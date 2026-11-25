//! The cross-language lock of the public values' word order: this file
//! writes `test/fixtures/public-values-vectors.json` from
//! `PublicValues::abi_encode` — the bytes the guest commits
//! (`prover/program/src/main.rs`) and the relay submits — (run with
//! `FIGARO_WRITE_FIXTURES=1 cargo test -p figaro-kernel --test public_values_vectors`)
//! and, on every run, asserts the committed fixture is what the encoder
//! produces. `test/core/verifier/PublicValuesVectorsTest.t.sol` feeds each
//! vector's bytes to `FigaroBatchVerifier` and proves each word lands where
//! the contract reads it: the `distinctWords` vector, nine distinct
//! recognizable words, through `_decodePV` field for field; and each
//! batch vector through `settleBatch`, where every word but the one
//! under test matches the test's chain (an empty batch on the genesis root,
//! at a fixed chain id, verifier address and block time), so the batch lands
//! or reverts with the error of exactly the word under test. Two words
//! swapped in either reader fail one of the two tests.

use alloy_primitives::{address, Address, B256};
use figaro_kernel::kernel::{
    compute_attestation_events_hash, compute_positions_hash, compute_usage_accrual_hash,
    PROVENANCE_LEAF_KEY,
};
use figaro_kernel::operation_stream::{compute_operations_hash, encode_operation_stream};
use figaro_kernel::types::PublicValues;
use serde_json::{json, Value};

mod common;

/// The chain the Foundry test runs on (the mock SP1 verifier deploys on
/// 31337 alone).
const CHAIN_ID: u64 = 31337;
/// Where the Foundry test deploys the verifier (`deployCodeTo`).
const VERIFIER: Address = address!("000000000000000000000000000000000000Fb57");
/// The block time the Foundry test warps to.
const BLOCK_TIMESTAMP: u64 = 1_700_000_000;
/// The usage period the batch vectors commit (no use, so any period).
const USAGE_PERIOD: u8 = 0;

/// The public values of an empty batch on the genesis root under the test's
/// chain, verifier and clock, landing on `new_root`: every hash the guest
/// commits for no positions, no attestations, no uses and no operations.
fn lands(new_root: B256) -> PublicValues {
    PublicValues {
        prev_state_root: B256::ZERO,
        new_state_root: new_root,
        chain_id: CHAIN_ID,
        verifying_contract: VERIFIER,
        token_ops_hash: compute_positions_hash(&[]),
        attestation_events_hash: compute_attestation_events_hash(&[]),
        usage_accrual_hash: compute_usage_accrual_hash(USAGE_PERIOD, &PROVENANCE_LEAF_KEY, &[]),
        block_timestamp: BLOCK_TIMESTAMP,
        operations_hash: compute_operations_hash(&encode_operation_stream(&[], &[])),
    }
}

/// A word no reader confuses with another: 32 bytes of `byte`.
fn word(byte: u8) -> B256 {
    B256::repeat_byte(byte)
}

