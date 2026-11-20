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
    parse_clause_spec, parse_stage_key, validate_content, ClauseSpec, ParseClauseSpecResult,
    ValidateOptions, MAX_FIELD_DEPTH, PATTERN_SIZE_LIMIT,
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
fn enforces_a_pattern_whose_quantified_group_holds_a_quantifier() {
    // Every pattern runs, whatever its shape. The SDK's `safeRegexTest` gives
    // the same verdicts (`sdk/tests/clauses/validate.test.ts`).
    let nested = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "pattern": "(a+)+$" },
    ]));
    assert!(ok(&json!({ "s": "aaaa" }), &nested));
    assert!(!ok(&json!({ "s": "a".repeat(40) + "!" }), &nested));
    assert!(!ok(&json!({ "s": "b" }), &nested));
    let domain = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "pattern": "^([a-z0-9-]+\\.)+[a-z]{2,}$" },
    ]));
    assert!(ok(&json!({ "s": "example.com" }), &domain));
    assert!(ok(&json!({ "s": "a.b-c.example.org" }), &domain));
    assert!(!ok(&json!({ "s": "example" }), &domain));
    assert!(!ok(&json!({ "s": "Example.com" }), &domain));
    assert!(!ok(&json!({ "s": "example.c" }), &domain));
    let plain = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "pattern": "^a+$" },
    ]));
    assert!(ok(&json!({ "s": "aaa" }), &plain));
    assert!(!ok(&json!({ "s": "aab" }), &plain));
}

#[test]
fn tests_a_value_over_4096_characters_against_its_pattern() {
    // A field with no `maxLength`: the value is tested like any other.
    let spec = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "pattern": "^a+$" },
    ]));
    assert!(ok(&json!({ "s": "a".repeat(5000) }), &spec));
    assert!(!ok(&json!({ "s": "a".repeat(4999) + "b" }), &spec));
    let other = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "pattern": "^y+$" },
    ]));
    assert!(!ok(&json!({ "s": "x".repeat(5000) }), &other));
}

fn parses(pattern: &str) -> bool {
    matches!(
        parse_clause_spec(&json!({
            "clauseId": "t",
            "version": 1,
            "title": "T",
            "description": "D",
            "fields": [{ "name": "s", "type": "string", "required": true, "pattern": pattern }],
        })),
        ParseClauseSpecResult::Ok(_)
    )
}

#[test]
fn refuses_a_pattern_past_the_size_limit() {
    // The expanded size, the SDK's `portablePatternSize`: 4,096 parses and
    // 4,097 does not. Each level of `(?:…)*` counts two, so nested
    // quantifiers no longer hide their cost.
    assert!(parses("(?:a{31}){64}"));
    assert!(parses("(?:a{0,31}){64}"));
    assert!(!parses("(?:a{31}){64}a"));
    assert!(!parses("(?:a{64}){64}"));
    let nested = |k: usize, q: &str| format!("{}a{}", "(?:".repeat(k), format!("){q}").repeat(k));
    assert!(!parses(&format!(
        "^(?:(?:{}){{64}}){{63}}$",
        nested(20, "*")
    )));
    assert!(parses(&format!("^(?:(?:{}){{8}}){{11}}$", nested(20, "*"))));
}

#[test]
fn refuses_a_value_past_the_work_budget_with_its_own_reason() {
    // Size 4,096, and it matches every value: 1,024 characters run, 1,025
    // are refused, never counted as matching (4,194,304 / 4,096).
    let spec = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "pattern": "(?:a{0,31}){64}" },
    ]));
    assert!(ok(&json!({ "s": "a".repeat(1024) }), &spec));
    let over = validate_content(
        &json!({ "s": "a".repeat(1025) }),
        &spec,
        ValidateOptions::default(),
    );
    let messages: Vec<&str> = over.errors().iter().map(|e| e.message.as_str()).collect();
    assert_eq!(messages, ["string too long for pattern (?:a{0,31}){64}"]);
    // `^a+$` has size 4: 1,048,576 characters run.
    let small = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "pattern": "^a+$" },
    ]));
    assert!(ok(&json!({ "s": "a".repeat(1 << 20) }), &small));
    assert!(!ok(&json!({ "s": "a".repeat((1 << 20) + 1) }), &small));
    // A value over `maxLength` is refused with that reason alone.
    let capped = spec_of(json!([
        { "name": "s", "type": "string", "required": true, "maxLength": 1024, "pattern": "(?:a{0,31}){64}" },
    ]));
    let over = validate_content(
        &json!({ "s": "a".repeat(1025) }),
        &capped,
        ValidateOptions::default(),
    );
    let messages: Vec<&str> = over.errors().iter().map(|e| e.message.as_str()).collect();
    assert_eq!(messages, ["string longer than maxLength 1024"]);
}

