//! Conformance tests for the Rust clause engine (the prover's Layer-A
//! mirror) against the TypeScript reference implementation
//! (`sdk/src/clauses/{spec,validate}.ts`).
//!
//! Two test surfaces:
//!   1. Spec parsing — every canonical clause JSON in `clauses/` (the
//!      ClauseRegistry seed source) must parse without errors. The count
//!      is DERIVED from the directory listing, never stored.
//!   2. Content validation — happy + sad cases mirroring Layer A. The
//!      engine must agree with Layer A on accept/reject for every case.

use figaro_clause::{
    parse_clause_spec, validate_content, ParseClauseSpecResult, ClauseSpec, ValidateOptions,
    MAX_FIELD_DEPTH,
};
use serde_json::{json, Value};
use std::path::PathBuf;

fn clauses_dir() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("clauses");
    p
}

fn parse_or_panic(value: &Value) -> ClauseSpec {
    match parse_clause_spec(value) {
        ParseClauseSpecResult::Ok(spec) => spec,
        ParseClauseSpecResult::Err(errors) => {
            panic!("parse failed: {errors:#?}");
        }
    }
}

fn parse_errors(value: &Value) -> Vec<figaro_clause::SpecParseError> {
    match parse_clause_spec(value) {
        ParseClauseSpecResult::Ok(_) => panic!("expected parse failure"),
        ParseClauseSpecResult::Err(errors) => errors,
    }
}

fn spec_of(fields: Value) -> ClauseSpec {
    parse_or_panic(&json!({
        "clauseId": "t",
        "version": 1,
        "title": "T",
        "description": "D",
        "fields": fields,
    }))
}

fn spec_of_with_stages(fields: Value, stages: Value) -> ClauseSpec {
    parse_or_panic(&json!({
        "clauseId": "t",
        "version": 1,
        "title": "T",
        "description": "D",
        "fields": fields,
        "stages": stages,
    }))
}

fn ok(content: &Value, spec: &ClauseSpec) -> bool {
    validate_content(content, spec, ValidateOptions::default()).is_ok()
}

// ── Protocol-clause parse conformance ────────────────────────────────

#[test]
fn parses_every_shipped_protocol_clause() {
    let dir = clauses_dir();
    let entries = std::fs::read_dir(&dir).expect("read_dir clauses/");
    let mut total = 0usize;
    let mut parsed = 0usize;
    for entry in entries {
        let path = entry.unwrap().path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        total += 1;
        let bytes = std::fs::read(&path).expect("read clause json");
        let value: Value = serde_json::from_slice(&bytes).expect("parse clause json");
        match parse_clause_spec(&value) {
            ParseClauseSpecResult::Ok(_) => parsed += 1,
            ParseClauseSpecResult::Err(errors) => {
                panic!("clause {} failed to parse: {errors:#?}", path.display());
            }
        }
    }
    assert!(total > 0, "clauses/ is empty — wrong directory?");
    assert_eq!(parsed, total, "every shipped clause spec must parse");
}

// ── Happy paths ──────────────────────────────────────────────────────

#[test]
fn accepts_valid_object_with_required_fields() {
    let spec = spec_of(json!([
        { "name": "name", "type": "string", "required": true, "minLength": 1 },
        { "name": "age", "type": "integer", "required": true, "min": 0 },
    ]));
    assert!(ok(&json!({ "name": "Ada", "age": 30 }), &spec));
}

#[test]
fn accepts_absent_optional_field() {
    let spec = spec_of(json!([
        { "name": "note", "type": "string", "required": false },
    ]));
    assert!(ok(&json!({}), &spec));
}

#[test]
fn accepts_nested_object_and_array() {
    let spec = spec_of(json!([
        { "name": "items", "type": "array", "required": true, "minItems": 1,
          "items": { "type": "object", "fields": [
              { "name": "id", "type": "string", "required": true },
              { "name": "qty", "type": "integer", "required": true, "min": 1 },
          ] } },
    ]));
    assert!(ok(&json!({ "items": [{ "id": "a", "qty": 2 }] }), &spec));
}

// ── Rejections ───────────────────────────────────────────────────────

#[test]
fn rejects_missing_required_field() {
    let spec = spec_of(json!([
        { "name": "name", "type": "string", "required": true },
    ]));
    assert!(!ok(&json!({}), &spec));
}

