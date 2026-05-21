/**
 * Content encoders for the local-commerce schemas.
 *
 * Each function takes a typed payload (matching the JSON schema spec) and
 * returns the ABI-encoded bytes that the on-chain validator expects.
 *
 * The encoders are the bridge between Layer A (TS validateContent — checks
 * a JS object against the JSON spec) and Layer C (Solidity validator —
 * checks ABI-decoded fields). For every schema both layers must agree on
 * the field-to-position mapping; this file is the canonical TS-side
 * declaration of those positions.
 */

import { encodeAbiParameters, type AbiParameter, type Hex } from "viem";
import type { FieldSpec, SchemaSpec } from "./spec.js";

// ── Empty content (some schemas accept empty bytes) ─────────────────────────

export const EMPTY_CONTENT: Hex = "0x";

// ── figaro-topology-v1 ──────────────────────────────────────────────────────
// Topology is a manifest-only clause — it lives inside the signed agreement at
// commit time and is never fired as a runtime attestation. No ABI encoder is
// needed; the off-chain manifest carries `{topologyMode, parentOrderHashes}`
// as a JSON section.

// ── figaro-geo-v2 ───────────────────────────────────────────────────────────
//
// Origin / destination geohashes plus the shipment's physical envelope (mass,
// volume) and class of service. v2 promotes mass/volume/class from optional
// metadata to first-class validated fields; every field is required when this
// clause is included. Class-of-service is encoded as a uint8 index on-chain
// (S=1, E=2, F=3, C=4) to mirror figaro-fulfilment-v2's enum-as-uint8 pattern.

/** Class of service. S = Standard. E = Express. F = Fragile. C = Cold Chain. */
export type ClassOfService = "S" | "E" | "F" | "C";

const CLASS_OF_SERVICE_INDEX: Record<ClassOfService, number> = {
    "S": 1,
    "E": 2,
    "F": 3,
    "C": 4,
};

export interface GeoContent {
    originGeohash: string;
    destinationGeohash: string;
    /** Whole grams. Must be ≥ 1; capped at uint32-max. */
    massGrams: number;
    /** Whole millilitres. Must be ≥ 1; capped at uint32-max. */
    volumeMl: number;
    classOfService: ClassOfService;
}

export function encodeGeoContent(content: GeoContent): Hex {
    return encodeAbiParameters(
        [
            { type: "string" },
            { type: "string" },
            { type: "uint32" },
            { type: "uint32" },
            { type: "uint8" },
        ],
        [
            content.originGeohash,
            content.destinationGeohash,
            content.massGrams,
            content.volumeMl,
            CLASS_OF_SERVICE_INDEX[content.classOfService],
        ],
    );
}

// ── figaro-fulfilment-v2 ────────────────────────────────────────────────────
//
// Offered fulfilment options for an order. Three orthogonal multi-valued
// dimensions: modalities (one or more of consume-onsite / pickup / delivery /
// virtual), courier coordinations (meaningful only when delivery is among the
// modalities), and handoff points. Every order has a fulfilment clause —
// fully-virtual products carry modalities: ["virtual"]. Proximity verification
// of the handoff lives in figaro-proximity-policy-v1, not here.

export type FulfilmentModality = "consume-onsite" | "pickup" | "delivery" | "virtual";
export type FulfilmentCoordination = "buyer-assigned" | "seller-assigned" | "dutch-auction";
export type FulfilmentHandoffPoint = "face-to-face" | "dead-drop" | "parking-area" | "locker";

const FULFILMENT_MODALITY_INDEX: Record<FulfilmentModality, number> = {
    "consume-onsite": 1,
    "pickup": 2,
    "delivery": 3,
    "virtual": 4,
};

const FULFILMENT_COORDINATION_INDEX: Record<FulfilmentCoordination, number> = {
    "buyer-assigned": 1,
    "seller-assigned": 2,
    "dutch-auction": 3,
};

const FULFILMENT_HANDOFF_POINT_INDEX: Record<FulfilmentHandoffPoint, number> = {
    "face-to-face": 1,
    "dead-drop": 2,
    "parking-area": 3,
    "locker": 4,
};