/// The widest portable classes: every other printable character, plain (48
/// byte ranges) and negated (49 with the bytes outside printable ASCII).
const WIDE: &str = "[!#%')+/13579;=?ACEGIKMOQSUWY_acegikmoqsuwy{}]";
const WIDE_NEGATED_EVEN: &str = r#"[^ "$&(*,.02468:<>@BDFHJLNPRTVXZ\\\^`bdfhjlnprtvxz|~]"#;
const WIDE_NEGATED_ODD: &str = r"[^!#%')+\-/13579;=?ACEGIKMOQSUWY\[\]_acegikmoqsuwy{}]";

#[test]
fn compiles_every_pattern_under_the_size_limit_within_pattern_size_limit() {
    // The costliest shapes for the automaton's memory at the size limit:
    // the widest classes, nested capturing groups, alternation. Each parses
    // under `PATTERN_SIZE_LIMIT`, and compiles in a quarter of it, so the
    // limit holds a fourfold margin over every one. The shared vectors and
    // `sdk/tests/clauses/engineVectors.test.ts` fit many more shapes to the
    // size limit, and the guest parses every one the SDK parses.
    let mut patterns = Vec::new();
    for class in [
        WIDE,
        WIDE_NEGATED_EVEN,
        WIDE_NEGATED_ODD,
        r"[\w\s]",
        r"\W",
        ".",
    ] {
        patterns.push(format!("(?:{class}{{0,63}}){{32}}"));
        patterns.push(format!("^(?:{class}{{0,64}}){{31}}$"));
        patterns.push(format!("^(?:(?:{class}{{0,8}}){{8}}){{28}}$"));
    }
    patterns.push("^(?:(?:((((((((((a)*)*)*)*)*)*)*)*)*)*){13}){13}$".to_string());
    patterns.push("^(?:(?:a|b|c|d|e|f|g|h){64}){3}$".to_string());
    for p in &patterns {
        assert!(parses(p), "{p}");
        let quarter = regex::bytes::RegexBuilder::new(p)
            .unicode(false)
            .size_limit(PATTERN_SIZE_LIMIT / 4)
            .build();
        assert!(quarter.is_ok(), "{p}");
    }
    // One past the size limit, the widest class parses in neither engine.
    assert!(!parses(&format!("(?:{WIDE_NEGATED_EVEN}{{0,63}}){{32}}a")));
}

#[test]
fn matches_the_widest_classes_at_the_budget_edge_in_bounded_time() {
    // Size 4,032: 1,040 characters run, each in the class, the last one
    // out of it; four such values run in one content, a fifth refuses it.
    for (class, hit, miss) in [
        (WIDE, '!', ' '),
        (WIDE_NEGATED_EVEN, '!', ' '),
        (WIDE_NEGATED_ODD, ' ', '!'),
    ] {
        let p = format!("^(?:{class}{{0,64}}){{31}}$");
        let value: String = std::iter::repeat(hit)
            .take(1039)
            .chain(std::iter::once(miss))
            .collect();
        let one =
            spec_of(json!([{ "name": "s", "type": "string", "required": true, "pattern": p }]));
        let start = std::time::Instant::now();
        assert!(!ok(&json!({ "s": value }), &one), "{p}");
        let list = list_spec(json!({ "type": "string", "pattern": p }));
        assert_eq!(
            messages(&json!({ "v": vec![value; 5] }), &list)
                .last()
                .map(String::as_str),
            Some("$ content too long for its patterns")
        );
        assert!(start.elapsed() < std::time::Duration::from_secs(60), "{p}");
    }
}

fn list_spec(items: Value) -> ClauseSpec {
    spec_of(json!([{ "name": "v", "type": "array", "required": true, "items": items }]))
}

