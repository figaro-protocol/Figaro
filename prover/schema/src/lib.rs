//! Figaro schema validator — Rust mirror of the TypeScript Layer A
//! (`@figaro/core/schemas`).
//!
//! The Figaro schema stack has three layers that MUST agree on
//! interpretation:
//!
//!   Layer A — TypeScript, `sdk/src/schemas/{spec,validate}.ts`
//!   Layer B — Rust (this crate), invoked from the SP1 zkVM prover and
//!             from the off-chain sequencer
//!   Layer C — Solidity, the per-schema `ISchemaValidator` contracts in
//!             `src/schemaValidators/`
//!
//! When the spec format is extended, all three layers must be updated in
//! lockstep. The conformance tests in `tests/conformance.rs` lock Layer B's
//! parse/validate behavior against the canonical schema JSONs in
//! `frontend/lib/shared/schemas/` (the deploy-time source of truth that the
//! frontend preloads).

pub mod encode;
pub mod spec;
pub mod validate;

pub use encode::{encode_content_for_schema, EncodeError};
pub use spec::{
    parse_schema_spec, ArrayFieldSpec, BaseFieldSpec, BigintFieldSpec, BooleanFieldSpec,
    EnumFieldSpec, FieldSpec, IntegerFieldSpec, ObjectFieldSpec, ParseSchemaSpecResult,
    SchemaBlockBinding, SchemaDrawerArticle, SchemaSpec, SchemaTier, SpecParseError,
    StringFieldSpec, StringFormat,
};
pub use validate::{validate_content, ValidateOptions, ValidationError, ValidationResult};
