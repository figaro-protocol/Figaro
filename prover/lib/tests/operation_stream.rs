//! The operation stream: the bytes a batch publishes in the transaction that
//! lands it, so the state behind its root is rebuilt from the chain alone.
//! Round trip, the hash the guest commits, the kind byte, and the decoder's
//! refusals.

use alloy_primitives::{keccak256, Address, B256, U256};
use figaro_kernel::kernel::apply_batch;
use figaro_kernel::operation_stream::{
    compute_operations_hash, decode_operation_stream, encode_operation_stream, COMMITMENT_BYTES,
    SIGNATURE_BYTES,
};
use figaro_kernel::state::KernelState;
use figaro_kernel::types::{
    AttestationContentProof, AttestationWitness, BatchInput, Commitment, ContentKind, KernelOp, Signature, UsageClaim,
    UsageClaimKind, USAGE_KIND_AGREEMENT, USAGE_KIND_ASSEMBLY, USAGE_KIND_CLAUSE,
};

fn commitment(seed: u8) -> Commitment {
    Commitment {
        process_id: B256::repeat_byte(seed),
        buyer: Address::repeat_byte(0x10 + seed),
        seller: Address::repeat_byte(0x20 + seed),
        currency: Address::repeat_byte(0x30 + seed),
        payment: U256::from(100u64 * seed as u64),
        expected_cumulative_value: U256::from(300u64 * seed as u64),
        checkout_hash: B256::repeat_byte(0x40 + seed),
        salt: U256::from(seed),
        deadline: U256::from(1_700_000_000u64 + seed as u64),
    }
}

fn signature(seed: u8) -> Signature {
    Signature {
        v: 27 + (seed % 2),
        r: B256::repeat_byte(0x50 + seed),
        s: B256::repeat_byte(0x60 + seed),
    }
}

fn attestation(seed: u8) -> KernelOp {
    KernelOp::AttestAsSeller {
        target: commitment(seed),
        clause_id: B256::repeat_byte(0x70),
        stage: 0,
        content_ref: B256::repeat_byte(0x71),
        seller_sig: signature(seed),
        proof: AttestationWitness::Plaintext(AttestationContentProof {
            spec_json: "{}".into(),
            content_json: "{}".into(),
            clause_data: "{}".into(),
            inclusion_proof: vec![],
            content_kind: ContentKind::ReAssert,
        }),
    }
}

fn sample() -> (Vec<KernelOp>, Vec<UsageClaim>) {
    let ops = vec![
        KernelOp::Commit {
            commitment: commitment(1),
            buyer_sig: signature(1),
            seller_sig: signature(2),
        },
        attestation(1),
        KernelOp::Commit {
            commitment: commitment(2),
            buyer_sig: signature(3),
            seller_sig: signature(4),
        },
        KernelOp::Resolve {
            process_id: B256::repeat_byte(0x01),
            // The sum of the listed payments, 100 + 200.
            cumulative_value: U256::from(300u64),
            commitments: vec![commitment(1), commitment(2)],
            buyer_sig: signature(5),
        },
    ];
    let claims = vec![
        UsageClaim {
            order: commitment(1),
            clause_or_assembly: B256::repeat_byte(0x80),
            kind: UsageClaimKind::Clause {
                clause_data_hash: B256::repeat_byte(0x81),
            },
            inclusion_proof: vec![B256::repeat_byte(0x82), B256::repeat_byte(0x83)],
        },
        UsageClaim {
            order: commitment(2),
            clause_or_assembly: B256::repeat_byte(0x90),
            kind: UsageClaimKind::Agreement {
                assembly_hash: B256::repeat_byte(0x91),
            },
            inclusion_proof: vec![],
        },
        UsageClaim {
            order: commitment(2),
            clause_or_assembly: B256::repeat_byte(0xa0),
            kind: UsageClaimKind::Assembly {
                agreement_hash: B256::repeat_byte(0xa1),
                slot_content_hash: B256::repeat_byte(0xa2),
                membership_proof: vec![B256::repeat_byte(0xa3)],
            },
            inclusion_proof: vec![B256::repeat_byte(0xa4)],
        },
    ];
    (ops, claims)
}

