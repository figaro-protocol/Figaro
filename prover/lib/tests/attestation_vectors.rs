//! The attestation lock: a batched attestation re-emits the
//! coordinator's event, byte for byte.
//!
//! `test/core/attestation/AttestationVectorsTest.t.sol` runs three direct
//! attestations on `AttestationCoordinator` over one order of a three-leaf
//! agreement (a seller's on a clause, the buyer's on another at stage 1, the
//! buyer's on the reserved provenance leaf) and writes each call's arguments
//! and the log it emitted to `test/fixtures/attestation-vectors.json`. This
//! file commits the same order, submits the same arguments as batched
//! attestations — the `clauseDataHash`, the inclusion proof and the
//! `contentRef`, nothing else — through both entries of the rules (the
//! relay's native run and the guest's `apply_guest`, `common::run_both`,
//! which holds the two to the same events and the same public values), and
//! asserts that each event they produce encodes to the coordinator's topics
//! and data. The events hash into public value 5, which the guest commits.
use alloy_primitives::B256;

use figaro_kernel::eip712::*;
use figaro_kernel::types::*;

mod common;
use common::{
    addr, b256, empty_snapshot, encode_log, fixture, hex_bytes, make_signing_key, run_both, s,
    sign_digest, u256, words, BUYER_KEY, SELLER1_KEY,
};

#[test]
fn a_batched_attestation_emits_the_coordinator_s_event_bytes() {
    let fx = fixture("attestation-vectors.json");
    let chain_id: u64 = s(&fx["chainId"]).parse().unwrap();
    let core = addr(&fx["verifyingContract"]);
    let domain = domain_separator(chain_id, core);
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller_key = make_signing_key(SELLER1_KEY);

    let order = Commitment {
        process_id: B256::ZERO,
        buyer: addr(&fx["buyer"]),
        seller: addr(&fx["seller"]),
        token: addr(&fx["token"]),
        payment: u256(&fx["payment"]),
        running_total: u256(&fx["payment"]),
        checkout_hash: b256(&fx["checkoutHash"]),
        salt: u256(&fx["salt"]),
        commit_deadline: u256(&fx["commitDeadline"]),
    };
    let struct_hash = commitment_struct_hash(&order);
    let process_id = typed_data_hash(&domain, &struct_hash);
    let order_hash = compute_order_hash(&process_id, &struct_hash);
    let commit_digest = typed_data_hash(&domain, &struct_hash);

    let count: usize = s(&fx["vectorCount"]).parse().unwrap();
    let mut operations = vec![KernelOp::Commit {
        commitment: order.clone(),
        buyer_sig: sign_digest(&buyer_key, &commit_digest),
        seller_sig: sign_digest(&seller_key, &commit_digest),
    }];
    for k in 0..count {
        let v = &fx[format!("v{k}")];
        let clause_id = b256(&v["clauseId"]);
        let stage: u8 = s(&v["stage"]).parse().unwrap();
        let content_ref = b256(&v["contentRef"]);
        let proof = AttestationWitness {
            clause_data_hash: b256(&v["clauseDataHash"]),
            inclusion_proof: words(&v["inclusionProof"]),
        };
        operations.push(match s(&v["role"]) {
            "seller" => {
                let h = attest_seller_struct_hash(&order_hash, &clause_id, stage, &content_ref);
                KernelOp::AttestAsSeller {
                    target: order.clone(),
                    clause_id,
                    stage,
                    content_ref,
                    seller_sig: sign_digest(&seller_key, &typed_data_hash(&domain, &h)),
                    proof,
                }
            }
            "buyer" => {
                let h = attest_buyer_struct_hash(
                    &process_id,
                    &order_hash,
                    &clause_id,
                    stage,
                    &content_ref,
                );
                KernelOp::AttestAsBuyer {
                    target: order.clone(),
                    clause_id,
                    stage,
                    content_ref,
                    buyer_sig: sign_digest(&buyer_key, &typed_data_hash(&domain, &h)),
                    proof,
                }
            }
            other => panic!("unknown role {other}"),
        });
    }

    let input = BatchInput {
        chain_id,
        verifying_contract: core,
        block_timestamp: 1000,
        operations,
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };
    let (_pv, _positions, events) = run_both(&input).expect("the attestations apply");

    assert_eq!(events.attestations.len(), count);
    for (k, e) in events.attestations.iter().enumerate() {
        let v = &fx[format!("v{k}")];
        let (topics, data) = encode_log(e);
        assert_eq!(
            topics,
            words(&v["topics"]),
            "vector {k}: the topics are the coordinator's"
        );
        assert_eq!(
            data,
            hex_bytes(&v["data"]),
            "vector {k}: the data is the coordinator's"
        );
    }
}
