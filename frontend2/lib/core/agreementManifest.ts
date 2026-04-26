/**
 * lib/core/agreementManifest.ts
 *
 * Schema-composed agreement. The off-chain semantic layer whose merkle root
 * becomes the on-chain `agreementHash` in CoreV5's OrderCommitment.
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
 * - What GHG reporting standard? → `figaro-ghg-iso-14064-v1` (scope 1 emissions
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
 *     { schema: "figaro-ghg-iso-14064-v1",  data: { standard: "iso-14064-1" } },
 *     { schema: "figaro-handoff-v1",         data: { mode: "face-to-face" } },
 *   ]
 * }
 * ```
 *
 * Sections are sorted by schema key for deterministic serialization.
 * `agreementHash = merkleRoot(sectionLeaves)` where each leaf is
 * `keccak256(schemaId || sectionDataHash)` with:
 *   - `schemaId` = `keccak256(schemaKey)` (matches the on-chain bytes32 id)
 *   - `sectionDataHash` = `keccak256(canonicalJSON(section.data))`
 * The tree uses OpenZeppelin-style sorted-pair hashing so inclusion proofs
 * do not need direction bits and verify with OZ `MerkleProof.verify`.
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
export const JURISDICTION_SCHEMA_KEY = "figaro-jurisdiction-v1";
/** Default GHG disclosure schema used by single-standard manifest flows. */
export const GHG_SCHEMA_KEY = "figaro-ghg-iso-14064-v1";
/** All five GHG disclosure sister schemas (one per accounting standard). */
export const GHG_DISCLOSURE_SCHEMA_KEYS = [
    "figaro-ghg-protocol-v1",
    "figaro-ghg-iso-14064-v1",
    "figaro-ghg-pas-2050-v1",
    "figaro-ghg-en-16258-v1",
    "figaro-ghg-custom-v1",
] as const;
export const GHG_MEASUREMENT_SCHEMA_KEY = "figaro-ghg-measurement-v1";
/** Committed proximity policy (Category-2 — band declared at agreement time). */
export const PROXIMITY_POLICY_SCHEMA_KEY = "figaro-proximity-policy-v1";
/** Runtime proximity proof (Category-1 — per-handoff nonce + signed witness). */
export const PROXIMITY_PROOF_SCHEMA_KEY = "figaro-proximity-proof-v1";

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

/**
 * Declares a process as measuring in grams CO2e under
 * `figaro-ghg-measurement-v1`. Include this section in the agreement when the
 * seller plans to fire runtime grams attestations via `submitActualForOrder`.
 * Category-1: the unit-of-account lives in sectionData; actual grams values
 * travel in each attestation's `content` and are not cross-checked.
 */
