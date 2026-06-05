/**
 * Generic spec-driven content encoder — TypeScript mirror of the Rust
 * `prover/clause/src/encode.rs`. Both must stay byte-identical: the
 * SP1 prover's cross-form-binding gate derives content bytes via the
 * Rust encoder and asserts they match the on-chain `content_ref`,
 * which off-chain producers compute via the TS encoder.
 *
 * Post-Keystone there is no per-clause dispatch — one encoder drives
 * every clause. New clauses plug in by declaring their spec; no
 * encoder code is needed. See docs/v5/SCALING_STRATEGY.md "Keystone
 * Design — Canonical ABI Mapping" for the encoding rule:
 *
 *   - top-level fields encode as `encodeAbiParameters` in declaration order
 *   - `boolean` → `bool`
 *   - `integer` / `bigint` → `uint256` (width is encode-irrelevant)
 *   - `enum` → `uint8` = 0-based position in `EnumFieldSpec.values`
 *   - `string` (no format) → `string`
 *   - `string` `bytes32-hex` → `bytes32`
 *   - `string` `address-hex` → `address`
 *   - `string` `bytes-hex` → `bytes`
 *   - `array<T>` → `T[]` (element type mapped recursively)
 *   - `object` → `tuple(...)` of its fields, declaration order
 *
 * Absent optional fields encode as the ABI zero-value of their type
 * (`0`, `""`, `false`, empty array, zero-bytes). A required absent
 * field throws (caller-detectable; validation should already have
 * caught it upstream).
 *
 * Per-clause *types* (`GeoContent`, `KlerosCourt`, `ConsentDocument`,
 * …) are preserved here as a courtesy to downstream code that wants
 * domain-typed values rather than `Record<string, unknown>`. The
 * type names are not load-bearing for the encoder — they're a
 * convenience layer that runs independently.
 */

import { encodeAbiParameters, type AbiParameter, type Hex } from "viem";
import type { FieldSpec, ClauseSpec } from "./spec.js";

// ── Empty content (some clauses accept empty bytes) ─────────────────────────

export const EMPTY_CONTENT: Hex = "0x";

// ── Per-clause content types (for downstream typing convenience) ────────────
//
// These mirror the field shapes of each protocol clause. Consumers can
// supply a `Record<string, unknown>` directly to `encodeContentFromSpec`;
// these typed aliases just narrow the surface for code that wants TS-side
// help. None of the index tables that used to back the deleted per-clause
// encoders survive — the canonical 0-based-position rule is enforced by
// the spec at runtime, not by hand-maintained enum maps.

/** Class of service. S = Standard. E = Express. F = Fragile. C = Cold Chain. */
export type ClassOfService = "S" | "E" | "F" | "C";

export interface GeoContent {
    originGeohash: string;
    destinationGeohash: string;
    /** Whole grams. */
    massGrams: number;
    /** Whole millilitres. */
    volumeMl: number;
    classOfService: ClassOfService;
}

export type FulfilmentModality = "consume-onsite" | "pickup" | "delivery" | "virtual";
export type FulfilmentCoordination = "buyer-assigned" | "seller-assigned" | "dutch-auction";
export type FulfilmentHandoffPoint = "face-to-face" | "dead-drop" | "parking-area" | "locker";

export interface FulfilmentV2Content {
    modalities: readonly FulfilmentModality[];
    coordinations: readonly FulfilmentCoordination[];
    handoffPoints: readonly FulfilmentHandoffPoint[];
}

/** Kleros subcourt. `none` is a sentinel (index 0; not a valid selection). */
export type KlerosCourt =
    | "none"
    | "general"
    | "blockchain-nontechnical"
    | "blockchain-technical"
    | "english-language";

export interface ArbitrationKlerosContent {
    klerosCourt: KlerosCourt;
    klerosMinJurors?: number;
}

export interface ApplicableLawContent {
    applicableLaw: string;
    forum?: string;
    language?: string;
}

export interface GHGScopeContent {
    scope?: number;
}

export interface GHGMeasurementContent {
    grams: string;
}

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

export type ProximityBand = "zone-wifi" | "nearby-ble" | "contact-nfc";

export interface ProximityPolicyContent {
    bands: readonly ProximityBand[];
}

export interface ProximityProofContent {
    band: ProximityBand;
    nonce: Hex;
    deviceSig: Hex;
}

export type OffsetProvider = "klima" | "toucan" | "moss" | "custom";

export interface OffsetPolicyContent {
    providers: readonly OffsetProvider[];
}

export type MerchantEvent =
    | "prep-started"
    | "ready-for-pickup"
    | "handed-off"
    | "cancelled";

export interface MerchantContent {
    eventType: MerchantEvent;
    evidenceUri?: string;
}

export interface ConsentDocument {
    documentHash: Hex;
    documentVersion: string;
    documentTitle: string;
}

export interface ConsentContent {
    documents: readonly ConsentDocument[];
}

export type CourierEvent =
    | "en-route-pickup"
    | "arrived-pickup"
    | "in-transit"
    | "arrived-dropoff"
    | "completed"
    | "cancelled";

export interface CourierContent {
    eventType: CourierEvent;
    evidenceUri?: string;
}

// ── Generic spec-driven encoder ─────────────────────────────────────────────

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
 * Encode JSON content to canonical ABI bytes from the parsed `ClauseSpec`
 * alone. Byte-identical to the Rust `encode_content_from_spec`.
 */
export function encodeContentFromSpec(
    spec: ClauseSpec,
    content: Record<string, unknown>,
): Hex {
    const params = spec.fields.map(abiParamOf);
    const values = spec.fields.map((field) => abiValueOf(field, content[field.name]));
    return encodeAbiParameters(params, values as never);
}
