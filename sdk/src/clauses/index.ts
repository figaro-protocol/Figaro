/**
 * @figaro/core/clauses — Clause-spec format + content validator
 *
 * The single source of truth for clause-content validation, shared by:
 *   - Client-side form gates (frontend / SDK)
 *   - On-chain per-clause validator contracts (future, Solidity)
 *   - SP1 prover clause enforcement (future, Rust mirror)
 *
 * All three layers parse the same spec JSON and apply the same validation
 * rules. If this format changes, every layer must be updated in lockstep.
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

export { parseClauseSpec } from "./spec.js";

export type {
    ValidationError,
    ValidationResult,
    ValidateOptions,
} from "./validate.js";

export { validateContent } from "./validate.js";

// ── Content encoding (TS ↔ ABI bridge) ──────────────────────────────────────

export type {
    GeoContent,
    ClassOfService,
    HandoffPoint,
    HandoffV1Content,
    KlerosCourt,
    ArbitrationKlerosContent,
    ApplicableLawContent,
    GHGScopeContent,
    GHGMeasurementContent,
    CommerceLineItem,
    CommerceContent,
    ProximityBand,
    ProximityPolicyContent,
    ProximityProofContent,
    OffsetProvider,
    OffsetPolicyContent,
    MerchantEvent,
    MerchantContent,
    CourierEvent,
    CourierContent,
    ConsentContent,
    ConsentDocument,
} from "./encode.js";

export {
    CONSENT_EIP712_TYPES,
    EMPTY_CONTENT,
    encodeContentFromSpec,
} from "./encode.js";

// ── Embedded protocol-clause spec catalog ───────────────────────────────────

export { embeddedSpec, allEmbeddedSpecs } from "./embedded.js";
