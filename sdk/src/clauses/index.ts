/**
 * @figaro-protocol/sdk/clauses — clause-spec format + content validator + encoder.
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
    FieldDisposition,
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

// A stage key (`stageKey`, `stageOfKey`): the one spelling of a stage in `stages`, read and written.
export {
    declaredStageFields,
    fieldCarriesPrivate,
    fieldSetRuleErrors,
    parseClauseSpec,
    parseFieldSpec,
    resolveInputFormat,
    stageKey,
    stageOfKey,
} from "./spec.js";

// The grain cap, cap(disposition, geocodeStandard), for geohash, H3, S2 and
// Open Location Code: the one home of the rule `validateContent` applies and a
// form input truncates to.
export {
    GEOHASH_FORMAT,
    H3_FORMAT,
    S2_FORMAT,
    OLC_FORMAT,
    grainCapOf,
    capOfDisposition,
    grainOf,
    PUBLIC_GEOHASH_MAX_PRECISION,
    PRIVATE_GEOHASH_MAX_PRECISION,
    geohashCapturePrecision,
    clampPublicGeohash,
    capGeohashGrain,
} from "./grain.js";

export type {
    ValidationError,
    ValidationResult,
    ValidateOptions,
} from "./validate.js";

export { validateContent, validateSignedContent } from "./validate.js";

// ReDoS-safe matching of an attacker-authored field `pattern` — the single
// source both off-chain validation and the frontend field inputs use.
export {
    safeRegexTest,
    isPotentiallyCatastrophicRegex,
    isPortablePattern,
    isPrintableAscii,
    MAX_PATTERN_TEST_INPUT,
    MAX_PATTERN_LENGTH,
    MAX_PATTERN_REPEAT,
    MAX_PATTERN_EXPANSION,
} from "./safeRegex.js";

// ── Content encoding (generic, spec-driven) ─────────────────────────────────
// No per-clause types are exported — the encoder is clause-agnostic and takes
// a parsed `ClauseSpec` + a plain `Record<string, unknown>`.

export type { EncodeOptions } from "./encode.js";

export {
    EMPTY_CONTENT,
    contentFieldsFor,
    encodeContentFromSpec,
    decodeContentFromSpec,
} from "./encode.js";

// Clause specs are NOT bundled — they live in ClauseRegistry (→ IPFS) and are
// fetched at runtime. There is no embedded catalog.
