//! Diagnostic: serialize a representative BatchInput with bincode (the
//! same library SP1 stdin uses) and deserialize it back. Runs on the
//! host platform with the same `figaro-kernel` source the SP1 guest
//! compiles. If this round-trip succeeds, the bincode wire format for
//! `BatchInput` is internally consistent — any SP1 panic with the same
//! input is an SP1-specific issue, not a type-layout issue.

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

#[test]
fn bincode_roundtrip_batchinput_with_content_proof_none() {
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
                role_commitment: dummy_commitment(),
                order_hash: B256::ZERO,
                schema_id: B256::ZERO,
                stage: 1,
                content_ref: B256::ZERO,
                seller_sig: dummy_sig(),
                content_proof: None,
            },
            KernelOp::AttestAsBuyer {
                process_id: B256::ZERO,
                order_hash: B256::ZERO,
                schema_id: B256::ZERO,
                stage: 0,
                content_ref: B256::ZERO,
                buyer_sig: dummy_sig(),
                content_proof: None,
            },
            KernelOp::Resolve {
                process_id: B256::ZERO,
                commitments: vec![dummy_commitment()],
                buyer_sig: dummy_sig(),
            },
        ],
        prev_state: KernelStateSnapshot {
            processes: vec![],
            order_status: vec![],
            order_process_id: vec![],
            schemas_registered: vec![],
            operators_registered: vec![],        },    };

    let bytes = bincode::serialize(&input).expect("serialize");
    eprintln!("serialized {} bytes", bytes.len());
    let _decoded: BatchInput = bincode::deserialize(&bytes).expect("deserialize");
}

#[test]
fn bincode_roundtrip_just_attestation_content_proof_none() {
    // Bisect: just Option<AttestationContentProof>
    let v: Option<AttestationContentProof> = None;
    let bytes = bincode::serialize(&v).expect("serialize");
    eprintln!("None bytes: {:?}", bytes);
    let _decoded: Option<AttestationContentProof> = bincode::deserialize(&bytes).expect("deserialize");
}

#[test]
fn bincode_roundtrip_just_attestation_content_proof_some() {
    let v: Option<AttestationContentProof> = Some(AttestationContentProof {
        content_json: r#"{"scope":1}"#.to_string(),
        schema_spec: r#"{}"#.to_string(),
    });
    let bytes = bincode::serialize(&v).expect("serialize");
    eprintln!("Some bytes: {} bytes", bytes.len());
    let decoded: Option<AttestationContentProof> = bincode::deserialize(&bytes).expect("deserialize");
    let decoded = decoded.unwrap();
    assert_eq!(decoded.content_json, r#"{"scope":1}"#);
}

#[test]
fn bincode_roundtrip_single_attest_seller_with_none() {
    let input = BatchInput {
        chain_id: 31337,
        verifying_contract: BUYER,
        block_timestamp: 1000,
        operations: vec![KernelOp::AttestAsSeller {
            role_commitment: dummy_commitment(),
            order_hash: B256::ZERO,
            schema_id: B256::ZERO,
            stage: 0,
            content_ref: B256::ZERO,
            seller_sig: dummy_sig(),
            content_proof: None,
        }],
        prev_state: KernelStateSnapshot {
            processes: vec![], order_status: vec![], order_process_id: vec![],
            schemas_registered: vec![], operators_registered: vec![],        },    };
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
        prev_state: KernelStateSnapshot {
            processes: vec![], order_status: vec![], order_process_id: vec![],
            schemas_registered: vec![], operators_registered: vec![],        },    };
    let bytes = bincode::serialize(&input).expect("serialize");
    eprintln!("serialized {} bytes", bytes.len());
    let _decoded: BatchInput = bincode::deserialize(&bytes).expect("deserialize");
}

#[test]
fn bincode_roundtrip_batchinput_with_content_proof_some() {
    let input = BatchInput {
        chain_id: 31337,
        verifying_contract: BUYER,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::AttestAsSeller {
                role_commitment: dummy_commitment(),
                order_hash: B256::ZERO,
                schema_id: B256::ZERO,
                stage: 0,
                content_ref: B256::ZERO,
                seller_sig: dummy_sig(),
                content_proof: Some(AttestationContentProof {
                    content_json: r#"{"scope":1}"#.to_string(),
                    schema_spec: r#"{"schemaId":"figaro-ghg-protocol-v1","version":1,"title":"T","description":"D","fields":[{"name":"scope","type":"integer","min":1,"max":3,"required":false}]}"#.to_string(),
                }),
            },
        ],
        prev_state: KernelStateSnapshot {
            processes: vec![],
            order_status: vec![],
            order_process_id: vec![],
            schemas_registered: vec![],
            operators_registered: vec![],        },    };

    let bytes = bincode::serialize(&input).expect("serialize");
    eprintln!("serialized {} bytes", bytes.len());
    let _decoded: BatchInput = bincode::deserialize(&bytes).expect("deserialize");
}
