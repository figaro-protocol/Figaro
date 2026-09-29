//! The differential fuzz lock: the kernel mirror replays a seeded stream of
//! operations the kernel itself ran, and must answer as the kernel did.
//!
//! `test/core/kernel/KernelDifferentialFuzzTest.t.sol` draws a stream of
//! commits and resolutions from a seed — valid ones and deliberately
//! malformed ones — runs each on `FigaroCore`, and writes what the kernel
//! did to `cache/kernel-fuzz-stream.json`, one JSON object per line. This
//! file replays the stream through `apply_batch_with_state`, one operation
//! per batch over the state the previous batch left, and asserts:
//!
//!   - every operation the kernel accepted, the mirror accepts, with the
//!     same process id and order hash;
//!   - every operation the kernel rejected, the mirror rejects, with the
//!     same error;
//!   - every wallet's deposits and payouts, per token, are the kernel's;
//!   - every process ends on the kernel's accumulator and active count.
//!
//! The commit signatures are the stream's own bytes, so a signature form the
//! kernel refuses (high-s, a 0/1 recovery id, zero bytes) reaches the mirror
//! as the kernel saw it. A resolution has no signature on the direct path
//! (the kernel reads `msg.sender`); the mirror's equivalent is the caller's
//! signature over the resolve struct, made here with the caller's key.
//!
//! The test is `#[ignore]`d because it needs the stream the Foundry half
//! writes; `scripts/test-cross-impl-fuzz.sh` runs both halves under one seed.
//! Run alone, a missing stream is a failure, never a skip.
use std::collections::BTreeMap;
use std::str::FromStr;

use alloy_primitives::{keccak256, Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{apply_batch_with_state, derive_commitment_ids};
use figaro_kernel::state::KernelState;
use figaro_kernel::types::*;

/// The Foundry half's keyring.
const KEYS: [u64; 5] = [0xB0B, 0x5E11, 0x5E12, 0x5E13, 0xB0B2];

fn stream() -> Vec<serde_json::Value> {
    let path = std::env::var("KERNEL_FUZZ_STREAM").map(std::path::PathBuf::from).unwrap_or_else(|_| {
        let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.pop(); // prover/
        p.pop(); // repo root
        p.push("cache/kernel-fuzz-stream.json");
        p
    });
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "read {}: {e} — run scripts/test-cross-impl-fuzz.sh, which writes the stream first",
            path.display()
        )
    });
    text.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).expect("stream line is JSON"))
        .collect()
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

fn signature(v: &serde_json::Value) -> Signature {
    let hex = s(v).trim_start_matches("0x");
    let bytes: Vec<u8> = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hex"))
        .collect();
    assert_eq!(bytes.len(), 65, "a stream signature is 65 bytes");
    Signature {
        r: B256::from_slice(&bytes[..32]),
        s: B256::from_slice(&bytes[32..64]),
        v: bytes[64],
    }
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

/// The mirror's error under the kernel's name. The kernel reports arithmetic
/// overflow as a Solidity panic and a malformed signature through
/// OpenZeppelin's ECDSA errors; every other name is the kernel's own.
fn kernel_name(e: &KernelError) -> &'static str {
    match e {
        KernelError::DeadlineExpired => "DeadlineExpired",
        KernelError::InvalidBuyerSignature => "InvalidBuyerSignature",
        KernelError::InvalidSellerSignature => "InvalidSellerSignature",
        KernelError::ZeroPayment => "ZeroPayment",
        KernelError::ProcessAlreadyExists => "ProcessAlreadyExists",
        KernelError::UnknownProcess => "UnknownProcess",
        KernelError::CumulativeValueMismatch { .. } => "CumulativeValueMismatch",
        KernelError::NotProcessBuyer => "NotProcessBuyer",
        KernelError::CurrencyMismatch => "CurrencyMismatch",
        KernelError::OrderNotCommitted(_) => "OrderNotCommitted",
        KernelError::NoActiveOrders => "NoActiveOrders",
        KernelError::IncompleteOrderList { .. } => "IncompleteOrderList",
        KernelError::DuplicateCommitment => "DuplicateCommitment",
        KernelError::InvalidRootCumulativeValue => "InvalidRootCumulativeValue",
        KernelError::ProcessAlreadyResolved => "ProcessAlreadyResolved",
        KernelError::Overflow => "Panic",
        KernelError::InvalidSignature => "ECDSAInvalidSignature",
        _ => "outside the kernel",
    }
}

/// The kernel's three ECDSA errors are one class to the mirror, which has
/// one `InvalidSignature`.
fn same_error(kernel: &str, mirror: &str) -> bool {
    if kernel.starts_with("ECDSAInvalidSignature") {
        return mirror == "ECDSAInvalidSignature";
    }
    kernel == mirror
}

