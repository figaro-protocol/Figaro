//! The state-transition lock: the kernel mirror replays what the frozen
//! kernel did.
//!
//! `test/core/kernel/KernelTransitionVectorsTest.t.sol` runs six scenarios
//! through `FigaroCore` on Foundry and writes every commitment as committed,
//! every party's deposit and payout, the kernel's balance delta and every
//! process's final accumulator and active count to
//! `test/fixtures/kernel-transition-vectors.json`. This file signs the same
//! commitments with the same keys, applies them through `apply_batch` — one
//! batch per scenario: the commits, then a resolve per process when the
//! scenario resolves — and asserts every figure. The mirror's payout and
//! bond arithmetic is thereby locked to the kernel's, not to a comment.
use std::collections::BTreeMap;
use std::str::FromStr;

use alloy_primitives::{keccak256, Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{apply_batch_with_state, derive_commitment_ids};
use figaro_kernel::types::*;

const BUYER_KEY: u64 = 0xB0B;
const SELLER1_KEY: u64 = 0x5E11;
const SELLER2_KEY: u64 = 0x5E12;
const SELLER3_KEY: u64 = 0x5E13;
const BLOCK_TIMESTAMP: u64 = 1000;

fn fixture() -> serde_json::Value {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("test/fixtures/kernel-transition-vectors.json");
    let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    serde_json::from_str(&text).expect("fixture JSON")
}

fn s(v: &serde_json::Value) -> &str {
    v.as_str().expect("string field")
}
fn b256(v: &serde_json::Value) -> B256 {
    B256::from_str(s(v)).expect("bytes32")
}
fn addr(v: &serde_json::Value) -> Address {
    Address::from_str(s(v)).expect("address")
}
fn u256(v: &serde_json::Value) -> U256 {
    U256::from_str_radix(s(v), 10).expect("decimal uint")
}
fn count(v: &serde_json::Value) -> usize {
    s(v).parse().expect("count")
}

fn make_signing_key(secret: u64) -> SigningKey {
    let mut bytes = [0u8; 32];
    bytes[24..].copy_from_slice(&secret.to_be_bytes());
    SigningKey::from_bytes((&bytes).into()).unwrap()
}

fn key_address(key: &SigningKey) -> Address {
    let pubkey = key.verifying_key().to_encoded_point(false);
    Address::from_slice(&keccak256(&pubkey.as_bytes()[1..])[12..])
}

fn sign_digest(key: &SigningKey, digest: &B256) -> Signature {
    use k256::ecdsa::{signature::hazmat::PrehashSigner, RecoveryId};
    let (sig, recid): (k256::ecdsa::Signature, RecoveryId) =
        key.sign_prehash(digest.as_slice()).unwrap();
    let bytes = sig.to_bytes();
    Signature {
        v: recid.to_byte() + 27,
        r: B256::from_slice(&bytes[..32]),
        s: B256::from_slice(&bytes[32..]),
    }
}

/// The parity keys, addressed by the wallet they derive — a fixture party is
/// signed for by whichever key owns it.
fn keyring() -> BTreeMap<Address, SigningKey> {
    [BUYER_KEY, SELLER1_KEY, SELLER2_KEY, SELLER3_KEY]
        .into_iter()
        .map(make_signing_key)
        .map(|k| (key_address(&k), k))
        .collect()
}

fn commitment(o: &serde_json::Value) -> Commitment {
    Commitment {
        process_id: b256(&o["commitmentProcessId"]),
        buyer: addr(&o["buyer"]),
        seller: addr(&o["seller"]),
        currency: addr(&o["currency"]),
        payment: u256(&o["payment"]),
        expected_cumulative_value: u256(&o["expectedCumulativeValue"]),
        agreement_hash: b256(&o["agreementHash"]),
        salt: u256(&o["salt"]),
        deadline: u256(&o["deadline"]),
    }
}

fn empty_snapshot() -> KernelStateSnapshot {
    KernelStateSnapshot {
        processes: vec![],
        order_status: vec![],
        order_process_id: vec![],
        usage_counted: vec![],
        usage_seller_seen: vec![],
        usage_accrual: vec![],
    }
}

#[test]
fn the_mirror_replays_every_frozen_kernel_transition() {
    let fx = fixture();
    let chain_id: u64 = s(&fx["chainId"]).parse().unwrap();
    let core = addr(&fx["verifyingContract"]);
    let token = addr(&fx["token"]);
    let domain = domain_separator(chain_id, core);
    let keys = keyring();
    let scenarios = count(&fx["scenarioCount"]);
    assert!(scenarios > 0);

    for si in 0..scenarios {
        let sc = &fx[format!("s{si}")];
        let name = s(&sc["name"]);
        let resolve = s(&sc["resolve"]) == "true";
        let orders = count(&sc["orderCount"]);

        // ── The commits, signed here with the parity keys ──
        let mut ops = Vec::new();
        let mut by_process: BTreeMap<B256, Vec<Commitment>> = BTreeMap::new();
        let mut process_order: Vec<B256> = Vec::new();
        for oi in 0..orders {
            let o = &sc[format!("o{oi}")];
            let c = commitment(o);
            let (order_hash, process_id) = derive_commitment_ids(&domain, &c);
            assert_eq!(
                process_id,
                b256(&o["processId"]),
                "{name}: order {oi} process id"
            );
            assert_eq!(
                order_hash,
                b256(&o["orderHash"]),
                "{name}: order {oi} order hash"
            );

            let struct_hash = commitment_struct_hash(&c);
            let digest = typed_data_hash(&domain, &struct_hash);
            ops.push(KernelOp::Commit {
                commitment: c.clone(),
                buyer_sig: sign_digest(&keys[&c.buyer], &digest),
                seller_sig: sign_digest(&keys[&c.seller], &digest),
            });
            if !by_process.contains_key(&process_id) {
                process_order.push(process_id);
            }
            by_process.entry(process_id).or_default().push(c);
        }

        // ── One resolve per process, buyer-signed, when the scenario resolves ──
        if resolve {
            for process_id in &process_order {
                let commitments = by_process[process_id].clone();
                let buyer = commitments[0].buyer;
                let digest = typed_data_hash(&domain, &resolve_struct_hash(process_id));
                ops.push(KernelOp::Resolve {
                    process_id: *process_id,
                    commitments,
                    buyer_sig: sign_digest(&keys[&buyer], &digest),
                });
            }
        }

        let input = BatchInput {
            chain_id,
            verifying_contract: core,
            block_timestamp: BLOCK_TIMESTAMP,
            operations: ops,
            prev_state: empty_snapshot(),
            usage_claims: vec![],
            usage_period: 0,
            provenance_clause: B256::ZERO,
        };
        let (_pv, positions, _events, state) =
            apply_batch_with_state(&input).unwrap_or_else(|e| panic!("{name}: {e:?}"));

        // ── Every party's deposit and payout, exactly ──
        let parties = count(&sc["partyCount"]);
        assert_eq!(positions.len(), parties, "{name}: one position per party");
        let mut deposits = U256::ZERO;
        let mut payouts = U256::ZERO;
        for pi in 0..parties {
            let p = &sc[format!("p{pi}")];
            let who = addr(&p["address"]);
            let pos = positions
                .iter()
                .find(|q| q.token == token && q.user == who)
                .unwrap_or_else(|| panic!("{name}: no position for {who}"));
            assert_eq!(pos.deposit, u256(&p["deposit"]), "{name}: deposit of {who}");
            assert_eq!(pos.payout, u256(&p["payout"]), "{name}: payout of {who}");
            deposits += pos.deposit;
            payouts += pos.payout;
        }

        // ── The kernel's balance moved by exactly the net of those ──
        let delta = s(&sc["kernelDelta"]);
        let expected_delta = match delta.strip_prefix('-') {
            Some(neg) => (U256::from_str_radix(neg, 10).unwrap(), true),
            None => (U256::from_str_radix(delta, 10).unwrap(), false),
        };
        let observed = if deposits >= payouts {
            (deposits - payouts, false)
        } else {
            (payouts - deposits, true)
        };
        assert_eq!(observed, expected_delta, "{name}: kernel balance delta");

        // ── Every process's final accumulator and active count ──
        let processes = count(&sc["processCount"]);
        assert_eq!(process_order.len(), processes, "{name}: process count");
        for pr in 0..processes {
            let p = &sc[format!("pr{pr}")];
            let pid = b256(&p["processId"]);
            let ps = state
                .processes
                .get(&pid)
                .unwrap_or_else(|| panic!("{name}: process {pr} missing from the mirror"));
            assert_eq!(
                ps.cumulative_value,
                u256(&p["cumulativeValue"]),
                "{name}: cumulative value"
            );
            assert_eq!(
                ps.active_order_count,
                s(&p["activeOrderCount"]).parse::<u64>().unwrap(),
                "{name}: active order count"
            );
        }
    }
}
