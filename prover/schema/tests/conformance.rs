//! Conformance tests for the Rust schema validator (Layer B) against the
//! TypeScript reference implementation (Layer A,
//! `sdk/src/schemas/{spec,validate}.ts`).
//!
//! Two test surfaces:
//!   1. Spec parsing — every protocol schema JSON in
//!      `frontend/lib/shared/schemas/` must parse without errors.
//!   2. Content validation — happy + sad cases drawn from
//!      `sdk/tests/schemas/validate.test.ts`. Layer B must agree with
//!      Layer A on accept/reject for every case.

use figaro_schema::{
    parse_schema_spec, validate_content, ParseSchemaSpecResult, SchemaSpec, ValidateOptions,
};
use serde_json::{json, Value};
use std::path::PathBuf;

fn shared_schemas_dir() -> PathBuf {
    // The crate lives at prover/schema; the canonical schema JSONs live at
    // frontend/lib/shared/schemas/. Resolve via CARGO_MANIFEST_DIR.
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("frontend");
    p.push("lib");
    p.push("shared");
    p.push("schemas");
    p
}

fn parse_or_panic(value: &Value) -> SchemaSpec {
    match parse_schema_spec(value) {
        ParseSchemaSpecResult::Ok(spec) => spec,
        ParseSchemaSpecResult::Err(errors) => {
            panic!("parse failed: {errors:#?}");
        }
    }
}

fn spec_of(fields: Value) -> SchemaSpec {
    parse_or_panic(&json!({
        "schemaId": "t-v1",
        "version": 1,
        "title": "T",
        "description": "D",
        "fields": fields,
    }))
}

fn spec_of_with_stages(fields: Value, stages: Value) -> SchemaSpec {
    parse_or_panic(&json!({
        "schemaId": "t-v1",
        "version": 1,
        "title": "T",
        "description": "D",
        "fields": fields,
        "stages": stages,
    }))
}

// ── Protocol-schema parse conformance ────────────────────────────────

#[test]
fn parses_every_shipped_protocol_schema() {
    let dir = shared_schemas_dir();
    let entries = std::fs::read_dir(&dir).expect("read_dir frontend/lib/shared/schemas");
    let mut parsed = 0usize;
    for entry in entries {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let bytes = std::fs::read(&path).expect("read schema json");
        let value: Value = serde_json::from_slice(&bytes).expect("parse schema json");
        match parse_schema_spec(&value) {
            ParseSchemaSpecResult::Ok(_) => parsed += 1,
            ParseSchemaSpecResult::Err(errors) => {
                panic!("schema {} failed to parse: {errors:#?}", path.display());
            }
        }
    }
    // We expect every shipped schema to parse; the precise count is
    // asserted to detect future drift.
    assert!(parsed >= 17, "expected at least 17 shipped schemas, got {parsed}");
}

// ── Happy paths (mirror sdk/tests/schemas/validate.test.ts) ──────────

#[test]
fn accepts_valid_object_with_required_fields() {
    let spec = spec_of(json!([
        { "name": "name", "type": "string", "required": true, "minLength": 1 },
        { "name": "age", "type": "integer", "required": true, "min": 0 },
    ]));
    let v = json!({ "name": "Ada", "age": 30 });
    assert!(validate_content(&v, &spec, ValidateOptions::default()).is_ok());
}

#[test]
fn permits_optional_fields_missing() {
    let spec = spec_of(json!([
        { "name": "x", "type": "string", "required": true },
        { "name": "y", "type": "boolean", "required": false },
    ]));
    let v = json!({ "x": "ok" });
    assert!(validate_content(&v, &spec, ValidateOptions::default()).is_ok());
}

#[test]
fn validates_bytes32_hex_format() {
    let spec = spec_of(json!([
        { "name": "h", "type": "string", "required": true, "format": "bytes32-hex" },
    ]));
    let valid = format!("0x{}", "ab".repeat(32));
    let v = json!({ "h": valid });
    assert!(validate_content(&v, &spec, ValidateOptions::default()).is_ok());
}

#[test]
fn validates_address_hex_format() {
    let spec = spec_of(json!([
        { "name": "a", "type": "string", "required": true, "format": "address-hex" },
    ]));
    let ok = format!("0x{}", "0".repeat(40));
    let bad = format!("0x{}", "0".repeat(39));
    assert!(validate_content(&json!({ "a": ok }), &spec, ValidateOptions::default()).is_ok());
    assert!(validate_content(&json!({ "a": bad }), &spec, ValidateOptions::default()).is_err());
}

