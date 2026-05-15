/**
 * @figaro/core/schemas — Schema-spec format + content validator
 *
 * The single source of truth for schema-content validation, shared by:
 *   - Client-side form gates (frontend / SDK)
 *   - On-chain per-schema validator contracts (future, Solidity)
 *   - SP1 prover schema enforcement (future, Rust mirror)
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
    SchemaSpec,
    SpecParseError,
    ParseSchemaSpecResult,
} from "./spec.js";

export { parseSchemaSpec } from "./spec.js";

export type {
    ValidationError,
    ValidationResult,
    ValidateOptions,
} from "./validate.js";

export { validateContent } from "./validate.js";

// ── Content encoders for each schema (TS ↔ ABI bridge) ──────────────────────

export type {
    GeoContent,
    ClassOfService,
    FulfilmentModality,
    FulfilmentCoordination,
    FulfilmentHandoffPoint,
    FulfilmentV2Content,
    KlerosCourt,
    JurisdictionContent,
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
    EMPTY_CONTENT,
    encodeGeoContent,
    encodeFulfilmentV2Content,
    encodeJurisdictionContent,
    encodeGHGScopeContent,
    encodeGHGMeasurementContent,
    encodeCommerceContent,
    encodeProximityPolicyContent,
    encodeProximityProofContent,
    encodeOffsetPolicyContent,
    encodeMerchantContent,
    encodeCourierContent,
    encodeConsentContent,
} from "./encode.js";