#[test]
#[ignore = "needs the stream the Foundry half writes; run scripts/test-cross-impl-fuzz.sh"]
fn the_mirror_answers_every_operation_as_the_kernel_did() {
    let lines = stream();
    let header = lines
        .iter()
        .find(|l| s(&l["type"]) == "header")
        .expect("the stream opens on a header");
    let seed = s(&header["seed"]).to_string();
    let chain_id: u64 = s(&header["chainId"]).parse().unwrap();
    let core = addr(&header["verifyingContract"]);
    let domain = domain_separator(chain_id, core);
    let keys: BTreeMap<Address, SigningKey> = KEYS
        .into_iter()
        .map(make_signing_key)
        .map(|k| (key_address(&k), k))
        .collect();

    let mut steps: Vec<&serde_json::Value> =
        lines.iter().filter(|l| s(&l["type"]) == "step").collect();
    steps.sort_by_key(|l| count(&l["index"]));
    assert_eq!(steps.len(), count(&header["stepCount"]), "every step is in the stream");

    let mut state = KernelState::new();
    let mut committed: BTreeMap<usize, Commitment> = BTreeMap::new();
    let mut deposits: BTreeMap<(Address, Address), U256> = BTreeMap::new();
    let mut payouts: BTreeMap<(Address, Address), U256> = BTreeMap::new();
    let mut divergences: Vec<String> = Vec::new();
    let (mut accepted, mut rejected) = (0usize, 0usize);

    for step in steps {
        let i = count(&step["index"]);
        let kind = s(&step["kind"]);
        let outcome = s(&step["outcome"]);

        let op = match kind {
            "commit" => KernelOp::Commit {
                commitment: commitment(step),
                buyer_sig: signature(&step["buyerSig"]),
                seller_sig: signature(&step["sellerSig"]),
            },
            "resolve" => {
                let process_id = b256(&step["processId"]);
                let caller = addr(&step["caller"]);
                let commitments = (0..count(&step["orderCount"]))
                    .map(|k| committed[&count(&step[format!("r{k}")])].clone())
                    .collect();
                let digest = typed_data_hash(&domain, &resolve_struct_hash(&process_id));
                KernelOp::Resolve {
                    process_id,
                    commitments,
                    buyer_sig: sign_digest(&keys[&caller], &digest),
                }
            }
            other => panic!("seed {seed}, step {i}: unknown kind {other}"),
        };

        let input = BatchInput {
            chain_id,
            verifying_contract: core,
            block_timestamp: s(&step["timestamp"]).parse().unwrap(),
            operations: vec![op],
            prev_state: state.to_snapshot(),
            usage_claims: vec![],
            usage_period: 0,
            provenance_clause: B256::ZERO,
        };

        match (apply_batch_with_state(&input), outcome) {
            (Ok((_pv, positions, _events, next)), "ok") => {
                accepted += 1;
                if kind == "commit" {
                    let c = commitment(step);
                    let (order_hash, process_id) = derive_commitment_ids(&domain, &c);
                    if process_id != b256(&step["processId"]) {
                        divergences.push(format!("step {i}: process id differs"));
                    }
                    if order_hash != b256(&step["orderHash"]) {
                        divergences.push(format!("step {i}: order hash differs"));
                    }
                    committed.insert(i, c);
                }
                for p in positions {
                    *deposits.entry((p.token, p.user)).or_default() += p.deposit;
                    *payouts.entry((p.token, p.user)).or_default() += p.payout;
                }
                state = next;
            }
            (Ok(_), kernel_error) => divergences.push(format!(
                "step {i} ({kind}): the kernel rejected with {kernel_error}, the mirror ACCEPTED"
            )),
            (Err(e), "ok") => divergences.push(format!(
                "step {i} ({kind}): the kernel accepted, the mirror rejected with {e}"
            )),
            (Err(e), kernel_error) => {
                rejected += 1;
                if !same_error(kernel_error, kernel_name(&e)) {
                    divergences.push(format!(
                        "step {i} ({kind}): the kernel rejected with {kernel_error}, the mirror with {e}"
                    ));
                }
            }
        }
    }

    for party in lines.iter().filter(|l| s(&l["type"]) == "party") {
        let key = (addr(&party["token"]), addr(&party["address"]));
        let deposit = deposits.get(&key).copied().unwrap_or_default();
        let payout = payouts.get(&key).copied().unwrap_or_default();
        if deposit != u256(&party["deposit"]) {
            divergences.push(format!("{key:?}: deposits {deposit}, the kernel pulled {}", s(&party["deposit"])));
        }
        if payout != u256(&party["payout"]) {
            divergences.push(format!("{key:?}: payouts {payout}, the kernel paid {}", s(&party["payout"])));
        }
    }

    let mut processes = 0usize;
    for process in lines.iter().filter(|l| s(&l["type"]) == "process") {
        processes += 1;
        let pid = b256(&process["processId"]);
        match state.processes.get(&pid) {
            None => divergences.push(format!("process {pid}: missing from the mirror")),
            Some(ps) => {
                if ps.cumulative_value != u256(&process["cumulativeValue"]) {
                    divergences.push(format!("process {pid}: cumulative value differs"));
                }
                if ps.active_order_count != s(&process["activeOrderCount"]).parse::<u64>().unwrap() {
                    divergences.push(format!("process {pid}: active order count differs"));
                }
            }
        }
    }
    if state.processes.len() != processes {
        divergences.push(format!(
            "the mirror holds {} processes, the kernel {processes}",
            state.processes.len()
        ));
    }

    assert!(accepted > 0 && rejected > 0, "seed {seed}: the stream exercises both outcomes");
    assert!(
        divergences.is_empty(),
        "seed {seed}: {} divergences between the kernel and its mirror:\n{}",
        divergences.len(),
        divergences.join("\n")
    );
    println!("seed {seed}: {accepted} accepted, {rejected} rejected, {processes} processes — no divergence");
}