fn messages(content: &Value, spec: &ClauseSpec) -> Vec<String> {
    validate_content(content, spec, ValidateOptions::default())
        .errors()
        .iter()
        .map(|e| format!("{} {}", e.path, e.message))
        .collect()
}

#[test]
fn bounds_one_contents_pattern_work_and_refuses_it_once_at_the_root() {
    // The total, 16,777,216: 1,925 32-byte hashes (size 132, 66 characters)
    // run, 1,926 are refused. The SDK's leg is
    // `sdk/tests/clauses/safeRegex.test.ts`.
    let hashes = list_spec(json!({ "type": "string", "pattern": "^0x[0-9a-fA-F]{64}$" }));
    let hash = format!("0x{}", "ab".repeat(32));
    assert!(ok(&json!({ "v": vec![hash.clone(); 1925] }), &hashes));
    assert_eq!(
        messages(&json!({ "v": vec![hash; 1926] }), &hashes),
        ["$ content too long for its patterns"]
    );
    // The many-values shape: four values run, then the content is refused
    // and no further pattern runs.
    let worst = list_spec(json!({ "type": "string", "pattern": "^(?:a{0,64}){31}$" }));
    let start = std::time::Instant::now();
    let got = messages(&json!({ "v": vec!["a".repeat(1039) + "!"; 1000] }), &worst);
    assert!(start.elapsed() < std::time::Duration::from_secs(30));
    let mut want: Vec<String> = (0..4)
        .map(|i| format!("$.v[{i}] string does not match pattern ^(?:a{{0,64}}){{31}}$"))
        .collect();
    want.push("$ content too long for its patterns".to_string());
    assert_eq!(got, want);
    // A value refused for its maxLength or its own budget adds nothing.
    let capped =
        list_spec(json!({ "type": "string", "maxLength": 1039, "pattern": "^(?:a{0,64}){31}$" }));
    assert!(
        messages(&json!({ "v": vec!["a".repeat(1040); 20] }), &capped)
            .iter()
            .all(|m| m.ends_with("string longer than maxLength 1039"))
    );
    assert!(
        messages(&json!({ "v": vec!["a".repeat(1041); 20] }), &worst)
            .iter()
            .all(|m| m.ends_with("string too long for pattern ^(?:a{0,64}){31}$"))
    );
}

#[test]
fn matches_the_costliest_patterns_at_the_budget_edge_in_bounded_time() {
    // The costliest shapes found at the size limit, each with its expanded
    // size, on the longest value the budget lets it run on. In a release
    // build the worst takes some 50 ms; this debug build is slower. The
    // SDK's leg is `sdk/tests/clauses/safeRegex.test.ts`.
    let patterns: [(&str, usize); 8] = [
        ("^(?:a{0,64}){31}$", 4032),
        ("^(?:(?:a{0,8}){8}){28}$", 4090),
        ("^(?:(?:(?:(?:a)*)*){64}){9}$", 4052),
        ("^(?:(?:(?:(?:[a-c])+)+){64}){9}$", 4052),
        ("^(?:(?:a*|b*){24}){24}$", 4082),
        ("^(?:(?:(a)+){28}){28}$", 3978),
        ("^(?:(?:((((((((((a)*)*)*)*)*)*)*)*)*)*){13}){13}$", 3915),
        ("b", 1),
    ];
    for (p, size) in patterns {
        let spec = spec_of(json!([
            { "name": "s", "type": "string", "required": true, "pattern": p },
        ]));
        let value = "a".repeat((1 << 22) / size - 1) + "!";
        let start = std::time::Instant::now();
        assert!(!ok(&json!({ "s": value }), &spec), "{p}");
        let elapsed = start.elapsed();
        assert!(
            elapsed < std::time::Duration::from_secs(30),
            "{p}: {elapsed:?}"
        );
    }
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
    assert!(!ok(
        &json!({ "h": format!("0x{}", "11".repeat(32)), "t": "yesterday" }),
        &spec
    ));
}

