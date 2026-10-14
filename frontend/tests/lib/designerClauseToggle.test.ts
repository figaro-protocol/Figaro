/**
 * designerClauseToggle.test.ts — one rule for picking a clause at a version,
 * at both scopes the designer canvas composes (the assembly-terms panel and
 * the per-order drawer).
 *
 * A design fill is the designer's own content (`block.design.fills`),
 * declared per spec, so another version may declare other fills. Switching a
 * selected clause to another version starts it over from the scope's seed: a
 * value declared by one version never rides on another's composition. The
 * regression it guards: the assembly toggle kept every old fill while the
 * per-order toggle reset them all.
 * Runs with a v2 of the dispute-forum clause in the module cache.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalContentHash } from "@figaro-protocol/sdk";
import { primeClauseSpecs } from "./primeClauseSpecs";
import { assemblyClauseDefaults, toggleClauseAtVersion } from "@/lib/designer/draftToAssemblyTemplate";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";

const CLAUSE = "figaro-arbitration-kleros";
const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");

beforeAll(async () => {
    await primeClauseSpecs([CLAUSE]);
    const v1 = JSON.parse(readFileSync(path.join(CLAUSES_DIR, `${CLAUSE}.json`), "utf8")) as {
        block: { design: { fills: string[] } };
    };
    // v2 still declares klerosCourt as a design fill; klerosMinJurors is no
    // longer the designer's to fill.
    const v2 = { ...v1, version: 2, block: { ...v1.block, design: { ...v1.block.design, fills: ["klerosCourt"] } } };
    const uri = `stranger://${CLAUSE}/2`;
    setClauseSpecFetcher(async (u) => (u === uri ? v2 : JSON.parse(readFileSync(u, "utf8"))));
    await loadClauseSpec(CLAUSE, 2, uri, canonicalContentHash(v2));
});

/** The canvas's two scopes: what a fresh pick starts from differs (an
 *  assembly term seeds its declared defaults); the toggle is one function. */
const SCOPES = {
    assembly: (version: number) => assemblyClauseDefaults(CLAUSE, version),
    order: (_version: number) => ({}),
} as const;

const v1Fills = { klerosCourt: "english-language", klerosMinJurors: 5 };

describe("toggleClauseAtVersion — one rule at both scopes", () => {
    for (const [scope, fresh] of Object.entries(SCOPES)) {
        it(`${scope} scope: switching v1 → v2 starts over from the scope's seed`, () => {
            const out = toggleClauseAtVersion({ [CLAUSE]: v1Fills }, {}, CLAUSE, true, 2, fresh(2));
            expect(out.values[CLAUSE]).toEqual(fresh(2));
            expect(out.versions).toEqual({ [CLAUSE]: 2 });
        });

        it(`${scope} scope: switching v2 → v1 starts over from the scope's seed`, () => {
            const out = toggleClauseAtVersion(
                { [CLAUSE]: { klerosCourt: "general" } }, { [CLAUSE]: 2 }, CLAUSE, true, 1, fresh(1),
            );
            expect(out.values[CLAUSE]).toEqual(fresh(1));
            expect(out.versions).toEqual({});
        });

        it(`${scope} scope: re-checking the composed version leaves its fills untouched`, () => {
            const out = toggleClauseAtVersion({ [CLAUSE]: v1Fills }, {}, CLAUSE, true, 1, fresh(1));
            expect(out.values[CLAUSE]).toEqual(v1Fills);
        });

        it(`${scope} scope: unchecking removes the clause and its version`, () => {
            const out = toggleClauseAtVersion({ [CLAUSE]: v1Fills }, { [CLAUSE]: 2 }, CLAUSE, false, 2, fresh(2));
            expect(out.values).toEqual({});
            expect(out.versions).toEqual({});
        });
    }

    it("a version switch leaves each scope at its own seed, by the one rule", () => {
        const assembly = toggleClauseAtVersion({ [CLAUSE]: v1Fills }, {}, CLAUSE, true, 2, SCOPES.assembly(2));
        const order = toggleClauseAtVersion({ [CLAUSE]: v1Fills }, {}, CLAUSE, true, 2, SCOPES.order(2));
        expect(assembly.values[CLAUSE]).toEqual(assemblyClauseDefaults(CLAUSE, 2));
        expect(order.values[CLAUSE]).toEqual({});
        expect(assembly.versions).toEqual(order.versions);
    });

    it("a fresh pick starts from the scope's seed", () => {
        expect(toggleClauseAtVersion({}, {}, CLAUSE, true, 1, SCOPES.assembly(1)).values[CLAUSE])
            .toEqual(assemblyClauseDefaults(CLAUSE, 1));
        expect(toggleClauseAtVersion({}, {}, CLAUSE, true, 1, SCOPES.order(1)).values[CLAUSE]).toEqual({});
    });

    it("a version whose spec is not loaded carries no fill", () => {
        const out = toggleClauseAtVersion({ [CLAUSE]: v1Fills }, {}, CLAUSE, true, 3, {});
        expect(out.values[CLAUSE]).toEqual({});
        expect(out.versions).toEqual({ [CLAUSE]: 3 });
    });
});
