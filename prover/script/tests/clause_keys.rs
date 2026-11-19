//! The cross-language lock on a clause key: `keccak256` of the canonical
//! bytes of the spec without its top-level `block` (the SDK's
//! `clauseKeyPreimage`). The SDK harvests
//! `test/fixtures/clause-keys.json` as `{ "<name>": "<key>" }` over
//! `clauses/*.json`; this file canonicalizes each `clauses/<name>.json` the
//! way the fixtures feed the guest (`block` dropped) and asserts it hashes to
//! the SDK's key.
use std::str::FromStr;

use alloy_primitives::{keccak256, B256};
use figaro_prove_test::{canonicalize, load_spec_json};

fn repo_root() -> std::path::PathBuf {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p
}

#[test]
fn every_clause_spec_canonicalizes_to_the_sdk_key() {
    let path = repo_root().join("test/fixtures/clause-keys.json");
    let text =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    let keys: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&text).expect("fixture JSON");

    let mut on_disk: Vec<String> = std::fs::read_dir(repo_root().join("clauses"))
        .expect("clauses/")
        .filter_map(|e| {
            let name = e.ok()?.file_name().into_string().ok()?;
            name.strip_suffix(".json").map(str::to_string)
        })
        .collect();
    on_disk.sort();
    let mut harvested: Vec<String> = keys.keys().cloned().collect();
    harvested.sort();
    assert_eq!(
        harvested, on_disk,
        "the fixture covers every clause spec, and only those"
    );

    for (name, key) in &keys {
        let expected = B256::from_str(key.as_str().expect("hex key")).expect("bytes32");
        assert_eq!(
            keccak256(load_spec_json(name).as_bytes()),
            expected,
            "{name}: the Rust canonicalization hashes to the SDK's key"
        );
    }
}

/// The canonical form's number and key rules, pinned by one key in both
/// languages: `test/fixtures/clause-key-canonical-form.json` holds floats,
/// integers above 2^53 and index-like keys. The SDK's leg is "clause keys —
/// the canonical form's numbers and index-like keys" in
/// `sdk/tests/clauseKeys.test.ts`, with the same key.
#[test]
fn the_canonical_form_vector_hashes_to_the_sdk_key() {
    let path = repo_root().join("test/fixtures/clause-key-canonical-form.json");
    let text =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    let mut spec: serde_json::Value = serde_json::from_str(&text).expect("vector JSON");
    spec.as_object_mut().expect("spec object").remove("block");
    let bytes = canonicalize(&spec);
    assert!(bytes.contains(r#""stages":{"0":["#), "{bytes}");
    assert!(
        bytes.contains(
            r#""x-indexed":{"2":5,"10":2,"4294967294":7,"-1":8,"02":4,"4294967295":6,"a":3,"b":1}"#
        ),
        "{bytes}"
    );
    assert!(
        bytes.contains(concat!(
            r#""x-numbers":[0.1,2.5,100,123456789.125,1.5e-7,0.000001,1e+21,1e-7,1.23e+22,9007199254740992,"#,
            r#"18446744073709552000,18446744073709552000,1.7976931348623157e+308,5e-324,0,-42,-9007199254740992]"#
        )),
        "{bytes}"
    );
    assert_eq!(
        keccak256(bytes.as_bytes()),
        B256::from_str("0xb63f111646773cc201705869797963e352d7e816b9d4b365315115f330916d1a")
            .expect("bytes32"),
        "the Rust canonical form hashes to the SDK's key"
    );
}
