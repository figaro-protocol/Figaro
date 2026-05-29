/**
 * lib/core/agreement.ts
 *
 * Clause-composed agreement. The off-chain semantic layer whose merkle root
 * becomes the on-chain `agreementHash` in CoreV5's OrderCommitment.
 *
 * ## Clauses as standardized terms of sale
 *
 * Each clause is a **standardized term** in the agreement between two parties.
 * The buyer composes their order by selecting terms:
 *
 * - What goods/services? → `figaro-commerce-v1` (basket of line items)
 * - Where from / where to? → `figaro-geo-v2` (origin, destination, mass, volume, class)
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
 *     { clause: "figaro-commerce-v1",        data: { lineItems, currency, payment } },
 *     { clause: "figaro-fulfilment-v2",      data: { modality: "delivery", coordination: "dutch-auction", handoffPoint: "face-to-face" } },
 *     { clause: "figaro-geo-v2",             data: { originGeohash, destinationGeohash, massGrams, volumeMl, classOfService } },
 *     { clause: "figaro-ghg-iso-14064-v1",  data: { standard: "iso-14064-1" } },
 *   ]
 * }
 * ```
 *
 * Sections are sorted by clause key for deterministic serialization.
 * `agreementHash = merkleRoot(sectionLeaves)` where each leaf is
 * `keccak256(clauseId || sectionDataHash)` with:
 *   - `clauseId` = `keccak256(clauseKey)` (matches the on-chain bytes32 id)
 *   - `sectionDataHash` = `keccak256(canonicalJSON(section.data))`
 * The tree uses OpenZeppelin-style sorted-pair hashing so inclusion proofs
 * do not need direction bits and verify with OZ `MerkleProof.verify`.
 *
 * ## Why this works universally
 *
 * The core protocol is universal because of **mechanism design**, not because
 * of this agreement layer. Asymmetric bonding creates a Nash equilibrium where
 * cooperation dominates — regardless of who holds the wallet: human, AI agent,
 * bot, or any other entity. The mechanism doesn't care. It just works.
 *
 * This agreement layer is the **terms of sale** layer on top of that universal
 * mechanism. Clauses are infinitely extensible — new terms add new sections
 * without changing existing types. The seller declares which terms they support;
 * the buyer selects from them; both sign the composition.
 *
 * The contract treats agreementHash as opaque bytes32. The agreement itself
 * lives off-chain (IPFS, localStorage, or encrypted channel) so either party
 * can reconstruct and verify it.
 */

import { concat, keccak256, stringToHex, toHex } from "viem";
import { ZERO_BYTES32, hexEqual } from "@/lib/shared/evm";
import { classOfServiceToShortCode } from "@/lib/shared/sellerCatalogueMetadata";

// ── Core types ───────────────────────────────────────────────────────────────

/**
 * A single term in the agreement. Each section is a standardized term of sale
 * whose clause key matches a registered clause in ClauseRegistry.
 */
export interface AgreementSection {
    /** Clause key from ClauseRegistry (e.g. "figaro-commerce-v1"). */
    clause: string;
    /** Clause-specific data. Structure is defined by the clause, not by this module. */
    data: Record<string, unknown>;
}

/**
 * A redacted section in an agreement — the clause is named, the section's
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
 * clause into separate sections — a future clause-design conversation.
 */
