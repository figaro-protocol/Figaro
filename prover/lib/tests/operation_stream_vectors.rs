//! The cross-language lock of the operation stream's bytes: this file writes
//! `test/fixtures/operation-stream-vectors.json` (run with
//! `FIGARO_WRITE_FIXTURES=1 cargo test -p figaro-kernel --test operation_stream_vectors`)
//! and, on every run, asserts the committed fixture is what the encoder
//! produces; `test/core/verifier/OperationStreamVectorsTest.t.sol` feeds
//! each stream to `FigaroBatchVerifier.settleBatch` and expects the order
//! and process events the Core would have emitted for the same entries,
//! with ids derived under the verifier's own domain. A byte the two readers
//! disagree on fails one of them.

use alloy_primitives::{Address, B256, U256};
use figaro_kernel::operation_stream::{encode_operation_stream, wallet_code_attestations};
use figaro_kernel::types::{
    AttestationWitness, AttesterRole, Commitment, KernelOp, Signature, UsageClaim, UsageClaimKind,
};
use serde_json::{json, Value};

mod common;

fn commitment(seed: u8, process_id: B256, cumulative: u64) -> Commitment {
    Commitment {
        process_id,
        buyer: Address::repeat_byte(0xB0),
        seller: Address::repeat_byte(0x50 + seed),
        token: Address::repeat_byte(0xC0),
        payment: U256::from(100u64 * seed as u64),
        running_total: U256::from(cumulative),
        checkout_hash: B256::repeat_byte(0x40 + seed),
        salt: U256::from(seed),
        commit_deadline: U256::from(4_000_000_000u64),
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
        "token": format!("{:#x}", c.token),
        "payment": c.payment.to_string(),
        "runningTotal": c.running_total.to_string(),
        "checkoutHash": format!("{:#x}", c.checkout_hash),
        "salt": c.salt.to_string(),
        "commitDeadline": c.commit_deadline.to_string(),
    })
}

