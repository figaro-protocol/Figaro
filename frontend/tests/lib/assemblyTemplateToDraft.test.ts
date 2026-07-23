/**
 * assemblyTemplateToDraft.test.ts — the composition-assist import seam:
 * `parseAssemblyTemplateJson` (pasted-JSON soundness) and the template→draft
 * hydration's clause-version carry (a draft that dropped the sparse non-1
 * picks would silently re-compose against v1).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { primeClauseSpecs } from "./primeClauseSpecs";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import {
    assemblyTemplateToDraft,
    parseAssemblyTemplateJson,
} from "@/lib/designer/assemblyTemplateToDraft";
import type { AssemblyTemplate } from "@/lib/shared/assemblyTemplate";

const TEMPLATE = {
    name: "Assist round-trip",
    agreements: [
        {
            id: "order-0",
            clauses: {
                "figaro-commerce": {},
                "figaro-topology": { parentOrderHashes: [] },
            },
        },
        {
            id: "order-1",
            clauses: {
                "figaro-commerce": {},
                "figaro-topology": { parentOrderHashes: ["order-0"] },
            },
            clauseVersions: { "figaro-commerce": 2 },
        },
    ],
} as unknown as AssemblyTemplate;

describe("parseAssemblyTemplateJson", () => {
    it("rejects text that is not JSON", () => {
        const r = parseAssemblyTemplateJson("not json {");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/valid JSON/);
    });

    it("rejects JSON that is not a template-shaped object", () => {
        for (const bad of ['[]', '"a string"', '{}', '{"agreements": []}']) {
            const r = parseAssemblyTemplateJson(bad);
            expect(r.ok, `accepted: ${bad}`).toBe(false);
        }
    });

    it("rejects an agreement missing its id or clauses map", () => {
        const r = parseAssemblyTemplateJson(JSON.stringify({ agreements: [{ id: "order-0" }] }));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/clauses/);
    });

    it("accepts a sound template and returns it parsed", () => {
        const r = parseAssemblyTemplateJson(JSON.stringify(TEMPLATE));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.template.agreements).toHaveLength(2);
    });
});

describe("assemblyTemplateToDraft clause-version carry", () => {
    beforeAll(async () => {
        await primeClauseSpecs(["figaro-commerce", "figaro-topology"]);
        // The template pins figaro-commerce v2 on order-1 — register the same
        // spec content under version 2 so projection resolves it (vitest has
        // no chain; loadClauseSpec checks the declared version, so the
        // fetcher re-versions the document for the sentinel URI).
        const commercePath = path.resolve(process.cwd(), "../clauses/figaro-commerce.json");
        setClauseSpecFetcher(async (uri) => {
            const raw = JSON.parse(readFileSync(uri.replace(/#v2$/u, ""), "utf8")) as { version?: number };
            if (uri.endsWith("#v2")) raw.version = 2;
            return raw;
        });
        await loadClauseSpec("figaro-commerce", 2, `${commercePath}#v2`);
    });

    it("carries the template's sparse non-1 version picks into the draft", () => {
        const draft = assemblyTemplateToDraft(TEMPLATE, { slug: "assist-test" });
        expect(draft.clauseVersionsByOrderId).toEqual({
            "order-1": { "figaro-commerce": 2 },
        });
        expect(draft.clausesByOrderId?.["order-0"]).toHaveProperty("figaro-commerce");
        expect(draft.orders).toHaveLength(2);
    });
});
