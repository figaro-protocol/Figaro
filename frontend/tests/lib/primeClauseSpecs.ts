/**
 * Prime the clauseSpecSource cache from the canonical off-chain specs
 * (`clauses/*.json`) — the same specs the seeding pins as canonical bytes and
 * registers under `keccak256` of those bytes. Vitest has no chain, so the
 * fetcher stub reads the file the URI names and hands back its canonical
 * bytes; everything downstream of the cache behaves exactly as it does after
 * `useClauseSpecs` warms it from the registry.
 *
 * `keyOf(name)` is the ONE way a test locates a clause by the name a human
 * reads: it looks the name up among the specs loaded into the cache and
 * returns that spec's key — never a hardcoded key.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { canonicalize, computeClauseKey, resolveAuthoredClauseKeys, type Hex } from "@figaro-protocol/sdk";
import { listKnownClauses, loadClauseSpec, noteClauseStakes, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";

// Vitest runs with cwd = frontend/ (the vitest config root).
const EXAMPLES_DIR = path.resolve(process.cwd(), "../clauses");

/** The bytes a designer pins for `spec` — its canonical JSON — and the clause
 *  key they hash to. Tests that serve a spec of their own pin it through this. */
export function pinSpec(spec: unknown): { clauseKey: Hex; bytes: string } {
    return { clauseKey: computeClauseKey(spec), bytes: canonicalize(spec) };
}

/** A fetcher that serves the canonical bytes of the JSON file a URI names —
 *  what a gateway returns for a spec the seeding pinned. */
export async function canonicalFileBytes(uri: string): Promise<string> {
    return canonicalize(JSON.parse(readFileSync(uri, "utf8")));
}

/** Load the named off-chain specs into the cache — or every example spec when
 *  called with no argument — and note every loaded clause's stake as live, as
 *  the registry read `useClauseSpecs` performs does for a registration nobody
 *  withdrew. Idempotent (loadClauseSpec caches). Names here are FILE names in
 *  `clauses/`, the maintainer's authored source. */
export async function primeClauseSpecs(clauseFiles?: readonly string[]): Promise<void> {
    const files = clauseFiles
        ?? readdirSync(EXAMPLES_DIR)
            .filter((f) => f.endsWith(".json"))
            .map((f) => f.replace(/\.json$/u, ""));
    setClauseSpecFetcher(canonicalFileBytes);
    for (const name of files) {
        const file = path.join(EXAMPLES_DIR, `${name}.json`);
        await loadClauseSpec(computeClauseKey(JSON.parse(readFileSync(file, "utf8"))), file);
    }
    noteClauseStakes(listKnownClauses().map((c) => ({ clauseKey: c.clauseKey, stakeWithdrawn: false })));
}

/** The key of the ONE loaded spec whose own `clauseId` is `name` (and whose
 *  `version` is `version`, when given). Throws when none or several match —
 *  a test that loaded two specs of one name says which. */
export function keyOf(name: string, version?: number): Hex {
    const matches = listKnownClauses().filter((c) => c.clauseId === name && (version === undefined || c.version === version));
    if (matches.length !== 1) {
        throw new Error(`keyOf("${name}"${version === undefined ? "" : `, ${version}`}): ${matches.length} loaded specs match`);
    }
    return matches[0].clauseKey;
}

/** The specs in `clauses/` as the seeding's authored spec set — each with the
 *  key its canonical bytes hash to — for tests that load the maintainer's
 *  name-authored `assemblies/*.json` / `members/*.json`. */
export function authoredSpecSet(): { list(): { clauseKey: Hex; clauseId: string; version: number; spec: Record<string, unknown> }[] } {
    const specs = readdirSync(EXAMPLES_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => {
            const spec = JSON.parse(readFileSync(path.join(EXAMPLES_DIR, f), "utf8")) as Record<string, unknown> & { clauseId: string; version: number };
            return { clauseKey: computeClauseKey(spec), clauseId: spec.clauseId, version: spec.version, spec };
        });
    return { list: () => specs };
}

/** An authored document (template, profile, catalog) with its clause names
 *  resolved to keys over `clauses/` — what the seeding pins. */
export function resolveAuthored<T extends object>(doc: T): T {
    return resolveAuthoredClauseKeys(doc, authoredSpecSet());
}
