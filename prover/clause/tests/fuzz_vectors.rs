//! The generated leg of the clause-engine lock: the Rust engine gives Layer
//! A's answers on cases nobody wrote by hand.
//!
//! `sdk/tests/clauses/clauseFuzzVectors.test.ts` draws cases from a seed —
//! every protocol clause in `clauses/` and generated specs nobody has seen,
//! some malformed; content drawn from each spec's field shapes, half of it
//! inside every bound and half crossing them — and records Layer A's three
//! answers in `test/fixtures/streams/clauses.jsonl`, one JSON object per line:
//! whether the spec parses, whether the content validates, and the canonical
//! ABI bytes when it does. This file asks the Rust engine the same three
//! questions and asserts the same answers.
//!
//! The guest runs this engine on witness input (gates S and C), so an answer
//! that differs from Layer A's is a clause the batch path reads differently
//! from the signer who composed it.
//!
//! The test is `#[ignore]`d because it needs the vectors the SDK leg
//! writes; `scripts/test-cross-impl-fuzz.sh` runs both under one seed. Run
//! alone, missing vectors are a failure, never a skip.

use figaro_clause::{
    encode_content_from_spec, parse_clause_spec, validate_content, EncodeOptions,
    ParseClauseSpecResult, ValidateOptions,
};
use serde_json::Value;

fn vectors() -> Vec<Value> {
    let path = std::env::var("CLAUSE_FUZZ_VECTORS")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            p.pop(); // prover/
            p.pop(); // repo root
            p.push("test/fixtures/streams/clauses.jsonl");
            p
        });
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "read {}: {e} — run scripts/test-cross-impl-fuzz.sh, which writes the vectors first",
            path.display()
        )
    });
    text.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).expect("vector line is JSON"))
        .collect()
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(2 + bytes.len() * 2);
    out.push_str("0x");
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

#[test]
#[ignore = "needs the vectors the SDK leg writes; run scripts/test-cross-impl-fuzz.sh"]
fn the_engine_gives_layer_a_answers_on_every_generated_case() {
    let lines = vectors();
    let header = lines
        .iter()
        .find(|l| l["type"] == "header")
        .expect("the vectors open on a header");
    let seed = header["seed"].as_i64().expect("seed");
    let cases: Vec<&Value> = lines.iter().filter(|l| l["type"] == "vector").collect();
    assert_eq!(
        cases.len() as u64,
        header["count"].as_u64().unwrap(),
        "every case is in the file"
    );

    let mut divergences: Vec<String> = Vec::new();
    let (mut encoded, mut rejected, mut unparsed) = (0usize, 0usize, 0usize);

    for case in cases {
        let index = case["index"].as_u64().unwrap();
        let origin = case["origin"].as_str().unwrap();
        let stage: Option<u8> = case["stage"].as_u64().map(|s| s as u8);
        let content = &case["content"];
        let at = format!("case {index} ({origin}, stage {stage:?})");

        // ── Does the spec parse? ──
        let layer_a_parses = case["specOk"].as_bool().unwrap();
        let spec = match (parse_clause_spec(&case["spec"]), layer_a_parses) {
            (ParseClauseSpecResult::Ok(spec), true) => spec,
            (ParseClauseSpecResult::Err(_), false) => {
                unparsed += 1;
                continue;
            }
            (ParseClauseSpecResult::Ok(_), false) => {
                divergences.push(format!("{at}: Layer A refuses the spec, the engine PARSES it"));
                continue;
            }
            (ParseClauseSpecResult::Err(errors), true) => {
                divergences.push(format!(
                    "{at}: Layer A parses the spec, the engine refuses it: {errors:?}"
                ));
                continue;
            }
        };

        // ── Does the content validate? ──
        let layer_a_validates = case["validateOk"].as_bool().unwrap();
        let verdict = validate_content(content, &spec, ValidateOptions { stage });
        if verdict.is_ok() != layer_a_validates {
            divergences.push(format!(
                "{at}: Layer A {} the content, the engine {}: {} — content {content}",
                if layer_a_validates { "accepts" } else { "rejects" },
                if verdict.is_ok() { "ACCEPTS" } else { "rejects" },
                verdict
                    .errors()
                    .iter()
                    .map(|e| format!("{e:?}"))
                    .collect::<Vec<_>>()
                    .join("; "),
            ));
            continue;
        }
        if !layer_a_validates {
            rejected += 1;
            continue;
        }

        // ── The canonical bytes ──
        let expected = case["encoded"].as_str().unwrap();
        match encode_content_from_spec(&spec, content, EncodeOptions { stage }) {
            Ok(bytes) => {
                let got = hex(&bytes);
                if got != expected.to_lowercase() {
                    divergences.push(format!(
                        "{at}: the bytes differ — content {content}\n  Layer A {expected}\n  engine  {got}"
                    ));
                } else {
                    encoded += 1;
                }
            }
            Err(e) => divergences.push(format!(
                "{at}: Layer A encodes the content, the engine cannot: {e:?} — content {content}"
            )),
        }
    }

    assert!(
        encoded > 0 && rejected > 0 && unparsed > 0,
        "seed {seed}: the vectors exercise all three answers"
    );
    assert!(
        divergences.is_empty(),
        "seed {seed}: {} divergences between Layer A and the engine:\n{}",
        divergences.len(),
        divergences.join("\n")
    );
    println!(
        "seed {seed}: {encoded} encoded byte-for-byte, {rejected} rejected, {unparsed} specs refused — no divergence"
    );
}
