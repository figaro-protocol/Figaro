/**
 * Fixture SpecSource for SDK tests — built from the canonical Layer-A specs
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
