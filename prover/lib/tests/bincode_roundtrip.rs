//! What crosses into the proof program: the relay writes one `GuestInput`
//! to SP1's stdin (`prover/sequencer/src/prover.rs`, `stdin.write(&guest)`),
//! which serializes it with bincode, and the guest reads it back
//! (`prover/program/src/main.rs`, `sp1_zkvm::io::read::<GuestInput>()`). The
//! public values go the other way as `abi_encode`'s bytes, never through
//! bincode, and the relay's `BatchInput` never crosses at all.
//!
//! These tests round-trip `GuestInput` through bincode's default options
//! (SP1's) and hold the decoded value to the original field for field (their
//! `Debug` forms, which print every field: the types carry no `PartialEq`,
//! and none is added to the guest's types for a test) and its re-encoding to
//! the same bytes. Standing rules they guard: no `serde_json::Value` on a
//! type that crosses (bincode is not self-describing, so `deserialize_any`
//! panics), and no `#[serde(skip_serializing_if)]` reachable from
//! `GuestInput` (a skipped field desyncs the guest's reader).

use alloy_primitives::{keccak256, Bytes, B256, U256};
use figaro_kernel::eip712::{domain_separator, resolve_struct_hash, typed_data_hash};
use figaro_kernel::kernel::{apply_guest, derive_commitment_ids, guest_input};
use figaro_kernel::state_tree::ProofItem;
use figaro_kernel::types::*;

mod common;
use common::{
    empty_snapshot, make_signing_key, sign_commitment, sign_digest, BUYER, BUYER_KEY, CHAIN_ID,
    CORE, SELLER1, SELLER1_KEY, TOKEN,
};

fn sig(byte: u8) -> Signature {
    Signature {
        v: 27,
        r: B256::repeat_byte(byte),
        s: B256::repeat_byte(byte.wrapping_add(1)),
    }
}

fn commitment(seed: u8) -> Commitment {
    Commitment {
        process_id: B256::repeat_byte(seed),
        buyer: BUYER,
        seller: SELLER1,
        token: TOKEN,
        payment: U256::from(100u64) + U256::from(seed),
        running_total: U256::from(200u64) + U256::from(seed),
        checkout_hash: keccak256([seed]),
        salt: U256::from(seed) << 200,
        commit_deadline: U256::from(1000u64),
    }
}

fn witness(seed: u8) -> AttestationWitness {
    AttestationWitness {
        clause_data_hash: B256::repeat_byte(seed),
        inclusion_proof: vec![B256::repeat_byte(0xcc), B256::repeat_byte(0xdd)],
    }
}

/// One operation of each `KernelOp` variant. No wildcard arm: a variant
/// added to the guest's operations fails to compile here until it is given
/// a value that crosses.
fn one_of_each_operation() -> Vec<KernelOp> {
    let ops = vec![
        KernelOp::Commit {
            commitment: commitment(1),
            buyer_sig: sig(0x10),
            seller_sig: sig(0x20),
        },
        KernelOp::Resolve {
            process_id: B256::repeat_byte(2),
            running_total: U256::MAX,
            commitments: vec![commitment(2), commitment(3)],
            buyer_sig: sig(0x30),
        },
        KernelOp::ResolveByWalletCode {
            process_id: B256::repeat_byte(4),
            running_total: U256::from(7u64),
            commitments: vec![commitment(4)],
            authorization: Bytes::from(vec![0xab; 70]),
        },
        KernelOp::AttestAsSeller {
            target: commitment(5),
            clause_id: B256::repeat_byte(0x51),
            stage: 1,
            content_ref: B256::repeat_byte(0x52),
            seller_sig: sig(0x50),
            proof: witness(0x53),
        },
        KernelOp::AttestAsBuyer {
            target: commitment(6),
            clause_id: B256::repeat_byte(0x61),
            stage: 0,
            content_ref: B256::repeat_byte(0x62),
            buyer_sig: sig(0x60),
            proof: witness(0x63),
        },
        KernelOp::AttestByWalletCode {
            role: AttesterRole::Buyer,
            target: commitment(7),
            clause_id: B256::repeat_byte(0x71),
            stage: 2,
            content_ref: B256::repeat_byte(0x72),
            authorization: Bytes::new(),
            proof: witness(0x73),
        },
        KernelOp::AttestByWalletCode {
            role: AttesterRole::Seller,
            target: commitment(8),
            clause_id: B256::repeat_byte(0x81),
            stage: 3,
            content_ref: B256::repeat_byte(0x82),
            authorization: Bytes::from(vec![0x01, 0x02, 0x03]),
            proof: AttestationWitness {
                clause_data_hash: B256::repeat_byte(0x83),
                inclusion_proof: vec![],
            },
        },
    ];
    for op in &ops {
        match op {
            KernelOp::Commit { .. }
            | KernelOp::Resolve { .. }
            | KernelOp::ResolveByWalletCode { .. }
            | KernelOp::AttestAsSeller { .. }
            | KernelOp::AttestAsBuyer { .. }
            | KernelOp::AttestByWalletCode { .. } => {}
        }
    }
    ops
}

