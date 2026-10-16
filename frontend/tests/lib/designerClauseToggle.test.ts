/**
 * designerClauseToggle.test.ts — one rule for picking a clause row (one key),
 * at both scopes the designer canvas composes (the assembly-terms panel and
 * the per-order drawer).
 *
 * A design fill is the designer's own content (`block.design.fills`),
 * declared per spec, so another version of a clause — another spec, another
 * key — may declare other fills. Moving to it is a fresh pick that starts
 * from the scope's seed: a value composed under one spec never rides on
 * another's composition. The regression it guards: the assembly toggle kept
 * every old fill while the per-order toggle reset them all.
 * Runs with a v2 of the dispute-forum clause in the module cache.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { keyOf, pinSpec, primeClauseSpecs, canonicalFileBytes } from "./primeClauseSpecs";
import { assemblyClauseDefaults, toggleClauseByKey } from "@/lib/designer/draftToAssembly";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";

const CLAUSE = "figaro-arbitration-kleros";
const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");

let V1 = "" as `0x${string}`;
let V2 = "" as `0x${string}`;

beforeAll(async () => {
    await primeClauseSpecs([CLAUSE]);
    V1 = keyOf(CLAUSE);
    const v1 = JSON.parse(readFileSync(path.join(CLAUSES_DIR, `${CLAUSE}.json`), "utf8")) as {
        block: { design: { fills: string[] } };
    };
    // v2 still declares klerosCourt as a design fill; klerosMinJurors is no
    // longer the designer's to fill.
    const v2 = pinSpec({ ...v1, version: 2, block: { ...v1.block, design: { ...v1.block.design, fills: ["klerosCourt"] } } });
    const uri = `stranger://${CLAUSE}/2`;
    setClauseSpecFetcher(async (u) => (u === uri ? v2.bytes : canonicalFileBytes(u)));
    await loadClauseSpec(v2.clauseKey, uri);
    V2 = v2.clauseKey;
});

/** The canvas's two scopes: what a fresh pick starts from differs (an
 *  assembly term seeds its declared defaults); the toggle is one function. */
const SCOPES = {
    assembly: (key: string) => assemblyClauseDefaults(key),
    order: (_key: string) => ({}),
} as const;

const v1Fills = { klerosCourt: "english-language", klerosMinJurors: 5 };

describe("toggleClauseByKey — one rule at both scopes", () => {
    for (const [scope, fresh] of Object.entries(SCOPES)) {
        it(`${scope} scope: picking v2's key beside a composed v1 starts v2 from the scope's seed`, () => {
            const out = toggleClauseByKey({ [V1]: v1Fills }, V2, true, fresh(V2));
            expect(out[V2]).toEqual(fresh(V2));
            expect(out[V1]).toEqual(v1Fills);
        });

        it(`${scope} scope: re-checking a composed key leaves its fills untouched`, () => {
            const out = toggleClauseByKey({ [V1]: v1Fills }, V1, true, fresh(V1));
            expect(out[V1]).toEqual(v1Fills);
        });

        it(`${scope} scope: unchecking removes the key`, () => {
            const out = toggleClauseByKey({ [V1]: v1Fills }, V1, false, fresh(V1));
            expect(out).toEqual({});
        });
    }

    it("a fresh pick leaves each scope at its own seed, by the one rule", () => {
        expect(toggleClauseByKey({}, V2, true, SCOPES.assembly(V2))[V2]).toEqual(assemblyClauseDefaults(V2));
        expect(toggleClauseByKey({}, V2, true, SCOPES.order(V2))[V2]).toEqual({});
        expect(toggleClauseByKey({}, V1, true, SCOPES.assembly(V1))[V1]).toEqual(assemblyClauseDefaults(V1));
    });

    it("the two specs of one name are two keys with their own defaults", () => {
        expect(V1).not.toBe(V2);
        expect(assemblyClauseDefaults(V2)).not.toHaveProperty("klerosMinJurors");
    });

    it("a key whose spec is not loaded seeds no fill", () => {
        const unknown = `0x${"cd".repeat(32)}`;
        expect(assemblyClauseDefaults(unknown)).toEqual({});
        expect(toggleClauseByKey({ [V1]: v1Fills }, unknown, true, assemblyClauseDefaults(unknown))[unknown]).toEqual({});
    });
});