#[test]
fn validates_bigint_as_decimal_string() {
    let spec = spec_of(json!([
        {
            "name": "amount", "type": "bigint", "required": true,
            "min": "0", "max": "1000000000000000000000",
        },
    ]));
    assert!(validate_content(
        &json!({ "amount": "500000000000000000000" }), &spec, ValidateOptions::default(),
    ).is_ok());
    assert!(validate_content(
        &json!({ "amount": "-1" }), &spec, ValidateOptions::default(),
    ).is_err());
    assert!(validate_content(
        &json!({ "amount": "9999999999999999999999" }), &spec, ValidateOptions::default(),
    ).is_err());
}

#[test]
fn validates_enum_values() {
    let spec = spec_of(json!([
        { "name": "color", "type": "enum", "required": true,
          "values": ["red", "green", "blue"] },
    ]));
    assert!(validate_content(&json!({ "color": "red" }), &spec, ValidateOptions::default()).is_ok());
    assert!(validate_content(&json!({ "color": "yellow" }), &spec, ValidateOptions::default()).is_err());
}

#[test]
fn validates_array_items_recursively() {
    let spec = spec_of(json!([
        {
            "name": "tags", "type": "array", "required": true,
            "items": { "type": "string", "name": "*", "required": true, "minLength": 1 },
            "minItems": 1, "maxItems": 5,
        },
    ]));
    assert!(validate_content(&json!({ "tags": ["a", "b"] }), &spec, ValidateOptions::default()).is_ok());
    assert!(validate_content(&json!({ "tags": [] }), &spec, ValidateOptions::default()).is_err());
    assert!(validate_content(
        &json!({ "tags": ["a", "b", "c", "d", "e", "f"] }), &spec, ValidateOptions::default(),
    ).is_err());
    assert!(validate_content(&json!({ "tags": ["a", ""] }), &spec, ValidateOptions::default()).is_err());
}

#[test]
fn validates_nested_objects() {
    let spec = spec_of(json!([
        {
            "name": "loc", "type": "object", "required": true,
            "fields": [
                { "name": "lat", "type": "integer", "required": true, "min": -90, "max": 90 },
                { "name": "lon", "type": "integer", "required": true, "min": -180, "max": 180 },
            ],
        },
    ]));
    assert!(validate_content(
        &json!({ "loc": { "lat": 40, "lon": -74 } }), &spec, ValidateOptions::default(),
    ).is_ok());
    assert!(validate_content(
        &json!({ "loc": { "lat": 91, "lon": 0 } }), &spec, ValidateOptions::default(),
    ).is_err());
}

#[test]
fn rejects_missing_required_fields() {
    let spec = spec_of(json!([
        { "name": "x", "type": "string", "required": true },
    ]));
    let result = validate_content(&json!({}), &spec, ValidateOptions::default());
    assert!(result.is_err());
    let errs = result.errors();
    assert_eq!(errs[0].path, "$.x");
}

#[test]
fn rejects_unknown_fields() {
    let spec = spec_of(json!([
        { "name": "x", "type": "string", "required": true },
    ]));
    let result = validate_content(
        &json!({ "x": "ok", "extra": "nope" }),
        &spec,
        ValidateOptions::default(),
    );
    assert!(result.is_err());
    assert!(
        result.errors().iter().any(|e| e.message.contains("unknown field")),
        "expected an unknown-field error, got {:#?}",
        result.errors(),
    );
}

#[test]
fn uses_stage_override_when_provided() {
    let spec = spec_of_with_stages(
        json!([{ "name": "x", "type": "string", "required": true }]),
        json!({
            "1": [
                { "name": "x", "type": "string", "required": true },
                { "name": "y", "type": "boolean", "required": true },
            ],
        }),
    );
    assert!(validate_content(&json!({ "x": "ok" }), &spec, ValidateOptions::default()).is_ok());
    assert!(validate_content(
        &json!({ "x": "ok" }), &spec, ValidateOptions { stage: Some(1) },
    ).is_err());
    assert!(validate_content(
        &json!({ "x": "ok", "y": true }), &spec, ValidateOptions { stage: Some(1) },
    ).is_ok());
}