#[test]
fn the_stream_round_trips_and_skips_attestations() {
    let (ops, claims) = sample();
    let bytes = encode_operation_stream(&ops, &claims);
    // Two commits, one resolve naming two commitments, three claims; no
    // attestation entry.
    let commit_len = 1 + COMMITMENT_BYTES + 2 * SIGNATURE_BYTES;
    let resolve_len = 1 + 32 + SIGNATURE_BYTES + 2 + 2 * COMMITMENT_BYTES;
    let claim_clause = 1 + COMMITMENT_BYTES + 32 + 1 + 32 + 2 + 2 * 32;
    let claim_agreement = 1 + COMMITMENT_BYTES + 32 + 1 + 32 + 2;
    let claim_assembly = 1 + COMMITMENT_BYTES + 32 + 1 + 64 + 2 + 32 + 2 + 32;
    assert_eq!(
        bytes.len(),
        2 * commit_len + resolve_len + claim_clause + claim_agreement + claim_assembly
    );
    let (ops2, claims2) = decode_operation_stream(&bytes).expect("decodes");
    assert_eq!(ops2.len(), 3, "the attestation is not in the stream");
    assert_eq!(claims2.len(), 3);
    assert_eq!(encode_operation_stream(&ops2, &claims2), bytes, "re-encoding is the identity");
    match &ops2[2] {
        KernelOp::Resolve {
            process_id,
            cumulative_value,
            commitments,
            buyer_sig,
        } => {
            assert_eq!(*process_id, B256::repeat_byte(0x01));
            assert_eq!(*cumulative_value, U256::from(300u64), "the decoder derives the signed value from the listed payments");
            assert_eq!(commitments.len(), 2);
            assert_eq!(commitments[1].seller, commitment(2).seller);
            assert_eq!(buyer_sig.v, signature(5).v);
        }
        other => panic!("expected a resolve, got {other:?}"),
    }
    match &claims2[2].kind {
        UsageClaimKind::Assembly {
            membership_proof, ..
        } => assert_eq!(membership_proof, &vec![B256::repeat_byte(0xa3)]),
        other => panic!("expected an assembly claim, got {other:?}"),
    }
    // The kind byte is the chain's family code: the byte after the claim's
    // commitment and key.
    let claim_offset = 2 * commit_len + resolve_len;
    assert_eq!(bytes[claim_offset + 1 + COMMITMENT_BYTES + 32], USAGE_KIND_CLAUSE);
    assert_eq!(bytes[claim_offset + claim_clause + 1 + COMMITMENT_BYTES + 32], USAGE_KIND_AGREEMENT);
    assert_eq!(bytes[claim_offset + claim_clause + claim_agreement + 1 + COMMITMENT_BYTES + 32], USAGE_KIND_ASSEMBLY);
}

#[test]
fn the_hash_is_keccak_of_the_bytes_and_the_empty_stream_hashes_to_keccak_empty() {
    let (ops, claims) = sample();
    let bytes = encode_operation_stream(&ops, &claims);
    assert_eq!(compute_operations_hash(&bytes), keccak256(&bytes));
    assert_eq!(compute_operations_hash(&[]), keccak256([]));
    assert!(encode_operation_stream(&[], &[]).is_empty());
    assert!(encode_operation_stream(&[attestation(1)], &[]).is_empty(), "attestations alone leave an empty stream");
}

#[test]
fn the_decoder_refuses_a_truncated_stream_an_unknown_tag_and_a_claim_before_an_operation() {
    let (ops, claims) = sample();
    let bytes = encode_operation_stream(&ops, &claims);
    assert!(decode_operation_stream(&bytes[..bytes.len() - 1]).is_err(), "one byte short");
    assert!(decode_operation_stream(&[0x09]).is_err(), "unknown tag");
    let mut swapped = encode_operation_stream(&[], &claims[..1]);
    swapped.extend(encode_operation_stream(&ops[..1], &[]));
    assert!(decode_operation_stream(&swapped).is_err(), "a commit after a claim");
    let mut trailing = bytes.clone();
    trailing.push(0x00);
    assert!(decode_operation_stream(&trailing).is_err(), "a trailing byte is an unknown tag");
}

#[test]
fn a_batch_of_nothing_commits_the_empty_stream_hash_as_word_nine() {
    let input = BatchInput {
        chain_id: 31337,
        verifying_contract: Address::repeat_byte(0xee),
        block_timestamp: 1_700_000_000,
        operations: vec![],
        prev_state: KernelState::new().to_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_leaf: B256::ZERO,
    };
    let (pv, _, _) = apply_batch(&input).expect("an empty batch applies");
    assert_eq!(pv.operations_hash, keccak256([]));
    let abi = pv.abi_encode();
    assert_eq!(abi.len(), 320);
    assert_eq!(&abi[288..320], pv.operations_hash.as_slice(), "word nine is the operations hash");
}
