/**
 * Clause block-binding — the `block` slice of a clause spec.
 *
 * This is pure UI / runtime-composition metadata: which drawer article a clause
 * composes into, the field a clause nests under in the drawer, and its
 * runtime-attestation companion (sisterClauseId).
 *
 * It lives in the FRONTEND, not the protocol SDK: nothing on-chain reads it, and
 * nothing in `@figaro/core` reads it either. The SDK `ClauseSpec` is content-only
 * (`fields` / `stages`); the frontend parses this `block` slice off the SAME spec
 * JSON at its spec-loading boundary (`clauseSpecSource.loadClauseSpec`) and
 * attaches it as `ClauseSpecWithBlock.block`. Keeping it here is the clause.block
 * seam: `fields` are the verified protocol; everything else in `block` is
 * replaceable presentation owned by the runtime.
 *
 * The parse mirrors the SDK's spec parser shape (it produces `SpecParseError`s on
 * the same `$.block.*` paths the SDK once used) so the frontend load path can fold
 * block errors into the same "spec failed to parse" report.
 */

import type { SpecParseError } from "@figaro/core/clauses";

/** Drawer article a clause composes into on the designer canvas. A free-form
 *  string read straight from the spec — the set of articles and their grouping
 *  are whatever the registered clauses declare, never a closed list.
 *  Module-internal: consumers read `block.article` off `ClauseBlockBinding`. */
type ClauseArticle = string;

/**
 * Block-binding metadata — how a clause composes into the UI. Each clause
 * declares its own binding here: its drawer `article` and the `nestsUnder`
 * field it nests beneath.
 *
 * Nothing on-chain reads this field — it's purely UI/composition metadata.
 */
export interface ClauseBlockBinding {
    /** Drawer article that composes this clause in the canvas designer — the
     *  clause's sole classification (post-K1-OW). REQUIRED: every clause
     *  declares exactly one article. */
    article: ClauseArticle;
    /** The FIELD name (on another, parent clause) this clause nests under in the
     *  designer drawer — a containment relationship read from the spec, never a
     *  hardcoded tree. The drawer renders this clause nested beneath the parent
     *  clause's matching field (e.g. a proximity-policy clause nests under a
     *  hand-off clause's `handoff` field). Omit for top-level clauses. */
    nestsUnder?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse and validate the `block` slice of a clause spec. Returns null (and
 * pushes `SpecParseError`s) on any malformed field, mirroring the SDK spec
 * parser's error shape so callers fold block errors into one parse report.
 */
export function parseBlockBinding(
    raw: unknown,
    path: string,
    errors: SpecParseError[],
): ClauseBlockBinding | null {
    if (!isObject(raw)) {
        errors.push({ path, message: "block binding must be an object" });
        return null;
    }
    if (typeof raw.article !== "string" || raw.article.length === 0) {
        errors.push({ path: `${path}.article`, message: "article is required and must be a non-empty string (the clause's sole classification)" });
        return null;
    }
    if (raw.nestsUnder !== undefined) {
        if (typeof raw.nestsUnder !== "string" || raw.nestsUnder.length === 0) {
            errors.push({ path: `${path}.nestsUnder`, message: "nestsUnder must be a non-empty string when present" });
            return null;
        }
    }
    return {
        article: raw.article as ClauseArticle,
        ...(raw.nestsUnder !== undefined && { nestsUnder: raw.nestsUnder as string }),
    };
}
