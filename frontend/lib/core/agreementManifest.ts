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
 * - How fulfilled, coordinated, and handed off? → `figaro-fulfilment-v2`
 *   (modality + coordination + handoff point in one clause)
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
 *     { schema: "figaro-fulfilment-v2",      data: { modality: "delivery", coordination: "dutch-auction", handoffPoint: "face-to-face" } },
 *     { schema: "figaro-geo-v1",             data: { origin, destination, mass, volume } },
 *     { schema: "figaro-ghg-iso-14064-v1",  data: { standard: "iso-14064-1" } },
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

import { ZERO_BYTES32, hexEqual } from "@/lib/shared/evm";

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
 * A redacted section in an agreement — the schema is named, the section's
 * pre-computed leaf hash is preserved, but the cleartext data is omitted.
 * The merkle root over the agreement's section leaves is unchanged whether
 * a section is in cleartext or redacted form, so verifiers can check the
 * agreementHash without seeing the redacted section's data.
 *
 * Selective reveal pattern: holder of the cleartext presents the original
 * `AgreementSection`; verifier recomputes its leaf via `computeSectionLeaf`
 * and checks it matches the `leaf` recorded here. See
 * `verifyRevealedSection`.
 *
 * Granularity note: redaction is per-section. Redacting `figaro-commerce-v1`
 * hides currency + payment + lineItems together. Finer granularity (e.g.,
 * hide lineItems but keep totals visible) would require splitting the
 * schema into separate sections — a future schema-design conversation.
 */
export interface RedactedAgreementSection {
    /** Schema key from SchemaRegistry. */
    schema: string;
    /** Pre-computed merkle leaf hash for this section, byte-equal to what
     *  `computeSectionLeaf` returns when called on the cleartext section. */
    leaf: `0x${string}`;
    /** Discriminator literal — distinguishes a redacted section from a
     *  cleartext one at the type level. */
    redacted: true;
}

/** Either a cleartext section or its redacted counterpart. */
export type AnyAgreementSection = AgreementSection | RedactedAgreementSection;

/** Type guard: true for sections whose cleartext has been redacted. */
export function isRedactedSection(s: AnyAgreementSection): s is RedactedAgreementSection {
    return (s as RedactedAgreementSection).redacted === true;
}

/**
 * The agreement: a versioned, schema-composed description of what both
 * parties agree on. Both parties sign an EIP-712 struct whose
 * `agreementHash` field is `keccak256(canonicalJSON(Agreement))`.
 *
 * Sections are sorted by `schema` key for deterministic serialization.
 *
 * `Agreement.sections` is strictly cleartext. The redacted distribution
 * form lives in `RedactableAgreement` below, which accepts either
 * cleartext sections or their redacted counterparts. The merkle root
 * computation produces the same hash for both forms, so verifiers can
 * check the agreementHash regardless of which form they hold.
 */
export interface Agreement {
    /** Format version. */
    version: "a1";
    /** Buyer address. */
    buyer: `0x${string}`;
    /** Seller address. */
    seller: `0x${string}`;
    /** Schema sections, sorted by schema key. Cleartext only. */
    sections: AgreementSection[];
}

/**
 * Distribution-form agreement: same shape as `Agreement` but the sections
 * array may contain redacted entries (cleartext omitted, leaf hash
 * preserved). Produced by `redactSections` for sharing with third parties
 * when the holder wants to commit to the agreementHash without revealing
 * specific clauses.
 *
 * Computing the agreementHash via `computeRedactableAgreementHash` returns
 * the same merkle root as the original cleartext `Agreement`, so an
 * external verifier sees the same on-chain anchor either way.
 */
