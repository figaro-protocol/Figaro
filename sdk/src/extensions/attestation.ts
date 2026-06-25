/**
 * @figaro/core/extensions — Attestation & GHG
 *
 * Clause ID derivation, attestation event filtering, GHG disclosure
 * encoding/decoding, and process disclosure summaries.
 *
 * Folds Clause Registry helpers + GHG domain logic into a single
 * module since they're tightly coupled through clauseId.
 */

import { keccak256, stringToHex, toHex, encodeAbiParameters } from "viem";
import type { Hex, Address, AttestationEvent } from "../types.js";

// ── Clause ID derivation ────────────────────────────────────────────────────

/**
 * Compute a clause ID from a string key.
 * This is the canonical way to derive clause IDs.
 *
 * Identity is the (name, version) pair: keccak256(abi.encode(name, version)),
 * matching ClauseRegistry + every IClauseValidator on-chain. The name carries
 * no version suffix; the version is a distinct argument.
 *
 * @example
 * ```ts
 * const clauseId = computeClauseId("figaro-ghg-iso-14064", 1);
 * ```
 */
export function computeClauseId(name: string, version: number): Hex {
    return keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint64" }], [name, BigInt(version)]));
}

// ── Well-known clause keys ──────────────────────────────────────────────────

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

// The GHG accounting standard is no longer a closed taxonomy of clauses: it is
// the free-form `standard` field on the single `figaro-ghg` clause. There is no
// SDK-side per-standard label/scope table — consumers read the standard value
// (and the clause spec's `title`/`label`) directly.

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
