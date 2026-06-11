//! Conformance tests for the generic Rust ABI encoder. Each test runs
//! `encode_content_from_spec` against an embedded spec + content payload
//! and asserts the bytes match the byte-for-byte canonical output of
//! viem's `encodeAbiParameters`. Vectors here lock Layer B's encoder to
//! Layer A's TypeScript (`sdk/src/clauses/encode.ts`); the kernel's
//! cross-form-binding gate depends on this equivalence.
//!
//! After the Keystone cutover (single spec-driven encoder, no per-clause
//! dispatch), the canonical encoding rule is:
//!   - top-level fields encode as `abi_encode_params` in declaration order
//!   - enums map to `uint8` = 0-based position in `EnumFieldSpec::values`
//!   - absent optional fields encode as the ABI zero-value of their type
//!   - object-arrays encode as `tuple[]`
//!
//! Whenever a clause's spec changes (field added/removed, enum values
//! reordered, type changed), regenerate the corresponding vector and
//! update the assertion. The matching TS vector in
//! `sdk/tests/clauses/encode.test.ts` must change in the same commit.

use figaro_clause::{
    embedded_spec_json_by_key, encode_content_from_spec, parse_clause_spec, ParseClauseSpecResult,
};
use serde_json::{json, Value};

fn to_hex(bytes: &[u8]) -> String {
    format!("0x{}", alloy_primitives::hex::encode(bytes))
}

fn assert_encode(clause_id: &str, content: Value, expected_hex: &str) {
    let json_str = embedded_spec_json_by_key(clause_id)
        .unwrap_or_else(|| panic!("no embedded spec for {clause_id}"));
    let parsed: Value = serde_json::from_str(json_str)
        .unwrap_or_else(|e| panic!("embedded spec for {clause_id} is not valid JSON: {e}"));
    let spec = match parse_clause_spec(&parsed) {
        ParseClauseSpecResult::Ok(s) => s,
        ParseClauseSpecResult::Err(errors) => {
            panic!("embedded spec for {clause_id} failed to parse: {errors:?}")
        }
    };
    let bytes = encode_content_from_spec(&spec, &content)
        .unwrap_or_else(|e| panic!("encode failed for {clause_id}: {e}"));
    assert_eq!(
        to_hex(&bytes),
        expected_hex,
        "clauseId {clause_id} bytes diverged from TypeScript canonical encoding",
    );
}

// ── Non-byte-changing clauses: vectors unchanged from pre-cutover ────

