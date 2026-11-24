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

use alloy_primitives::{address, keccak256, Address, B256, U256};
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
        token: TOKEN,
        payment: U256::from(100u64),
        running_total: U256::from(100u64),
        checkout_hash: keccak256("test"),
        salt: U256::from(1u64),
        commit_deadline: U256::from(1000u64),
    }
}

fn dummy_witness() -> AttestationWitness {
    AttestationWitness {
        clause_data_hash: B256::repeat_byte(0xab),
        inclusion_proof: vec![B256::repeat_byte(0xcc), B256::repeat_byte(0xdd)],
    }
}

fn empty_snapshot() -> KernelStateSnapshot {
    KernelStateSnapshot {
        processes: vec![],
        order_status: vec![],
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
                target: dummy_commitment(),
                clause_id: B256::ZERO,
                stage: 1,
                content_ref: B256::ZERO,
                seller_sig: dummy_sig(),
                proof: dummy_witness(),
            },
            KernelOp::AttestAsBuyer {
                target: dummy_commitment(),
                clause_id: B256::ZERO,
                stage: 0,
                content_ref: B256::ZERO,
                buyer_sig: dummy_sig(),
                proof: dummy_witness(),
            },
            KernelOp::Resolve {
                process_id: B256::ZERO,
                running_total: U256::ZERO,
                commitments: vec![dummy_commitment()],
                buyer_sig: dummy_sig(),
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };

    let bytes = bincode::serialize(&input).expect("serialize");
    eprintln!("serialized {} bytes", bytes.len());
    let _decoded: BatchInput = bincode::deserialize(&bytes).expect("deserialize");
}

#[test]
fn bincode_roundtrip_the_attestation_witness() {
    let bytes = bincode::serialize(&dummy_witness()).expect("serialize");
    let decoded: AttestationWitness = bincode::deserialize(&bytes).expect("deserialize");
    assert_eq!(decoded.clause_data_hash, B256::repeat_byte(0xab));
    assert_eq!(
        decoded.inclusion_proof,
        vec![B256::repeat_byte(0xcc), B256::repeat_byte(0xdd)]
    );
}

#[test]
fn bincode_roundtrip_single_attest_seller() {
    let input = BatchInput {
        chain_id: 31337,
        verifying_contract: BUYER,
        block_timestamp: 1000,
        operations: vec![KernelOp::AttestAsSeller {
            target: dummy_commitment(),
            clause_id: B256::ZERO,
            stage: 0,
            content_ref: B256::ZERO,
            seller_sig: dummy_sig(),
            proof: dummy_witness(),
        }],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
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
        usage_accrual_hash: B256::repeat_byte(0x0a),
        block_timestamp: 1000,
        operations_hash: B256::repeat_byte(0x0b),
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
        uses: vec![BatchUse {
            clause_or_process: B256::repeat_byte(0x0c),
            kind: USAGE_KIND_CLAUSE,
            process_id: B256::repeat_byte(0x0f),
            seller: SELLER1,
        }],
        usage_period: 1,
    };
    let bytes = bincode::serialize(&events).expect("serialize");
    let _decoded: BatchEvents = bincode::deserialize(&bytes).expect("deserialize");
}

