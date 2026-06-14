//! Canonical Layer-A clause specs, compiled into the binary.
//!
//! The Layer B content gate validates against these — never against a
//! caller-supplied spec — so the constraint set every attestation is
//! checked against is covered by the program verification key. The JSON
//! is `include_str!`d straight from the Layer A source of truth
//! (`sdk/src/clauses/examples/`), so there is no second copy that
//! could drift.
//!
//! `figaro-topology` is intentionally absent: it is manifest-only,
//! never attested at runtime, and has no encoder (see `encode.rs`). The
//! set here mirrors the encoder dispatch in `encode.rs` exactly — every
//! clause with a Rust encoder has its spec embedded here, and vice versa.

use alloy_dyn_abi::DynSolValue;
use alloy_primitives::{keccak256, B256, U256};

/// One embedded protocol clause: its bare name, version, and canonical spec JSON.
struct EmbeddedSpec {
    clause_key: &'static str,
    version: u64,
    spec_json: &'static str,
}

/// Build an `EmbeddedSpec` by `include_str!`ing the Layer A spec JSON for
/// the given (bare) clause name. The path is resolved relative to this file.
macro_rules! embed {
    ($key:literal, $version:literal) => {
        EmbeddedSpec {
            clause_key: $key,
            version: $version,
            spec_json: include_str!(concat!(
                "../../../sdk/src/clauses/examples/",
                $key,
                ".json"
            )),
        }
    };
}

/// On-chain clause identity: keccak256(abi.encode(name, version)) — matches
/// ClauseRegistry, every IClauseValidator, and the SDK/frontend hashers. The
/// name carries no version suffix; the version is a distinct field.
fn clause_id_hash(name: &str, version: u64) -> B256 {
    keccak256(
        DynSolValue::Tuple(vec![
            DynSolValue::String(name.to_string()),
            DynSolValue::Uint(U256::from(version), 64),
        ])
        .abi_encode_params(),
    )
}

/// The 19 runtime-attestable protocol clauses.
const EMBEDDED_SPECS: &[EmbeddedSpec] = &[
    embed!("figaro-ghg-protocol", 1),
    embed!("figaro-ghg-iso-14064", 1),
    embed!("figaro-ghg-pas-2050", 1),
    embed!("figaro-ghg-en-16258", 1),
    embed!("figaro-ghg-custom", 1),
    embed!("figaro-ghg-measurement", 1),
    embed!("figaro-geo", 2),
    embed!("figaro-modalities", 1),
    embed!("figaro-coordination", 1),
    embed!("figaro-handoff", 1),
    embed!("figaro-arbitration-kleros", 1),
    embed!("figaro-applicable-law", 1),
    embed!("figaro-commerce", 1),
    embed!("figaro-proximity-policy", 1),
    embed!("figaro-proximity-proof", 1),
    embed!("figaro-offset-policy", 1),
    embed!("figaro-merchant-process", 1),
    embed!("figaro-courier-process", 1),
    embed!("figaro-consent", 1),
];

/// The canonical spec JSON for a clauseId hash, or `None` if the clauseId
/// is not one of the 19 runtime-attestable protocol clauses (third-party
/// clauses, `figaro-topology`, etc.).
pub fn embedded_spec_json(clause_id: &B256) -> Option<&'static str> {
    EMBEDDED_SPECS
        .iter()
        .find(|e| clause_id_hash(e.clause_key, e.version) == *clause_id)
        .map(|e| e.spec_json)
}

/// The canonical spec JSON for a human-readable clauseId string. Same
/// return contract as `embedded_spec_json` but accepts the string form
/// directly — most callers have the string in hand. Pairs with
/// `crate::spec::parse_clause_spec` and `crate::encode::encode_content_from_spec`.
pub fn embedded_spec_json_by_key(clause_id: &str) -> Option<&'static str> {
    EMBEDDED_SPECS
        .iter()
        .find(|e| e.clause_key == clause_id)
        .map(|e| e.spec_json)
}

/// All embedded `(clause_key, spec_json)` pairs — for conformance tests.
pub fn all_embedded_specs() -> impl Iterator<Item = (&'static str, u64, &'static str)> {
    EMBEDDED_SPECS.iter().map(|e| (e.clause_key, e.version, e.spec_json))
}

/// Public accessor for the on-chain clause identity of a (name, version) pair —
/// used by conformance tests to cross-check the embedded lookup.
pub fn embedded_clause_id(name: &str, version: u64) -> B256 {
    clause_id_hash(name, version)
}
