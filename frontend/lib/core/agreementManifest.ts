/**
 * lib/core/agreementManifest.ts
 *
 * Schema-composed agreement. The off-chain semantic layer whose keccak256
 * hash becomes the on-chain `agreementHash` in CoreV4's OrderCommitment.
 *
 * ## Schemas as standardized terms of sale
 *
 * Each schema is a **standardized term** in the agreement between two parties.
 * The buyer composes their order by selecting terms:
 *
 * - What goods/services? → `figaro-commerce-v1` (basket of line items)
 * - Where from / where to? → `figaro-geo-v1` (origin, destination, physical params)
 * - How fulfilled? → `figaro-fulfilment-v1` (consume-onsite | pickup | deliver:seller-assigned
 *   | deliver:buyer-assigned | deliver:dutch-auction)
 * - How handed off? → `figaro-handoff-v1` (face-to-face | dead-drop | parking-area | ...)
 * - What GHG reporting standard? → `figaro-ghg-disclosure-v1` (scope 1 emissions
 *   of the seller in fulfilling this order — ISO 14064, GHG Protocol, etc.)
 * - Any item-level attestations? → `figaro-allergen-v1`, etc.
 *
 * The agreement is the **composition of these terms**. Both parties sign it.
 *
 * ```
 * Agreement {
 *   version: "a1",
 *   sections: [
 *     { schema: "figaro-commerce-v1",        data: { lineItems, currency, payment } },
 *     { schema: "figaro-fulfilment-v1",       data: { method: "deliver:dutch-auction" } },
 *     { schema: "figaro-geo-v1",             data: { origin, destination, mass, volume } },
 *     { schema: "figaro-ghg-disclosure-v1",  data: { standard: "iso-14064-1" } },
 *     { schema: "figaro-handoff-v1",         data: { mode: "face-to-face" } },
 *   ]
 * }
 * ```
 *
 * Sections are sorted by schema key for deterministic hashing.
 * `agreementHash = keccak256(canonicalJSON(Agreement))`.
 *
 * ## Why this works universally
 *
 * The core protocol is universal because of **mechanism design**, not because
 * of this manifest layer. Asymmetric bonding creates a Nash equilibrium where
 * cooperation dominates — regardless of who holds the wallet: human, AI agent,
 * bot, or any other entity. The mechanism doesn't care. It just works.
 *
 * This manifest layer is the **terms of sale** layer on top of that universal
 * mechanism. Schemas are infinitely extensible — new terms add new sections
 * without changing existing types. The seller declares which terms they support;
 * the buyer selects from them; both sign the composition.
 *
 * The contract treats agreementHash as opaque bytes32. The manifest itself
 * lives off-chain (IPFS, localStorage, or encrypted channel) so either party
 * can reconstruct and verify it.
 */

// ── Core types ───────────────────────────────────────────────────────────────

/**
 * A single term in the agreement. Each section is a standardized term of sale
 * whose schema key matches a registered schema in SchemaRegistry.
 */
export interface AgreementSection {
    /** Schema key from SchemaRegistry (e.g. "figaro-commerce-v1"). */
    schema: string;
    /** Schema-specific data. Structure is defined by the schema, not by this module. */
    data: Record<string, unknown>;
}

/**
 * The agreement: a versioned, schema-composed description of what both
 * parties agree on. Both parties sign an EIP-712 struct whose
 * `agreementHash` field is `keccak256(canonicalJSON(Agreement))`.
 *
 * Sections are sorted by `schema` key for deterministic serialization.
 */
export interface Agreement {
    /** Format version. */
    version: "a1";
    /** Buyer address. */
    buyer: `0x${string}`;
    /** Seller address. */
    seller: `0x${string}`;
    /** Schema sections, sorted by schema key. */
    sections: AgreementSection[];
}

/**
 * Line item in a commerce section. Kept as a named type for convenience
 * since the commerce schema is near-universal.
 */
export interface AgreementLineItem {
    /** Item ID from the seller's catalogue. */
    itemId: string;
    /** Display name (for human readability). */
    name: string;
    /** Quantity ordered. */
    quantity: number;
    /** Unit price at time of agreement (string to avoid float precision). */
    unitPrice: string;
}

export const COMMERCE_SCHEMA_KEY = "figaro-commerce-v1";
export const GEO_SCHEMA_KEY = "figaro-geo-v1";
export const TOPOLOGY_SCHEMA_KEY = "figaro-topology-v1";
export const FULFILMENT_SCHEMA_KEY = "figaro-fulfilment-v1";
export const HANDOFF_SCHEMA_KEY = "figaro-handoff-v1";
export const GHG_SCHEMA_KEY = "figaro-ghg-disclosure-v1";

export type TopologyMode = "root" | "explicit" | "linear-fallback";

export interface CommerceSectionData {
    currency: `0x${string}`;
    payment: string;
    lineItems: AgreementLineItem[];
}

export interface TopologySectionData {
    topologyMode: TopologyMode;
    parentOrderHashes: string[];
}

export function buildCommerceSection(params: {
    currency: `0x${string}`;
    payment: bigint | string;
    lineItems?: AgreementLineItem[];
}): AgreementSection {
    return {
        schema: COMMERCE_SCHEMA_KEY,
        data: {
            currency: params.currency,
            payment: typeof params.payment === "bigint"
                ? params.payment.toString()
                : params.payment,
            lineItems: params.lineItems ?? [],
        } satisfies CommerceSectionData,
    };
}

