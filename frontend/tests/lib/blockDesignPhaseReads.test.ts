/**
 * A part of a clause's `block` is read in its own phase (CLAUDE.md § "The
 * clause's seams", 2; docs/CLAUSES.md § "Clause-spec format"). This test
 * holds the design phase: the designer's pages
 * (`app/(tools)/assemblies/designer/`) and the designer's library
 * (`lib/designer/`) read `block.design` and never `block.checkout` or
 * `block.runtime`, neither directly nor through the spec cache's readers of
 * those parts (`lib/shared/clauseSpecSource.ts`: `clauseCatalogFills`,
 * `clauseProfileFills`, `listCatalogSourcedClauses`,
 * `listProfileSourcedClauses`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { treeSourceFiles } from "./__fixtures__/sourceTree";

const FRONTEND = process.cwd();
const DESIGN_PHASE = ["app/(tools)/assemblies/designer", "lib/designer"];

/** A read of the checkout or runtime part, directly or through a reader of the spec cache. */
const OTHER_PHASE_READ =
    /\bblock\??\.(checkout|runtime)\b|\b(clauseCatalogFills|clauseProfileFills|listCatalogSourcedClauses|listProfileSourcedClauses)\b/;

function otherPhaseReads(source: string): string[] {
    return source.split("\n").filter((line) => OTHER_PHASE_READ.test(line)).map((line) => line.trim());
}

describe("block.design is the design phase's part, and the design phase reads no other", () => {
    const files = treeSourceFiles(FRONTEND, DESIGN_PHASE);

    it("the scan reads the designer's pages and library", () => {
        expect(files.length).toBeGreaterThan(10);
        expect(files.some((f) => readFileSync(f, "utf8").includes("block.design"))).toBe(true);
    });

    it("no module of the design phase reads block.checkout or block.runtime", () => {
        const found = files.flatMap((file) =>
            otherPhaseReads(readFileSync(file, "utf8")).map((line) => `${path.relative(FRONTEND, file)}: ${line}`),
        );
        expect(found).toEqual([]);
    });

    it("the scan finds a read of another phase's part when one is written", () => {
        expect(otherPhaseReads("const f = spec.block.runtime.fields;")).toHaveLength(1);
        expect(otherPhaseReads("const m = spec.block?.checkout.catalogueMeasures;")).toHaveLength(1);
        expect(otherPhaseReads("const c = clauseCatalogFills(key);")).toHaveLength(1);
        expect(otherPhaseReads("const a = spec.block.design.article;")).toHaveLength(0);
    });
});