export interface RedactedAgreementSection {
    /** Clause key from ClauseRegistry. */
    clause: string;
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
 * The agreement: a versioned, clause-composed description of what both
 * parties agree on. Both parties sign an EIP-712 struct whose
 * `agreementHash` field is `keccak256(canonicalJSON(Agreement))`.
 *
 * Sections are sorted by `clause` key for deterministic serialization.
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
    /** Clause sections, sorted by clause key. Cleartext only. */
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
 * since the commerce clause is near-universal.
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

export const COMMERCE_CLAUSE_KEY = "figaro-commerce-v1";
export const GEO_CLAUSE_KEY = "figaro-geo-v2";
export const TOPOLOGY_CLAUSE_KEY = "figaro-topology-v1";
/** Fulfilment-composition clause. Three orthogonal fields (modality,
 *  coordination, handoffPoint) in one clause. */
export const FULFILMENT_V2_CLAUSE_KEY = "figaro-fulfilment-v2";
/** Decentralized off-chain arbitration via Kleros. Sister clauses would
 *  cover other ODR providers — `figaro-arbitration-<provider>-v1`. */
export const ARBITRATION_KLEROS_CLAUSE_KEY = "figaro-arbitration-kleros-v1";
/** State / ADR / traditional-jurisdiction recourse layer. Provider-agnostic
 *  by construction (free-form string fields). */
export const APPLICABLE_LAW_CLAUSE_KEY = "figaro-applicable-law-v1";
/** Consent attestation: a wallet binds itself to an off-chain legal document
 *  by its keccak256 hash + version + title. Reusable as a designer-time clause
 *  on any assembly that needs cryptographic consent (beta participation,
 *  ToS acceptance, NDA, governance vote receipts, etc.). */
export const CONSENT_CLAUSE_KEY = "figaro-consent-v1";
/** Default GHG disclosure clause used by single-standard agreement flows. */
export const GHG_CLAUSE_KEY: GHGDisclosureClauseKey = "figaro-ghg-iso-14064-v1";
export const GHG_CLAUSE_ID = keccak256(stringToHex(GHG_CLAUSE_KEY));
/** All five GHG disclosure sister clauses (one per accounting standard). */
export const GHG_DISCLOSURE_CLAUSE_KEYS = [
    "figaro-ghg-protocol-v1",
    "figaro-ghg-iso-14064-v1",
    "figaro-ghg-pas-2050-v1",
    "figaro-ghg-en-16258-v1",
    "figaro-ghg-custom-v1",
] as const;
export type GHGDisclosureClauseKey = (typeof GHG_DISCLOSURE_CLAUSE_KEYS)[number];
/** Map a UI standard string to its corresponding GHG sister clauseId. Each
 *  accounting standard is its own clause; standard identity lives in the
 *  clauseId, not in a content field. Unknown values fall through to the
 *  default GHG_CLAUSE_KEY. Canonical source of truth — the drawer's GHG
 *  picker, orderAgreement.ts builder, and any indexer that needs to derive
 *  a clauseId from a label all read this map. */
export const GHG_STANDARD_TO_CLAUSE: Record<string, typeof GHG_DISCLOSURE_CLAUSE_KEYS[number]> = {
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
/** Reverse lookup: clauseId → human-readable standard label (for summaries
 *  and UI display). */
export const GHG_CLAUSE_TO_STANDARD: Record<typeof GHG_DISCLOSURE_CLAUSE_KEYS[number], string> = {
    "figaro-ghg-protocol-v1": "GHG-Protocol",
    "figaro-ghg-iso-14064-v1": "ISO-14064",
    "figaro-ghg-pas-2050-v1": "PAS-2050",
    "figaro-ghg-en-16258-v1": "EN-16258",
    "figaro-ghg-custom-v1": "Custom",
};
export const GHG_MEASUREMENT_CLAUSE_KEY = "figaro-ghg-measurement-v1";
export const GHG_MEASUREMENT_CLAUSE_ID = keccak256(stringToHex(GHG_MEASUREMENT_CLAUSE_KEY));
/** Committed proximity policy (Category-2 — band declared at agreement time). */
export const PROXIMITY_POLICY_CLAUSE_KEY = "figaro-proximity-policy-v1";
/** Runtime proximity proof (Category-1 — per-handoff nonce + signed witness). */
export const PROXIMITY_PROOF_CLAUSE_KEY = "figaro-proximity-proof-v1";
/** Sovereign event log for the merchant role (Category-1). */
export const MERCHANT_PROCESS_CLAUSE_KEY = "figaro-merchant-process-v1";
/** Sovereign event log for the courier role (Category-1). */
export const COURIER_PROCESS_CLAUSE_KEY = "figaro-courier-process-v1";

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
        clause: COMMERCE_CLAUSE_KEY,
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
        clause: TOPOLOGY_CLAUSE_KEY,
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
 * Canonical bytes32 clauseId for a clause key — matches Solidity's
 * `keccak256("figaro-…-v1")` pattern used by registered validators and the
 * ClauseRegistry.
 */
function clauseIdOf(clauseKey: string): `0x${string}` {
    return keccak256(toHex(new TextEncoder().encode(clauseKey)));
}

/**
 * Return the on-chain sectionData bytes for an agreement section.
 *
 * Category-2 clauses (declarative clauses) encode their data via the
 * generic canonical encoder — the same path the runtime attestation's
 * `content` takes — so the on-chain byte-equality check
 * `keccak256(content) == keccak256(sectionData)` succeeds. Category-1
 * clauses (no committed clause: lifecycle events, proximity proofs,
 * ghg-measurement) and unknown clauses fall through to canonical JSON
 * bytes.
 *
 * Post-Keystone there is no per-clause dispatch; the embedded spec
 * drives both encoding and tier classification.
 *
 * One field-level adapter: `figaro-geo-v2.classOfService` is normalised
 * to the SDK short code before encoding — a section authored with the
 * catalogue long form (`"fragile"`) would otherwise surface as a cryptic
 * encoder error. The other 16 clauses pass their data through as-is.
 */
export function getSectionDataBytes(section: AgreementSection): `0x${string}` {
    // Resolve the embedded spec via dynamic require so this module stays
    // loadable in test environments where the SDK is resolved via link /
    // pnpm / vitest.
    const { embeddedSpec, encodeContentFromSpec } =
        require("@figaro/core/clauses") as typeof import("@figaro/core/clauses");
    const spec = embeddedSpec(section.clause);
    if (spec && spec.block?.tier === "category-2") {
        const data = section.clause === "figaro-geo-v2"
            ? { ...section.data, classOfService: classOfServiceToShortCode(section.data.classOfService) }
            : section.data;
        return encodeContentFromSpec(spec, data);
    }
    return toHex(new TextEncoder().encode(canonicalizeSectionData(section.data)));
}

/**
 * Compute one merkle leaf: `keccak256(clauseId || keccak256(sectionDataBytes))`.
 * Uses `getSectionDataBytes` so leaves computed off-chain match the coordinator's
 * reconstruction during inclusion-proof verification.
 */
export function computeSectionLeaf(section: AgreementSection): `0x${string}` {
    return keccak256(concat([clauseIdOf(section.clause), keccak256(getSectionDataBytes(section))]));
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
    // complements the `sortSections` clause-key ordering used during agreement
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
 * clause key is in `clauseKeysToRedact` is replaced with a
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
 * Clause keys that don't appear in the agreement are silently ignored.
 */
export function redactSections(
    agreement: Agreement,
    clauseKeysToRedact: readonly string[],
): RedactableAgreement {
    const targets = new Set(clauseKeysToRedact);
    return {
        version: agreement.version,
        buyer: agreement.buyer,
        seller: agreement.seller,
        sections: agreement.sections.map((s): AnyAgreementSection =>
            targets.has(s.clause)
                ? { clause: s.clause, leaf: computeSectionLeaf(s), redacted: true }
                : s,
        ),
    };
}

/**
 * Verify that a revealed cleartext section's leaf matches the redacted
 * leaf carried in a `RedactableAgreement`. The verifier checks:
 *
 *   1. A redacted section under `revealed.clause` exists in the agreement.
 *   2. The leaf computed from `revealed` matches that redacted entry's
 *      stored leaf.
 *
 * If both hold, the verifier has cryptographic assurance that
 * `revealed` is the same byte-content the original parties signed under
 * that clause key — without trusting the holder's word for it.
 *
 * Returns false if the clause isn't redacted in the agreement (cleartext
 * sections don't need reveal-verification — read them directly), or if
 * the leaf doesn't match.
 */
export function verifyRevealedSection(
    agreement: RedactableAgreement,
    revealed: AgreementSection,
): boolean {
    const redacted = agreement.sections.find(
        (s) => s.clause === revealed.clause && isRedactedSection(s),
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
    clauseKey: string,
): { leaf: `0x${string}`; proof: `0x${string}`[] } {
    const section = agreement.sections.find((s) => s.clause === clauseKey);
    if (!section) {
        throw new Error(`Section not found: ${clauseKey}`);
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
 * Sort sections by clause key. This produces deterministic ordering
 * so both parties always compute the same hash.
 */
function sortSections(sections: AgreementSection[]): AgreementSection[] {
    return sections.slice().sort((a, b) => a.clause.localeCompare(b.clause));
}

/**
 * Get a section by clause key, or undefined.
 */
export function getSection(agreement: Agreement, clause: string): AgreementSection | undefined {
    return agreement.sections.find((s) => s.clause === clause);
}

/**
 * Get a section by clause key from a redactable agreement, in either form
 * (cleartext or redacted). The redactable-typed sibling of `getSection`.
 */
export function findAnySection(
    agreement: Agreement | RedactableAgreement,
    clause: string,
): AnyAgreementSection | undefined {
    return agreement.sections.find((s) => s.clause === clause);
}

/**
 * Get a section by clause key, returning only its cleartext form; a redacted
 * or absent section yields undefined.
 */
export function findCleartextSection(
    agreement: Agreement | RedactableAgreement,
    clause: string,
): AgreementSection | undefined {
    const s = findAnySection(agreement, clause);
    if (!s) return undefined;
    return isRedactedSection(s) ? undefined : s;
}

/**
 * Find the first section across an assembly assemblyDoc's inlined agreements
 * that matches `clause`. The assemblyDoc-shaped sibling of `getSection`, which
 * scopes to a single agreement: a assemblyDoc inlines one `Agreement` per
 * order, and a clause an assembly authored — jurisdiction, proximity-policy
 * — may live on any of them. Returns `undefined` when no agreement carries
 * the clause.
 */
export function readAssemblyClause(
    assemblyDoc: { agreements: Record<string, Agreement> },
    clause: string,
): AgreementSection | undefined {
    for (const agreement of Object.values(assemblyDoc.agreements)) {
        const section = getSection(agreement, clause);
        if (section) return section;
    }
    return undefined;
}

/**
 * Read the GHG disclosure standards declared by a specific order's agreement
 * in an assembly assemblyDoc. The checkout pipeline reads these and propagates
 * them into the per-order commitment via `clauseFields.ghgStandards`, so
 * the committed agreement carries the same disclosure clauses (and their
 * paired measurement clause) the assembly author declared.
 */
export function readAssemblyOrderGhgStandards(
    assemblyDoc: { agreements: Record<string, Agreement> },
    agreementHash: string | undefined,
): GHGDisclosureClauseKey[] {
    if (!agreementHash) return [];
    const agreement = assemblyDoc.agreements[agreementHash];
    if (!agreement) return [];
    const allowed = GHG_DISCLOSURE_CLAUSE_KEYS as readonly string[];
    return agreement.sections
        .map((s) => s.clause)
        .filter((s): s is GHGDisclosureClauseKey => allowed.includes(s));
}

/**
 * Look up a section by its on-chain clauseId bytes32 (matches Solidity
 * `keccak256(clauseKey)`). Convenience for hook code that receives a clauseId
 * from a UI / selector rather than the human-readable clause key.
 */
export function getSectionById(
    agreement: Agreement | null | undefined,
    clauseId: `0x${string}`,
): AgreementSection | undefined {
    if (!agreement) return undefined;
    return agreement.sections.find((s) => hexEqual(clauseIdOf(s.clause), clauseId));
}

/**
 * Check whether an agreement includes a given clause.
 */
export function hasSection(agreement: Agreement, clause: string): boolean {
    return agreement.sections.some((s) => s.clause === clause);
}

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build an Agreement from checkout state.
 *
 * Takes buyer/seller addresses and an array of clause sections.
 * Sections are sorted by clause key for deterministic hashing.
 * Duplicate clause keys are rejected.
 */
export function buildAgreement(params: {
    buyer: `0x${string}`;
    seller: `0x${string}`;
    sections: AgreementSection[];
}): Agreement {
    const sorted = sortSections(params.sections);

    // Guard: no duplicate clause keys
    const keys = sorted.map((s) => s.clause);
    const unique = new Set(keys);
    if (unique.size !== keys.length) {
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        throw new Error(`Duplicate clause keys in agreement: ${dupes.join(", ")}`);
    }

    return {
        version: "a1",
        buyer: params.buyer,
        seller: params.seller,
        sections: sorted,
    };
}

// ── V3 ClauseFields bridge ─────────────────────────────────────────────────

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
 * Convert V3-style ClauseFields into a figaro-geo-v2 section data object.
 *
 * Default values match the v2 validator's minimum-valid 5-tuple so the
 * agreement-hash mechanism is consistent at designer time even when the
 * buyer hasn't supplied real values yet:
 *
 *   - mass / volume default to 1 (the smallest value v2 accepts; 0 reverts).
 *   - classOfService defaults to "S" (Standard).
 *
 * Real buyer-supplied values overwrite these at commit time.
 */
export function clauseFieldsToGeoSection(
    fields: { origin?: string; destination?: string; mass?: string; volume?: string; class_?: string },
): AgreementSection {
    const massGrams = parseMassToGrams(fields.mass);
    const volumeMl = parseVolumeToMl(fields.volume);
    const classOfService = fields.class_?.trim() || "S";
    return {
        clause: GEO_CLAUSE_KEY,
        data: {
            originGeohash: fields.origin?.trim() ?? "",
            destinationGeohash: fields.destination?.trim() ?? "",
            massGrams: massGrams > 0 ? massGrams : 1,
            volumeMl: volumeMl > 0 ? volumeMl : 1,
            classOfService,
        },
    };
}