#[test]
fn unknown_format_validates_as_plain_string() {
    // The format axis is OPEN — a permissionlessly-declared format the
    // engine does not know validates as a plain string, and the spec parses.
    // (Geohash is the one format whose grain the engine caps.)
    let spec = spec_of(json!([
        { "name": "g", "type": "string", "required": true, "format": "plus-code", "minLength": 5 },
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
    // no whitespace (Layer A enforces the same grammar). A content value
    // carries no sign at all: the field's ABI word is uint256.
    let spec = spec_of(json!([
        { "name": "v", "type": "bigint", "required": true, "min": "-100", "max": "1000000000000000000000000" },
    ]));
    assert!(ok(&json!({ "v": "123456789012345678901234" }), &spec));
    assert!(!ok(&json!({ "v": "-100" }), &spec));
    assert!(!ok(&json!({ "v": "-0" }), &spec));
    assert!(!ok(&json!({ "v": "" }), &spec));
    assert!(!ok(&json!({ "v": "+5" }), &spec));
    assert!(!ok(&json!({ "v": "0x10" }), &spec));
    assert!(!ok(&json!({ "v": " 5" }), &spec));
    assert!(!ok(&json!({ "v": 5 }), &spec)); // must be a decimal string
}

#[test]
fn bigint_content_stays_inside_the_uint256_word() {
    let spec = spec_of(json!([{ "name": "v", "type": "bigint", "required": true }]));
    let max = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    let past = "115792089237316195423570985008687907853269984665640564039457584007913129639936";
    assert!(ok(&json!({ "v": "0" }), &spec));
    assert!(ok(&json!({ "v": max }), &spec));
    assert!(!ok(&json!({ "v": past }), &spec));
}

#[test]
fn integer_content_stays_inside_the_safe_range() {
    // Past 2^53 − 1 Layer A reads a rounded number from the text this engine
    // reads exactly; both refuse it.
    let spec = spec_of(json!([{ "name": "n", "type": "integer", "required": true }]));
    assert!(ok(&json!({ "n": 9007199254740991i64 }), &spec));
    assert!(ok(&json!({ "n": -9007199254740991i64 }), &spec));
    assert!(!ok(&json!({ "n": 9007199254740992i64 }), &spec));
    assert!(!ok(&json!({ "n": -9007199254740992i64 }), &spec));
    assert!(!ok(&json!({ "n": 1e21 }), &spec));
}

#[test]
fn a_spec_integer_written_as_a_float_meets_the_same_bound() {
    // JSON `9007199254740991.0` is the integer to Layer A; one past it is not.
    let spec_with_version = |version: &str| -> Value {
        serde_json::from_str(&format!(
            r#"{{"clauseId":"t","version":{version},"title":"T","description":"D",
                "fields":[{{"name":"b","type":"boolean","required":true}}]}}"#
        ))
        .unwrap()
    };
    let at = parse_or_panic(&spec_with_version("9007199254740991.0"));
    assert_eq!(at.version, 9007199254740991);
    parse_errors(&spec_with_version("9007199254740992.0"));
    parse_errors(&spec_with_version("1e21"));
}

#[test]
fn a_content_integer_written_as_a_float_is_read_exactly() {
    // The text is the witness: the engine reads the integer Layer A's
    // JSON.parse reads from it, to the last digit, and encodes that one.
    use figaro_clause::{encode_content_from_spec, EncodeOptions};
    let spec = spec_of(json!([{ "name": "n", "type": "integer", "required": true }]));
    let text = |n: &str| -> Value { serde_json::from_str(&format!(r#"{{"n":{n}}}"#)).unwrap() };
    for (written, exact) in [
        ("9007199254740991.0", "9007199254740991"),
        ("9007199254740989.0", "9007199254740989"),
        ("4503599627370497.0", "4503599627370497"),
        ("-9007199254740991.0", "-9007199254740991"),
        ("1e15", "1000000000000000"),
        ("1.5e1", "15"),
    ] {
        assert!(ok(&text(written), &spec), "{written} is an integer");
        assert_eq!(
            encode_content_from_spec(&spec, &text(written), EncodeOptions::default()).unwrap(),
            encode_content_from_spec(&spec, &text(exact), EncodeOptions::default()).unwrap(),
            "{written} encodes as {exact}"
        );
    }
    for past in [
        "9007199254740992.0",
        "9007199254740993.0",
        "1e16",
        "-9007199254740993.0",
        "1.5",
    ] {
        assert!(!ok(&text(past), &spec), "{past} is refused");
    }
}

#[test]
fn a_default_is_carried_in_its_own_form() {
    use figaro_clause::spec::DefaultValue;
    let default_of = |field: Value| -> Option<DefaultValue> {
        spec_of(json!([field])).fields[0].base().default.clone()
    };
    assert!(matches!(
        default_of(json!({ "name": "v", "type": "string", "required": true, "default": "x" })),
        Some(DefaultValue::String(s)) if s == "x"
    ));
    assert!(matches!(
        default_of(json!({ "name": "v", "type": "boolean", "required": true, "default": true })),
        Some(DefaultValue::Boolean(true))
    ));
    assert!(matches!(
        default_of(json!({ "name": "v", "type": "integer", "required": true, "default": 7 })),
        Some(DefaultValue::Integer(7))
    ));
    assert!(matches!(
        default_of(json!({ "name": "v", "type": "array", "required": true,
            "items": { "type": "enum", "values": ["a", "b"] }, "default": ["b", "a"] })),
        Some(DefaultValue::StringArray(v)) if v == ["b", "a"]
    ));
    assert!(default_of(json!({ "name": "v", "type": "boolean", "required": true })).is_none());
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
    assert!(validate_content(
        &json!({ "declared": "x" }),
        &spec,
        ValidateOptions { stage: Some(2) }
    )
    .is_ok());
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
    assert!(
        errors.iter().any(|e| e.path.ends_with(".default")),
        "{errors:?}"
    );
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
    assert!(
        errors.iter().any(|e| e.path.ends_with(".default")),
        "{errors:?}"
    );
}

#[test]
fn rejects_sentinel_not_in_values() {
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [
            { "name": "e", "type": "enum", "required": true, "values": ["a"], "sentinel": "b" },
        ],
    }));
    assert!(
        errors.iter().any(|e| e.path.ends_with(".sentinel")),
        "{errors:?}"
    );
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
    assert!(
        errors.iter().any(|e| e.path.contains("valueLabels")),
        "{errors:?}"
    );
}

#[test]
fn rejects_invalid_regex_pattern() {
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [
            { "name": "s", "type": "string", "required": true, "pattern": "([" },
        ],
    }));
    assert!(
        errors.iter().any(|e| e.path.ends_with(".pattern")),
        "{errors:?}"
    );
}

