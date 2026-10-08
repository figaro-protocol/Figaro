/**
 * Fixture SpecSource for SDK tests — built from the canonical off-chain specs
 * (`clauses/*.json`) via `parseClauseSpec` + `parseProjectionHints`, the same
 * construction any consumer performs on registry-fetched spec JSON. (The
 * frontend's cache adapter does exactly this against ClauseRegistry → IPFS.)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseClauseSpec } from "../src/clauses/index.js";
import { parseProjectionHints, type ProjectionSpecView, type SpecSource } from "../src/projection.js";

const CLAUSES_DIR = path.resolve(__dirname, "../../clauses");

export function specSourceFromFixtures(clauseIds: readonly string[]): SpecSource {
    const views: ProjectionSpecView[] = clauseIds.map((id) => {
        const raw = JSON.parse(readFileSync(path.join(CLAUSES_DIR, `${id}.json`), "utf8"));
        const parsed = parseClauseSpec(raw);
        if (!parsed.ok) throw new Error(`fixture spec ${id} failed to parse`);
        return { ...parsed.spec, hints: parseProjectionHints(raw) };
    });
    return {
        get: (clauseId, version) =>
            views.find(
                (v) => v.clauseId === clauseId && (version === undefined || v.version === version),
            ),
        list: () => views,
    };
}

/** A registry-shaped SpecSource over `base` plus further registrations: `get`
 *  with no version returns the HIGHEST loaded version, as the frontend's
 *  registry cache does — the read a version fallback must never take, since
 *  every (clauseId, version) slot is open to anyone. */
export function specSourceWithRegistrations(
    base: SpecSource,
    extra: readonly ProjectionSpecView[],
): SpecSource {
    const views = [...base.list(), ...extra];
    return {
        get: (clauseId, version) =>
            views
                .filter((v) => v.clauseId === clauseId && (version === undefined || v.version === version))
                .sort((a, b) => b.version - a.version)[0],
        list: () => views,
    };
}
