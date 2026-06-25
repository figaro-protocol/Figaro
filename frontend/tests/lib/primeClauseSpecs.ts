/**
 * Prime the clauseSpecSource cache from the canonical Layer-A specs
 * (`clauses/*.json`) — the same JSON the on-chain `metadataURI` points at.
 * Vitest has no chain, so the fetcher stub reads the file the URI names;
 * everything downstream of the cache behaves exactly as it does after
 * `useClauseSpecs` warms it from the registry.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";

// Vitest runs with cwd = frontend/ (the vitest config root).
const EXAMPLES_DIR = path.resolve(process.cwd(), "../clauses");

/** Load the named Layer-A specs into the cache — or every example spec when
 *  called with no argument. Idempotent (loadClauseSpec caches). */
export async function primeClauseSpecs(clauseIds?: readonly string[]): Promise<void> {
    const ids = clauseIds
        ?? readdirSync(EXAMPLES_DIR)
            .filter((f) => f.endsWith(".json"))
            .map((f) => f.replace(/\.json$/u, ""));
    setClauseSpecFetcher(async (uri) => JSON.parse(readFileSync(uri, "utf8")));
    for (const id of ids) {
        await loadClauseSpec(id, path.join(EXAMPLES_DIR, `${id}.json`));
    }
}