#[test]
fn ghg_protocol_scope_1() {
    assert_encode(
        "figaro-ghg-protocol-v1",
        json!({ "scope": 1 }),
        "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
}

#[test]
fn ghg_protocol_scope_unset_defaults_to_zero() {
    assert_encode(
        "figaro-ghg-protocol-v1",
        json!({}),
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    );
}

#[test]
fn ghg_iso_14064_uses_same_encoder() {
    assert_encode(
        "figaro-ghg-iso-14064-v1",
        json!({ "scope": 2 }),
        "0x0000000000000000000000000000000000000000000000000000000000000002",
    );
}

#[test]
fn ghg_measurement_grams_1000() {
    assert_encode(
        "figaro-ghg-measurement-v1",
        json!({ "grams": "1000" }),
        "0x00000000000000000000000000000000000000000000000000000000000003e8",
    );
}

#[test]
fn applicable_law_law_only() {
    assert_encode(
        "figaro-applicable-law-v1",
        json!({
            "applicableLaw": "US-CA",
        }),
        "0x000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000555532d434100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    );
}

#[test]
fn applicable_law_law_forum_language() {
    assert_encode(
        "figaro-applicable-law-v1",
        json!({
            "applicableLaw": "US",
            "forum": "JAMS-arbitration",
            "language": "en",
        }),
        "0x000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000002555300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000104a414d532d6172626974726174696f6e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002656e000000000000000000000000000000000000000000000000000000000000",
    );
}

#[test]
fn commerce_one_item() {
    assert_encode(
        "figaro-commerce-v1",
        json!({
            "currency": "0x0000000000000000000000000000000000000001",
            "payment": "100",
            "lineItems": [{
                "itemId": "id-1",
                "name": "Item",
                "quantity": "2",
                "unitPrice": "50",
            }],
        }),
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000032000000000000000000000000000000000000000000000000000000000000000469642d310000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000044974656d00000000000000000000000000000000000000000000000000000000",
    );
}

#[test]
fn merchant_handed_off() {
    assert_encode(
        "figaro-merchant-process-v1",
        json!({
            "eventType": "handed-off",
            "evidenceUri": "ipfs://abc",
        }),
        "0x00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000a697066733a2f2f61626300000000000000000000000000000000000000000000",
    );
}

#[test]
fn courier_in_transit_no_evidence() {
    assert_encode(
        "figaro-courier-process-v1",
        json!({ "eventType": "in-transit" }),
        "0x000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000",
    );
}

#[test]
fn arbitration_kleros_general_5() {
    // klerosCourt = "general" → position 1 in [none, general, ...].
    // The "none" insertion at position 0 preserves the legacy index for
    // every real subcourt — only the (never-emitted) sentinel slot moved.
    assert_encode(
        "figaro-arbitration-kleros-v1",
        json!({
            "klerosCourt": "general",
            "klerosMinJurors": 5,
        }),
        "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000005",
    );
}

#[test]
fn arbitration_kleros_blockchain_technical_no_jurors() {
    // klerosCourt = "blockchain-technical" → position 3. klerosMinJurors
    // absent + optional → ABI zero (0x...000), not the legacy 1-arg
    // default of 3. Court-routing UI applies its own default at dispute
    // time; the encoder does not.
    assert_encode(
        "figaro-arbitration-kleros-v1",
        json!({
            "klerosCourt": "blockchain-technical",
        }),
        "0x00000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000",
    );
}

// ── Byte-changing clauses: vectors regenerated under the canonical rule

#[test]
fn geo_v2_basic() {
    // classOfService "S" → position 0 in [S, E, F, C]
    // (previous per-clause encoder used 1-based; bytes shift accordingly)
    assert_encode(
        "figaro-geo-v2",
        json!({
            "originGeohash": "dr5ru",
            "destinationGeohash": "dr5x1",
            "massGrams": 1000,
            "volumeMl": 500,
            "classOfService": "S",
        }),
        "0x00000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000003e800000000000000000000000000000000000000000000000000000000000001f400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005647235727500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000056472357831000000000000000000000000000000000000000000000000000000",
    );
}

#[test]
fn modalities_delivery() {
    // Single-select enum → its 0-based position:
    // modality "delivery" → 2 in [consume-onsite, pickup, delivery, virtual].
    // Expected bytes generated by the Layer-A reference encoder
    // (sdk encodeContentFromSpec) against the same input.
    assert_encode(
        "figaro-modalities-v1",
        json!({ "modality": "delivery" }),
        "0x0000000000000000000000000000000000000000000000000000000000000002",
    );
}

#[test]
fn coordination_buyer_assigned() {
    // coordination "buyer-assigned" → 1 in
    // [seller-assigned, buyer-assigned, dutch-auction].
    assert_encode(
        "figaro-coordination-v1",
        json!({ "coordination": "buyer-assigned" }),
        "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
}

#[test]
fn proximity_policy_two_bands() {
    // bands ["zone-wifi", "contact-nfc"] → [0, 2] in [zone-wifi, nearby-ble, contact-nfc]
    assert_encode(
        "figaro-proximity-policy-v1",
        json!({ "bands": ["zone-wifi", "contact-nfc"] }),
        "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002",
    );
}

#[test]
fn proximity_proof_basic() {
    // band "nearby-ble" → 1 in [zone-wifi, nearby-ble, contact-nfc]
    assert_encode(
        "figaro-proximity-proof-v1",
        json!({
            "band": "nearby-ble",
            "nonce": format!("0x{}", "ab".repeat(32)),
            "deviceSig": "0xdeadbeef",
        }),
        "0x0000000000000000000000000000000000000000000000000000000000000001abababababababababababababababababababababababababababababababab00000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000004deadbeef00000000000000000000000000000000000000000000000000000000",
    );
}

#[test]
fn offset_policy_two_providers() {
    // providers ["klima", "toucan"] → [0, 1] in [klima, toucan, moss, custom]
    assert_encode(
        "figaro-offset-policy-v1",
        json!({ "providers": ["klima", "toucan"] }),
        "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
    );
}

#[test]
fn consent_one_doc() {
    // documents array switches from struct-of-arrays (bytes32[], string[],
    // string[]) to tuple[] — the canonical "object-array → tuple[]" rule.
    assert_encode(
        "figaro-consent-v1",
        json!({
            "documents": [{
                "documentHash": format!("0x{}", "11".repeat(32)),
                "documentVersion": "1.0",
                "documentTitle": "Terms",
            }],
        }),
        "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000201111111111111111111111111111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000003312e30000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000055465726d73000000000000000000000000000000000000000000000000000000",
    );
}

// ── Unsupported-clause path ─────────────────────────────────────────

#[test]
fn unknown_clause_has_no_embedded_spec() {
    assert!(
        embedded_spec_json_by_key("figaro-bogus-v99").is_none(),
        "third-party clauseIds should not be found in the embedded set",
    );
}

#[test]
fn topology_v1_has_no_embedded_spec() {
    // Manifest-only — no validator, never attested at runtime, so no
    // canonical encoding either.
    assert!(
        embedded_spec_json_by_key("figaro-topology-v1").is_none(),
        "topology is manifest-only; embedded set must exclude it",
    );
}
