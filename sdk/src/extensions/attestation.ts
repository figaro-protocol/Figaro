/**
 * @figaro/sdk/extensions — Attestation filtering
 *
 * Clause-agnostic attestation-event filtering. Carries no knowledge of any
 * specific clause: the stage, contentRef shape, and meaning of an attestation
 * are clause-spec data read at the edge, never baked in here. Clause-key
 * derivation is `computeClauseKey` (root export).
 */

import type { Hex, AttestationEvent } from "../types.js";

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
