/**
 * Per-order clause content — the SINGLE shape shared by the assembly template,
 * the designer, and the commit path. Keyed by clauseId; each value is that
 * clause's spec-named field values. An agreement section is a near-identity
 * projection of an entry: `{ clause: clauseId, data: values }`.
 *
 * Structurally identical to `@figaro/core`'s template `ClauseValues`, so a
 * template order's `clauses` feeds checkout with zero translation.
 */
export type ClauseFields = Record<string, Record<string, unknown>>;
