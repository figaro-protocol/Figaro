//! The state-transition lock: the mirror of FigaroCore replays what the frozen
//! FigaroCore did.
//!
//! `test/core/kernel/KernelTransitionVectorsTest.t.sol` runs six scenarios
//! through `FigaroCore` on Foundry and writes every commitment as committed,
//! every party's deposit and payout, FigaroCore's balance delta and every
//! process's final accumulator and active count to
//! `test/fixtures/kernel-transition-vectors.json`. This file signs the same
//! commitments with the same keys, applies them through both entries of the rules (the relay's native run and the guest's `apply_guest`, `common::run_both_with_state`) — one
//! batch per scenario: the commits, then a resolve per process when the
//! scenario resolves — and asserts every figure. The mirror's payout and
//! bond arithmetic is thereby locked to FigaroCore's, not to a comment.
use std::collections::BTreeMap;

use alloy_primitives::{Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{
    apply_batch_with_state, apply_guest, apply_operations, derive_commitment_ids, guest_input,
};
use figaro_kernel::operation_stream::resolved_running_total;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::*;

mod common;
use common::{
    addr, b256, commitment_json, count, empty_snapshot, key_address, make_signing_key,
    run_both_with_state, s, sign_digest, u256, BUYER_KEY, SELLER1_KEY, SELLER2_KEY, SELLER3_KEY,
};

const BLOCK_TIMESTAMP: u64 = 1000;

fn fixture() -> serde_json::Value {
    common::fixture("kernel-transition-vectors.json")
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
    commitment_json(o, "commitmentProcessId")
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
                let running_total = resolved_running_total(&commitments).expect("payments fit");
                let digest =
                    typed_data_hash(&domain, &resolve_struct_hash(process_id, &running_total));
                ops.push(KernelOp::Resolve {
                    process_id: *process_id,
                    running_total,
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
        };
        // Both entries: the guest's witnessed run reaches the native run's
        // public values, positions and events (`common::run_both_with_state`).
        let (_pv, positions, _events, state) =
            run_both_with_state(&input).unwrap_or_else(|e| panic!("{name}: {e:?}"));

        // A second batch on the post-state: one process's resolve replayed
        // is refused on both paths alike.
        if resolve {
            let replay = BatchInput {
                operations: vec![input.operations.last().unwrap().clone()],
                prev_state: state.to_snapshot(),
                ..input.clone()
            };
            // Refused natively, and by the guest with the same error.
            assert!(
                run_both_with_state(&replay).is_err(),
                "{name}: a resolve replayed is refused"
            );
        }

        // ── The relay's trial path reaches the batch's own state ──
        // One operation at a time on a running state, as `trial_apply`
        // runs, with no root until the end: the same root and the same
        // positions as the batch.
        let mut running = KernelState::from_snapshot(&input.prev_state);
        let mut trial_positions: BTreeMap<(Address, Address), (U256, U256)> = BTreeMap::new();
        for op in &input.operations {
            let effects = apply_operations(
                &mut running,
                chain_id,
                core,
                BLOCK_TIMESTAMP,
                std::slice::from_ref(op),
            )
            .unwrap_or_else(|e| {
                panic!("{name}: the trial path refused an operation the batch applied: {e:?}")
            });
            for p in effects.positions {
                let e = trial_positions.entry((p.token, p.user)).or_default();
                e.0 += p.deposit;
                e.1 += p.payout;
            }
        }
        assert_eq!(
            running.compute_root(),
            state.compute_root(),
            "{name}: the trial path's root is the batch's"
        );
        for p in &positions {
            let got = trial_positions
                .get(&(p.token, p.user))
                .copied()
                .unwrap_or_default();
            assert_eq!(
                got,
                (p.deposit, p.payout),
                "{name}: the trial path's positions are the batch's for {}",
                p.user
            );
        }

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

        // ── FigaroCore's balance moved by exactly the net of those ──
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
                .process(&pid)
                .unwrap()
                .unwrap_or_else(|| panic!("{name}: process {pr} missing from the mirror"));
            assert_eq!(
                ps.running_total,
                u256(&p["runningTotal"]),
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

/// The guest's witnessed state: an entry left out of the witness cannot be
/// read as absent, and an entry carried with a wrong value fails the proof.
#[test]
fn the_guest_refuses_a_witness_missing_an_entry_or_carrying_a_wrong_value() {
    let fx = fixture();
    let chain_id: u64 = s(&fx["chainId"]).parse().unwrap();
    let core = addr(&fx["verifyingContract"]);
    let domain = domain_separator(chain_id, core);
    let keys = keyring();
    let sc = &fx["s0"];
    let c = commitment(&sc["o0"]);
    let digest = typed_data_hash(&domain, &commitment_struct_hash(&c));
    let commit = KernelOp::Commit {
        commitment: c.clone(),
        buyer_sig: sign_digest(&keys[&c.buyer], &digest),
        seller_sig: sign_digest(&keys[&c.seller], &digest),
    };
    let first = BatchInput {
        chain_id,
        verifying_contract: core,
        block_timestamp: BLOCK_TIMESTAMP,
        operations: vec![commit.clone()],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };
    let (_, _, _, state) = apply_batch_with_state(&first).unwrap();

    // Drop the order's entry from the witness of the first batch: the guest
    // refuses the read instead of taking the order as absent.
    let mut missing = guest_input(&first).unwrap();
    missing.prev_witness.orders.clear();
    assert!(matches!(
        apply_guest(&missing).unwrap_err(),
        KernelError::UnwitnessedKey
    ));

    // One entry carried twice, even with the same value: refused.
    let mut doubled = guest_input(&first).unwrap();
    let entry = doubled.prev_witness.orders[0];
    doubled.prev_witness.orders.push(entry);
    assert!(matches!(
        apply_guest(&doubled).unwrap_err(),
        KernelError::DuplicateWitnessEntry
    ));

    // A process entry carried with a token the tree does not hold: the
    // resolve reads it without a check of its own, so only the witness's
    // check can refuse it.
    let mut wrong = guest_input(&again_resolvable(&first, &state)).unwrap();
    let Some((_, Some(ps))) = wrong.prev_witness.processes.first_mut() else {
        panic!("the resolve's witness carries its process");
    };
    ps.token = Address::repeat_byte(0x77);
    assert!(matches!(
        apply_guest(&wrong).unwrap_err(),
        KernelError::Witness(_)
    ));
    // The honest witness of the same batch is accepted.
    assert!(apply_guest(&guest_input(&again_resolvable(&first, &state)).unwrap()).is_ok());
}

/// A batch on `state` that reads the process `first` opened: its resolve.
fn again_resolvable(first: &BatchInput, state: &KernelState) -> BatchInput {
    let keys = keyring();
    let domain = domain_separator(first.chain_id, first.verifying_contract);
    let KernelOp::Commit { commitment, .. } = &first.operations[0] else {
        unreachable!()
    };
    let (_, process_id) = derive_commitment_ids(&domain, commitment);
    let running_total = commitment.running_total;
    let digest = typed_data_hash(&domain, &resolve_struct_hash(&process_id, &running_total));
    BatchInput {
        operations: vec![KernelOp::Resolve {
            process_id,
            running_total,
            commitments: vec![commitment.clone()],
            buyer_sig: sign_digest(&keys[&commitment.buyer], &digest),
        }],
        prev_state: state.to_snapshot(),
        ..first.clone()
    }
}