/// Each vector: its name, its public values, and the outcome the verifier
/// gives them (`lands`, or the error of the word under test).
fn cases() -> Vec<(&'static str, PublicValues, &'static str)> {
    let new_root = word(0xa1);
    let base = lands(new_root);
    vec![
        (
            "distinctWords",
            PublicValues {
                prev_state_root: word(0xa0),
                new_state_root: word(0xa1),
                chain_id: 0xc2c2_c2c2_c2c2_c2c2,
                verifying_contract: Address::repeat_byte(0xa3),
                token_ops_hash: word(0xa4),
                attestation_events_hash: word(0xa5),
                usage_accrual_hash: word(0xa6),
                block_timestamp: 0xa7a7_a7a7_a7a7_a7a7,
                operations_hash: word(0xa8),
            },
            "decodes",
        ),
        ("lands", base.clone(), "lands"),
        (
            "previousRootIsNotTheStoredRoot",
            PublicValues {
                prev_state_root: word(0xa0),
                ..base.clone()
            },
            "StateRootMismatch",
        ),
        (
            "chainIdIsNotTheChain",
            PublicValues {
                chain_id: 0xc2c2_c2c2_c2c2_c2c2,
                ..base.clone()
            },
            "ChainIdMismatch",
        ),
        (
            "verifyingContractIsNotTheVerifier",
            PublicValues {
                verifying_contract: Address::repeat_byte(0xa3),
                ..base.clone()
            },
            "VerifyingContractMismatch",
        ),
        (
            "timestampIsAheadOfTheBlock",
            PublicValues {
                block_timestamp: BLOCK_TIMESTAMP + 1,
                ..base.clone()
            },
            "BatchTimestampOutOfRange",
        ),
        (
            "positionsHashIsNotThePositions",
            PublicValues {
                token_ops_hash: word(0xa4),
                ..base.clone()
            },
            "PositionHashMismatch",
        ),
        (
            "attestationsHashIsNotTheAttestations",
            PublicValues {
                attestation_events_hash: word(0xa5),
                ..base.clone()
            },
            "AttestationHashMismatch",
        ),
        (
            "usageHashIsNotTheUsage",
            PublicValues {
                usage_accrual_hash: word(0xa6),
                ..base.clone()
            },
            "UsageAccrualHashMismatch",
        ),
        (
            "operationsHashIsNotTheStream",
            PublicValues {
                operations_hash: word(0xa8),
                ..base
            },
            "OperationsHashMismatch",
        ),
    ]
}

fn vectors() -> Value {
    let vectors: Vec<Value> = cases()
        .into_iter()
        .map(|(name, pv, outcome)| {
            json!({
                "name": name,
                "outcome": outcome,
                "publicValues": format!("0x{}", alloy_primitives::hex::encode(pv.abi_encode())),
                "prevStateRoot": format!("{:#x}", pv.prev_state_root),
                "newStateRoot": format!("{:#x}", pv.new_state_root),
                "chainId": pv.chain_id.to_string(),
                "verifyingContract": format!("{:#x}", pv.verifying_contract),
                "tokenOpsHash": format!("{:#x}", pv.token_ops_hash),
                "attestationEventsHash": format!("{:#x}", pv.attestation_events_hash),
                "usageAccrualHash": format!("{:#x}", pv.usage_accrual_hash),
                "blockTimestamp": pv.block_timestamp.to_string(),
                "operationsHash": format!("{:#x}", pv.operations_hash),
            })
        })
        .collect();
    json!({
        "chainId": CHAIN_ID.to_string(),
        "verifyingContract": format!("{VERIFIER:#x}"),
        "blockTimestamp": BLOCK_TIMESTAMP.to_string(),
        "usagePeriod": USAGE_PERIOD.to_string(),
        "usageProvenanceLeaf": format!("{PROVENANCE_LEAF_KEY:#x}"),
        "vectorCount": vectors.len().to_string(),
        "vectors": vectors,
    })
}

#[test]
fn the_committed_fixture_is_what_the_encoder_produces() {
    common::committed_fixture_is("public-values-vectors.json", &vectors());
}

/// Every batch vector differs from the landing one in exactly the word
/// under test, so a revert names that word and no other.
#[test]
fn each_settlement_vector_differs_from_the_landing_one_in_one_word() {
    let all = cases();
    let landing = all
        .iter()
        .find(|(name, _, _)| *name == "lands")
        .unwrap()
        .1
        .abi_encode();
    for (name, pv, outcome) in &all {
        if matches!(*outcome, "lands" | "decodes") {
            continue;
        }
        let bytes = pv.abi_encode();
        let differing: Vec<usize> = (0..9)
            .filter(|i| bytes[i * 32..(i + 1) * 32] != landing[i * 32..(i + 1) * 32])
            .collect();
        assert_eq!(
            differing.len(),
            1,
            "{name} differs in one word: {differing:?}"
        );
    }
    let distinct = &all[0].1.abi_encode();
    let mut words: Vec<&[u8]> = (0..9).map(|i| &distinct[i * 32..(i + 1) * 32]).collect();
    words.sort();
    words.dedup();
    assert_eq!(
        words.len(),
        9,
        "the distinct vector's nine words are distinct"
    );
}