/// One usage claim of each kind.
fn one_of_each_claim() -> Vec<UsageClaim> {
    let claim = |kind: UsageClaimKind| UsageClaim {
        order: commitment(9),
        clause_or_process: B256::repeat_byte(0x0d),
        kind,
        inclusion_proof: vec![B256::repeat_byte(0x0e)],
    };
    vec![
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
    ]
}

/// Serialize as SP1's stdin does, read back as the guest does, and hold the
/// two to each other: every field, and the bytes again.
fn crosses(input: &GuestInput) -> GuestInput {
    let bytes = bincode::serialize(input).expect("serialize");
    let decoded: GuestInput = bincode::deserialize(&bytes).expect("deserialize");
    assert_eq!(
        format!("{decoded:?}"),
        format!("{input:?}"),
        "the guest reads every field the relay wrote"
    );
    assert_eq!(
        bincode::serialize(&decoded).expect("serialize"),
        bytes,
        "the decoded input re-encodes to the same bytes"
    );
    decoded
}

/// Every operation variant, every usage-claim kind, every proof item and
/// both an absent and a present entry of each map of the witness cross.
#[test]
fn a_guest_input_with_every_variant_crosses_bincode_unchanged() {
    let input = GuestInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: u64::MAX,
        operations: one_of_each_operation(),
        prev_witness: StateWitness {
            processes: vec![
                (B256::repeat_byte(0xa1), None),
                (
                    B256::repeat_byte(0xa2),
                    Some(ProcessState {
                        root_buyer: BUYER,
                        token: TOKEN,
                        running_total: U256::from(300u64),
                        active_order_count: 2,
                    }),
                ),
            ],
            orders: vec![
                (B256::repeat_byte(0xb1), None),
                (B256::repeat_byte(0xb2), Some(2)),
            ],
            proof: vec![
                ProofItem::Descend,
                ProofItem::Empty,
                ProofItem::Leaf {
                    path: B256::repeat_byte(0xc1),
                    value_hash: B256::repeat_byte(0xc2),
                },
                ProofItem::Node(B256::repeat_byte(0xc3)),
            ],
        },
        usage_claims: one_of_each_claim(),
        usage_period: 2,
    };
    crosses(&input);
}

/// A witness the relay builds for a real batch (`guest_input`, the function
/// `prove_batch` calls) crosses, and the guest's run on what it read is its
/// run on what was written: the same public values.
#[test]
fn a_built_witness_crosses_and_the_guest_s_run_is_unchanged() {
    let domain = domain_separator(CHAIN_ID, CORE);
    let order = Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: SELLER1,
        token: TOKEN,
        payment: U256::from(100u64),
        running_total: U256::from(100u64),
        checkout_hash: keccak256("bincode"),
        salt: U256::from(1u64),
        commit_deadline: U256::from(2000u64),
    };
    let (_, process_id) = derive_commitment_ids(&domain, &order);
    let buyer = make_signing_key(BUYER_KEY);
    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: order.clone(),
                buyer_sig: sign_commitment(&order, &domain, &buyer),
                seller_sig: sign_commitment(&order, &domain, &make_signing_key(SELLER1_KEY)),
            },
            KernelOp::Resolve {
                process_id,
                running_total: order.payment,
                commitments: vec![order.clone()],
                buyer_sig: sign_digest(
                    &buyer,
                    &typed_data_hash(&domain, &resolve_struct_hash(&process_id, &order.payment)),
                ),
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };
    let guest = guest_input(&input).expect("the witness builds");
    assert!(
        !guest.prev_witness.processes.is_empty() && !guest.prev_witness.orders.is_empty(),
        "the witness carries the entries the batch touches"
    );
    let read = crosses(&guest);
    let (written_pv, _, _) = apply_guest(&guest).expect("the guest applies what was written");
    let (read_pv, _, _) = apply_guest(&read).expect("the guest applies what it read");
    assert_eq!(read_pv.abi_encode(), written_pv.abi_encode());
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