export interface FulfilmentV2Content {
    /** Non-empty list of modalities on offer. */
    modalities: readonly FulfilmentModality[];
    /** Required non-empty when "delivery" is among `modalities`; rejected
     *  non-empty otherwise. */
    coordinations?: readonly FulfilmentCoordination[];
    /** Optional list of handoff points on offer. */
    handoffPoints?: readonly FulfilmentHandoffPoint[];
}

export function encodeFulfilmentV2Content(content: FulfilmentV2Content): Hex {
    return encodeAbiParameters(
        [{ type: "uint8[]" }, { type: "uint8[]" }, { type: "uint8[]" }],
        [
            content.modalities.map((m) => FULFILMENT_MODALITY_INDEX[m]),
            (content.coordinations ?? []).map((c) => FULFILMENT_COORDINATION_INDEX[c]),
            (content.handoffPoints ?? []).map((h) => FULFILMENT_HANDOFF_POINT_INDEX[h]),
        ],
    );
}

// ── figaro-jurisdiction-v1 ──────────────────────────────────────────────────
//
// Three-layer dispute resolution. Layer 1 (kernel mechanisms — asymmetric
// bonding + buyer dominance) is always active and not encoded here. Layer 2
// (Kleros — decentralized off-chain arbitration) sits in `klerosCourt` +
// `klerosMinJurors`. Layer 3 (state / ADR / traditional) sits in
// `applicableLaw` + `forum` + `language`. At least one of `klerosCourt` or
// `applicableLaw` must be set; otherwise the section is empty and shouldn't
// exist.

export type KlerosCourt = "general" | "blockchain-nontechnical" | "blockchain-technical" | "english-language";

const KLEROS_COURT_INDEX: Record<KlerosCourt, number> = {
    "general": 1,
    "blockchain-nontechnical": 2,
    "blockchain-technical": 3,
    "english-language": 4,
};

export interface JurisdictionContent {
    /** Layer 2 — Kleros subcourt. Omit to opt out of Kleros. */
    klerosCourt?: KlerosCourt;
    /** Layer 2 — Kleros minimum juror count. Defaults to 3 if klerosCourt
     *  is set and this is omitted. Ignored when klerosCourt is unset. */
    klerosMinJurors?: number;
    /** Layer 3 — body of law that governs the contract. ISO 3166 code
     *  (e.g., "US-CA"), "EU" / "INTL", or a free-form non-state legal-order
     *  identifier. Omit to use Kleros (layer 2) alone. */
    applicableLaw?: string;
    /** Layer 3 — named adjudication venue (optional). */
    forum?: string;
    /** Layer 3 — ISO 639 language code for adjudication (optional). */
    language?: string;
}

export function encodeJurisdictionContent(content: JurisdictionContent): Hex {
    const klerosCourtIndex = content.klerosCourt ? KLEROS_COURT_INDEX[content.klerosCourt] : 0;
    const klerosMinJurors = klerosCourtIndex === 0 ? 0 : (content.klerosMinJurors ?? 3);
    return encodeAbiParameters(
        [
            { type: "uint8" },
            { type: "uint8" },
            { type: "string" },
            { type: "string" },
            { type: "string" },
        ],
        [
            klerosCourtIndex,
            klerosMinJurors,
            content.applicableLaw ?? "",
            content.forum ?? "",
            content.language ?? "",
        ],
    );
}

// ── figaro-ghg-<standard>-v1 family (sister schemas) ────────────────────────
//
// Five sister schemas, one per accounting standard. The standard identity
// lives in the schemaId, not in a content enum. All five share the same
// `(uint8 scope)` content shape and the same encoder. Pick the schema by
// schemaId at the manifest builder; pass scope content via this encoder.
//
// Sister schemaIds:
//   - figaro-ghg-protocol-v1  (GHG Protocol Corporate Standard + WRI/WBCSD guidance)
//   - figaro-ghg-iso-14064-v1 (ISO 14064 family, parts 1/2/3)
//   - figaro-ghg-pas-2050-v1  (PAS 2050:2011)
//   - figaro-ghg-en-16258-v1  (EN 16258 transport methodology)
//   - figaro-ghg-custom-v1    (custom / non-standard methodology)

