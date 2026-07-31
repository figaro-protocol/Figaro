//! Diagnostic: serialize a representative BatchInput with bincode (the
//! same library SP1 stdin uses) and deserialize it back. Runs on the
//! host platform with the same `figaro-kernel` source the SP1 guest
//! compiles. If this round-trip succeeds, the bincode wire format for
//! `BatchInput` is internally consistent — any SP1 panic with the same
//! input is an SP1-specific issue, not a type-layout issue.
//!
//! Standing rules these tests guard (learned the hard way — see the
//! bincode/SP1 stdin landmines): no `serde_json::Value` on any type
//! that crosses SP1 stdin (bincode is non-self-describing —
//! `deserialize_any` panics), and no `#[serde(skip_serializing_if)]`
//! anywhere reachable from `BatchInput` (skipping bytes desyncs the
//! guest's deserializer).

use alloy_primitives::{address, Address, B256, U256, keccak256};
use figaro_kernel::types::*;

const BUYER: Address = address!("0376AAc07Ad725E01357B1725B5ceC61aE10473c");
const SELLER1: Address = address!("Ad29D7a8aD3639F97798c768202F27C1dE81DC55");
const TOKEN: Address = address!("5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f");

fn dummy_sig() -> Signature {
    Signature {
        v: 27,
        r: B256::repeat_byte(0xaa),
        s: B256::repeat_byte(0xbb),
    }
}

fn dummy_commitment() -> Commitment {
    Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: SELLER1,
        currency: TOKEN,
        payment: U256::from(100u64),
        expected_cumulative_value: U256::from(100u64),
        agreement_hash: keccak256("test"),
        salt: U256::from(1u64),
        deadline: U256::from(1000u64),
    }
}

fn dummy_proof(kind: ContentKind) -> AttestationContentProof {
    AttestationContentProof {
        spec_json: r#"{"clauseId":"t","version":1,"title":"T","description":"D","fields":[]}"#
            .to_string(),
        content_json: r#"{"scope":1}"#.to_string(),
        section_data: r#"{"k":"v"}"#.to_string(),
        inclusion_proof: vec![B256::repeat_byte(0xcc)],
        content_kind: kind,
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
fn bincode_roundtrip_full_batchinput() {
    let input = BatchInput {
        chain_id: 31337,
        verifying_contract: BUYER,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: dummy_commitment(),
                buyer_sig: dummy_sig(),
                seller_sig: dummy_sig(),
            },
            KernelOp::AttestAsSeller {
                role: dummy_commitment(),
                target: dummy_commitment(),
                clause_id: B256::ZERO,
                stage: 1,
                content_ref: B256::ZERO,
                seller_sig: dummy_sig(),
                proof: dummy_proof(ContentKind::RuntimeWitness),
            },
            KernelOp::AttestAsBuyer {
                target: dummy_commitment(),
                clause_id: B256::ZERO,
                stage: 0,
                content_ref: B256::ZERO,
                buyer_sig: dummy_sig(),
                proof: dummy_proof(ContentKind::ReAssert),
            },
            KernelOp::Resolve {
                process_id: B256::ZERO,
                commitments: vec![dummy_commitment()],
                buyer_sig: dummy_sig(),
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_clause: B256::ZERO,
    };

    let bytes = bincode::serialize(&input).expect("serialize");
    eprintln!("serialized {} bytes", bytes.len());
    let _decoded: BatchInput = bincode::deserialize(&bytes).expect("deserialize");
}

#[test]
fn bincode_roundtrip_just_attestation_content_proof() {
    let v = dummy_proof(ContentKind::RuntimeWitness);
    let bytes = bincode::serialize(&v).expect("serialize");
    eprintln!("proof bytes: {} bytes", bytes.len());
    let decoded: AttestationContentProof = bincode::deserialize(&bytes).expect("deserialize");
    assert_eq!(decoded.content_json, r#"{"scope":1}"#);
    assert_eq!(decoded.content_kind, ContentKind::RuntimeWitness);
}

#[test]
fn bincode_roundtrip_content_kind_variants() {
    for kind in [ContentKind::RuntimeWitness, ContentKind::ReAssert] {
        let bytes = bincode::serialize(&kind).expect("serialize");
        let decoded: ContentKind = bincode::deserialize(&bytes).expect("deserialize");
        assert_eq!(decoded, kind);
    }
}

#[test]
fn bincode_roundtrip_single_attest_seller() {
    let input = BatchInput {
        chain_id: 31337,
        verifying_contract: BUYER,
        block_timestamp: 1000,
        operations: vec![KernelOp::AttestAsSeller {
            role: dummy_commitment(),
            target: dummy_commitment(),
            clause_id: B256::ZERO,
            stage: 0,
            content_ref: B256::ZERO,
            seller_sig: dummy_sig(),
            proof: dummy_proof(ContentKind::RuntimeWitness),
        }],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_clause: B256::ZERO,
    };
    let bytes = bincode::serialize(&input).expect("serialize");
    eprintln!("serialized {} bytes", bytes.len());
    let _decoded: BatchInput = bincode::deserialize(&bytes).expect("deserialize");
}

#[test]
fn bincode_roundtrip_single_commit() {
    let input = BatchInput {
        chain_id: 31337,
        verifying_contract: BUYER,
        block_timestamp: 1000,
        operations: vec![KernelOp::Commit {
            commitment: dummy_commitment(),
            buyer_sig: dummy_sig(),
            seller_sig: dummy_sig(),
        }],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_clause: B256::ZERO,
    };
    let bytes = bincode::serialize(&input).expect("serialize");
    eprintln!("serialized {} bytes", bytes.len());
    let _decoded: BatchInput = bincode::deserialize(&bytes).expect("deserialize");
}

#[test]
fn bincode_roundtrip_public_values_and_events() {
    let pv = PublicValues {
        prev_state_root: B256::repeat_byte(0x01),
        new_state_root: B256::repeat_byte(0x02),
        chain_id: 31337,
        verifying_contract: BUYER,
        token_ops_hash: B256::repeat_byte(0x03),
        attestation_events_hash: B256::repeat_byte(0x04),
        spec_bindings_hash: B256::repeat_byte(0x05),
        usage_accrual_hash: B256::repeat_byte(0x0a),
    };
    let bytes = bincode::serialize(&pv).expect("serialize");
    let _decoded: PublicValues = bincode::deserialize(&bytes).expect("deserialize");

    let events = BatchEvents {
        attestations: vec![AttestationEventData {
            order_hash: B256::repeat_byte(0x06),
            process_id: B256::repeat_byte(0x07),
            attester: SELLER1,
            clause_id: B256::repeat_byte(0x08),
            stage: 2,
            content_ref: B256::repeat_byte(0x09),
        }],
        spec_bindings: vec![SpecBinding {
            clause_id: B256::repeat_byte(0x0a),
            spec_hash: B256::repeat_byte(0x0b),
        }],
        usage_accruals: vec![UsageAccrual {
            artifact: B256::repeat_byte(0x0c),
            c: 3,
            d: 2,
        }],
        usage_sellers: vec![SELLER1],
        usage_period: 1,
    };
    let bytes = bincode::serialize(&events).expect("serialize");
    let _decoded: BatchEvents = bincode::deserialize(&bytes).expect("deserialize");
}
