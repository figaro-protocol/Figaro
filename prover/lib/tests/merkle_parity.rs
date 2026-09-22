//! The guest's leg of the three-way agreement-tree lock.
//!
//! `sdk/tests/merkleParity.test.ts` freezes SDK-built roots, leaves and
//! inclusion proofs into `test/fixtures/merkle-vectors.json`;
//! `test/core/attestation/MerkleParityTest.t.sol` verifies them with the
//! OpenZeppelin library the direct path calls; this file verifies them with
//! `merkle::verify_inclusion`, the batch path's verifier, from a leaf rebuilt
//! the way the guest rebuilds it for a usage claim — clause key
//! `clause_id_hash(clause, version)`, section hash over the canonical bytes,
//! `keccak256(keccak256(key ‖ sectionHash))`.
use std::str::FromStr;

use alloy_primitives::{keccak256, B256};

use figaro_kernel::kernel::clause_id_hash;
use figaro_kernel::merkle::verify_inclusion;

fn fixture() -> serde_json::Value {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("test/fixtures/merkle-vectors.json");
    let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    serde_json::from_str(&text).expect("fixture JSON")
}

fn b256(v: &serde_json::Value) -> B256 {
    B256::from_str(v.as_str().expect("hex string")).expect("bytes32")
}

fn leaf(clause: &str, version: u64, section_data: &str) -> B256 {
    let key = clause_id_hash(clause, version);
    let section_hash = keccak256(section_data.as_bytes());
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(key.as_slice());
    preimage[32..].copy_from_slice(section_hash.as_slice());
    keccak256(keccak256(preimage))
}

#[test]
fn every_frozen_proof_opens_against_the_rebuilt_leaf() {
    let fx = fixture();
    let agreements = fx["agreements"].as_array().expect("agreements");
    assert_eq!(
        agreements.len() as u64,
        fx["agreementCount"].as_u64().unwrap()
    );
    for agreement in agreements {
        let root = b256(&agreement["agreementHash"]);
        let sections = agreement["sections"].as_array().expect("sections");
        assert_eq!(
            sections.len() as u64,
            agreement["sectionCount"].as_u64().unwrap()
        );
        for section in sections {
            let rebuilt = leaf(
                section["clause"].as_str().unwrap(),
                section["version"].as_u64().unwrap(),
                section["sectionData"].as_str().unwrap(),
            );
            assert_eq!(
                rebuilt,
                b256(&section["leaf"]),
                "the rebuilt leaf is the SDK's"
            );
            let proof: Vec<B256> = section["proof"]
                .as_array()
                .unwrap()
                .iter()
                .map(b256)
                .collect();
            assert!(
                verify_inclusion(&proof, root, rebuilt),
                "the frozen proof opens"
            );
            let mut tampered = rebuilt;
            tampered.0[31] ^= 1;
            assert!(
                !verify_inclusion(&proof, root, tampered),
                "a tampered leaf does not open"
            );
        }
    }
}

#[test]
fn a_single_section_root_is_the_leaf() {
    let fx = fixture();
    let one = &fx["agreements"][1];
    assert_eq!(one["sectionCount"].as_u64().unwrap(), 1);
    assert_eq!(
        b256(&one["agreementHash"]),
        b256(&one["sections"][0]["leaf"])
    );
    assert!(one["sections"][0]["proof"].as_array().unwrap().is_empty());
}
