//! The guest's leg of the three-way agreement-tree lock.
//!
//! `sdk/tests/merkleParity.test.ts` freezes SDK-built roots, leaves and
//! inclusion proofs into `test/fixtures/merkle-vectors.json`;
//! `test/core/attestation/MerkleParityTest.t.sol` verifies them with the
//! OpenZeppelin library the direct path calls; this file verifies them with
//! `merkle::verify_inclusion`, the batch path's verifier, from a leaf rebuilt
//! the way the guest rebuilds it for a usage claim — the section's
//! `clauseKey` (the `keccak256` of the clause spec's pinned bytes, carried
//! as the key itself), section hash over the canonical bytes,
//! `keccak256(keccak256(key ‖ clauseDataHash))`.
//!
//! An agreement that instantiates an assembly carries the reserved
//! provenance leaf (the vector's optional `provenance` entry): its key is a
//! constant of the agreement format, `keccak256("figaro-agreement-provenance")`,
//! never a clause key, and its bytes are
//! `{"agreementKey":"0x…","compositionHash":"0x…"}`, which the guest
//! reproduces from the two keys for an agreement or assembly claim
//! (`kernel::provenance_section_bytes`). This file rebuilds that leaf from
//! `leafKey` and the bytes, checks the guest reproduces the SDK's bytes, and
//! opens the frozen proof against `agreementHash`.
//!
//! `MERKLE_VECTORS` names another file in the same format: the differential
//! fuzz (`scripts/test-cross-impl-fuzz.sh`) points it at the agreements the
//! SDK generated from a seed.
use std::str::FromStr;

use alloy_primitives::{keccak256, B256};

use figaro_kernel::kernel::{provenance_section_bytes, ASSEMBLY_TERMS_LEAF_KEY, PROVENANCE_LEAF_KEY};
use figaro_kernel::merkle::verify_inclusion;

fn generated() -> bool {
    std::env::var_os("MERKLE_VECTORS").is_some()
}

fn fixture() -> serde_json::Value {
    let p = std::env::var("MERKLE_VECTORS").map(std::path::PathBuf::from).unwrap_or_else(|_| {
        let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.pop(); // prover/
        p.pop(); // repo root
        p.push("test/fixtures/merkle-vectors.json");
        p
    });
    let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    serde_json::from_str(&text).expect("fixture JSON")
}

fn b256(v: &serde_json::Value) -> B256 {
    B256::from_str(v.as_str().expect("hex string")).expect("bytes32")
}

