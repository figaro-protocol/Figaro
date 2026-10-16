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
import {
    canonicalize,
    computeClauseKey,
    resolveAuthoredClauseKeys,
    agreementKeyOf,
    assembleAuthored,
    composeAuthoredAgreement,
    type AssemblyTemplate,
    type ComposedAgreement,
    type Hex,
    type HydratedAssembly,
    type AssemblyAgreement,
} from "@figaro-protocol/sdk";
import { listKnownClauses, loadClauseSpec, noteClauseStakes, setClauseSpecFetcher, specSource } from "@/lib/shared/clauseSpecSource";

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
 *  name-authored `agreements/*.json` / `assemblies/*.json` / `members/*.json`. */
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

/** The reference assemblies' authored agreements (`agreements/*.json`),
 *  composed over the primed specs by name — what the seeding registers. */
export function authoredAgreements(): Record<string, ComposedAgreement> {
    const dir = path.resolve(process.cwd(), "../agreements");
    const byName: Record<string, ComposedAgreement> = {};
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
        byName[file.replace(/\.json$/, "")] = composeAuthoredAgreement(JSON.parse(readFileSync(path.join(dir, file), "utf8")), specSource()).document;
    }
    return byName;
}

/** A reference assembly (`assemblies/<name>`) built exactly as the seeding
 *  builds it: over the authored agreements its agreements name
 *  (`assembleAuthored`), every registered agreement beside the template,
 *  keyed by lowercased key, as a registry read hands them to checkout. */
export function referenceAssembly(name: string): HydratedAssembly {
    const authored = JSON.parse(readFileSync(path.resolve(process.cwd(), "../assemblies", name), "utf8")) as object;
    const { template, agreements } = assembleAuthored(authored, authoredAgreements(), specSource());
    const byKey: Record<Hex, ComposedAgreement> = {};
    for (const [key, doc] of Object.entries(agreements)) byKey[key.toLowerCase() as Hex] = doc;
    return { template, agreements: byKey };
}

/** A hydrated assembly from the INLINE shape a test writes
 *  (`agreements[].clauses` by clause key or name, the topology clause
 *  carrying its parents as `order-<j>` labels): each agreement's parents
 *  lifted into its own fill (the clause stays composed, with `{}`) and each
 *  agreement's agreement keyed — every registered agreement beside the
 *  template, keyed by lowercased key, as a registry read hands them to
 *  checkout. By default each inline agreement composes as the seeding
 *  composes an authored one (`composeAuthoredAgreement` over the primed
 *  specs, the mandatory clauses folded — prime the specs first) and the
 *  assembly builds over them (`assembleAuthored`); `{ fold: false }` keys
 *  each inline clause set as written, for a test whose spec set carries no
 *  mandatory clause. */
export function hydrateAuthored(authored: object, opts: { fold?: boolean } = {}): HydratedAssembly {
    const byKey: Record<Hex, ComposedAgreement> = {};
    if (opts.fold !== false) {
        const { agreements: written, ...rest } = authored as {
            agreements: { id?: string; clauses: Record<string, Record<string, unknown>> }[];
        } & Record<string, unknown>;
        const byName: Record<string, ComposedAgreement> = {};
        const entries = written.map((entry, i) => {
            const id = entry.id ?? `order-${i}`;
            const clauses: Record<string, Record<string, unknown>> = {};
            let parents: string[] | undefined;
            for (const [key, values] of Object.entries(entry.clauses)) {
                const { parentOrderHashes, ...composed } = values ?? {};
                clauses[key] = composed;
                if (Array.isArray(parentOrderHashes)) parents = [...parentOrderHashes] as string[];
            }
            byName[id] = composeAuthoredAgreement({ clauses }, specSource()).document;
            return { id, agreement: id, ...(parents ? { parentOrderHashes: parents } : {}) };
        });
        const { template, agreements } = assembleAuthored({ ...rest, agreements: entries }, byName, specSource());
        for (const [key, doc] of Object.entries(agreements)) byKey[key.toLowerCase() as Hex] = doc;
        return { template, agreements: byKey };
    }
    const { agreements: written, ...rest } = authored as {
        agreements: { id: string; clauses: Record<Hex, Record<string, unknown>> }[];
    } & Omit<AssemblyTemplate, "agreements">;
    const entries: AssemblyAgreement[] = written.map((entry) => {
        const clauses: Record<Hex, Record<string, unknown>> = {};
        const fills: Record<Hex, Record<string, unknown>> = {};
        for (const [key, values] of Object.entries(entry.clauses) as [Hex, Record<string, unknown>][]) {
            const { parentOrderHashes, ...composed } = values ?? {};
            clauses[key] = composed;
            if (Array.isArray(parentOrderHashes)) fills[key] = { parentOrderHashes: [...parentOrderHashes] };
        }
        const agreementKey = agreementKeyOf({ clauses });
        byKey[agreementKey.toLowerCase() as Hex] = { clauses };
        return { id: entry.id, agreementKey, clauses: fills };
    });
    return { template: { ...rest, agreements: entries }, agreements: byKey };
}
