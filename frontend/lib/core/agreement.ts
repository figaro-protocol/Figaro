/**
 * lib/core/agreement.ts
 *
 * Clause-composed agreement. The off-chain semantic layer whose merkle root
 * becomes the on-chain `agreementHash` in CoreV5's OrderCommitment.
 *
 * ## Clauses as standardized terms of sale
 *
 * Each clause is a **standardized term** in the agreement between two parties.
 * The buyer composes their order by selecting terms — what goods/services
 * (the commerce clause's basket of line items), where from / where to (the
 * geo clause), how fulfilled and handed off, what GHG reporting standard,
 * any item-level attestations. The SET of terms is OPEN: it is whatever the
 * network's ClauseRegistry defines at runtime, never a list in this module.
 *
 * The agreement is the **composition of these terms**. Both parties sign it.
 *
 * ```
 * Agreement {
 *   version: "a1",
 *   sections: [
 *     { clause: "<commerce clauseId>",   data: { lineItems, currency, payment } },
 *     { clause: "<fulfilment clauseId>", data: { modalities, delivery: { coordination } } },
 *     { clause: "<geo clauseId>",        data: { originGeohash, destinationGeohash, massGrams, volumeMl, classOfService } },
 *     { clause: "<disclosure clauseId>", data: { scope } },
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

// ── Core types ───────────────────────────────────────────────────────────────

/**
 * A single term in the agreement. Each section is a standardized term of sale
 * whose clause key matches a registered clause in ClauseRegistry.
 */
export interface AgreementSection {
    /** Clause key from ClauseRegistry (the readable registry id). */
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
 * Granularity note: redaction is per-section. Redacting the commerce section
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

export type TopologyMode = "root" | "explicit" | "linear-fallback";

// NO clause-id constants live here — or anywhere in generic code. The set of
// clauses is OPEN, defined by the network's ClauseRegistry at runtime; generic
// surfaces find sections by their spec-declared FIELDS (`sectionsByField`),
// families by spec metadata (tier / ladder / sisterClauseId / structural /
// defaultOn), and labels by spec title. Commerce + topology section data is
// assembled by composeOrderClauseFields in buildOrderAgreement (structural
// clauses fold into the clause set and project through the generic loop).
// This file is the agreement model + merkle only.

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
export function clauseIdOf(clauseKey: string): `0x${string}` {
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
 * drives both encoding and tier classification. Every section's data
 * passes through as-is — producers capture spec-typed values, so no
 * field-level adapters live here.
 */
export function getSectionDataBytes(section: AgreementSection): `0x${string}` {
    // Resolve the embedded spec via dynamic require so this module stays
    // loadable in test environments where the SDK is resolved via link /
    // pnpm / vitest.
    const { embeddedSpec, encodeContentFromSpec } =
        require("@figaro/core/clauses") as typeof import("@figaro/core/clauses");
    const spec = embeddedSpec(section.clause);
    if (spec && spec.block?.tier === "category-2") {
        return encodeContentFromSpec(spec, section.data);
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

