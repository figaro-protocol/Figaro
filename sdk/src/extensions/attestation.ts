/**
 * @figaro/core/extensions — Attestation & GHG
 *
 * Clause ID derivation, attestation event filtering, GHG disclosure
 * encoding/decoding, and process disclosure summaries.
 *
 * Folds Clause Registry helpers + GHG domain logic into a single
 * module since they're tightly coupled through clauseId.
 */

import { keccak256, stringToHex, toHex } from "viem";
import type { Hex, Address, AttestationEvent } from "../types.js";
import ghgProtocolSpec from "../clauses/examples/figaro-ghg-protocol-v1.json" with { type: "json" };
import ghgISO14064Spec from "../clauses/examples/figaro-ghg-iso-14064-v1.json" with { type: "json" };
import ghgPAS2050Spec from "../clauses/examples/figaro-ghg-pas-2050-v1.json" with { type: "json" };
import ghgEN16258Spec from "../clauses/examples/figaro-ghg-en-16258-v1.json" with { type: "json" };
import ghgCustomSpec from "../clauses/examples/figaro-ghg-custom-v1.json" with { type: "json" };

// ── Clause ID derivation ────────────────────────────────────────────────────

/**
 * Compute a clause ID from a string key.
 * This is the canonical way to derive clause IDs.
 * Matches how clauses are registered on-chain: keccak256(stringToHex(name)).
 *
 * @example
 * ```ts
 * const clauseId = computeClauseId("figaro-ghg-iso-14064-v1");
 * ```
 */
export function computeClauseId(key: string): Hex {
    return keccak256(stringToHex(key));
}

// ── Well-known clause keys ──────────────────────────────────────────────────

/**
 * GHG disclosure sister clauses — one per accounting standard. The standard
 * identity lives in the clauseId; the content shape is shared across all five.
 */
export const GHG_DISCLOSURE_CLAUSE_KEYS = [
    "figaro-ghg-protocol-v1",
    "figaro-ghg-iso-14064-v1",
    "figaro-ghg-pas-2050-v1",
    "figaro-ghg-en-16258-v1",
    "figaro-ghg-custom-v1",
] as const;

export type GHGDisclosureClauseKey = (typeof GHG_DISCLOSURE_CLAUSE_KEYS)[number];

// ── GHG disclosure kinds (stage values in AttestationCoordinator) ────────────

export enum DisclosureKind {
    /** Upfront commitment to disclose. */
    Commitment = 0,
    /** Actual emissions inventory. */
    Inventory = 1,
    /** Revised disclosure (restatement). */
    Restatement = 2,
    /** Third-party verification. */
    Verification = 3,
}

export const DISCLOSURE_KIND_LABELS: Record<DisclosureKind, string> = {
    [DisclosureKind.Commitment]: "Commitment",
    [DisclosureKind.Inventory]: "Inventory",
    [DisclosureKind.Restatement]: "Restatement",
    [DisclosureKind.Verification]: "Verification",
};

// ── GHG norm references ─────────────────────────────────────────────────────

/** Concise editorial scope tag per disclosure clause — published with the SDK
 *  so non-React consumers don't need to load the spec JSON to render chips.
 *  Not in the spec JSON itself; the spec's `description` is the full prose. */
const GHG_SCOPES: Record<GHGDisclosureClauseKey, string> = {
    "figaro-ghg-protocol-v1": "Scope 1/2/3 corporate accounting",
    "figaro-ghg-iso-14064-v1": "Quantification, reporting & verification",
    "figaro-ghg-pas-2050-v1": "Product carbon footprint",
    "figaro-ghg-en-16258-v1": "Transport energy & GHG",
    "figaro-ghg-custom-v1": "Self-declared accounting basis",
};

/** Labels derived from each spec JSON's `title` — single source of truth.
 *  Adding a sister clause means importing its spec above and adding it here;
 *  the TypeScript `Record<GHGDisclosureClauseKey, ...>` enforces completeness. */
const GHG_LABELS: Record<GHGDisclosureClauseKey, string> = {
    "figaro-ghg-protocol-v1": ghgProtocolSpec.title,
    "figaro-ghg-iso-14064-v1": ghgISO14064Spec.title,
    "figaro-ghg-pas-2050-v1": ghgPAS2050Spec.title,
    "figaro-ghg-en-16258-v1": ghgEN16258Spec.title,
    "figaro-ghg-custom-v1": ghgCustomSpec.title,
};

/** Normative-standard reference for each disclosure clause. 1:1 with
 *  `GHG_DISCLOSURE_CLAUSE_KEYS`; each `id` IS the clauseId. `label` derives
 *  from the clause's spec JSON `title`; `scope` is SDK-published editorial. */
export const GHG_NORM_REFERENCES: ReadonlyArray<{
    id: GHGDisclosureClauseKey;
    label: string;
    scope: string;
}> = GHG_DISCLOSURE_CLAUSE_KEYS.map((id) => ({
    id,
    label: GHG_LABELS[id],
    scope: GHG_SCOPES[id],
}));

// ── GHG content ref encoding/decoding ───────────────────────────────────────

/**
 * Encode a commitment disclosure contentRef.
 * Derives: keccak256(`figaro:ghg:commitment:v1:{role}:{orderHash}`)
 */
export function encodeCommitmentRef(orderHash: Hex, role: string): Hex {
    return keccak256(stringToHex(`figaro:ghg:commitment:v1:${role}:${orderHash}`));
}