fn leaf_under(key: B256, section_data: &str) -> B256 {
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
            agreement["clauseCount"].as_u64().unwrap()
        );
        if let Some(provenance) = agreement.get("provenance") {
            opens_the_provenance_leaf(provenance, root);
        }
        for section in sections {
            let rebuilt = leaf_under(
                b256(&section["clauseKey"]),
                section["clauseData"].as_str().unwrap(),
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

/// The reserved provenance leaf: the key is the agreement format's
/// constant, the bytes are what the guest reproduces from the agreementKey
/// and the compositionHash, and the frozen proof opens against the
/// agreement root.
fn opens_the_provenance_leaf(provenance: &serde_json::Value, root: B256) {
    let key = b256(&provenance["leafKey"]);
    assert_eq!(
        key,
        keccak256(b"figaro-agreement-provenance"),
        "the provenance leaf's key is the agreement format's constant"
    );
    let section_data = provenance["clauseData"].as_str().unwrap();
    let agreement = b256(&provenance["agreementKey"]);
    let composition = b256(&provenance["compositionHash"]);
    assert_eq!(
        provenance_section_bytes(&agreement, &composition),
        section_data.as_bytes(),
        "the guest reproduces the SDK's provenance bytes from both keys"
    );
    let mut other = agreement;
    other.0[0] ^= 1;
    assert_ne!(
        provenance_section_bytes(&other, &composition),
        section_data.as_bytes(),
        "a wrong agreementKey reproduces other bytes"
    );
    let rebuilt = leaf_under(key, section_data);
    assert_eq!(
        rebuilt,
        b256(&provenance["leaf"]),
        "the rebuilt provenance leaf is the SDK's"
    );
    let proof: Vec<B256> = provenance["proof"]
        .as_array()
        .unwrap()
        .iter()
        .map(b256)
        .collect();
    assert!(
        verify_inclusion(&proof, root, rebuilt),
        "the frozen provenance proof opens"
    );
    let mut tampered = rebuilt;
    tampered.0[31] ^= 1;
    assert!(
        !verify_inclusion(&proof, root, tampered),
        "a tampered provenance leaf does not open"
    );
}

#[test]
fn the_fixture_carries_a_provenance_leaf() {
    if generated() {
        return; // the pinned case is the fixture's
    }
    let fx = fixture();
    let carriers = fx["agreements"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|a| a.get("provenance").is_some())
        .count();
    assert!(
        carriers >= 1,
        "the lock covers the reserved provenance leaf"
    );
}

#[test]
fn a_single_clause_root_is_the_leaf() {
    if generated() {
        return; // the pinned case is the fixture's
    }
    let fx = fixture();
    let one = &fx["agreements"][1];
    assert_eq!(one["clauseCount"].as_u64().unwrap(), 1);
    assert_eq!(
        b256(&one["agreementHash"]),
        b256(&one["sections"][0]["leaf"])
    );
    assert!(one["sections"][0]["proof"].as_array().unwrap().is_empty());
}

// ── The assembly root: agreements and the terms leaf ─────────────────
//
// `sdk/tests` freezes the agreement keys, the agreements' bytes and
// leaves, the terms leaf, every composition root, each agreement's
// membership proof and its two-key provenance leaf into
// `test/fixtures/assembly-vectors.json`. This leg rebuilds each from the
// bytes with the guest's own functions and opens every membership proof
// with `merkle::verify_inclusion` — the verifier an assembly claim uses.

fn assembly_fixture() -> serde_json::Value {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("test/fixtures/assembly-vectors.json");
    let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    serde_json::from_str(&text).expect("fixture JSON")
}

fn proof_of(v: &serde_json::Value) -> Vec<B256> {
    v.as_array().expect("proof").iter().map(b256).collect()
}

#[test]
fn every_agreement_key_is_the_root_over_its_clause_leaves() {
    let fx = assembly_fixture();
    let agreements = fx["agreements"].as_array().unwrap();
    let keys: Vec<B256> = agreements.iter().map(|a| b256(&a["agreementKey"])).collect();
    for (i, agreement) in agreements.iter().enumerate() {
        let key = keys[i];
        let clauses = agreement["clauses"].as_array().unwrap();
        assert!(!clauses.is_empty(), "{}: an agreement composes at least one clause", agreement["label"]);
        for clause in clauses {
            let fills = clause["fillsBytes"].as_str().unwrap();
            assert_eq!(keccak256(fills.as_bytes()), b256(&clause["fillsHash"]), "fillsHash = keccak256(fillsBytes)");
            let leaf = leaf_under(b256(&clause["clauseKey"]), fills);
            assert_eq!(leaf, b256(&clause["leaf"]), "the rebuilt clause leaf is the SDK's");
            let proof = proof_of(&clause["membershipProof"]);
            assert!(verify_inclusion(&proof, key, leaf), "the clause proof opens under the agreement key");
            for (j, other) in keys.iter().enumerate() {
                if j != i {
                    assert!(
                        !verify_inclusion(&proof, *other, leaf),
                        "the clause proof opens under no other agreement's key"
                    );
                }
            }
        }
        if clauses.len() == 1 {
            assert_eq!(key, b256(&clauses[0]["leaf"]), "a one-clause agreement's key is its leaf");
        }
    }
}

#[test]
fn every_agreement_opens_under_its_own_root_and_no_other() {
    let fx = assembly_fixture();
    let assemblies = fx["assemblies"].as_array().unwrap();
    let roots: Vec<B256> = assemblies.iter().map(|a| b256(&a["compositionHash"])).collect();
    for (i, assembly) in assemblies.iter().enumerate() {
        let root = roots[i];
        for entry in assembly["agreements"].as_array().unwrap() {
            let content = keccak256(entry["agreementBytes"].as_str().unwrap().as_bytes());
            assert_eq!(content, b256(&entry["slotContentHash"]), "the agreement's content hash");
            let leaf = leaf_under(b256(&entry["agreementKey"]), entry["agreementBytes"].as_str().unwrap());
            assert_eq!(leaf, b256(&entry["leaf"]), "the rebuilt order-entry leaf is the SDK's");
            let proof = proof_of(&entry["membershipProof"]);
            assert!(verify_inclusion(&proof, root, leaf), "the membership proof opens");
            for (j, other) in roots.iter().enumerate() {
                if j != i {
                    assert!(
                        !verify_inclusion(&proof, *other, leaf),
                        "the membership proof opens under no other assembly's root"
                    );
                }
            }
            let mut wrong_key = b256(&entry["agreementKey"]);
            wrong_key.0[0] ^= 1;
            assert!(
                !verify_inclusion(&proof, root, leaf_under(wrong_key, entry["agreementBytes"].as_str().unwrap())),
                "another agreement in the same agreement does not open"
            );
        }
    }
}

#[test]
fn every_agreement_s_provenance_leaf_is_the_guest_s_reproduction() {
    let fx = assembly_fixture();
    for assembly in fx["assemblies"].as_array().unwrap() {
        for entry in assembly["agreements"].as_array().unwrap() {
            let p = &entry["provenance"];
            assert_eq!(b256(&p["leafKey"]), PROVENANCE_LEAF_KEY);
            assert_eq!(b256(&p["agreementKey"]), b256(&entry["agreementKey"]));
            assert_eq!(b256(&p["compositionHash"]), b256(&assembly["compositionHash"]));
            let bytes = provenance_section_bytes(&b256(&p["agreementKey"]), &b256(&p["compositionHash"]));
            assert_eq!(bytes, p["clauseData"].as_str().unwrap().as_bytes());
            assert_eq!(keccak256(&bytes), b256(&p["clauseDataHash"]));
            assert_eq!(
                leaf_under(PROVENANCE_LEAF_KEY, p["clauseData"].as_str().unwrap()),
                b256(&p["leaf"])
            );
        }
    }
}

#[test]
fn the_terms_leaf_is_keyed_on_the_reserved_terms_key() {
    let fx = assembly_fixture();
    let mut carriers = 0;
    for assembly in fx["assemblies"].as_array().unwrap() {
        let terms = &assembly["terms"];
        if terms.is_null() {
            continue;
        }
        carriers += 1;
        assert_eq!(b256(&terms["leafKey"]), ASSEMBLY_TERMS_LEAF_KEY);
        let bytes = terms["termsBytes"].as_str().unwrap();
        assert_eq!(keccak256(bytes.as_bytes()), b256(&terms["clauseDataHash"]));
        assert_eq!(leaf_under(ASSEMBLY_TERMS_LEAF_KEY, bytes), b256(&terms["leaf"]));
    }
    assert!(carriers >= 1, "the lock covers the terms leaf");
}

#[test]
fn a_one_agreement_root_is_its_leaf() {
    let fx = assembly_fixture();
    let one = &fx["assemblies"][0];
    assert_eq!(one["agreements"].as_array().unwrap().len(), 1);
    assert!(one["terms"].is_null());
    assert_eq!(b256(&one["compositionHash"]), b256(&one["agreements"][0]["leaf"]));
    assert!(one["agreements"][0]["membershipProof"].as_array().unwrap().is_empty());
}