export function buildTopologySection(params: {
    topologyMode: TopologyMode;
    parentOrderHashes?: string[];
}): AgreementSection {
    return {
        schema: TOPOLOGY_SCHEMA_KEY,
        data: {
            topologyMode: params.topologyMode,
            parentOrderHashes: [...new Set((params.parentOrderHashes ?? []).filter(Boolean))],
        } satisfies TopologySectionData,
    };
}

// ── Canonical serialization ──────────────────────────────────────────────────

/**
 * Deterministic JSON serialization of the agreement.
 * Keys are sorted recursively so the same logical agreement always produces
 * the same byte sequence, regardless of insertion order.
 */
export function canonicalizeAgreement(agreement: Agreement): string {
    return JSON.stringify(agreement, sortedReplacer);
}

/**
 * JSON replacer that sorts object keys for deterministic output.
 * Arrays preserve order (they're positional); objects get sorted keys.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((acc, k) => {
                acc[k] = (value as Record<string, unknown>)[k];
                return acc;
            }, {});
    }
    return value;
}

// ── Agreement hash computation ───────────────────────────────────────────────

/**
 * Compute the agreementHash for an Agreement.
 * Returns a 0x-prefixed bytes32 keccak256 hash suitable for the
 * OrderCommitment.agreementHash field in CoreV4.
 *
 * `keccak256(UTF-8 bytes of canonical JSON)`
 *
 * Both parties must independently reconstruct the same agreement and verify
 * this hash before signing the EIP-712 commitment.
 */
export function computeAgreementHash(agreement: Agreement): `0x${string}` {
    const { keccak256, toHex } = require("viem") as {
        keccak256: (data: `0x${string}`) => `0x${string}`;
        toHex: (value: string | Uint8Array) => `0x${string}`;
    };
    const canonical = canonicalizeAgreement(agreement);
    const hex = toHex(new TextEncoder().encode(canonical));
    return keccak256(hex);
}

// ── Section helpers ──────────────────────────────────────────────────────────

/**
 * Sort sections by schema key. This produces deterministic ordering
 * so both parties always compute the same hash.
 */
function sortSections(sections: AgreementSection[]): AgreementSection[] {
    return sections.slice().sort((a, b) => a.schema.localeCompare(b.schema));
}

/**
 * Get a section by schema key, or undefined.
 */
export function getSection(agreement: Agreement, schema: string): AgreementSection | undefined {
    return agreement.sections.find((s) => s.schema === schema);
}

/**
 * Check whether an agreement includes a given schema.
 */
export function hasSection(agreement: Agreement, schema: string): boolean {
    return agreement.sections.some((s) => s.schema === schema);
}

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build an Agreement from checkout state.
 *
 * Takes buyer/seller addresses and an array of schema sections.
 * Sections are sorted by schema key for deterministic hashing.
 * Duplicate schema keys are rejected.
 */
export function buildAgreement(params: {
    buyer: `0x${string}`;
    seller: `0x${string}`;
    sections: AgreementSection[];
}): Agreement {
    const sorted = sortSections(params.sections);

    // Guard: no duplicate schema keys
    const keys = sorted.map((s) => s.schema);
    const unique = new Set(keys);
    if (unique.size !== keys.length) {
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        throw new Error(`Duplicate schema keys in agreement: ${dupes.join(", ")}`);
    }

    return {
        version: "a1",
        buyer: params.buyer,
        seller: params.seller,
        sections: sorted,
    };
}

// ── V3 ManifestFields bridge ─────────────────────────────────────────────────

/**
 * Parse a mass string like "5 kg", "500g", "2.5 lbs" into grams.
 * Returns 0 for unparseable or empty input.
 */
function parseMassToGrams(mass: string | undefined): number {
    if (!mass?.trim()) return 0;
    const m = mass.trim().toLowerCase();
    const num = parseFloat(m);
    if (isNaN(num)) return 0;
    if (m.includes("kg")) return Math.round(num * 1000);
    if (m.includes("lb")) return Math.round(num * 453.592);
    if (m.includes("oz")) return Math.round(num * 28.3495);
    return Math.round(num);
}

/**
 * Parse a volume string like "10 L", "500ml", "2 gal" into millilitres.
 * Returns 0 for unparseable or empty input.
 */
function parseVolumeToMl(volume: string | undefined): number {
    if (!volume?.trim()) return 0;
    const v = volume.trim().toLowerCase();
    const num = parseFloat(v);
    if (isNaN(num)) return 0;
    if (v.includes("l") && !v.includes("ml") && !v.includes("gal")) return Math.round(num * 1000);
    if (v.includes("gal")) return Math.round(num * 3785.41);
    return Math.round(num);
}

/**
 * Convert V3-style ManifestFields into a figaro-geo-v1 section data object.
 */
export function manifestFieldsToGeoSection(
    fields: { origin?: string; destination?: string; mass?: string; volume?: string; class_?: string },
): AgreementSection {
    return {
        schema: GEO_SCHEMA_KEY,
        data: {
            originGeohash: fields.origin?.trim() ?? "",
            destinationGeohash: fields.destination?.trim() ?? "",
            massGrams: parseMassToGrams(fields.mass),
            volumeMl: parseVolumeToMl(fields.volume),
            classOfService: fields.class_?.trim() || "S",
        },
    };
}