export interface RedactableAgreement {
    version: "a1";
    buyer: `0x${string}`;
    seller: `0x${string}`;
    sections: AnyAgreementSection[];
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
/** Fulfilment-composition schema. Three orthogonal fields (modality,
 *  coordination, handoffPoint) in one clause. */
export const FULFILMENT_V2_SCHEMA_KEY = "figaro-fulfilment-v2";
export const JURISDICTION_SCHEMA_KEY = "figaro-jurisdiction-v1";
/** Consent attestation: a wallet binds itself to an off-chain legal document
 *  by its keccak256 hash + version + title. Reusable as a designer-time clause
 *  on any assembly that needs cryptographic consent (beta participation,
 *  ToS acceptance, NDA, governance vote receipts, etc.). */
export const CONSENT_SCHEMA_KEY = "figaro-consent-v1";
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
/** Map a UI standard string to its corresponding GHG sister schemaId. Each
 *  accounting standard is its own schema; standard identity lives in the
 *  schemaId, not in a content field. Unknown values fall through to the
 *  default GHG_SCHEMA_KEY. Canonical source of truth — the drawer's GHG
 *  picker, orderAgreement.ts builder, and any indexer that needs to derive
 *  a schemaId from a label all read this map. */
export const GHG_STANDARD_TO_SCHEMA: Record<string, typeof GHG_DISCLOSURE_SCHEMA_KEYS[number]> = {
    "iso-14064-1": "figaro-ghg-iso-14064-v1",
    "iso-14064-2": "figaro-ghg-iso-14064-v1",
    "iso-14064-3": "figaro-ghg-iso-14064-v1",
    "ISO-14064": "figaro-ghg-iso-14064-v1",
    "ghg-protocol-corporate": "figaro-ghg-protocol-v1",
    "ghg-protocol-scope3": "figaro-ghg-protocol-v1",
    "GHG-Protocol": "figaro-ghg-protocol-v1",
    "pas-2050": "figaro-ghg-pas-2050-v1",
    "PAS-2050": "figaro-ghg-pas-2050-v1",
    "en-16258": "figaro-ghg-en-16258-v1",
    "EN-16258": "figaro-ghg-en-16258-v1",
    "custom": "figaro-ghg-custom-v1",
    "Custom": "figaro-ghg-custom-v1",
};
/** Reverse lookup: schemaId → human-readable standard label (for summaries
 *  and UI display). */
export const GHG_SCHEMA_TO_STANDARD: Record<typeof GHG_DISCLOSURE_SCHEMA_KEYS[number], string> = {
    "figaro-ghg-protocol-v1": "GHG-Protocol",
    "figaro-ghg-iso-14064-v1": "ISO-14064",
    "figaro-ghg-pas-2050-v1": "PAS-2050",
    "figaro-ghg-en-16258-v1": "EN-16258",
    "figaro-ghg-custom-v1": "Custom",
};
export const GHG_MEASUREMENT_SCHEMA_KEY = "figaro-ghg-measurement-v1";
/** Committed proximity policy (Category-2 — band declared at agreement time). */
export const PROXIMITY_POLICY_SCHEMA_KEY = "figaro-proximity-policy-v1";
/** Carbon-offset providers an assembly accepts (Category-2). */
export const OFFSET_POLICY_SCHEMA_KEY = "figaro-offset-policy-v1";
/** Runtime proximity proof (Category-1 — per-handoff nonce + signed witness). */
export const PROXIMITY_PROOF_SCHEMA_KEY = "figaro-proximity-proof-v1";
/** Runtime delivery-lifecycle stage progression (Category-1). */
export const DELIVERY_LIFECYCLE_SCHEMA_KEY = "figaro-delivery-lifecycle-v1";
/** Sovereign event log for the merchant role (Category-1). */
export const MERCHANT_PROCESS_SCHEMA_KEY = "figaro-merchant-process-v1";
/** Sovereign event log for the courier role (Category-1). */
export const COURIER_PROCESS_SCHEMA_KEY = "figaro-courier-process-v1";

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

// ── Agreement hash computation (merkle root over section leaves) ────────────

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
    const schemasMod = require("@figaro/core/schemas") as typeof import("@figaro/core/schemas");
    const {
        encodeGeoContent,
        encodeFulfilmentV2Content,
        encodeJurisdictionContent,
        encodeGHGScopeContent,
        encodeProximityPolicyContent,
        encodeOffsetPolicyContent,
        encodeCommerceContent,
        encodeConsentContent,
    } = schemasMod;
    // Cast `data.*` strings to the SDK encoder enum types at the call site.
    // Runtime mismatches (unknown enum values) surface as TypeError inside the
    // encoder and surface to the hook as an encoding failure — that's the
    // intended behaviour; upstream builders are expected to supply SDK-valid
    // enum strings.
    const asAny = <T>(v: unknown) => v as T;
    switch (schemaKey) {
        case "figaro-geo-v1":
            return (data) => encodeGeoContent({
                originGeohash: data.originGeohash as string,
                destinationGeohash: data.destinationGeohash as string,
            });
        case "figaro-fulfilment-v2":
            return (data) => encodeFulfilmentV2Content({
                modalities: asAny(data.modalities ?? []),
                coordinations: asAny(data.coordinations ?? []),
                handoffPoints: asAny(data.handoffPoints ?? []),
            });
        case "figaro-jurisdiction-v1":
            return (data) => encodeJurisdictionContent({
                klerosCourt: asAny(data.klerosCourt),
                klerosMinJurors: typeof data.klerosMinJurors === "number"
                    ? data.klerosMinJurors
                    : undefined,
                applicableLaw: data.applicableLaw as string | undefined,
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
                bands: asAny(data.bands ?? []),
            });
        case "figaro-offset-policy-v1":
            return (data) => encodeOffsetPolicyContent({
                providers: asAny(data.providers ?? []),
            });
        case "figaro-consent-v1":
            return (data) => encodeConsentContent({
                documents: Array.isArray(data.documents)
                    ? (data.documents as Array<{
                        documentHash: `0x${string}`;
                        documentVersion: string;
                        documentTitle: string;
                    }>)
                    : [],
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
 * Return the merkle leaf for a section that may be cleartext or redacted.
 * Cleartext: recompute via `computeSectionLeaf`. Redacted: return the
 * stored `leaf` field. The two paths produce byte-equal hashes for any
 * given section, so the agreement merkle root is the same regardless of
 * which form a particular section is in.
 */
function leafOfAnySection(section: AnyAgreementSection): `0x${string}` {
    return isRedactedSection(section) ? section.leaf : computeSectionLeaf(section);
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
    if (leaves.length === 0) return ZERO_BYTES32;
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
 * Compute the agreementHash for a `RedactableAgreement` whose sections may
 * be a mix of cleartext and redacted forms. Returns the same merkle root
 * as `computeAgreementHash` would on the original cleartext agreement —
 * redacted sections contribute their stored leaf, cleartext sections
 * contribute a freshly computed leaf, and the two are byte-equal by
 * construction.
 */
export function computeRedactableAgreementHash(agreement: RedactableAgreement): `0x${string}` {
    const leaves = agreement.sections.map(leafOfAnySection);
    leaves.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return buildMerkleRoot(leaves);
}

/**
 * Produce a redacted distribution form of an agreement. Each section whose
 * schema key is in `schemaKeysToRedact` is replaced with a
 * `RedactedAgreementSection` carrying the section's pre-computed merkle
 * leaf. All other sections are passed through unchanged.
 *
 * The returned `RedactableAgreement` produces the same merkle root as the
 * original cleartext `Agreement` when fed to
 * `computeRedactableAgreementHash`. Holders of the cleartext can later
 * reveal individual sections via `verifyRevealedSection` — the verifier
 * recomputes the leaf from the revealed cleartext and checks it matches
 * the stored leaf in the redacted form.
 *
 * Schema keys that don't appear in the agreement are silently ignored.
 */
export function redactSections(
    agreement: Agreement,
    schemaKeysToRedact: readonly string[],
): RedactableAgreement {
    const targets = new Set(schemaKeysToRedact);
    return {
        version: agreement.version,
        buyer: agreement.buyer,
        seller: agreement.seller,
        sections: agreement.sections.map((s): AnyAgreementSection =>
            targets.has(s.schema)
                ? { schema: s.schema, leaf: computeSectionLeaf(s), redacted: true }
                : s,
        ),
    };
}

/**
 * Verify that a revealed cleartext section's leaf matches the redacted
 * leaf carried in a `RedactableAgreement`. The verifier checks:
 *
 *   1. A redacted section under `revealed.schema` exists in the agreement.
 *   2. The leaf computed from `revealed` matches that redacted entry's
 *      stored leaf.
 *
 * If both hold, the verifier has cryptographic assurance that
 * `revealed` is the same byte-content the original parties signed under
 * that schema key — without trusting the holder's word for it.
 *
 * Returns false if the schema isn't redacted in the agreement (cleartext
 * sections don't need reveal-verification — read them directly), or if
 * the leaf doesn't match.
 */
export function verifyRevealedSection(
    agreement: RedactableAgreement,
    revealed: AgreementSection,
): boolean {
    const redacted = agreement.sections.find(
        (s) => s.schema === revealed.schema && isRedactedSection(s),
    );
    if (!redacted || !isRedactedSection(redacted)) return false;
    const recomputed = computeSectionLeaf(revealed);
    return hexEqual(redacted.leaf, recomputed);
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

    let idx = leaves.findIndex((l) => hexEqual(l, targetLeaf));
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
    return hexEqual(computed, root);
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
    return agreement.sections.find((s) => hexEqual(schemaIdOf(s.schema), schemaId));
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