export function buildMeasurementSection(): AgreementSection {
    return {
        schema: GHG_MEASUREMENT_SCHEMA_KEY,
        data: { unit: "grams-co2e" },
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

// ── Agreement hash computation (merkle root over section leaves) ────────────

const ZERO_HASH = `0x${"0".repeat(64)}` as `0x${string}`;

/**
 * Canonicalize section data (not the whole agreement) for hashing into a leaf.
 * Mirrors `canonicalizeAgreement`'s key-sort rule but applied to a single
 * section's `data` subtree.
 */
function canonicalizeSectionData(data: Record<string, unknown>): string {
    return JSON.stringify(data, sortedReplacer);
}

/**
 * Canonical bytes32 schemaId for a schema key — matches Solidity's
 * `keccak256("figaro-…-v1")` pattern used by registered validators and the
 * SchemaRegistry.
 */
function schemaIdOf(schemaKey: string): `0x${string}` {
    const { keccak256, toHex } = require("viem") as {
        keccak256: (data: `0x${string}`) => `0x${string}`;
        toHex: (value: string | Uint8Array) => `0x${string}`;
    };
    return keccak256(toHex(new TextEncoder().encode(schemaKey)));
}

/**
 * Encoders for Category-2 (declarative-clause) schemas. These produce the ABI
 * bytes that match the on-chain validator's `abi.decode` for each schema.
 * Both `sectionData` (committed at agreement time) and runtime attestation
 * `content` must open to these exact bytes — the validator enforces
 * `keccak256(content) == keccak256(sectionData)` to prevent drift.
 *
 * Category-1 schemas (delivery-lifecycle, proximity-proof, merchant-process,
 * courier-process) have no committed clause; their sectionData remains
 * canonical JSON and the validator does not cross-check. The sister schema
 * figaro-proximity-policy-v1 IS Category-2 — band committed at agreement
 * time so off-chain consumers can verify proof.band == policy.band.
 */
function getCategory2Encoder(schemaKey: string): ((data: Record<string, unknown>) => `0x${string}`) | null {
    // Encoders live in the `@figaro/core/schemas` subpath; require them
    // dynamically to keep this module loadable in test environments where
    // the SDK is resolved via link / pnpm / vitest.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schemasMod = require("@figaro/core/schemas") as typeof import("@figaro/core/schemas");
    const {
        encodeHandoffContent,
        encodeGeoContent,
        encodeFulfilmentContent,
        encodeJurisdictionContent,
        encodeGHGScopeContent,
        encodeProximityPolicyContent,
        encodeCommerceContent,
    } = schemasMod;
    // Cast `data.*` strings to the SDK encoder enum types at the call site.
    // Runtime mismatches (unknown enum values) surface as TypeError inside the
    // encoder and surface to the hook as an encoding failure — that's the
    // intended behaviour; upstream builders are expected to supply SDK-valid
    // enum strings.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asAny = <T>(v: unknown) => v as T;
    switch (schemaKey) {
        case "figaro-handoff-v1":
            return (data) => encodeHandoffContent(asAny(data.mode));
        case "figaro-geo-v1":
            return (data) => encodeGeoContent({
                originGeohash: data.originGeohash as string,
                destinationGeohash: data.destinationGeohash as string,
            });
        case "figaro-fulfilment-v1":
            return (data) => encodeFulfilmentContent({
                method: asAny(data.method),
            });
        case "figaro-jurisdiction-v1":
            return (data) => encodeJurisdictionContent({
                applicableLaw: data.applicableLaw as string,
                forum: data.forum as string | undefined,
                language: data.language as string | undefined,
            });
        case "figaro-ghg-protocol-v1":
        case "figaro-ghg-iso-14064-v1":
        case "figaro-ghg-pas-2050-v1":
        case "figaro-ghg-en-16258-v1":
        case "figaro-ghg-custom-v1":
            return (data) => encodeGHGScopeContent({
                scope: data.scope as 0 | 1 | 2 | 3 | undefined,
            });
        case "figaro-proximity-policy-v1":
            return (data) => encodeProximityPolicyContent({
                band: asAny(data.band),
            });
        case "figaro-commerce-v1":
            return (data) => encodeCommerceContent({
                currency: data.currency as `0x${string}`,
                payment: BigInt(data.payment as string | number | bigint),
                lineItems: ((data.lineItems as Array<Record<string, unknown>>) ?? []).map((li) => ({
                    itemId: li.itemId as string,
                    name: li.name as string,
                    quantity: BigInt(li.quantity as string | number | bigint),
                    unitPrice: BigInt(li.unitPrice as string | number | bigint),
                })),
            });
        default:
            return null;
    }
}

/**
 * Return the on-chain sectionData bytes for an agreement section. For
 * Category-2 schemas (declarative clauses) this is ABI-encoded in the same
 * shape the runtime validator expects as `content`, so the on-chain
 * byte-equality check `keccak256(content) == keccak256(sectionData)` can
 * succeed. For Category-1 schemas (runtime-only events — lifecycle, proximity)
 * this is canonical JSON bytes as before.
 */
export function getSectionDataBytes(section: AgreementSection): `0x${string}` {
    const encoder = getCategory2Encoder(section.schema);
    if (encoder) return encoder(section.data);
    const { toHex } = require("viem") as {
        toHex: (value: string | Uint8Array) => `0x${string}`;
    };
    return toHex(new TextEncoder().encode(canonicalizeSectionData(section.data)));
}

/**
 * Compute one merkle leaf: `keccak256(schemaId || keccak256(sectionDataBytes))`.
 * Uses `getSectionDataBytes` so leaves computed off-chain match the coordinator's
 * reconstruction during inclusion-proof verification.
 */
export function computeSectionLeaf(section: AgreementSection): `0x${string}` {
    const { keccak256, concat } = require("viem") as {
        keccak256: (data: `0x${string}`) => `0x${string}`;
        concat: (values: readonly `0x${string}`[]) => `0x${string}`;
    };
    return keccak256(concat([schemaIdOf(section.schema), keccak256(getSectionDataBytes(section))]));
}

/**
 * OZ-style commutative pair hash: `keccak256(min(a,b) || max(a,b))`.
 * Allows inclusion proofs to verify without carrying left/right direction bits.
 */
function hashPair(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
    const { keccak256, concat } = require("viem") as {
        keccak256: (data: `0x${string}`) => `0x${string}`;
        concat: (values: readonly `0x${string}`[]) => `0x${string}`;
    };
    return a.toLowerCase() < b.toLowerCase()
        ? keccak256(concat([a, b]))
        : keccak256(concat([b, a]));
}

/**
 * Build the merkle root over a pre-sorted leaf list, promoting odd leaves up.
 * Empty list returns bytes32(0); single-leaf list returns the leaf itself.
 */
function buildMerkleRoot(leaves: readonly `0x${string}`[]): `0x${string}` {
    if (leaves.length === 0) return ZERO_HASH;
    let layer: `0x${string}`[] = [...leaves];
    while (layer.length > 1) {
        const next: `0x${string}`[] = [];
        for (let i = 0; i < layer.length; i += 2) {
            if (i + 1 < layer.length) {
                next.push(hashPair(layer[i], layer[i + 1]));
            } else {
                // Odd count: last leaf promotes to the next layer without a sibling.
                next.push(layer[i]);
            }
        }
        layer = next;
    }
    return layer[0];
}

/**
 * Compute the agreementHash for an Agreement.
 * Returns a 0x-prefixed bytes32 merkle root suitable for the
 * `agreementHash` field in the signed Commitment struct.
 *
 * Both parties must independently reconstruct the same agreement, compute
 * the same merkle root, and verify it before signing the EIP-712 commitment.
 *
 * Format change: pre-2026-04 builds hashed the canonical JSON of the whole
 * agreement. V5 uses a merkle root so individual sections can produce on-chain
 * inclusion proofs at runtime-attestation time. Hashes computed under the two
 * schemes are incompatible.
 */
export function computeAgreementHash(agreement: Agreement): `0x${string}` {
    const leaves = agreement.sections.map(computeSectionLeaf);
    // Sort leaves lexicographically so the root is order-insensitive; this
    // complements the `sortSections` schema-key ordering used during manifest
    // composition and guarantees the same root regardless of insertion order.
    leaves.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return buildMerkleRoot(leaves);
}

/**
 * Build an inclusion proof for a given section's leaf against the agreement's
 * merkle root. Returns the leaf and the sibling-hash proof walking the tree
 * from the leaf up. Verifiable off-chain via `verifyInclusionProof` and
 * on-chain via OpenZeppelin's `MerkleProof.verify`.
 *
 * Throws if the section is not present in the agreement.
 */
export function buildSectionInclusionProof(
    agreement: Agreement,
    schemaKey: string,
): { leaf: `0x${string}`; proof: `0x${string}`[] } {
    const section = agreement.sections.find((s) => s.schema === schemaKey);
    if (!section) {
        throw new Error(`Section not found: ${schemaKey}`);
    }

    const targetLeaf = computeSectionLeaf(section);
    const leaves = agreement.sections.map(computeSectionLeaf);
    leaves.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    let idx = leaves.findIndex((l) => l.toLowerCase() === targetLeaf.toLowerCase());
    if (idx < 0) {
        // Unreachable: we just generated the leaf from a section that
        // appears in the agreement.
        throw new Error(`Internal error: leaf not in sorted tree`);
    }

    const proof: `0x${string}`[] = [];
    let layer: `0x${string}`[] = [...leaves];

    while (layer.length > 1) {
        const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
        if (siblingIdx < layer.length) {
            proof.push(layer[siblingIdx]);
        }
        // siblingIdx === layer.length means we're the promoted odd — no sibling at this layer.

        const next: `0x${string}`[] = [];
        for (let i = 0; i < layer.length; i += 2) {
            if (i + 1 < layer.length) {
                next.push(hashPair(layer[i], layer[i + 1]));
            } else {
                next.push(layer[i]);
            }
        }
        layer = next;
        idx = Math.floor(idx / 2);
    }

    return { leaf: targetLeaf, proof };
}

/**
 * Verify a merkle inclusion proof against a root. Mirrors the on-chain
 * OZ `MerkleProof.verify` logic so receipts produced by this module
 * validate identically off-chain and on-chain.
 */
export function verifyInclusionProof(
    root: `0x${string}`,
    leaf: `0x${string}`,
    proof: readonly `0x${string}`[],
): boolean {
    let computed = leaf;
    for (const sibling of proof) {
        computed = hashPair(computed, sibling);
    }
    return computed.toLowerCase() === root.toLowerCase();
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
 * Look up a section by its on-chain schemaId bytes32 (matches Solidity
 * `keccak256(schemaKey)`). Convenience for hook code that receives a schemaId
 * from a UI / selector rather than the human-readable schema key.
 */
export function getSectionById(
    agreement: Agreement | null | undefined,
    schemaId: `0x${string}`,
): AgreementSection | undefined {
    if (!agreement) return undefined;
    const target = schemaId.toLowerCase();
    return agreement.sections.find((s) => schemaIdOf(s.schema).toLowerCase() === target);
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