/// The vectors: a root commit; a process of two orders (a root commit, an
/// extension naming the process, a resolve of both); the same process
/// resolved by its buyer's wallet code, with authorizations of 17, 0 and 300
/// bytes (the length's low byte alone, none, and its high byte); a
/// claim-bearing stream
/// whose claims the chain parses and skips; and a stream that carries an
/// attestation authorized by wallet code in each role (the seller's on an
/// order of a named process, with 17 bytes; the buyer's on a root order,
/// whose process id the verifier derives, with none) and an agreement claim
/// whose inclusion proof has two words.
fn vectors() -> Value {
    let process = B256::repeat_byte(0xAA);
    let root = commitment(1, B256::ZERO, 100);
    let first = commitment(2, process, 200);
    let second = commitment(3, process, 500);
    let claim = UsageClaim {
        order: first.clone(),
        clause_or_process: B256::repeat_byte(0x80),
        kind: UsageClaimKind::Clause {
            clause_data_hash: B256::repeat_byte(0x81),
        },
        inclusion_proof: vec![B256::repeat_byte(0x82)],
    };
    let assembly_claim = UsageClaim {
        order: second.clone(),
        clause_or_process: B256::repeat_byte(0x90),
        kind: UsageClaimKind::Process {
            agreement_hash: B256::repeat_byte(0x91),
            agreement_content_hash: B256::repeat_byte(0x92),
            membership_proof: vec![B256::repeat_byte(0x93), B256::repeat_byte(0x94)],
        },
        inclusion_proof: vec![],
    };
    let agreement_claim = UsageClaim {
        order: second.clone(),
        clause_or_process: B256::repeat_byte(0xA1),
        kind: UsageClaimKind::Agreement {
            process_design_hash: B256::repeat_byte(0xA2),
        },
        inclusion_proof: vec![B256::repeat_byte(0xA3), B256::repeat_byte(0xA4)],
    };
    let attest_by_wallet_code =
        |role: AttesterRole, target: &Commitment, seed: u8, authorization: Vec<u8>| {
            KernelOp::AttestByWalletCode {
                role,
                target: target.clone(),
                clause_id: B256::repeat_byte(0xD0 + seed),
                stage: seed,
                content_ref: B256::repeat_byte(0xE0 + seed),
                authorization: alloy_primitives::Bytes::from(authorization),
                // The witness never enters the stream.
                proof: AttestationWitness {
                    clause_data_hash: B256::repeat_byte(0xF0 + seed),
                    inclusion_proof: vec![],
                },
            }
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
                    running_total: second.running_total,
                    commitments: vec![first.clone(), second.clone()],
                    buyer_sig: signature(7),
                },
            ],
            vec![],
        ),
        (
            "twoOrdersResolvedByWalletCode",
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
                KernelOp::ResolveByWalletCode {
                    process_id: process,
                    running_total: second.running_total,
                    commitments: vec![first.clone(), second.clone()],
                    authorization: alloy_primitives::Bytes::from(b"guardian-approval".to_vec()),
                },
            ],
            vec![],
        ),
        (
            "walletCodeResolveWithAnEmptyAuthorization",
            vec![KernelOp::ResolveByWalletCode {
                process_id: process,
                running_total: second.running_total,
                commitments: vec![first.clone(), second.clone()],
                authorization: alloy_primitives::Bytes::new(),
            }],
            vec![],
        ),
        (
            "walletCodeResolveWithA300ByteAuthorization",
            vec![KernelOp::ResolveByWalletCode {
                process_id: process,
                running_total: second.running_total,
                commitments: vec![first.clone(), second.clone()],
                authorization: alloy_primitives::Bytes::from(
                    (0..300u16).map(|i| i as u8).collect::<Vec<u8>>(),
                ),
            }],
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
        (
            "walletCodeAttestationsAndAnAgreementClaim",
            vec![
                KernelOp::Commit {
                    commitment: root.clone(),
                    buyer_sig: signature(1),
                    seller_sig: signature(2),
                },
                attest_by_wallet_code(
                    AttesterRole::Seller,
                    &first,
                    1,
                    b"seller-guardian-1".to_vec(),
                ),
                attest_by_wallet_code(AttesterRole::Buyer, &root, 2, vec![]),
            ],
            vec![agreement_claim],
        ),
    ];
    let mut out = Vec::new();
    for (name, ops, claims) in streams {
        let bytes = encode_operation_stream(&ops, &claims);
        let mut entries = Vec::new();
        for op in &ops {
            match op {
                KernelOp::Commit { commitment, .. } => entries
                    .push(json!({"kind": "commit", "commitment": commitment_json(commitment)})),
                KernelOp::Resolve {
                    process_id,
                    commitments,
                    ..
                } => entries.push(json!({
                    "kind": "resolve",
                    "processId": format!("{:#x}", process_id),
                    "commitments": commitments.iter().map(commitment_json).collect::<Vec<_>>(),
                })),
                KernelOp::ResolveByWalletCode {
                    process_id,
                    commitments,
                    authorization,
                    ..
                } => entries.push(json!({
                    "kind": "resolveByWalletCode",
                    "processId": format!("{:#x}", process_id),
                    "authorization": format!("{authorization:#x}"),
                    "commitments": commitments.iter().map(commitment_json).collect::<Vec<_>>(),
                })),
                _ => {}
            }
        }
        // The `0x05` entries follow every commit and resolve in the stream.
        for a in wallet_code_attestations(&ops) {
            entries.push(json!({
                "kind": "attestByWalletCode",
                "role": match a.role {
                    AttesterRole::Seller => "seller",
                    AttesterRole::Buyer => "buyer",
                },
                "target": commitment_json(&a.target),
                "clauseId": format!("{:#x}", a.clause_id),
                "stage": a.stage,
                "contentRef": format!("{:#x}", a.content_ref),
                "authorization": format!("{:#x}", a.authorization),
            }));
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
fn the_committed_fixture_is_what_the_encoder_produces() {
    common::committed_fixture_is("operation-stream-vectors.json", &vectors());
}