#[test]
fn rejects_unknown_field() {
    // Clause is a closed contract — undeclared fields are rejected.
    let spec = spec_of(json!([
        { "name": "name", "type": "string", "required": true },
    ]));
    assert!(!ok(&json!({ "name": "Ada", "extra": 1 }), &spec));
}

#[test]
fn rejects_wrong_types() {
    let spec = spec_of(json!([
        { "name": "flag", "type": "boolean", "required": true },
    ]));
    assert!(!ok(&json!({ "flag": "yes" }), &spec));
}

#[test]
fn rejects_float_for_integer() {
    let spec = spec_of(json!([
        { "name": "n", "type": "integer", "required": true },
    ]));
    assert!(!ok(&json!({ "n": 1.5 }), &spec));
}

#[test]
fn enforces_integer_bounds() {
    let spec = spec_of(json!([
        { "name": "n", "type": "integer", "required": true, "min": -273, "max": 100 },
    ]));
    assert!(ok(&json!({ "n": -273 }), &spec));
    assert!(!ok(&json!({ "n": -274 }), &spec));
    assert!(!ok(&json!({ "n": 101 }), &spec));
}

#[test]
fn enforces_array_bounds_and_items() {
    let spec = spec_of(json!([
        { "name": "xs", "type": "array", "required": true, "minItems": 1, "maxItems": 2,
          "items": { "type": "integer", "min": 0 } },
    ]));
    assert!(ok(&json!({ "xs": [1, 2] }), &spec));
    assert!(!ok(&json!({ "xs": [] }), &spec));
    assert!(!ok(&json!({ "xs": [1, 2, 3] }), &spec));
    assert!(!ok(&json!({ "xs": [-1] }), &spec));
}

#[test]
fn enforces_enum_membership() {
    let spec = spec_of(json!([
        { "name": "mode", "type": "enum", "required": true, "values": ["a", "b"] },
    ]));
    assert!(ok(&json!({ "mode": "b" }), &spec));
    assert!(!ok(&json!({ "mode": "c" }), &spec));
    assert!(!ok(&json!({ "mode": 1 }), &spec));
}

#[test]
fn enforces_pattern() {
    let spec = spec_of(json!([
        { "name": "un", "type": "string", "required": true, "pattern": "^UN[0-9]{4}$" },
    ]));
    assert!(ok(&json!({ "un": "UN1263" }), &spec));
    assert!(!ok(&json!({ "un": "UN12" }), &spec));
}

#[test]
fn skips_catastrophic_pattern_matching_layer_a() {
    // A ReDoS-shaped pattern (nested quantifiers) is SKIPPED, not run — the
    // field validates as satisfied. Layer A's `safeRegexTest` does the same, so
    // both engines accept; the catastrophic pattern can never hang the prover.
    // This is the conformance case for the coordinated ReDoS screen.
    let spec = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "pattern": "(a+)+$" },
    ]));
    // Both a would-match and a would-not-match input are accepted (screen skips).
    assert!(ok(&json!({ "s": "aaaa" }), &spec));
    assert!(ok(&json!({ "s": &"a".repeat(40).to_string() }), &spec));
    // A safe pattern still enforces normally.
    let safe = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "pattern": "^a+$" },
    ]));
    assert!(ok(&json!({ "s": "aaa" }), &safe));
    assert!(!ok(&json!({ "s": "aab" }), &safe));
}

// ── String formats — the four canonical + the open axis ──────────────

#[test]
fn enforces_canonical_formats() {
    let spec = spec_of(json!([
        { "name": "h", "type": "string", "required": true, "format": "bytes32-hex" },
        { "name": "a", "type": "string", "required": false, "format": "address-hex" },
        { "name": "b", "type": "string", "required": false, "format": "bytes-hex" },
        { "name": "t", "type": "string", "required": false, "format": "iso-datetime" },
    ]));
    let good = json!({
        "h": format!("0x{}", "11".repeat(32)),
        "a": format!("0x{}", "22".repeat(20)),
        "b": "0xdeadbeef",
        "t": "2026-07-16T12:00:00Z",
    });
    assert!(ok(&good, &spec));
    assert!(!ok(&json!({ "h": "0x1234" }), &spec));
    assert!(!ok(&json!({ "h": format!("0x{}", "11".repeat(32)), "t": "yesterday" }), &spec));
}

