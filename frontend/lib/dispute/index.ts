/**
 * Dispute / recourse module.
 *
 * Figaro does not run arbitration — the forum a dispute-resolution clause
 * names does (Kleros ships its own UI, resolve.kleros.io, built on
 * ArbitrableProxy). This module is read/format only: it builds the evidence
 * timeline from FigaroCore events and resolves the recourse forum(s) the
 * assembly's clauses authored. The evidence already exists as side-effects of
 * token-moving operations; nothing here writes on-chain.
 */

// Evidence timeline — reads FigaroCore events, builds a chronological record.
export {
    buildProcessTimeline,
} from "./evidenceTimeline";
export type {
    TimelineEvent,
    ProcessTimeline,
} from "./evidenceTimeline";

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
