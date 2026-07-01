/**
 * Recourse module.
 *
 * Figaro does not run arbitration — the forum a dispute-resolution clause names
 * does (Kleros ships its own UI, resolve.kleros.io, built on ArbitrableProxy).
 * This module reads the dispute-resolution clause(s) the assembly authored and
 * resolves the Layer-3 recourse forum(s). The process record it points a forum
 * at is the audit timeline (`lib/audit/processTimeline`), not a separate
 * "evidence" artifact. Nothing here writes on-chain.
 */

// Process-jurisdiction recourse — reads the dispute-resolution clause(s) the
// assembly authored and resolves the Layer-3 recourse forum(s). Court display
// labels come from the arbitration clause's own `valueLabels` (the SSoT), not
// a forked local catalog.
export {
    resolveProcessRecourse,
} from "./processJurisdiction";
export type {
    JurisdictionRecourse,
} from "./processJurisdiction";
