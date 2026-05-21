//! Canonical Layer-A schema specs, compiled into the binary.
//!
//! The Layer B content gate validates against these — never against a
//! caller-supplied spec — so the constraint set every attestation is
//! checked against is covered by the program verification key. The JSON
//! is `include_str!`d straight from the Layer A source of truth
//! (`frontend/lib/shared/schemas/`), so there is no second copy that
//! could drift.
//!
//! Each entry also records whether the schema is a Category-2
//! cross-checking clause — needed by the kernel's agreement-inclusion
//! gate (`schema_cross_checks`); see that function's docstring.
//!
//! `figaro-topology-v1` is intentionally absent: it is manifest-only,
//! never attested at runtime, and has no encoder (see `encode.rs`). The
//! set here mirrors the encoder dispatch in `encode.rs` exactly — every
//! schema with a Rust encoder has its spec embedded here, and vice versa.

use alloy_primitives::{keccak256, B256};

/// One embedded protocol schema: its key string, canonical spec JSON, and
/// whether its agreement-manifest `sectionData` cross-checks the runtime
/// attestation content.
struct EmbeddedSpec {
    schema_key: &'static str,
    spec_json: &'static str,
    /// `true` for Category-2 declarative-clause schemas: the committed
    /// `sectionData` is the same ABI byte form the runtime attestation
    /// re-derives, so `keccak256(sectionData) == content_ref` and the
    /// agreement Merkle leaf collapses to `keccak256(schemaId ++
    /// content_ref)`. `false` for Category-1 runtime-only schemas, whose
    /// `sectionData` is canonical JSON and must be carried explicitly in
    /// the content proof.
    cross_checks: bool,
}

/// Build an `EmbeddedSpec` by `include_str!`ing the Layer A spec JSON for
/// the given schema key. The path is resolved relative to this file.
macro_rules! embed {
    ($key:literal, $cross_checks:literal) => {
        EmbeddedSpec {
            schema_key: $key,
            spec_json: include_str!(concat!(
                "../../../frontend/lib/shared/schemas/",
                $key,
                ".json"
            )),
            cross_checks: $cross_checks,
        }
    };
}

/// The 16 runtime-attestable protocol schemas. The `cross_checks` flag is
/// `true` for the 12 Category-2 declarative clauses and `false` for the 4
/// Category-1 runtime-only schemas (ghg-measurement, proximity-proof,
/// merchant-process, courier-process) — matching `getCategory2Encoder` in
/// `frontend/lib/core/agreementManifest.ts` and `CATEGORY_2_ENCODERS` in
/// `sdk/src/agreement.ts`.
const EMBEDDED_SPECS: &[EmbeddedSpec] = &[
    embed!("figaro-ghg-protocol-v1", true),
    embed!("figaro-ghg-iso-14064-v1", true),
    embed!("figaro-ghg-pas-2050-v1", true),
    embed!("figaro-ghg-en-16258-v1", true),
    embed!("figaro-ghg-custom-v1", true),
    embed!("figaro-ghg-measurement-v1", false),
    embed!("figaro-geo-v2", true),
    embed!("figaro-fulfilment-v2", true),
    embed!("figaro-jurisdiction-v1", true),
    embed!("figaro-commerce-v1", true),
    embed!("figaro-proximity-policy-v1", true),
    embed!("figaro-proximity-proof-v1", false),
    embed!("figaro-offset-policy-v1", true),
    embed!("figaro-merchant-process-v1", false),
    embed!("figaro-courier-process-v1", false),
    embed!("figaro-consent-v1", true),
];

/// The canonical spec JSON for a schemaId hash, or `None` if the schemaId
/// is not one of the 16 runtime-attestable protocol schemas (third-party
/// schemas, `figaro-topology-v1`, etc.).
pub fn embedded_spec_json(schema_id: &B256) -> Option<&'static str> {
    EMBEDDED_SPECS
        .iter()
        .find(|e| keccak256(e.schema_key.as_bytes()) == *schema_id)
        .map(|e| e.spec_json)
}

/// Whether the schema's agreement-manifest `sectionData` cross-checks the
/// runtime attestation content, or `None` if the schemaId is not one of
/// the 16 runtime-attestable protocol schemas.
///
/// `Some(true)` — Category-2: the committed `sectionData` and the attested
/// content are byte-identical, so the agreement-inclusion Merkle leaf is
/// `keccak256(schemaId ++ content_ref)`. `Some(false)` — Category-1: the
/// leaf uses the canonical-JSON `sectionData` the content proof carries
/// explicitly, since the committed bytes and the attested content differ.
pub fn schema_cross_checks(schema_id: &B256) -> Option<bool> {
    EMBEDDED_SPECS
        .iter()
        .find(|e| keccak256(e.schema_key.as_bytes()) == *schema_id)
        .map(|e| e.cross_checks)
}

/// All embedded `(schema_key, spec_json)` pairs — for conformance tests.
pub fn all_embedded_specs() -> impl Iterator<Item = (&'static str, &'static str)> {
    EMBEDDED_SPECS.iter().map(|e| (e.schema_key, e.spec_json))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cross_check_split_is_12_and_4() {
        let cross = EMBEDDED_SPECS.iter().filter(|e| e.cross_checks).count();
        let plain = EMBEDDED_SPECS.iter().filter(|e| !e.cross_checks).count();
        assert_eq!(cross, 12, "12 Category-2 cross-checking schemas");
        assert_eq!(plain, 4, "4 Category-1 runtime-only schemas");
        assert_eq!(EMBEDDED_SPECS.len(), 16);
    }

    #[test]
    fn schema_cross_checks_resolves_known_and_unknown() {
        // Category-2 declarative clause.
        assert_eq!(
            schema_cross_checks(&keccak256(b"figaro-commerce-v1")),
            Some(true),
        );
        // Category-1 runtime-only schema.
        assert_eq!(
            schema_cross_checks(&keccak256(b"figaro-courier-process-v1")),
            Some(false),
        );
        // Not a runtime-attestable protocol schema.
        assert_eq!(schema_cross_checks(&keccak256(b"figaro-bogus-v99")), None);
    }
}