export interface GHGScopeContent {
    scope?: 0 | 1 | 2 | 3;
}

export function encodeGHGScopeContent(content: GHGScopeContent): Hex {
    return encodeAbiParameters(
        [{ type: "uint8" }],
        [content.scope ?? 0],
    );
}

// ── figaro-ghg-measurement-v1 ───────────────────────────────────────────────
//
// Runtime grams CO2e measurement. Pair with any figaro-ghg-<standard>-v1
// sister schema when the accounting standard and scope need to be committed
// at contract time; measurement is Category-1 (runtime-only), so the grams
// value is NOT cross-checked against the committed sectionData.

export interface GHGMeasurementContent {
    grams: bigint;
}

export function encodeGHGMeasurementContent(content: GHGMeasurementContent): Hex {
    return encodeAbiParameters([{ type: "uint256" }], [content.grams]);
}

// ── figaro-commerce-v1 ──────────────────────────────────────────────────────

export interface CommerceLineItem {
    itemId: string;
    name: string;
    quantity: bigint;
    unitPrice: bigint;
}

export interface CommerceContent {
    currency: Hex;
    payment: bigint;
    lineItems: readonly CommerceLineItem[];
}

export function encodeCommerceContent(content: CommerceContent): Hex {
    return encodeAbiParameters(
        [
            { type: "address" },
            { type: "uint256" },
            {
                type: "tuple[]",
                components: [
                    { type: "string", name: "itemId" },
                    { type: "string", name: "name" },
                    { type: "uint256", name: "quantity" },
                    { type: "uint256", name: "unitPrice" },
                ],
            },
        ],
        [content.currency, content.payment, content.lineItems as readonly CommerceLineItem[]],
    );
}

// ── figaro-proximity-policy-v1 + figaro-proximity-proof-v1 (sister schemas) ─
//
// Policy commits the required band at agreement signing (Category-2,
// byte-equality enforced). Proof carries the per-handoff nonce + signed
// witness payload at runtime (Category-1, content fresh per attestation).
// Off-chain consumers should verify proof.band == policy.band when needed.
// Sister-schema split mirrors GHG-disclosure (committed) +
// GHG-measurement (runtime).

/** Detection modalities. Indices match across the policy + proof schemas. */
export type ProximityBand = "zone-wifi" | "nearby-ble" | "contact-nfc";

const PROXIMITY_BAND_INDEX: Record<ProximityBand, number> = {
    "zone-wifi": 1, "nearby-ble": 2, "contact-nfc": 3,
};

export interface ProximityPolicyContent {
    /** Non-empty list of bands the merchant offers (or the buyer commits to)
     *  for this order. Empty would mean "no proximity required" — express that
     *  by omitting the policy clause entirely. */
    bands: readonly ProximityBand[];
}

export function encodeProximityPolicyContent(content: ProximityPolicyContent): Hex {
    return encodeAbiParameters(
        [{ type: "uint8[]" }],
        [content.bands.map((b) => PROXIMITY_BAND_INDEX[b])],
    );
}

export interface ProximityProofContent {
    band: ProximityBand;
    nonce: Hex;       // bytes32
    deviceSig: Hex;   // bytes
}

export function encodeProximityProofContent(content: ProximityProofContent): Hex {
    return encodeAbiParameters(
        [{ type: "uint8" }, { type: "bytes32" }, { type: "bytes" }],
        [PROXIMITY_BAND_INDEX[content.band], content.nonce, content.deviceSig],
    );
}

// ── figaro-offset-policy-v1 ──────────────────────────────────────────────────
//
// Carbon-offset providers an assembly accepts for emissions compensation.
// Multi-valued — same shape pattern as proximity-policy-v1. The actual offset
// purchase is modeled as a sub-order against the chosen provider; this clause
// anchors the policy declaration, not the purchase.

export type OffsetProvider = "klima" | "toucan" | "moss" | "custom";

