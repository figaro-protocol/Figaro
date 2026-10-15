/**
 * The cross-language clause-key vector: `test/fixtures/clause-keys.json` maps
 * every `clauses/<name>.json` to its key — keccak256 of the spec's canonical
 * bytes (`computeClauseKey`), the bytes the reference tooling pins. The Rust
 * canonicalization is pinned to it on its side; this suite pins the SDK's and
 * is the fixture's one harvest path (`HARVEST_CLAUSE_KEYS=1`).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import { canonicalize } from "../src/agreement.js";
import { computeClauseKey } from "../src/discovery.js";

const CLAUSES_DIR = path.resolve(__dirname, "../../clauses");
const FIXTURE = path.resolve(__dirname, "../../test/fixtures/clause-keys.json");

function harvest(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const file of readdirSync(CLAUSES_DIR).filter((f) => f.endsWith(".json")).sort()) {
        out[file.replace(/\.json$/, "")] = computeClauseKey(JSON.parse(readFileSync(path.join(CLAUSES_DIR, file), "utf8")));
    }
    return out;
}

describe("clause keys — test/fixtures/clause-keys.json", () => {
    it("every clause's key is keccak256 of its canonical bytes, and the fixture holds them", () => {
        const keys = harvest();
        if (process.env.HARVEST_CLAUSE_KEYS === "1") writeFileSync(FIXTURE, `${JSON.stringify(keys, null, 4)}\n`);
        for (const [name, key] of Object.entries(keys)) {
            const raw = JSON.parse(readFileSync(path.join(CLAUSES_DIR, `${name}.json`), "utf8"));
            expect(key).toBe(keccak256(toBytes(canonicalize(raw))));
        }
        expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(keys);
    });
});
