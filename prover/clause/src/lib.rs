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
//! This crate embeds NOTHING. A clause spec reaches the engine as a
//! witness input whose bytes the caller binds to the clause's on-chain
//! `contentHash` (`ClauseRegistry.registerClause` anchors
//! `keccak256(canonical spec JSON)`). A never-seen clause therefore
//! validates in-proof with zero Rust changes — open-world by
//! construction; the program verification key covers the ENGINE, not a
//! clause list.

pub mod encode;
pub mod spec;
pub mod validate;

pub use encode::{encode_content_from_spec, EncodeError, EncodeOptions};
pub use spec::{
    parse_clause_spec, parse_field_spec, ArrayFieldSpec, BaseFieldSpec, BigintFieldSpec,
    BooleanFieldSpec, DefaultValue, EnumFieldSpec, FieldSpec, IntegerFieldSpec, ObjectFieldSpec,
    ParseClauseSpecResult, ClauseSpec, SpecParseError, StringFieldSpec, StringFormat,
    MAX_FIELD_DEPTH,
};
pub use validate::{validate_content, ValidateOptions, ValidationError, ValidationResult};
