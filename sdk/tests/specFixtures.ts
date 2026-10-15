/**
 * Fixture SpecSource for SDK tests — built from the canonical off-chain specs
 * (`clauses/*.json`) via `parseClauseSpec` + `parseProjectionHints`, the same
 * construction any consumer performs on registry-fetched spec JSON, each view
 * carrying its clause key (`computeClauseKey` = keccak256 of the spec's
 * canonical bytes, the bytes the reference tooling pins).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Hex } from "viem";
import { parseClauseSpec } from "../src/clauses/index.js";
import { computeClauseKey } from "../src/discovery.js";
import { parseProjectionHints, type ProjectionSpecView, type SpecSource } from "../src/projection.js";

const CLAUSES_DIR = path.resolve(__dirname, "../../clauses");

/** The raw spec document `clauses/<name>.json`. */
export function rawSpecOf(name: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path.join(CLAUSES_DIR, `${name}.json`), "utf8"));
}

/** The clause key of `clauses/<name>.json` — keccak256 of its canonical bytes. */
const KEYS = new Map<string, Hex>();
export function keyOf(name: string): Hex {
    let key = KEYS.get(name);
    if (key === undefined) {
        key = computeClauseKey(rawSpecOf(name));
        KEYS.set(name, key);
    }
    return key;
}

/** A projection view of a raw spec document, keyed by its own hash. */
export function viewOf(raw: Record<string, unknown>): ProjectionSpecView {
    const parsed = parseClauseSpec(raw);
    if (!parsed.ok) throw new Error(`fixture spec ${String(raw.clauseId)} failed to parse`);
    return { ...parsed.spec, clauseKey: computeClauseKey(raw), hints: parseProjectionHints(raw) };
}

/** A SpecSource over the named `clauses/*.json` specs, read by key. */
export function specSourceFromFixtures(names: readonly string[]): SpecSource {
    return specSourceOf(names.map((name) => viewOf(rawSpecOf(name))));
}

/** A SpecSource over the given views, read by key (case-insensitive). */
export function specSourceOf(views: readonly ProjectionSpecView[]): SpecSource {
    const byKey = new Map(views.map((v) => [v.clauseKey.toLowerCase(), v]));
    return {
        get: (clauseKey) => byKey.get(clauseKey.toLowerCase()),
        list: () => views,
    };
}

/** `base` plus further registrations — each its own key. */
export function specSourceWithRegistrations(
    base: SpecSource,
    extra: readonly ProjectionSpecView[],
): SpecSource {
    return specSourceOf([...base.list(), ...extra]);
}
