/**
 * Per-order clause content — the SINGLE shape shared by the assembly template,
 * the designer, and the commit path. Keyed by clauseId; each value is that
 * clause's spec-named field values. An agreement section is a near-identity
 * projection of an entry: `{ clause: clauseId, data: values }`.
 */
export type ClauseFields = Record<string, Record<string, unknown>>;
