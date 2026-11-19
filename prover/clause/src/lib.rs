//! Figaro clause engine — Rust mirror of the TypeScript Layer A
//! (`@figaro-protocol/sdk/clauses`).
//!
//! The clause stack has two live surfaces that MUST agree on
//! interpretation:
//!
//!   Layer A — TypeScript, `sdk/src/clauses/{spec,validate,encode}.ts`
//!   Layer B — Rust (this crate), invoked from the SP1 zkVM prover and
//!             from the off-chain sequencer
//!
//! When the spec format is extended, both layers move in lockstep. The
//! conformance tests in `tests/conformance.rs` lock this crate's
//! parse/validate behavior against the canonical clause JSONs in
//! `clauses/` (the `ClauseRegistry` seed source every consumer loads
//! chain→IPFS at runtime); `tests/encode_conformance.rs` locks the
//! encoder byte-for-byte against Layer A vectors.
//!
//! The two engines apply the same rules: the spec format's (the
//! disposition, `formatFromField`, the private set's one blinding field of
//! one shape, the enum's 256 values) and content validation's (the geohash
//! grain cap by disposition, `grain.rs`, among them). The SDK's frozen
//! vectors (`tests/engine_vectors.rs`) and its generated stream
//! (`tests/fuzz_vectors.rs`) hold this engine to the SDK's verdict on every
//! case, so a proof of a plaintext attestation attests the private set's
//! rules and the grain as the SDK applies them. That check binds for the
//! party that submitted the plaintext form; a reader of the chain cannot
//! tell which form an attestation took (`docs/DESIGN_DECISIONS.md` § 26).
//!
//! This crate embeds NOTHING. A clause spec reaches the engine as a
//! witness input whose bytes the caller binds to the clause's on-chain
//! `contentHash` (`ClauseRegistry.registerClause` anchors
//! `keccak256(canonical spec JSON)`). A never-seen clause therefore
//! validates in-proof with zero Rust changes — open-world by
//! construction; the program verification key covers the ENGINE, not a
//! clause list.

pub mod encode;
pub mod grain;
pub mod spec;
pub mod validate;

pub use encode::{encode_content_from_spec, EncodeError, EncodeOptions};
pub use grain::{
    geohash_capture_precision, GEOHASH_FORMAT, PRIVATE_GEOHASH_MAX_PRECISION,
    PUBLIC_GEOHASH_MAX_PRECISION,
};
pub use spec::{
    parse_clause_spec, parse_field_spec, parse_stage_key, ArrayFieldSpec, BaseFieldSpec,
    BigintFieldSpec, BooleanFieldSpec, ClauseSpec, DefaultValue, Disposition, EnumFieldSpec,
    FieldSpec, IntegerFieldSpec, ObjectFieldSpec, ParseClauseSpecResult, SpecParseError,
    StringFieldSpec, StringFormat, MAX_FIELD_DEPTH,
};
pub use validate::{
    resolve_input_format, validate_content, validate_signed_content, ValidateOptions,
    ValidationError, ValidationResult,
};
