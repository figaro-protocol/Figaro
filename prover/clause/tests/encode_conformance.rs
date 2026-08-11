//! Conformance tests for the generic Rust ABI encoder. Each test runs
//! `encode_content_from_spec` against a canonical clause spec (loaded
//! from `clauses/` at the repo root — the ClauseRegistry seed source) +
//! a content payload, and asserts the bytes match the byte-for-byte
//! canonical output of Layer A (`sdk/src/clauses/encode.ts`, viem's
//! `encodeAbiParameters`). The kernel's cross-form-binding gate depends
//! on this equivalence.
//!
//! The canonical encoding rule:
//!   - top-level fields encode as `abi_encode_params` in declaration order
//!   - `integer` → int256 (SIGNED); `bigint` → uint256
//!   - enums map to `uint8` = 0-based position in `EnumFieldSpec::values`
//!   - unknown string formats encode as plain `string` (open format axis)
//!   - absent optional fields encode as the ABI zero-value of their type
//!   - object-arrays encode as `tuple[]`
//!   - `stages[n]` overrides the field set when the encode targets stage n
//!
//! Vectors are generated from the live Layer A encoder by
//! `scripts/generate-encode-conformance-vectors.mjs` (repo root, with
//! sdk/dist built: `node scripts/generate-encode-conformance-vectors.mjs`).
//! This file stays the single source of the vector INPUTS; the script
//! validates each payload, then re-derives the expected hex from Layer A —
//! NEVER from the Rust side under test. When a clause's spec changes, edit
//! the content payload here and rerun the script in the same commit.

use figaro_clause::{
    encode_content_from_spec, parse_clause_spec, EncodeOptions, ParseClauseSpecResult,
};
use serde_json::{json, Value};
use std::path::PathBuf;

fn clauses_dir() -> PathBuf {
    // The crate lives at prover/clause; the canonical clause JSONs live
    // at clauses/ in the repo root.
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("clauses");
    p
}

fn load_spec(clause_id: &str) -> figaro_clause::ClauseSpec {
    let path = clauses_dir().join(format!("{clause_id}.json"));
    let bytes = std::fs::read(&path)
        .unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    let value: Value = serde_json::from_slice(&bytes)
        .unwrap_or_else(|e| panic!("{clause_id} is not valid JSON: {e}"));
    match parse_clause_spec(&value) {
        ParseClauseSpecResult::Ok(s) => s,
        ParseClauseSpecResult::Err(errors) => {
            panic!("spec {clause_id} failed to parse: {errors:?}")
        }
    }
}

fn to_hex(bytes: &[u8]) -> String {
    format!("0x{}", alloy_primitives::hex::encode(bytes))
}

fn assert_encode_stage(clause_id: &str, stage: Option<u8>, content: Value, expected_hex: &str) {
    let spec = load_spec(clause_id);
    let bytes = encode_content_from_spec(&spec, &content, EncodeOptions { stage })
        .unwrap_or_else(|e| panic!("encode failed for {clause_id}: {e}"));
    assert_eq!(
        to_hex(&bytes),
        expected_hex,
        "clauseId {clause_id} (stage {stage:?}) bytes diverged from the Layer A canonical encoding",
    );
}

fn assert_encode(clause_id: &str, content: Value, expected_hex: &str) {
    assert_encode_stage(clause_id, None, content, expected_hex);
}

// ── Enum → uint8, 0-based position ───────────────────────────────────

#[test]
fn modalities_enum_position() {
    assert_encode(
        "figaro-modalities",
        json!({ "modality": "delivery" }),
        "0x0000000000000000000000000000000000000000000000000000000000000002",
    );
}

// ── Signed integers (int256) — negative values two's-complement ──────

#[test]
fn cold_chain_negative_integers() {
    assert_encode(
        "figaro-cold-chain",
        json!({ "tempClass": "frozen", "tempMinC": -25, "tempMaxC": -18, "recordingIntervalSeconds": 300, "monitoringStandard": "EN 12830" }),
        "0x0000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe7ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffee000000000000000000000000000000000000000000000000000000000000012c00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000008454e203132383330000000000000000000000000000000000000000000000000",
    );
}

// ── Stage-scoped encoding — stages[1] drives the field set ───────────

