/**
 * A part of a clause's `block` is named for the phase whose actor it
 * instructs (CLAUDE.md § "The clause's seams", 2; docs/CLAUSES.md §
 * "Clause-spec format"). The phases run in order: design, then checkout, then
 * runtime. A later phase may read an earlier part; no phase reads a part
 * named for a later one. This test holds the order over the frontend's
 * files of the design phase and of the checkout phase:
 *
 *   - design: the designer's pages (`app/(tools)/assemblies/designer/`) and
 *     library (`lib/designer/`) read `block.design` and never
 *     `block.checkout` or `block.runtime`;
 *   - checkout: the checkout's pages (`app/(app)/s/checkout/`, `/sign`), its
 *     library, the seller's binding surfaces (`lib/registries/`,
 *     `components/members/`) and the pre-sign review read `block.design` and
 *     `block.checkout`, and never `block.runtime`.
 *
 * A read through a helper counts as a read of the part behind it: the spec
 * cache's readers of the checkout part (`lib/shared/clauseSpecSource.ts`),
 * the held-values readers (`lib/composability/heldValues.ts`) and the SDK's
 * priced-lines readers. No helper reads the runtime part, so a runtime read
 * is always a direct one.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { treeSourceFiles } from "./__fixtures__/sourceTree";

const FRONTEND = process.cwd();

type Phase = "design" | "checkout" | "runtime";
const ORDER: readonly Phase[] = ["design", "checkout", "runtime"];

/** The files of each phase that this test holds, folders or single files. */
const PHASE_FILES: Readonly<Record<"design" | "checkout", readonly string[]>> = {
    design: ["app/(tools)/assemblies/designer", "lib/designer"],
    checkout: [
        "app/(app)/s/checkout",
        "app/(app)/sign",
        "lib/checkout",
        "lib/registries",
        "components/members",
        "lib/composability/heldValues.ts",
        "components/runtime/AgreementReview.tsx",
        "components/runtime/AgreementPreviewModal.tsx",
        "components/runtime/CommitmentSignPreviewProvider.tsx",
    ],
};

/** The helpers that read a part on their caller's behalf, by the part they read. */
const PART_HELPERS: Readonly<Record<Phase, readonly string[]>> = {
    design: [],
    checkout: [
        "clauseCatalogFills",
        "clauseProfileFills",
        "listCatalogSourcedClauses",
        "listProfileSourcedClauses",
        "useHeldValues",
        "readHeldValues",
        "readPricedLines",
        "pricedLinesSum",
    ],
    runtime: [],
};

function partRead(part: Phase): RegExp {
    const helpers = PART_HELPERS[part];
    const direct = `\\bblock\\??\\.${part}\\b`;
    return new RegExp(helpers.length > 0 ? `${direct}|\\b(${helpers.join("|")})\\b` : direct);
}

/** The lines of `source` that read a part named for a phase later than `phase`. */
function laterPhaseReads(phase: Phase, source: string): string[] {
    const later = ORDER.slice(ORDER.indexOf(phase) + 1).map(partRead);
    return source.split("\n").filter((line) => later.some((re) => re.test(line))).map((line) => line.trim());
}

function phaseFiles(entries: readonly string[]): string[] {
    return entries.flatMap((entry) =>
        statSync(path.join(FRONTEND, entry)).isDirectory()
            ? treeSourceFiles(FRONTEND, [entry])
            : [path.join(FRONTEND, entry)],
    );
}

function violations(phase: "design" | "checkout"): string[] {
    return phaseFiles(PHASE_FILES[phase]).flatMap((file) =>
        laterPhaseReads(phase, readFileSync(file, "utf8")).map((line) => `${path.relative(FRONTEND, file)}: ${line}`),
    );
}

describe("each phase reads the parts of block named for it or for an earlier phase, never a later one", () => {
    it("the scan reads the designer's pages and library", () => {
        const files = phaseFiles(PHASE_FILES.design);
        expect(files.length).toBeGreaterThan(10);
        expect(files.some((f) => readFileSync(f, "utf8").includes("block.design"))).toBe(true);
    });

    it("the scan reads the checkout's pages, library, binding surfaces and pre-sign review", () => {
        const files = phaseFiles(PHASE_FILES.checkout);
        expect(files.length).toBeGreaterThan(10);
        const rel = files.map((f) => path.relative(FRONTEND, f));
        expect(rel.some((f) => f.startsWith(path.join("app", "(app)", "sign")))).toBe(true);
        expect(rel).toContain(path.join("components", "runtime", "AgreementReview.tsx"));
        expect(rel).toContain(path.join("components", "runtime", "AgreementPreviewModal.tsx"));
        expect(files.some((f) => readFileSync(f, "utf8").includes("block.checkout"))).toBe(true);
    });

    it("no module of the design phase reads block.checkout or block.runtime", () => {
        expect(violations("design")).toEqual([]);
    });

    it("no module of the checkout phase reads block.runtime", () => {
        expect(violations("checkout")).toEqual([]);
    });

    it("the scan finds a read of a later phase's part when one is written", () => {
        // In a design file: the checkout and runtime parts are later.
        expect(laterPhaseReads("design", "const f = spec.block.runtime.interaction;")).toHaveLength(1);
        expect(laterPhaseReads("design", "const m = spec.block?.checkout.catalogueMeasures;")).toHaveLength(1);
        expect(laterPhaseReads("design", "const c = spec.block.checkout.compositionFields;")).toHaveLength(1);
        expect(laterPhaseReads("design", "const c = clauseCatalogFills(key);")).toHaveLength(1);
        expect(laterPhaseReads("design", "const l = readPricedLines(spec, data);")).toHaveLength(1);
        expect(laterPhaseReads("design", "const a = spec.block.design.article;")).toHaveLength(0);
        // In a checkout file: only the runtime part is later.
        expect(laterPhaseReads("checkout", "const i = spec.block.runtime.interaction;")).toHaveLength(1);
        expect(laterPhaseReads("checkout", "if (block?.design.composes && block.runtime.fields.length > 0) {")).toHaveLength(1);
        expect(laterPhaseReads("checkout", "const i = getClauseSpec(k)?.block?.runtime.interaction;")).toHaveLength(1);
        expect(laterPhaseReads("checkout", "const c = spec.block.checkout.compositionFields;")).toHaveLength(0);
        expect(laterPhaseReads("checkout", "const c = clauseCatalogFills(key);")).toHaveLength(0);
        expect(laterPhaseReads("checkout", "const a = spec.block.design.article;")).toHaveLength(0);
        // In a runtime file: no part is later, so every read is allowed.
        expect(laterPhaseReads("runtime", "const a = spec.block.design.article;")).toHaveLength(0);
        expect(laterPhaseReads("runtime", "const l = readPricedLines(spec, data);")).toHaveLength(0);
        expect(laterPhaseReads("runtime", "const i = spec.block.runtime.interaction;")).toHaveLength(0);
    });
});
