//! The cross-language lock of the operation stream's bytes: this file writes
//! `test/fixtures/operation-stream-vectors.json` (run with
//! `cargo test -p figaro-kernel --test operation_stream_vectors -- --ignored write_fixture`)
//! and, on every run, asserts the committed fixture is what the encoder
//! produces; `test/core/verifier/OperationStreamVectorsTest.t.sol` feeds
//! each stream to `FigaroBatchVerifier.settleBatch` and expects the order
//! and process events the Core would have emitted for the same entries,
//! with ids derived under the verifier's own domain. A byte the two readers
//! disagree on fails one of them.

use alloy_primitives::{Address, B256, U256};
use figaro_kernel::operation_stream::encode_operation_stream;
use figaro_kernel::types::{Commitment, KernelOp, Signature, UsageClaim, UsageClaimKind};
use serde_json::{json, Value};

fn fixture_path() -> std::path::PathBuf {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop();
    p.pop();
    p.push("test/fixtures/operation-stream-vectors.json");
    p
}

fn commitment(seed: u8, process_id: B256, cumulative: u64) -> Commitment {
    Commitment {
        process_id,
        buyer: Address::repeat_byte(0xB0),
        seller: Address::repeat_byte(0x50 + seed),
        currency: Address::repeat_byte(0xC0),
        payment: U256::from(100u64 * seed as u64),
        expected_cumulative_value: U256::from(cumulative),
        checkout_hash: B256::repeat_byte(0x40 + seed),
        salt: U256::from(seed),
        deadline: U256::from(4_000_000_000u64),
    }
}

fn signature(seed: u8) -> Signature {
    Signature {
        v: 27 + (seed % 2),
        r: B256::repeat_byte(0x60 + seed),
        s: B256::repeat_byte(0x70 + seed),
    }
}

fn commitment_json(c: &Commitment) -> Value {
    json!({
        "processId": format!("{:#x}", c.process_id),
        "buyer": format!("{:#x}", c.buyer),
        "seller": format!("{:#x}", c.seller),
        "currency": format!("{:#x}", c.currency),
        "payment": c.payment.to_string(),
        "expectedCumulativeValue": c.expected_cumulative_value.to_string(),
        "checkoutHash": format!("{:#x}", c.checkout_hash),
        "salt": c.salt.to_string(),
        "deadline": c.deadline.to_string(),
    })
}

/// The vectors: a root commit; a process of two orders (a root commit, an
/// extension naming the process, a resolve of both); a claim-bearing stream
/// whose claims the chain parses and skips.
fn vectors() -> Value {
    let process = B256::repeat_byte(0xAA);
    let root = commitment(1, B256::ZERO, 100);
    let first = commitment(2, process, 200);
    let second = commitment(3, process, 500);
    let claim = UsageClaim {
        order: first.clone(),
        clause_or_assembly: B256::repeat_byte(0x80),
        kind: UsageClaimKind::Clause {
            clause_data_hash: B256::repeat_byte(0x81),
        },
        inclusion_proof: vec![B256::repeat_byte(0x82)],
    };
    let assembly_claim = UsageClaim {
        order: second.clone(),
        clause_or_assembly: B256::repeat_byte(0x90),
        kind: UsageClaimKind::Assembly {
            agreement_hash: B256::repeat_byte(0x91),
            slot_content_hash: B256::repeat_byte(0x92),
            membership_proof: vec![B256::repeat_byte(0x93), B256::repeat_byte(0x94)],
        },
        inclusion_proof: vec![],
    };
    let streams = vec![
        (
            "oneRootCommit",
            vec![KernelOp::Commit {
                commitment: root.clone(),
                buyer_sig: signature(1),
                seller_sig: signature(2),
            }],
            vec![],
        ),
        (
            "twoOrdersCommittedAndResolved",
            vec![
                KernelOp::Commit {
                    commitment: first.clone(),
                    buyer_sig: signature(3),
                    seller_sig: signature(4),
                },
                KernelOp::Commit {
                    commitment: second.clone(),
                    buyer_sig: signature(5),
                    seller_sig: signature(6),
                },
                KernelOp::Resolve {
                    process_id: process,
                    cumulative_value: second.expected_cumulative_value,
                    commitments: vec![first.clone(), second.clone()],
                    buyer_sig: signature(7),
                },
            ],
            vec![],
        ),
        (
            "claimsAfterOperations",
            vec![KernelOp::Commit {
                commitment: first.clone(),
                buyer_sig: signature(3),
                seller_sig: signature(4),
            }],
            vec![claim, assembly_claim],
        ),
    ];
    let mut out = Vec::new();
    for (name, ops, claims) in streams {
        let bytes = encode_operation_stream(&ops, &claims);
        let mut entries = Vec::new();
        for op in &ops {
            match op {
                KernelOp::Commit { commitment, .. } => entries.push(json!({"kind": "commit", "commitment": commitment_json(commitment)})),
                KernelOp::Resolve { process_id, commitments, .. } => entries.push(json!({
                    "kind": "resolve",
                    "processId": format!("{:#x}", process_id),
                    "commitments": commitments.iter().map(commitment_json).collect::<Vec<_>>(),
                })),
                _ => {}
            }
        }
        out.push(json!({
            "name": name,
            "stream": format!("0x{}", alloy_primitives::hex::encode(&bytes)),
            "entryCount": entries.len(),
            "entries": entries,
            "claimCount": claims.len(),
        }));
    }
    json!({ "streamCount": out.len(), "streams": out })
}

#[test]
#[ignore]
fn write_fixture() {
    let v = vectors();
    std::fs::write(fixture_path(), serde_json::to_string_pretty(&v).unwrap() + "\n").unwrap();
}

#[test]
fn the_committed_fixture_is_what_the_encoder_produces() {
    let committed: Value = serde_json::from_str(
        &std::fs::read_to_string(fixture_path()).expect("the fixture is committed; write it with --ignored write_fixture"),
    )
    .unwrap();
    assert_eq!(committed, vectors(), "the fixture drifted from the encoder: rewrite it with --ignored write_fixture");
}
