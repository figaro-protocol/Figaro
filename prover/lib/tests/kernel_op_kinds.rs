//! The proof program carries no registration operation. Registering a
//! clause, an agreement, an assembly or a member stays on the direct path
//! (`KernelOp`'s doc comment in `src/types.rs`), so what a batch publishes —
//! its operation stream, the only operation data `FigaroBatchVerifier`
//! reads — holds the Core's entries and nothing else: a commit (`0x01`), a
//! resolve (`0x02`), a usage claim (`0x03`), a wallet-code resolve (`0x04`)
//! and a wallet-code attestation (`0x05`), the tags the stream's format
//! documents (`src/operation_stream.rs`).
//!
//! `documented_tag` matches `KernelOp` exhaustively, with no wildcard arm: a
//! new variant stops this file from compiling until it is given its entry,
//! and the test then asserts that the encoder writes that entry and only it.

use alloy_primitives::{Bytes, B256, U256};
use figaro_kernel::operation_stream::{decode_operation_stream, encode_operation_stream};
use figaro_kernel::types::*;

/// The stream entry the format documents for each operation; `None` for a
/// signed attestation, which moves no state and is published through the
/// attestation events (public value 5), never the stream.
fn documented_tag(op: &KernelOp) -> Option<u8> {
    match op {
        KernelOp::Commit { .. } => Some(0x01),
        KernelOp::Resolve { .. } => Some(0x02),
        KernelOp::ResolveByWalletCode { .. } => Some(0x04),
        KernelOp::AttestAsSeller { .. } | KernelOp::AttestAsBuyer { .. } => None,
        KernelOp::AttestByWalletCode { .. } => Some(0x05),
    }
}

fn commitment() -> Commitment {
    Commitment {
        process_id: B256::repeat_byte(1),
        buyer: alloy_primitives::Address::repeat_byte(2),
        seller: alloy_primitives::Address::repeat_byte(3),
        token: alloy_primitives::Address::repeat_byte(4),
        payment: U256::from(5u64),
        running_total: U256::from(5u64),
        checkout_hash: B256::repeat_byte(6),
        salt: U256::from(7u64),
        commit_deadline: U256::from(8u64),
    }
}

fn sig() -> Signature {
    Signature {
        v: 27,
        r: B256::repeat_byte(9),
        s: B256::repeat_byte(10),
    }
}

fn witness() -> AttestationWitness {
    AttestationWitness {
        clause_data_hash: B256::repeat_byte(11),
        inclusion_proof: vec![],
    }
}

/// One operation of each variant.
fn one_of_each() -> Vec<KernelOp> {
    vec![
        KernelOp::Commit {
            commitment: commitment(),
            buyer_sig: sig(),
            seller_sig: sig(),
        },
        KernelOp::Resolve {
            process_id: B256::repeat_byte(1),
            running_total: U256::from(5u64),
            commitments: vec![commitment()],
            buyer_sig: sig(),
        },
        KernelOp::ResolveByWalletCode {
            process_id: B256::repeat_byte(1),
            running_total: U256::from(5u64),
            commitments: vec![commitment()],
            authorization: Bytes::from(vec![0xab]),
        },
        KernelOp::AttestAsSeller {
            target: commitment(),
            clause_id: B256::repeat_byte(12),
            stage: 0,
            content_ref: B256::repeat_byte(13),
            seller_sig: sig(),
            proof: witness(),
        },
        KernelOp::AttestAsBuyer {
            target: commitment(),
            clause_id: B256::repeat_byte(12),
            stage: 0,
            content_ref: B256::repeat_byte(13),
            buyer_sig: sig(),
            proof: witness(),
        },
        KernelOp::AttestByWalletCode {
            role: AttesterRole::Seller,
            target: commitment(),
            clause_id: B256::repeat_byte(12),
            stage: 0,
            content_ref: B256::repeat_byte(13),
            authorization: Bytes::from(vec![0xcd]),
            proof: witness(),
        },
    ]
}

/// Each operation, encoded alone, is the entry the format documents for it
/// (or none), and decodes back to one entry; a usage claim is `0x03`. The
/// tags a batch can publish are exactly the five documented ones.
#[test]
fn every_operation_publishes_its_documented_entry_and_no_other() {
    let mut tags = std::collections::BTreeSet::new();
    for op in one_of_each() {
        let stream = encode_operation_stream(std::slice::from_ref(&op), &[]);
        match documented_tag(&op) {
            None => assert!(stream.is_empty(), "{op:?} publishes no entry"),
            Some(tag) => {
                assert_eq!(stream[0], tag, "{op:?}");
                let (ops, attestations, claims) =
                    decode_operation_stream(&stream).expect("the entry decodes");
                assert_eq!(ops.len() + attestations.len(), 1, "{op:?} is one entry");
                assert!(claims.is_empty());
                tags.insert(tag);
            }
        }
    }
    let claim = UsageClaim {
        order: commitment(),
        clause_or_process: B256::repeat_byte(14),
        kind: UsageClaimKind::Clause {
            clause_data_hash: B256::repeat_byte(15),
        },
        inclusion_proof: vec![],
    };
    let stream = encode_operation_stream(&[], &[claim]);
    assert_eq!(stream[0], 0x03, "a usage claim's entry");
    tags.insert(stream[0]);
    assert_eq!(
        tags.into_iter().collect::<Vec<_>>(),
        vec![0x01, 0x02, 0x03, 0x04, 0x05],
        "a batch publishes the Core's five entries, and no registration"
    );
}