/**
 * Encode actual grams CO2e as a bytes32 contentRef.
 * Simply right-pads the bigint to 32 bytes.
 */
export function encodeGramsRef(grams: bigint): Hex {
    return toHex(grams, { size: 32 });
}

/**
 * Decode a grams contentRef back to bigint.
 * Returns null if the value is zero or cannot be parsed.
 */
export function decodeGramsRef(contentRef: Hex): bigint | null {
    try {
        const val = BigInt(contentRef);
        return val > 0n ? val : null;
    } catch {
        return null;
    }
}

/**
 * Format grams CO2e for human display.
 * Automatically selects g / kg / t units.
 */
export function formatGrams(grams: bigint): string {
    if (grams < 1000n) {
        return `${grams} g CO2e`;
    }
    if (grams < 1_000_000n) {
        const kg = Number(grams) / 1000;
        return `${kg.toFixed(kg % 1 === 0 ? 0 : 2)} kg CO2e`;
    }
    const tonnes = Number(grams) / 1_000_000;
    return `${tonnes.toFixed(3)} t CO2e`;
}

// ── Attestation event filtering ─────────────────────────────────────────────

/**
 * Filter raw event logs by source contract address. Use this when processing
 * `Attestation`, `ClauseRegistered`, `MechanismClauseSet`, `SellerRegistered`,
 * or any other event re-emitted from `FigaroBatchVerifier` with the same
 * topic hash as its direct-path counterpart. Without contract-address
 * filtering, indexers conflate batch-re-emitted events with direct-path ones
 * — the topic hashes are identical by design (so a single ABI definition
 * decodes both), but the source contract carries the trust-boundary
 * distinction (direct path enforces gates inline; batch path inherits from
 * the SP1 proof).
 *
 * @param logs    Raw event logs from `publicClient.getLogs()` or similar.
 *                Each must carry an `address` field (viem's standard log shape).
 * @param sources One contract address, or an array of accepted addresses.
 * @returns Logs whose `address` matches one of the sources (case-insensitive).
 *
 * @example
 *   const all = await client.getLogs({ event: EV_ATTESTATION, fromBlock, toBlock });
 *   const direct  = filterLogsBySource(all, attestationCoordinator);
 *   const batched = filterLogsBySource(all, batchVerifier);
 *   // Or accept both for downstream tagging:
 *   const both    = filterLogsBySource(all, [attestationCoordinator, batchVerifier]);
 */
export function filterLogsBySource<T extends { address: Address }>(
    logs: readonly T[],
    sources: Address | readonly Address[],
): T[] {
    const accept = new Set<string>(
        (Array.isArray(sources) ? sources : [sources as Address]).map((s) => s.toLowerCase()),
    );
    return logs.filter((log) => accept.has(log.address.toLowerCase()));
}

/**
 * Filter attestation events by clause ID.
 */
export function filterByClause(
    events: AttestationEvent[],
    clauseId: Hex,
): AttestationEvent[] {
    return events.filter((e) => e.clauseId === clauseId);
}

/**
 * Filter attestation events by process ID.
 */
export function filterByProcess(
    events: AttestationEvent[],
    processId: Hex,
): AttestationEvent[] {
    return events.filter((e) => e.processId === processId);
}

/**
 * Filter attestation events by order hash.
 */
export function filterByOrder(
    events: AttestationEvent[],
    orderHash: Hex,
): AttestationEvent[] {
    return events.filter((e) => e.orderHash === orderHash);
}

/**
 * Filter attestation events by stage (e.g., DisclosureKind.Inventory).
 */
export function filterByStage(
    events: AttestationEvent[],
    stage: number,
): AttestationEvent[] {
    return events.filter((e) => e.stage === stage);
}

// ── Process disclosure summary ──────────────────────────────────────────────

export interface ProcessDisclosureSummary {
    processId: Hex;
    /** Total attestation events for this process under the GHG clause. */
    attestationCount: number;
    /** Number of commitment-stage attestations. */
    commitmentCount: number;
    /** Number of inventory-stage attestations. */
    inventoryCount: number;
    /** Total actual grams from inventory attestations (decoded from contentRef). */
    totalActualGrams: bigint;
    /** All attestation events for this process. */
    attestations: AttestationEvent[];
}

/**
 * Build a GHG disclosure summary for a process.
 *
 * @param allAttestations All attestation events (will be filtered internally).
 * @param processId       The process to summarize.
 * @param ghgClauseId     The GHG clause ID to filter by.
 */
export function buildProcessDisclosureSummary(
    allAttestations: AttestationEvent[],
    processId: Hex,
    ghgClauseId: Hex,
): ProcessDisclosureSummary {
    const attestations = allAttestations.filter(
        (e) => e.processId === processId && e.clauseId === ghgClauseId,
    );

    const commitments = attestations.filter((e) => e.stage === DisclosureKind.Commitment);
    const inventories = attestations.filter((e) => e.stage === DisclosureKind.Inventory);

    let totalActualGrams = 0n;
    for (const inv of inventories) {
        const grams = decodeGramsRef(inv.contentRef);
        if (grams !== null) {
            totalActualGrams += grams;
        }
    }

    return {
        processId,
        attestationCount: attestations.length,
        commitmentCount: commitments.length,
        inventoryCount: inventories.length,
        totalActualGrams,
        attestations,
    };
}
