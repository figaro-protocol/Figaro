/**
 * @figaro/core/extensions — Attestation & GHG
 *
 * Schema ID derivation, attestation event filtering, GHG disclosure
 * encoding/decoding, and process disclosure summaries.
 *
 * Folds Schema Registry helpers + GHG domain logic into a single
 * module since they're tightly coupled through schemaId.
 */

import { keccak256, stringToHex, toHex } from "viem";
import type { Hex, Address, AttestationEvent } from "../types.js";

// ── Schema ID derivation ────────────────────────────────────────────────────

/**
 * Compute a schema ID from a string key.
 * This is the canonical way to derive schema IDs.
 * Matches how schemas are registered on-chain: keccak256(stringToHex(name)).
 *
 * @example
 * ```ts
 * const schemaId = computeSchemaId("figaro-ghg-disclosure-v1");
 * ```
 */
export function computeSchemaId(key: string): Hex {
    return keccak256(stringToHex(key));
}

// ── Well-known schema keys ──────────────────────────────────────────────────

export const GHG_SCHEMA_KEY = "figaro-ghg-disclosure-v1";

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

export const GHG_NORM_REFERENCES = [
    { id: "iso-14064-1", label: "ISO 14064-1:2018", scope: "Quantification & reporting" },
    { id: "iso-14064-3", label: "ISO 14064-3:2019", scope: "Verification & validation" },
    { id: "ghg-protocol-corporate", label: "GHG Protocol Corporate Standard", scope: "Scope 1/2/3 accounting" },
    { id: "ghg-protocol-scope3", label: "GHG Protocol Scope 3 Standard", scope: "Value-chain emissions" },
] as const;

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
 * Filter attestation events by schema ID.
 */
export function filterBySchema(
    events: AttestationEvent[],
    schemaId: Hex,
): AttestationEvent[] {
    return events.filter((e) => e.schemaId === schemaId);
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
    /** Total attestation events for this process under the GHG schema. */
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
 * @param ghgSchemaId     The GHG schema ID to filter by.
 */
export function buildProcessDisclosureSummary(
    allAttestations: AttestationEvent[],
    processId: Hex,
    ghgSchemaId: Hex,
): ProcessDisclosureSummary {
    const attestations = allAttestations.filter(
        (e) => e.processId === processId && e.schemaId === ghgSchemaId,
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
