/**
 * @figaro/core/extensions — Clause ID & Attestation filtering
 *
 * Clause-ID derivation (matching `ClauseRegistry`) and clause-agnostic
 * attestation-event filtering. Carries no knowledge of any specific clause:
 * the stage, contentRef shape, and meaning of an attestation are clause-spec
 * data read at the edge, never baked in here.
 */

import { keccak256, encodeAbiParameters } from "viem";
import type { Hex, AttestationEvent } from "../types.js";

// ── Clause ID derivation ────────────────────────────────────────────────────

/**
 * Compute a clause ID from a string key.
 * This is the canonical way to derive clause IDs.
 *
 * Identity is the (name, version) pair: keccak256(abi.encode(name, version)),
 * matching `ClauseRegistry`. The name carries no version suffix; the version
 * is a distinct argument.
 *
 * @example
 * ```ts
 * const clauseId = computeClauseId("figaro-emissions", 1);
 * ```
 */
export function computeClauseId(name: string, version: number): Hex {
    return keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint64" }], [name, BigInt(version)]));
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
 * Filter attestation events by stage.
 *
 * Stage is an opaque per-clause index; its meaning lives in the clause spec,
 * not here.
 */
export function filterByStage(
    events: AttestationEvent[],
    stage: number,
): AttestationEvent[] {
    return events.filter((e) => e.stage === stage);
}