const OFFSET_PROVIDER_INDEX: Record<OffsetProvider, number> = {
    "klima": 1,
    "toucan": 2,
    "moss": 3,
    "custom": 4,
};

export interface OffsetPolicyContent {
    /** Non-empty list of offset providers the merchant offers (or the buyer
     *  commits to) for this order. Empty would mean no offset path — express
     *  that by omitting the policy clause entirely. */
    providers: readonly OffsetProvider[];
}

export function encodeOffsetPolicyContent(content: OffsetPolicyContent): Hex {
    return encodeAbiParameters(
        [{ type: "uint8[]" }],
        [content.providers.map((p) => OFFSET_PROVIDER_INDEX[p])],
    );
}

// ── figaro-merchant-process-v1 ──────────────────────────────────────────────
//
// Sovereignty primitive: merchant attests their own internal events under this
// schema as the SSoT for "what the merchant has done." Generic across local-
// commerce verticals (restaurants, retail, service merchants).

export type MerchantEvent =
    | "order-received" | "accepted" | "prep-started"
    | "ready-for-pickup" | "handed-off" | "cancelled";

const MERCHANT_EVENT_INDEX: Record<MerchantEvent, number> = {
    "order-received": 0, "accepted": 1, "prep-started": 2,
    "ready-for-pickup": 3, "handed-off": 4, "cancelled": 5,
};

export interface MerchantContent {
    eventType: MerchantEvent;
    evidenceUri?: string;
}

export function encodeMerchantContent(content: MerchantContent): Hex {
    return encodeAbiParameters(
        [{ type: "uint8" }, { type: "string" }],
        [MERCHANT_EVENT_INDEX[content.eventType], content.evidenceUri ?? ""],
    );
}

// ── figaro-consent-v1 ───────────────────────────────────────────────────────
//
// Cryptographic consent attestation. Anchors the binding between a wallet
// (recovered from the EIP-712 signature on the AttestationCoordinator call,
// visible in the `attester` field of the Attestation event) and an off-chain
// legal document identified by its keccak256 content hash. Pattern: off-chain
// document semantics, on-chain anchor for shared reference integrity.
//
// Append-only: revocation is a separate off-chain process and does NOT mutate
// the on-chain attestation. A new document version requires figaro-consent-v2.
//
// Bounded inputs (length limits enforced both Layer A and Layer C) prevent
// griefing via unbounded calldata.

export interface ConsentDocument {
    /** keccak256 of the canonical document text. 32-byte hex (0x...). */
    documentHash: Hex;
    /** Semver-style version identifier; bounded to 32 chars. */
    documentVersion: string;
    /** Human-readable document name; bounded to 200 chars. */
    documentTitle: string;
}

export interface ConsentContent {
    /** Non-empty list of referenced documents. */
    documents: readonly ConsentDocument[];
}

export function encodeConsentContent(content: ConsentContent): Hex {
    const hashes = content.documents.map((d) => d.documentHash);
    const versions = content.documents.map((d) => d.documentVersion);
    const titles = content.documents.map((d) => d.documentTitle);
    return encodeAbiParameters(
        [{ type: "bytes32[]" }, { type: "string[]" }, { type: "string[]" }],
        [hashes, versions, titles],
    );
}

// ── figaro-courier-process-v1 ───────────────────────────────────────────────
//
// Sovereignty primitive: courier attests their own internal events under this
// schema as the SSoT for "what the courier has done." Generic across transport
// modes (driver, cyclist, walker, drone, autonomous vehicle).

export type CourierEvent =
    | "available" | "accepted" | "en-route-pickup" | "arrived-pickup"
    | "in-transit" | "arrived-dropoff" | "completed" | "cancelled";

const COURIER_EVENT_INDEX: Record<CourierEvent, number> = {
    "available": 0, "accepted": 1, "en-route-pickup": 2, "arrived-pickup": 3,
    "in-transit": 4, "arrived-dropoff": 5, "completed": 6, "cancelled": 7,
};

export interface CourierContent {
    eventType: CourierEvent;
    evidenceUri?: string;
}

