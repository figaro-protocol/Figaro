//! The guest's leg of the hand-written clause-engine lock.
//!
//! `sdk/tests/clauses/engineVectors.test.ts` names the engine's boundaries
//! one by one — each character position of the datetime format, each hex
//! width, each shape the regex screen reads, each bound a spec declares —
//! and freezes Layer A's verdict on every case into
//! `test/fixtures/clause-engine-vectors.json`. This file asserts the guest's
//! engine gives the same verdicts, and the same bytes where a case carries
//! them.

use figaro_clause::{
    encode_content_from_spec, parse_clause_spec, validate_content, ClauseSpec, EncodeOptions,
    ParseClauseSpecResult, ValidateOptions,
};
use serde_json::{json, Value};

fn fixture() -> Value {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("test/fixtures/clause-engine-vectors.json");
    let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    serde_json::from_str(&text).expect("fixture JSON")
}

fn spec_of(fields: &Value) -> Result<ClauseSpec, String> {
    let raw = json!({
        "clauseId": "t",
        "version": 1,
        "title": "T",
        "description": "D",
        "fields": fields,
    });
    match parse_clause_spec(&raw) {
        ParseClauseSpecResult::Ok(spec) => Ok(spec),
        ParseClauseSpecResult::Err(errors) => Err(format!("{errors:?}")),
    }
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::from("0x");
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// The engine's verdict in the fixture's form: `None` when the field spec
/// itself does not parse.
fn verdict(fields: &Value, content: &Value) -> Option<bool> {
    let spec = spec_of(fields).ok()?;
    Some(validate_content(content, &spec, ValidateOptions::default()).is_ok())
}

#[test]
fn the_engine_gives_layer_a_verdict_on_every_value() {
    let fx = fixture();
    let cases = fx["values"].as_array().expect("values");
    assert!(cases.len() > 100);
    let mut differing = Vec::new();
    for case in cases {
        let fields = json!([case["field"]]);
        let content = json!({ "v": case["value"] });
        let expected = case["ok"].as_bool();
        let got = verdict(&fields, &content);
        if got != expected {
            differing.push(format!(
                "{}: value {} — Layer A {expected:?}, the engine {got:?}",
                case["group"], case["value"]
            ));
        }
    }
    assert!(differing.is_empty(), "{} verdicts differ:\n{}", differing.len(), differing.join("\n"));
}

#[test]
fn the_engine_gives_layer_a_verdict_on_every_content() {
    let fx = fixture();
    let mut differing = Vec::new();
    for case in fx["contents"].as_array().expect("contents") {
        let expected = case["ok"].as_bool();
        let got = verdict(&case["fields"], &case["content"]);
        if got != expected {
            differing.push(format!("{}: Layer A {expected:?}, the engine {got:?}", case["label"]));
        }
    }
    assert!(differing.is_empty(), "{} verdicts differ:\n{}", differing.len(), differing.join("\n"));
}

#[test]
fn the_engine_parses_the_specs_layer_a_parses_and_no_others() {
    let fx = fixture();
    let cases = fx["specs"].as_array().expect("specs");
    assert!(cases.len() > 30);
    let mut differing = Vec::new();
    for case in cases {
        let expected = case["ok"].as_bool().unwrap();
        let got = matches!(parse_clause_spec(&case["spec"]), ParseClauseSpecResult::Ok(_));
        if got != expected {
            differing.push(format!(
                "{}: Layer A {}, the engine {}",
                case["label"],
                if expected { "parses" } else { "refuses" },
                if got { "parses" } else { "refuses" },
            ));
        }
    }
    assert!(differing.is_empty(), "{} specs differ:\n{}", differing.len(), differing.join("\n"));
}

#[test]
fn the_engine_encodes_layer_a_bytes() {
    let fx = fixture();
    for case in fx["encodings"].as_array().expect("encodings") {
        let label = &case["label"];
        let spec = spec_of(&case["fields"]).unwrap_or_else(|e| panic!("{label}: {e}"));
        let bytes = encode_content_from_spec(&spec, &case["content"], EncodeOptions::default())
            .unwrap_or_else(|e| panic!("{label}: {e:?}"));
        // viem echoes the case of a `bytes` value's hex digits; bytes have none.
        assert_eq!(
            hex(&bytes),
            case["encoded"].as_str().unwrap().to_lowercase(),
            "{label}: the bytes"
        );
    }
}

#[test]
fn a_verdict_carries_its_reasons() {
    // `is_err` and `errors` are what the guest reports a rejection with.
    let spec = spec_of(&json!([{ "name": "v", "type": "integer", "required": true, "min": 0 }])).unwrap();
    let good = validate_content(&json!({ "v": 1 }), &spec, ValidateOptions::default());
    assert!(good.is_ok() && !good.is_err());
    assert!(good.errors().is_empty());

    let bad = validate_content(&json!({ "v": "x", "w": 1 }), &spec, ValidateOptions::default());
    assert!(bad.is_err() && !bad.is_ok());
    let errors = bad.errors();
    assert_eq!(errors.len(), 2, "one reason per fault: {errors:?}");
    assert_eq!(errors[0].path, "$.v");
    assert_eq!(errors[0].message, "expected integer, got string");
    assert!(errors.iter().any(|e| e.path == "$.w"), "the unknown field is named: {errors:?}");

    // The names are JavaScript's `typeof`, Layer A's: an array is an object.
    for (value, name) in [
        (json!(true), "boolean"),
        (json!(1.5), "number"),
        (json!("x"), "string"),
        (json!([]), "object"),
        (json!({}), "object"),
    ] {
        let v = validate_content(&json!({ "v": value }), &spec, ValidateOptions::default());
        assert_eq!(
            v.errors()[0].message,
            format!("expected integer, got {name}"),
            "the reason names what it got"
        );
    }

    // An integer written as a whole number and out of range names the range;
    // a fraction names the type.
    let unbounded = spec_of(&json!([{ "name": "v", "type": "integer", "required": true }])).unwrap();
    let past: Value = serde_json::from_str(r#"{"v":1e21}"#).unwrap();
    assert_eq!(
        validate_content(&past, &unbounded, ValidateOptions::default()).errors()[0].message,
        "value 1e+21 is outside the safe integer range"
    );
    let fraction: Value = serde_json::from_str(r#"{"v":1.5}"#).unwrap();
    assert_eq!(
        validate_content(&fraction, &unbounded, ValidateOptions::default()).errors()[0].message,
        "expected integer, got number"
    );

    // A reason's path is the field's place in the content: `$.name` at the
    // root, and one more step for each level below it.
    let nested = spec_of(&json!([{
        "name": "o", "type": "object", "required": true,
        "fields": [
            { "name": "a", "type": "integer", "required": true },
            { "name": "l", "type": "array", "required": true, "items": { "type": "integer" } },
        ],
    }]))
    .unwrap();
    let v = validate_content(
        &json!({ "o": { "a": "x", "l": [1, "y"], "z": 1 }, "w": 1 }),
        &nested,
        ValidateOptions::default(),
    );
    let mut paths: Vec<&str> = v.errors().iter().map(|e| e.path.as_str()).collect();
    paths.sort();
    assert_eq!(paths, ["$.o.a", "$.o.l[1]", "$.o.z", "$.w"], "{:?}", v.errors());
    let absent = validate_content(&json!({ "o": {} }), &nested, ValidateOptions::default());
    let mut paths: Vec<&str> = absent.errors().iter().map(|e| e.path.as_str()).collect();
    paths.sort();
    assert_eq!(paths, ["$.o.a", "$.o.l"], "{:?}", absent.errors());

    let formatted = spec_of(&json!([{ "name": "v", "type": "string", "required": true, "format": "address-hex" }])).unwrap();
    let v = validate_content(&json!({ "v": "0x00" }), &formatted, ValidateOptions::default());
    assert!(
        v.errors()[0].message.contains("address-hex"),
        "the reason names the format: {:?}",
        v.errors()
    );
}
