//! The cross-language lock on a clause key: `keccak256` of the spec's
//! pinned bytes, `canonicalize(spec)`. The SDK harvests
//! `test/fixtures/clause-keys.json` as `{ "<name>": "<key>" }` over
//! `clauses/*.json`; this file canonicalizes each `clauses/<name>.json` the
//! way the fixtures feed the guest and asserts it hashes to the SDK's key.
use std::str::FromStr;

use alloy_primitives::{keccak256, B256};
use figaro_prove_test::load_spec_json;

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