#[test]
fn unknown_format_validates_as_plain_string() {
    // The format axis is OPEN — a permissionlessly-declared format the
    // engine does not know validates as a plain string (and the spec
    // parses; a closed set here once hard-failed the first novel format).
    let spec = spec_of(json!([
        { "name": "g", "type": "string", "required": true, "format": "geohash", "minLength": 5 },
    ]));
    assert!(ok(&json!({ "g": "u4pruyd" }), &spec));
    assert!(!ok(&json!({ "g": "u4" }), &spec)); // length still enforced
    assert!(!ok(&json!({ "g": 7 }), &spec)); // type still enforced
}

// ── JS parity details ────────────────────────────────────────────────

#[test]
fn string_length_counts_utf16_code_units() {
    // Layer A's min/maxLength use JS String.length (UTF-16 code units):
    // "🚚" is TWO units there, not one char and not four bytes.
    let spec = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "minLength": 2, "maxLength": 2 },
    ]));
    assert!(ok(&json!({ "s": "🚚" }), &spec));
    assert!(!ok(&json!({ "s": "é" }), &spec)); // 1 UTF-16 unit (2 UTF-8 bytes)
}

#[test]
fn bigint_grammar_is_decimal_only() {
    // The tightened grammar `-?[0-9]+` — no empty string, no `+`, no hex,
    // no whitespace (Layer A enforces the same grammar).
    let spec = spec_of(json!([
        { "name": "v", "type": "bigint", "required": true, "min": "-100", "max": "1000000000000000000000000" },
    ]));
    assert!(ok(&json!({ "v": "123456789012345678901234" }), &spec));
    assert!(ok(&json!({ "v": "-100" }), &spec));
    assert!(!ok(&json!({ "v": "-101" }), &spec));
    assert!(!ok(&json!({ "v": "" }), &spec));
    assert!(!ok(&json!({ "v": "+5" }), &spec));
    assert!(!ok(&json!({ "v": "0x10" }), &spec));
    assert!(!ok(&json!({ "v": " 5" }), &spec));
    assert!(!ok(&json!({ "v": 5 }), &spec)); // must be a decimal string
}

#[test]
fn json_float_with_zero_fraction_is_an_integer_bound() {
    // JS has no int/float distinction: `1.0` IS the integer 1 to Layer A.
    let spec = parse_or_panic(&json!({
        "clauseId": "t",
        "version": 1.0,
        "title": "T",
        "description": "D",
        "fields": [{ "name": "n", "type": "integer", "required": true, "min": 0.0, "max": 10.0 }],
    }));
    assert_eq!(spec.version, 1);
    assert!(ok(&json!({ "n": 10 }), &spec));
    assert!(!ok(&json!({ "n": 11 }), &spec));
}

// ── Stage overrides ──────────────────────────────────────────────────

#[test]
fn stage_override_selects_stage_fields() {
    let spec = spec_of_with_stages(
        json!([{ "name": "declared", "type": "string", "required": true }]),
        json!({ "1": [{ "name": "observed", "type": "integer", "required": true }] }),
    );
    let witness = json!({ "observed": 5 });
    assert!(validate_content(&witness, &spec, ValidateOptions { stage: Some(1) }).is_ok());
    // Without the stage, the default fields apply and the witness fails.
    assert!(validate_content(&witness, &spec, ValidateOptions::default()).is_err());
    // A stage with no override falls back to the default fields.
    assert!(
        validate_content(&json!({ "declared": "x" }), &spec, ValidateOptions { stage: Some(2) })
            .is_ok()
    );
}

// ── Spec-parse gates (Layer A parity) ────────────────────────────────

#[test]
fn rejects_nesting_beyond_max_depth() {
    // Build a fields chain MAX_FIELD_DEPTH+1 objects deep — parse must
    // reject cleanly (in-circuit a stack overflow would be a prover crash).
    let mut field = json!({ "name": "leaf", "type": "string", "required": true });
    for i in 0..=MAX_FIELD_DEPTH {
        field = json!({ "name": format!("lvl{i}"), "type": "object", "required": true, "fields": [field] });
    }
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [field],
    }));
    assert!(
        errors.iter().any(|e| e.message.contains("maximum depth")),
        "{errors:?}"
    );
}

