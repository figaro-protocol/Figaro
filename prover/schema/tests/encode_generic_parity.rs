//! Parity audit for the generic spec-driven encoder
//! (`encode_content_from_spec`) against the per-schema encoders.
//!
//! Non-destructive: the generic encoder is additive and not yet wired
//! into the kernel — the per-schema dispatch (`encode_content_for_schema`)
//! is still the canonical path. This test confirms the generic encoder
//! runs on every protocol schema and that, under the canonical rule
//! (0-based enum index, `tuple[]` object arrays), its output matches the
//! per-schema encoder for the canonically-shaped schemas and diverges in
//! exactly the set the keystone design predicts — schemas with 1-based
//! enum tables, and `figaro-consent-v1`'s struct-of-arrays transpose.
//!
//! See docs/v5/SCALING_STRATEGY.md "Keystone Design — Canonical ABI
//! Mapping".

use alloy_primitives::keccak256;
use figaro_schema::{
    encode_content_for_schema, encode_content_from_spec, parse_schema_spec, ParseSchemaSpecResult,
    SchemaSpec,
};
use serde_json::{json, Value};

fn to_hex(bytes: &[u8]) -> String {
    format!("0x{}", alloy_primitives::hex::encode(bytes))
}

fn spec_for(schema_key: &str) -> SchemaSpec {
    let json_str = figaro_schema::embedded_spec_json(&keccak256(schema_key.as_bytes()))
        .unwrap_or_else(|| panic!("no embedded spec for {schema_key}"));
    let value: Value = serde_json::from_str(json_str)
        .unwrap_or_else(|e| panic!("embedded spec {schema_key} is not valid JSON: {e}"));
    match parse_schema_spec(&value) {
        ParseSchemaSpecResult::Ok(s) => s,
        ParseSchemaSpecResult::Err(errs) => {
            panic!("embedded spec {schema_key} failed to parse: {errs:?}")
        }
    }
}

/// `(schema_key, content, expect_match)` — `expect_match` records whether
/// the generic encoder reproduces the per-schema encoder's bytes today.
/// Content is reused verbatim from `encode_conformance.rs`.
fn fixtures() -> Vec<(&'static str, Value, bool)> {
    vec![
        // ── Match: scalar / bigint / 0-based-enum / already-tuple[] ──
        ("figaro-ghg-protocol-v1", json!({ "scope": 1 }), true),
        ("figaro-ghg-protocol-v1", json!({}), true),
        ("figaro-ghg-iso-14064-v1", json!({ "scope": 2 }), true),
        ("figaro-ghg-measurement-v1", json!({ "grams": "1000" }), true),
        (
            "figaro-commerce-v1",
            json!({
                "currency": "0x0000000000000000000000000000000000000001",
                "payment": "100",
                "lineItems": [{
                    "itemId": "id-1", "name": "Item",
                    "quantity": "2", "unitPrice": "50",
                }],
            }),
            true,
        ),
        (
            "figaro-merchant-process-v1",
            json!({ "eventType": "accepted", "evidenceUri": "ipfs://abc" }),
            true,
        ),
        (
            "figaro-courier-process-v1",
            json!({ "eventType": "in-transit" }),
            true,
        ),
        // klerosCourt absent → 0 either way, so the law-only fixture matches.
        (
            "figaro-jurisdiction-v1",
            json!({ "applicableLaw": "US-CA" }),
            true,
        ),
        // ── Diverge: 1-based enum tables vs canonical 0-based ──
        (
            "figaro-geo-v2",
            json!({
                "originGeohash": "dr5ru", "destinationGeohash": "dr5x1",
                "massGrams": 1000, "volumeMl": 500, "classOfService": "S",
            }),
            false,
        ),
        (
            "figaro-fulfilment-v2",
            json!({
                "modalities": ["delivery"],
                "coordinations": ["buyer-assigned"],
                "handoffPoints": ["face-to-face"],
            }),
            false,
        ),
        (
            "figaro-jurisdiction-v1",
            json!({ "klerosCourt": "general", "klerosMinJurors": 5 }),
            false,
        ),
        (
            "figaro-proximity-policy-v1",
            json!({ "bands": ["zone-wifi", "contact-nfc"] }),
            false,
        ),
        (
            "figaro-proximity-proof-v1",
            json!({
                "band": "nearby-ble",
                "nonce": format!("0x{}", "ab".repeat(32)),
                "deviceSig": "0xdeadbeef",
            }),
            false,
        ),
        (
            "figaro-offset-policy-v1",
            json!({ "providers": ["klima", "toucan"] }),
            false,
        ),
        // ── Diverge: struct-of-arrays transpose vs canonical tuple[] ──
        (
            "figaro-consent-v1",
            json!({
                "documents": [{
                    "documentHash": format!("0x{}", "11".repeat(32)),
                    "documentVersion": "1.0", "documentTitle": "Terms",
                }],
            }),
            false,
        ),
    ]
}

#[test]
fn generic_encoder_runs_on_every_fixture() {
    for (key, content, _) in fixtures() {
        let spec = spec_for(key);
        encode_content_from_spec(&spec, &content)
            .unwrap_or_else(|e| panic!("generic encoder failed on {key}: {e}"));
    }
}

#[test]
fn generic_parity_with_per_schema_encoders() {
    for (key, content, expect_match) in fixtures() {
        let spec = spec_for(key);
        let generic = encode_content_from_spec(&spec, &content)
            .unwrap_or_else(|e| panic!("generic encoder failed on {key}: {e}"));
        let per_schema = encode_content_for_schema(key, &content)
            .unwrap_or_else(|e| panic!("per-schema encoder failed on {key}: {e}"));
        if expect_match {
            assert_eq!(
                generic, per_schema,
                "{key}: generic encoder must reproduce the per-schema (canonical) bytes",
            );
        } else {
            assert_ne!(
                generic, per_schema,
                "{key}: divergence expected (1-based enum table or struct-of-arrays \
                 transpose) but bytes matched — the keystone design's divergence set \
                 is now stale",
            );
        }
    }
}

/// Locks one canonical divergent output to a hand-verified value:
/// `providers: [klima, toucan]` → 0-based enum indices `[0, 1]` (the
/// per-schema encoder emits the 1-based `[1, 2]`).
#[test]
fn generic_offset_policy_canonical_bytes() {
    let spec = spec_for("figaro-offset-policy-v1");
    let bytes = encode_content_from_spec(
        &spec,
        &json!({ "providers": ["klima", "toucan"] }),
    )
    .unwrap();
    assert_eq!(
        to_hex(&bytes),
        concat!(
            "0x",
            "0000000000000000000000000000000000000000000000000000000000000020",
            "0000000000000000000000000000000000000000000000000000000000000002",
            "0000000000000000000000000000000000000000000000000000000000000000",
            "0000000000000000000000000000000000000000000000000000000000000001",
        ),
        "offset-policy canonical encoding: uint8[] [0, 1]",
    );
}