export function encodeCourierContent(content: CourierContent): Hex {
    return encodeAbiParameters(
        [{ type: "uint8" }, { type: "string" }],
        [COURIER_EVENT_INDEX[content.eventType], content.evidenceUri ?? ""],
    );
}

// ── Generic spec-driven encoder ─────────────────────────────────────────────
//
// `encodeContentFromSpec` derives the ABI encoding from the parsed SchemaSpec
// alone — no per-schema code. It mirrors the Rust `encode_content_from_spec`
// (prover/schema/src/encode.rs); the two MUST stay byte-identical. Additive:
// the per-schema encoders above remain the wired-in path until the keystone
// cutover. See docs/v5/SCALING_STRATEGY.md "Keystone Design — Canonical ABI
// Mapping".
//
// Canonical rule: top-level fields encode in declaration order; an enum
// encodes as the 0-based position of its value in `values`; an absent
// optional field encodes as the ABI zero-value of its type; an object-array
// encodes as `tuple[]`; integer and bigint alike encode as `uint256`.

/** The viem ABI-parameter descriptor for a spec field. */
function abiParamOf(field: FieldSpec): AbiParameter {
    switch (field.type) {
        case "boolean":
            return { type: "bool" };
        case "integer":
        case "bigint":
            return { type: "uint256" };
        case "enum":
            return { type: "uint8" };
        case "string":
            switch (field.format) {
                case "bytes32-hex": return { type: "bytes32" };
                case "address-hex": return { type: "address" };
                case "bytes-hex": return { type: "bytes" };
                default: return { type: "string" };
            }
        case "array": {
            const inner = abiParamOf(field.items);
            return { ...inner, type: `${inner.type}[]` };
        }
        case "object":
            return { type: "tuple", components: field.fields.map(abiParamOf) };
    }
}

/** The ABI zero-value for an absent optional field, by type. */
function zeroValueOf(field: FieldSpec): unknown {
    switch (field.type) {
        case "boolean":
            return false;
        case "integer":
        case "bigint":
        case "enum":
            return 0n;
        case "string":
            switch (field.format) {
                case "bytes32-hex": return `0x${"0".repeat(64)}`;
                case "address-hex": return `0x${"0".repeat(40)}`;
                case "bytes-hex": return "0x";
                default: return "";
            }
        case "array":
            return [];
        case "object":
            return field.fields.map(zeroValueOf);
    }
}

/** The viem value for a spec field given its raw JSON value (or absence). */
function abiValueOf(field: FieldSpec, raw: unknown): unknown {
    if (raw === undefined || raw === null) {
        if (field.required) {
            throw new Error(`field ${field.name}: required field is absent`);
        }
        return zeroValueOf(field);
    }
    switch (field.type) {
        case "boolean":
            return Boolean(raw);
        // Encoding does not distinguish `integer` from `bigint` — both are a
        // 32-byte word. Content may arrive as a JSON number or, for values
        // outside JSON's safe integer range, a decimal string.
        case "integer":
        case "bigint":
            return BigInt(raw as string | number | bigint);
        case "enum": {
            const idx = field.values.indexOf(raw as string);
            if (idx < 0) {
                throw new Error(
                    `field ${field.name}: "${String(raw)}" is not a declared enum value`,
                );
            }
            return BigInt(idx);
        }
        case "string":
            return raw;
        case "array":
            return (raw as unknown[]).map((item) => abiValueOf(field.items, item));
        case "object": {
            const obj = raw as Record<string, unknown>;
            return field.fields.map((sub) => abiValueOf(sub, obj[sub.name]));
        }
    }
}

/**
 * Encode JSON content to canonical ABI bytes from the parsed `SchemaSpec`
 * alone. Byte-identical to the Rust `encode_content_from_spec`.
 */
export function encodeContentFromSpec(
    spec: SchemaSpec,
    content: Record<string, unknown>,
): Hex {
    const params = spec.fields.map(abiParamOf);
    const values = spec.fields.map((field) => abiValueOf(field, content[field.name]));
    return encodeAbiParameters(params, values as never);
}