#[test]
fn falls_back_to_default_when_stage_has_no_override() {
    let spec = spec_of_with_stages(
        json!([{ "name": "x", "type": "string", "required": true }]),
        json!({
            "1": [
                { "name": "x", "type": "string", "required": true },
                { "name": "y", "type": "boolean", "required": true },
            ],
        }),
    );
    assert!(
        validate_content(&json!({ "x": "ok" }), &spec, ValidateOptions { stage: Some(5) }).is_ok()
    );
}

// ── Per-shipped-schema content checks ────────────────────────────────

/// `figaro-ghg-protocol-v1` carries a single optional integer field
/// `scope` constrained to 1..=3.
#[test]
fn ghg_protocol_v1_accepts_valid_scope_and_rejects_out_of_range() {
    let bytes = std::fs::read(shared_schemas_dir().join("figaro-ghg-protocol-v1.json"))
        .expect("read ghg protocol json");
    let value: Value = serde_json::from_slice(&bytes).unwrap();
    let spec = parse_or_panic(&value);

    assert!(validate_content(&json!({ "scope": 1 }), &spec, ValidateOptions::default()).is_ok());
    assert!(validate_content(&json!({ "scope": 3 }), &spec, ValidateOptions::default()).is_ok());
    // scope is optional — empty object is valid.
    assert!(validate_content(&json!({}), &spec, ValidateOptions::default()).is_ok());
    assert!(validate_content(&json!({ "scope": 0 }), &spec, ValidateOptions::default()).is_err());
    assert!(validate_content(&json!({ "scope": 4 }), &spec, ValidateOptions::default()).is_err());
}

/// `figaro-geo-v2` exercises the regex `pattern` field on geohash strings.
#[test]
fn geo_v2_accepts_valid_geohash_and_rejects_garbage() {
    let bytes = std::fs::read(shared_schemas_dir().join("figaro-geo-v2.json"))
        .expect("read geo v2 json");
    let value: Value = serde_json::from_slice(&bytes).unwrap();
    let spec = parse_or_panic(&value);

    // Drive every required field with valid inputs first to isolate the
    // pattern check.
    let with = |origin: &str, destination: &str| {
        json!({
            "originGeohash": origin,
            "destinationGeohash": destination,
            "massGrams": 1000,
            "volumeMl": 500,
            "classOfService": "S",
        })
    };

    let good = with("dr5ru", "dr5x1");
    let result = validate_content(&good, &spec, ValidateOptions::default());
    assert!(
        result.is_ok(),
        "expected geo-v2 happy path to validate, got: {:#?}",
        result.errors(),
    );

    // Geohash base32 excludes "i", "l", "o", "a" — the second origin uses "i"
    // and should be rejected by the regex pattern.
    let bad = with("ilo", "dr5x1");
    assert!(validate_content(&bad, &spec, ValidateOptions::default()).is_err());
}

// ── Embedded canonical specs (Layer B content gate) ──────────────────

#[test]
fn every_embedded_spec_parses_and_matches_its_schema_id() {
    use alloy_primitives::keccak256;
    let mut count = 0;
    for (key, json) in figaro_schema::all_embedded_specs() {
        let value: Value = serde_json::from_str(json)
            .unwrap_or_else(|e| panic!("embedded spec {key} is not valid JSON: {e}"));
        let spec = parse_or_panic(&value);
        assert_eq!(
            spec.schema_id, key,
            "embedded spec for {key} declares a different schemaId",
        );
        // Lookup by keccak hash returns the same JSON back.
        assert_eq!(
            figaro_schema::embedded_spec_json(&keccak256(key.as_bytes())),
            Some(json),
            "embedded_spec_json lookup mismatch for {key}",
        );
        count += 1;
    }
    assert_eq!(count, 16, "expected 16 embedded protocol schemas");
}

#[test]
fn embedded_spec_json_is_none_for_non_protocol_schemas() {
    use alloy_primitives::keccak256;
    // figaro-topology-v1 is manifest-only; figaro-bogus-v99 is unknown.
    assert!(figaro_schema::embedded_spec_json(&keccak256(b"figaro-topology-v1")).is_none());
    assert!(figaro_schema::embedded_spec_json(&keccak256(b"figaro-bogus-v99")).is_none());
}