#[test]
fn rejects_a_pattern_outside_the_portable_core() {
    // A valid regex in one library or the other, and outside what both read
    // alike (`tests/engine_vectors.rs` carries the cases one by one).
    for pattern in ["^(?!foo).*$", "(?i)^a$", "^\\p{L}$", "^[a&&b]$", "^a++$"] {
        let errors = parse_errors(&json!({
            "clauseId": "t", "version": 1, "title": "T", "description": "D",
            "fields": [
                { "name": "s", "type": "string", "required": true, "pattern": pattern },
            ],
        }));
        assert!(
            errors.iter().any(|e| e.message.contains("portable core")),
            "{pattern}: {errors:?}"
        );
    }
}

#[test]
fn rejects_empty_format_string() {
    let errors = parse_errors(&json!({
        "clauseId": "t", "version": 1, "title": "T", "description": "D",
        "fields": [
            { "name": "s", "type": "string", "required": true, "format": "" },
        ],
    }));
    assert!(
        errors.iter().any(|e| e.path.ends_with(".format")),
        "{errors:?}"
    );
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
    for expected in [
        "$.clauseId",
        "$.version",
        "$.title",
        "$.description",
        "$.fields",
    ] {
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
        errors
            .iter()
            .filter(|e| e.message.contains("0..255"))
            .count(),
        2,
        "{errors:?}"
    );
}

#[test]
fn a_stage_key_has_one_spelling() {
    // Every uint8 reads back from its decimal, and from no other spelling.
    for stage in 0..=255u8 {
        assert_eq!(parse_stage_key(&stage.to_string()), Some(stage));
    }
    for key in [
        "01", "00", "+1", " 1", "1 ", "1.0", "0x1", "-0", "", "256", "1e1", "\u{0661}", "a",
    ] {
        assert_eq!(parse_stage_key(key), None, "{key:?}");
    }
}
