//! Canonical Layer-A schema specs, compiled into the binary.
//!
//! The Layer B content gate validates against these — never against a
//! caller-supplied spec — so the constraint set every attestation is
//! checked against is covered by the program verification key. The JSON
//! is `include_str!`d straight from the Layer A source of truth
//! (`frontend/lib/shared/schemas/`), so there is no second copy that
//! could drift.
//!
//! `figaro-topology-v1` is intentionally absent: it is manifest-only,
//! never attested at runtime, and has no encoder (see `encode.rs`). The
//! set here mirrors the encoder dispatch in `encode.rs` exactly — every
//! schema with a Rust encoder has its spec embedded here, and vice versa.

use alloy_primitives::{keccak256, B256};

/// One embedded protocol schema: its key string and canonical spec JSON.
struct EmbeddedSpec {
    schema_key: &'static str,
    spec_json: &'static str,
}

/// Build an `EmbeddedSpec` by `include_str!`ing the Layer A spec JSON for
/// the given schema key. The path is resolved relative to this file.
macro_rules! embed {
    ($key:literal) => {
        EmbeddedSpec {
            schema_key: $key,
            spec_json: include_str!(concat!(
                "../../../frontend/lib/shared/schemas/",
                $key,
                ".json"
            )),
        }
    };
}

/// The 17 runtime-attestable protocol schemas.
const EMBEDDED_SPECS: &[EmbeddedSpec] = &[
    embed!("figaro-ghg-protocol-v1"),
    embed!("figaro-ghg-iso-14064-v1"),
    embed!("figaro-ghg-pas-2050-v1"),
    embed!("figaro-ghg-en-16258-v1"),
    embed!("figaro-ghg-custom-v1"),
    embed!("figaro-ghg-measurement-v1"),
    embed!("figaro-geo-v2"),
    embed!("figaro-fulfilment-v2"),
    embed!("figaro-arbitration-kleros-v1"),
    embed!("figaro-applicable-law-v1"),
    embed!("figaro-commerce-v1"),
    embed!("figaro-proximity-policy-v1"),
    embed!("figaro-proximity-proof-v1"),
    embed!("figaro-offset-policy-v1"),
    embed!("figaro-merchant-process-v1"),
    embed!("figaro-courier-process-v1"),
    embed!("figaro-consent-v1"),
];

/// The canonical spec JSON for a schemaId hash, or `None` if the schemaId
/// is not one of the 17 runtime-attestable protocol schemas (third-party
/// schemas, `figaro-topology-v1`, etc.).
pub fn embedded_spec_json(schema_id: &B256) -> Option<&'static str> {
    EMBEDDED_SPECS
        .iter()
        .find(|e| keccak256(e.schema_key.as_bytes()) == *schema_id)
        .map(|e| e.spec_json)
}

/// The canonical spec JSON for a human-readable schemaId string. Same
/// return contract as `embedded_spec_json` but accepts the string form
/// directly — most callers have the string in hand. Pairs with
/// `crate::spec::parse_schema_spec` and `crate::encode::encode_content_from_spec`.
pub fn embedded_spec_json_by_key(schema_id: &str) -> Option<&'static str> {
    EMBEDDED_SPECS
        .iter()
        .find(|e| e.schema_key == schema_id)
        .map(|e| e.spec_json)
}

/// All embedded `(schema_key, spec_json)` pairs — for conformance tests.
pub fn all_embedded_specs() -> impl Iterator<Item = (&'static str, &'static str)> {
    EMBEDDED_SPECS.iter().map(|e| (e.schema_key, e.spec_json))
}
