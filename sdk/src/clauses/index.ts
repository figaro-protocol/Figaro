/**
 * @figaro/core/clauses — clause-spec format + content validator + encoder.
 *
 * The single off-chain source of truth for clause-content validation and ABI
 * encoding. Fully generic: it parses the spec JSON (fetched from
 * `ClauseRegistry` → IPFS at runtime) and applies the same rules to ANY
 * clause — no clause is known to this module, nothing is bundled. The chain
 * does not validate content; well-formedness is this layer's job (honest
 * authors) plus a read-time concern (downstream forums reject garbage).
 */

export type {
    FieldType,
    StringFormat,
    BaseFieldSpec,
    StringFieldSpec,
    IntegerFieldSpec,
    BigintFieldSpec,
    BooleanFieldSpec,
    EnumFieldSpec,
    ArrayFieldSpec,
    ObjectFieldSpec,
    FieldSpec,
    ClauseSpec,
    SpecParseError,
    ParseClauseSpecResult,
} from "./spec.js";

export { parseClauseSpec, parseFieldSpec } from "./spec.js";

export type {
    ValidationError,
    ValidationResult,
    ValidateOptions,
} from "./validate.js";

export { validateContent } from "./validate.js";

// ── Content encoding (generic, spec-driven) ─────────────────────────────────
// No per-clause types are exported — the encoder is clause-agnostic and takes
// a parsed `ClauseSpec` + a plain `Record<string, unknown>`.

export {
    EMPTY_CONTENT,
    encodeContentFromSpec,
} from "./encode.js";

// Clause specs are NOT bundled — they live in ClauseRegistry (→ IPFS) and are
// fetched at runtime. There is no embedded catalogue.
