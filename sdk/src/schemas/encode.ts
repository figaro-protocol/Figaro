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

import { encodeAbiParameters, type Hex } from "viem";

// ── Empty content (some schemas accept empty bytes) ─────────────────────────

export const EMPTY_CONTENT: Hex = "0x";

// ── figaro-topology-v1 ──────────────────────────────────────────────────────
// Topology is a manifest-only clause — it lives inside the signed agreement at
// commit time and is never fired as a runtime attestation. No ABI encoder is
// needed; the off-chain manifest carries `{topologyMode, parentOrderHashes}`
// as a JSON section.

// ── figaro-geo-v1 ───────────────────────────────────────────────────────────

export interface GeoContent {
    originGeohash: string;
    destinationGeohash: string;
}

export function encodeGeoContent(content: GeoContent): Hex {
    return encodeAbiParameters(
        [{ type: "string" }, { type: "string" }],
        [content.originGeohash, content.destinationGeohash],
    );
}

// ── figaro-fulfilment-v2 ────────────────────────────────────────────────────
//
// Three orthogonal fields replacing fulfilment-v1's single conflated enum AND
// handoff-v1's separate physical-mode enum. modality is required; coordination
// is meaningful only when modality = delivery; handoffPoint records where the
// physical exchange occurs. Proximity verification of the handoff lives in
// figaro-proximity-policy-v1, not here.

export type FulfilmentModality = "consume-onsite" | "pickup" | "delivery";
export type FulfilmentCoordination = "buyer-assigned" | "seller-assigned" | "dutch-auction";
export type FulfilmentHandoffPoint = "face-to-face" | "dead-drop" | "parking-area" | "locker";

const FULFILMENT_MODALITY_INDEX: Record<FulfilmentModality, number> = {
    "consume-onsite": 1,
    "pickup": 2,
    "delivery": 3,
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
    modality: FulfilmentModality;
    coordination?: FulfilmentCoordination;
    handoffPoint?: FulfilmentHandoffPoint;
}

export function encodeFulfilmentV2Content(content: FulfilmentV2Content): Hex {
    return encodeAbiParameters(
        [{ type: "uint8" }, { type: "uint8" }, { type: "uint8" }],
        [
            FULFILMENT_MODALITY_INDEX[content.modality],
            content.coordination ? FULFILMENT_COORDINATION_INDEX[content.coordination] : 0,
            content.handoffPoint ? FULFILMENT_HANDOFF_POINT_INDEX[content.handoffPoint] : 0,
        ],
    );
}

// ── figaro-jurisdiction-v1 ──────────────────────────────────────────────────
//
// Off-chain dispute-resolution jurisdiction. Captures the legal/forum scope
// under which the contract is adjudicated. Per Paper E: settlement on-chain by
// nature, adjudication off-chain by nature — every signed contract sits inside
// some jurisdiction even if FigaroCore never reads it. Baseline graph
// alongside capital flow, geo, GHG, topology, handoff, proximity.
//
// applicableLaw is required (2-16 chars). Forum and language are optional.
// Generic across legal traditions: state law (ISO 3166), religious law,
// customary law, ODR (Kleros, ICANN-UDRP).

export interface JurisdictionContent {
    /** Body of law that governs the contract. ISO 3166 code (e.g., "US-CA"),
     *  "EU"/"INTL", or a free-form non-state legal-order identifier. */
    applicableLaw: string;
    /** Named adjudication venue (optional). Empty = courts of competent
     *  jurisdiction within applicableLaw. */
    forum?: string;
    /** ISO 639 language code for adjudication (optional). Empty = official
     *  language of the forum. */
    language?: string;
}

export function encodeJurisdictionContent(content: JurisdictionContent): Hex {
    return encodeAbiParameters(
        [{ type: "string" }, { type: "string" }, { type: "string" }],
        [content.applicableLaw, content.forum ?? "", content.language ?? ""],
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

// ── figaro-delivery-lifecycle-v1 ────────────────────────────────────────────

export function encodeLifecycleContent(evidenceUri: string = ""): Hex {
    return encodeAbiParameters([{ type: "string" }], [evidenceUri]);
}

// ── figaro-proximity-policy-v1 + figaro-proximity-proof-v1 (sister schemas) ─
//
// Policy commits the required band at agreement signing (Category-2,
// byte-equality enforced). Proof carries the per-handoff nonce + signed
// witness payload at runtime (Category-1, content fresh per attestation).
// Off-chain consumers should verify proof.band == policy.band when needed.
// Sister-schema split mirrors GHG-disclosure (committed) +
// GHG-measurement (runtime).

export type ProximityBand = "none" | "zone-wifi" | "nearby-ble" | "contact-nfc";

const PROXIMITY_BAND_INDEX: Record<ProximityBand, number> = {
    "none": 0, "zone-wifi": 1, "nearby-ble": 2, "contact-nfc": 3,
};

export interface ProximityPolicyContent {
    band: ProximityBand;
}

export function encodeProximityPolicyContent(content: ProximityPolicyContent): Hex {
    return encodeAbiParameters(
        [{ type: "uint8" }],
        [PROXIMITY_BAND_INDEX[content.band]],
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

export interface ConsentContent {
    /** keccak256 of the canonical legal document text. 32-byte hex (0x...). */
    documentHash: Hex;
    /** Semver-style version identifier; bounded to 32 chars. */
    documentVersion: string;
    /** Human-readable document name; bounded to 200 chars. */
    documentTitle: string;
}

export function encodeConsentContent(content: ConsentContent): Hex {
    return encodeAbiParameters(
        [{ type: "bytes32" }, { type: "string" }, { type: "string" }],
        [content.documentHash, content.documentVersion, content.documentTitle],
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