#[test]
fn cold_chain_stage1_runtime_witness() {
    assert_encode_stage(
        "figaro-cold-chain",
        Some(1),
        json!({ "periodStart": "2026-07-01T00:00:00Z", "periodEnd": "2026-07-02T00:00:00Z", "observedMinC": -20, "observedMaxC": -17 }),
        "0x00000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffef00000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000014323032362d30372d30315430303a30303a30305a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014323032362d30372d30325430303a30303a30305a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    );
}

// ── bigint (uint256) + array<object> → tuple[] ───────────────────────

#[test]
fn commerce_line_items_tuple_array() {
    assert_encode(
        "figaro-commerce",
        json!({ "currency": format!("0x{}", "5a".repeat(20)), "payment": "250000000", "lineItems": [
            { "itemId": "espresso", "name": "Espresso", "quantity": 2, "unitPrice": "3500000" },
            { "itemId": "cornetto", "name": "Cornetto", "quantity": 1, "unitPrice": "2800000" },
        ] }),
        "0x0000000000000000000000005a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a000000000000000000000000000000000000000000000000000000000ee6b2800000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000003567e00000000000000000000000000000000000000000000000000000000000000008657370726573736f0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008457370726573736f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000002ab9800000000000000000000000000000000000000000000000000000000000000008636f726e6574746f0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008436f726e6574746f000000000000000000000000000000000000000000000000",
    );
}

#[test]
fn consent_documents_tuple_array() {
    assert_encode(
        "figaro-consent",
        json!({ "documents": [
            { "documentHash": format!("0x{}", "ab".repeat(32)), "documentVersion": "1.0.0", "documentTitle": "Service terms" },
        ] }),
        "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020abababababababababababababababababababababababababababababababab000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000005312e302e30000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d53657276696365207465726d73000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    );
}

// ── bytes32-hex / address-hex formats ────────────────────────────────

#[test]
fn assembly_provenance_bytes32() {
    assert_encode(
        "figaro-assembly-provenance",
        json!({ "compositionHash": format!("0x{}", "cd".repeat(32)) }),
        &format!("0x{}", "cd".repeat(32)),
    );
}

#[test]
fn utility_token_address() {
    assert_encode(
        "figaro-utility-token",
        json!({ "currency": format!("0x{}", "5a".repeat(20)) }),
        "0x0000000000000000000000005a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a",
    );
}

// ── Unknown (permissionless) format encodes as plain string ──────────

#[test]
fn geolocation_unknown_format_encodes_as_string() {
    // The format axis is OPEN: `geocodeStandard` admits any non-empty
    // standard token, and `origin`/`destination` resolve their format
    // from its VALUE (`formatFromField`) — a standard the engine has
    // never seen ("maidenhead" is real but outside the spec's known
    // examples) must still encode as plain strings.
    assert_encode(
        "figaro-geolocation",
        json!({ "geocodeStandard": "maidenhead", "origin": "JN47uv", "destination": "FN31pr" }),
        "0x000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000000a6d616964656e6865616400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064a4e3437757600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006464e333170720000000000000000000000000000000000000000000000000000",
    );
}

// ── Absent optional fields → ABI zero-values ─────────────────────────

#[test]
fn hazmat_absent_optional_enum_encodes_zero() {
    // packingGroup (enum) absent → uint8 zero.
    assert_encode(
        "figaro-hazmat",
        json!({ "unNumber": "UN1263", "properShippingName": "PAINT", "hazardClass": "3" }),
        "0x000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006554e31323633000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000055041494e54000000000000000000000000000000000000000000000000000000",
    );
}

#[test]
fn applicable_law_absent_optional_strings() {
    assert_encode(
        "figaro-applicable-law",
        json!({ "applicableLaw": "CH" }),
        "0x000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000002434800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    );
}

// ── Array of enums ───────────────────────────────────────────────────

#[test]
fn handoff_enum_array_positions() {
    assert_encode(
        "figaro-handoff",
        json!({ "handoff": ["face-to-face", "locker"] }),
        "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003",
    );
}

// ── Error paths ──────────────────────────────────────────────────────

#[test]
fn required_absent_field_errors() {
    let spec = load_spec("figaro-modalities");
    let err = encode_content_from_spec(&spec, &json!({}), EncodeOptions::default())
        .expect_err("required absent field must error");
    assert!(err.to_string().contains("required field is absent"), "{err}");
}

#[test]
fn undeclared_enum_value_errors() {
    let spec = load_spec("figaro-modalities");
    let err = encode_content_from_spec(
        &spec,
        &json!({ "modality": "teleportation" }),
        EncodeOptions::default(),
    )
    .expect_err("undeclared enum value must error");
    assert!(err.to_string().contains("not a declared enum value"), "{err}");
}

#[test]
fn negative_bigint_errors() {
    // `bigint` is unsigned (uint256) — a negative value must not encode.
    let spec = load_spec("figaro-commerce");
    let err = encode_content_from_spec(
        &spec,
        &json!({ "currency": format!("0x{}", "5a".repeat(20)), "payment": "-1", "lineItems": [] }),
        EncodeOptions::default(),
    )
    .expect_err("negative bigint must error");
    assert!(err.to_string().contains("invalid integer"), "{err}");
}