#[test]
fn parses_label_default_sentinel_value_labels() {
    let spec = spec_of(json!([
        { "name": "band", "type": "enum", "required": false,
          "values": ["none", "zone-wifi", "nearby-ble"],
          "sentinel": "none",
          "default": "zone-wifi",
          "label": "Proximity band",
          "valueLabels": { "zone-wifi": "Same Wi-Fi network" } },
    ]));
    match &spec.fields[0] {
        figaro_clause::FieldSpec::Enum(e) => {
            assert_eq!(e.sentinel.as_deref(), Some("none"));
            assert_eq!(e.base.label.as_deref(), Some("Proximity band"));
            assert!(e.base.default.is_some());
            assert!(e.value_labels.is_some());
        }
        other => panic!("expected enum, got {other:?}"),
    }
}

#[test]
fn rejects_default_that_mismatches_field() {
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [
            { "name": "n", "type": "integer", "required": false, "min": 0, "default": -5 },
        ],
    }));
    assert!(errors.iter().any(|e| e.path.ends_with(".default")), "{errors:?}");
}

#[test]
fn rejects_sentinel_default() {
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [
            { "name": "e", "type": "enum", "required": false,
              "values": ["none", "a"], "sentinel": "none", "default": "none" },
        ],
    }));
    assert!(errors.iter().any(|e| e.path.ends_with(".default")), "{errors:?}");
}

#[test]
fn rejects_sentinel_not_in_values() {
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [
            { "name": "e", "type": "enum", "required": true, "values": ["a"], "sentinel": "b" },
        ],
    }));
    assert!(errors.iter().any(|e| e.path.ends_with(".sentinel")), "{errors:?}");
}

#[test]
fn rejects_value_label_for_undeclared_value() {
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [
            { "name": "e", "type": "enum", "required": true, "values": ["a"],
              "valueLabels": { "b": "Bee" } },
        ],
    }));
    assert!(errors.iter().any(|e| e.path.contains("valueLabels")), "{errors:?}");
}

#[test]
fn rejects_invalid_regex_pattern() {
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [
            { "name": "s", "type": "string", "required": true, "pattern": "([" },
        ],
    }));
    assert!(errors.iter().any(|e| e.message.contains("valid regex")), "{errors:?}");
}

#[test]
fn rejects_empty_format_string() {
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [
            { "name": "s", "type": "string", "required": true, "format": "" },
        ],
    }));
    assert!(errors.iter().any(|e| e.path.ends_with(".format")), "{errors:?}");
}

#[test]
fn array_items_name_and_required_are_synthetic() {
    // Layer A parses items as { ...items, name: "*", required: true } —
    // the synthetic values OVERRIDE whatever the items spec declares.
    let spec = spec_of(json!([
        { "name": "xs", "type": "array", "required": true,
          "items": { "type": "string", "name": "custom", "required": false } },
    ]));
    match &spec.fields[0] {
        figaro_clause::FieldSpec::Array(a) => {
            assert_eq!(a.items.base().name, "*");
            assert!(a.items.base().required);
        }
        other => panic!("expected array, got {other:?}"),
    }
}

#[test]
fn ignores_block_slice() {
    // `block` is presentation metadata — parse succeeds and carries none of it.
    parse_or_panic(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [],
        "block": { "article": "logistics", "anything": ["else"] },
    }));
}

#[test]
fn rejects_bad_top_level_shapes() {
    assert!(matches!(
        parse_clause_spec(&json!("not an object")),
        ParseClauseSpecResult::Err(_)
    ));
    let errors = parse_errors(&json!({
        "clauseId": "", "version": -1, "title": "", "description": 5, "fields": "nope",
    }));
    let paths: Vec<&str> = errors.iter().map(|e| e.path.as_str()).collect();
    for expected in ["$.clauseId", "$.version", "$.title", "$.description", "$.fields"] {
        assert!(paths.contains(&expected), "missing {expected} in {paths:?}");
    }
}

#[test]
fn rejects_bad_stage_keys() {
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [],
        "stages": { "256": [], "x": [] },
    }));
    assert_eq!(
        errors.iter().filter(|e| e.message.contains("0..255")).count(),
        2,
        "{errors:?}"
    );
}
