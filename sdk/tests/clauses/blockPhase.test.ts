// A clause spec's `block` has three parts, each named for the phase whose
// actor it instructs: design, checkout, runtime. The sign gate and the
// checkout plan run before commit, in the design and checkout phases, for any
// frontend that calls the SDK. So the hints the SDK reads (`parseProjectionHints`)
// carry the design and checkout parts only, and neither module reads the
// runtime part (docs/CLAUSES.md § "Clause-spec format").
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseProjectionHints } from "../../src/projection.js";

const SRC = join(__dirname, "../../src");
const examplesDir = join(__dirname, "../../../clauses");
const exampleFiles = readdirSync(examplesDir).filter((f) => f.endsWith(".json"));

/** A read of the runtime part: `block.runtime`, `block?.runtime` or `block["runtime"]`. */
const RUNTIME_READ = /\bblock\??\.runtime\b|\[\s*["']runtime["']\s*\]/;

describe("the SDK's pre-commit modules read no part of block named for runtime", () => {
    it("parseProjectionHints returns the same hints with and without a filled block.runtime", () => {
        const block = {
            design: { article: "terms", scope: "agreement", fills: ["a"] },
            checkout: {
                catalogueFills: ["b"],
                profileFills: ["c"],
                catalogueMeasures: { d: { from: "massGrams", combine: "sum" } },
                pricedLines: { field: "lines", quantity: "q", unitPrice: "p" },
                derives: { e: { rule: "r", inputs: { x: { field: "c" } } } },
            },
        };
        const without = parseProjectionHints({ block });
        const withRuntime = parseProjectionHints({
            block: {
                ...block,
                runtime: {
                    interaction: { interface: "qr-challenge" },
                    article: "other",
                    catalogueFills: ["z"],
                    pricedLines: { field: "z", quantity: "z", unitPrice: "z" },
                },
            },
        });
        expect(Object.keys(without).length).toBeGreaterThan(0);
        expect(withRuntime).toEqual(without);
    });

    it.each(exampleFiles)("%s: its hints do not change when block.runtime is taken away", (file) => {
        const spec = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
        const { runtime: _runtime, ...rest } = spec.block;
        expect(parseProjectionHints(spec)).toEqual(parseProjectionHints({ ...spec, block: rest }));
    });

    it.each(["projection.ts", "checkoutPlan.ts"])("sdk/src/%s reads no block.runtime", (file) => {
        const found = readFileSync(join(SRC, file), "utf8")
            .split("\n")
            .filter((line) => RUNTIME_READ.test(line));
        expect(found).toEqual([]);
    });

    it("the scan finds a read of block.runtime when one is written", () => {
        expect(RUNTIME_READ.test("const i = spec.block.runtime.interaction;")).toBe(true);
        expect(RUNTIME_READ.test("const i = spec.block?.runtime?.interaction;")).toBe(true);
        expect(RUNTIME_READ.test('const i = block["runtime"];')).toBe(true);
        expect(RUNTIME_READ.test("const c = spec.block.checkout.compositionFields;")).toBe(false);
    });
});
