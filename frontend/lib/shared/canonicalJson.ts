/**
 * lib/shared/canonicalJson.ts — the one canonical-JSON convention.
 *
 * Both hash-anchored artifact families (clause specs on `ClauseRegistry`,
 * assembly templates on `AssemblyRegistry`) hash the SAME canonical form:
 * sorted object keys at every depth, no whitespace. One convention means a
 * reader can verify any fetched document by re-canonicalizing the parsed
 * JSON — no dependence on the pinned byte formatting or the transport.
 *
 * The convention's single home is the SDK (`@figaro/core`); this file is the
 * frontend barrel. The node-side seed scripts (`populate-clauses.mjs`,
 * `populate-test-data.mjs`) import the same SDK functions.
 */

export { canonicalize, canonicalContentHash } from "@figaro/core";
