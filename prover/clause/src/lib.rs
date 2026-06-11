//! Figaro clause validator — Rust mirror of the TypeScript Layer A
//! (`@figaro/core/clauses`).
//!
//! The Figaro clause stack has three layers that MUST agree on
//! interpretation:
//!
//!   Layer A — TypeScript, `sdk/src/clauses/{spec,validate}.ts`
//!   Layer B — Rust (this crate), invoked from the SP1 zkVM prover and
//!             from the off-chain sequencer
//!   Layer C — Solidity, the per-clause `IClauseValidator` contracts in
//!             `src/clauseValidators/`
//!
//! When the spec format is extended, all three layers must be updated in
//! lockstep. The conformance tests in `tests/conformance.rs` lock Layer B's
//! parse/validate behavior against the canonical clause JSONs in
//! `sdk/src/clauses/examples/` (the deploy-time source of truth that
//! `populate-clauses.mjs` pins to IPFS and the frontend loads chain→IPFS).

pub mod embedded;
pub mod encode;
pub mod spec;
pub mod validate;

pub use embedded::{all_embedded_specs, embedded_spec_json, embedded_spec_json_by_key};
pub use encode::{encode_content_from_spec, EncodeError};
pub use spec::{
    parse_clause_spec, ArrayFieldSpec, BaseFieldSpec, BigintFieldSpec, BooleanFieldSpec,
    EnumFieldSpec, FieldSpec, IntegerFieldSpec, ObjectFieldSpec, ParseClauseSpecResult,
    ClauseBlockBinding, ClauseSpec, ClauseTier, SpecParseError,
    StringFieldSpec, StringFormat,
};
pub use validate::{validate_content, ValidateOptions, ValidationError, ValidationResult};
