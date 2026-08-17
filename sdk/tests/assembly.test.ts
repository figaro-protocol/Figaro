import { describe, it, expect } from "vitest";
import { templateComposedClauseIds } from "../src/assembly.js";
import type { AssemblyTemplate } from "../src/assembly.js";

describe("templateComposedClauseIds", () => {
    it("unions the assembly-scoped sections with every agreement's clauses, sorted and de-duplicated", () => {
        const template: AssemblyTemplate = {
            assemblyClauses: { "figaro-assembly-provenance": {} },
            agreements: [
                { id: "order-0", clauses: { "figaro-topology": {}, "figaro-commerce": {} } },
                { id: "order-1", clauses: { "figaro-commerce": {}, "figaro-handoff": {} } },
            ],
        };
        expect(templateComposedClauseIds(template)).toEqual([
            "figaro-assembly-provenance",
            "figaro-commerce",
            "figaro-handoff",
            "figaro-topology",
        ]);
    });

    it("tolerates a template without assembly-scoped sections", () => {
        const template: AssemblyTemplate = {
            agreements: [{ id: "order-0", clauses: { "figaro-commerce": {} } }],
        };
        expect(templateComposedClauseIds(template)).toEqual(["figaro-commerce"]);
    });
});