/// The ABI layout `FigaroBatchVerifier._decodePV` decodes: 9 words, 288
/// bytes, in the order prev root, new root, chain id, verifying contract,
/// token ops hash, attestation events hash, usage accrual hash, block
/// timestamp, operations hash. A drift here silently mis-decodes on chain,
/// and the 320-byte layout that carried a spec-bindings word is refused.
#[test]
fn the_public_values_are_nine_words_each_at_its_index() {
    let pv = PublicValues {
        prev_state_root: B256::repeat_byte(0x01),
        new_state_root: B256::repeat_byte(0x02),
        chain_id: 31337,
        verifying_contract: BUYER,
        token_ops_hash: B256::repeat_byte(0x03),
        attestation_events_hash: B256::repeat_byte(0x04),
        usage_accrual_hash: B256::repeat_byte(0x05),
        block_timestamp: 1000,
        operations_hash: B256::repeat_byte(0x06),
    };
    let abi = pv.abi_encode();
    assert_eq!(abi.len(), 288, "public values are 9 × 32-byte words");

    let word = |i: usize| B256::from_slice(&abi[i * 32..(i + 1) * 32]);
    let mut chain_word = [0u8; 32];
    chain_word[24..].copy_from_slice(&31337u64.to_be_bytes());
    let mut addr_word = [0u8; 32];
    addr_word[12..].copy_from_slice(BUYER.as_slice());
    let mut ts_word = [0u8; 32];
    ts_word[24..].copy_from_slice(&1000u64.to_be_bytes());
    assert_eq!(word(0), pv.prev_state_root, "word 0: the previous root");
    assert_eq!(word(1), pv.new_state_root, "word 1: the new root");
    assert_eq!(word(2), B256::from(chain_word), "word 2: the chain id");
    assert_eq!(
        word(3),
        B256::from(addr_word),
        "word 3: the verifying contract"
    );
    assert_eq!(word(4), pv.token_ops_hash, "word 4: the token ops hash");
    assert_eq!(
        word(5),
        pv.attestation_events_hash,
        "word 5: the attestation events hash"
    );
    assert_eq!(
        word(6),
        pv.usage_accrual_hash,
        "word 6: the usage accrual hash"
    );
    assert_eq!(word(7), B256::from(ts_word), "word 7: the block timestamp");
    assert_eq!(word(8), pv.operations_hash, "word 8: the operations hash");

    let decoded = PublicValues::abi_decode(&abi).expect("its own encoding decodes");
    assert_eq!(decoded.prev_state_root, pv.prev_state_root);
    assert_eq!(decoded.new_state_root, pv.new_state_root);
    assert_eq!(decoded.chain_id, pv.chain_id);
    assert_eq!(decoded.verifying_contract, pv.verifying_contract);
    assert_eq!(decoded.token_ops_hash, pv.token_ops_hash);
    assert_eq!(decoded.attestation_events_hash, pv.attestation_events_hash);
    assert_eq!(decoded.usage_accrual_hash, pv.usage_accrual_hash);
    assert_eq!(decoded.block_timestamp, pv.block_timestamp);
    assert_eq!(decoded.operations_hash, pv.operations_hash);

    // Ten words, the length that carried a spec-bindings word: refused.
    let mut ten_words = abi.clone();
    ten_words.extend_from_slice(&[0u8; 32]);
    assert_eq!(ten_words.len(), 320);
    assert!(
        PublicValues::abi_decode(&ten_words).is_err(),
        "320 bytes are refused"
    );
    assert!(
        PublicValues::abi_decode(&abi[..256]).is_err(),
        "eight words are refused"
    );
}

/// Every usage-claim kind crosses SP1 stdin: the enum's variant tag and the
/// assembly claim's variable-length membership proof must survive bincode,
/// field for field.
#[test]
fn bincode_roundtrip_every_usage_claim_kind() {
    let claim = |kind: UsageClaimKind| UsageClaim {
        order: dummy_commitment(),
        clause_or_process: B256::repeat_byte(0x0d),
        kind,
        inclusion_proof: vec![B256::repeat_byte(0x0e)],
    };
    let input = BatchInput {
        chain_id: 31337,
        verifying_contract: BUYER,
        block_timestamp: 1000,
        operations: vec![],
        prev_state: empty_snapshot(),
        usage_claims: vec![
            claim(UsageClaimKind::Clause {
                clause_data_hash: B256::repeat_byte(0x01),
            }),
            claim(UsageClaimKind::Agreement {
                process_design_hash: B256::repeat_byte(0x02),
            }),
            claim(UsageClaimKind::Process {
                agreement_hash: B256::repeat_byte(0x03),
                agreement_content_hash: B256::repeat_byte(0x04),
                membership_proof: vec![B256::repeat_byte(0x05), B256::repeat_byte(0x06)],
            }),
        ],
        usage_period: 2,
    };
    let bytes = bincode::serialize(&input).expect("serialize");
    let decoded: BatchInput = bincode::deserialize(&bytes).expect("deserialize");
    assert_eq!(decoded.usage_period, 2);
    let codes: Vec<u8> = decoded.usage_claims.iter().map(|c| c.kind.code()).collect();
    assert_eq!(
        codes,
        vec![USAGE_KIND_CLAUSE, USAGE_KIND_AGREEMENT, USAGE_KIND_PROCESS]
    );
    match &decoded.usage_claims[1].kind {
        UsageClaimKind::Agreement {
            process_design_hash,
        } => {
            assert_eq!(*process_design_hash, B256::repeat_byte(0x02))
        }
        other => panic!("expected Agreement, got {other:?}"),
    }
    match &decoded.usage_claims[2].kind {
        UsageClaimKind::Process {
            agreement_hash,
            agreement_content_hash,
            membership_proof,
        } => {
            assert_eq!(*agreement_hash, B256::repeat_byte(0x03));
            assert_eq!(*agreement_content_hash, B256::repeat_byte(0x04));
            assert_eq!(
                membership_proof,
                &vec![B256::repeat_byte(0x05), B256::repeat_byte(0x06)]
            );
        }
        other => panic!("expected Assembly, got {other:?}"),
    }
}
