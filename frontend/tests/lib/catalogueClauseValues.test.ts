import { afterEach, describe, expect, it } from "vitest";
import {
    catalogueClausesForBindings,
    catalogueFieldsOfClause,
    validateCatalogueClauseValues,
} from "@/lib/member/catalogueClauseValues";
import { _resetClauseSpecCache_TESTING_ONLY } from "@/lib/shared/clauseSpecSource";
import type { CatalogueItemMetadata } from "@/lib/member/memberCatalogueMetadata";
import { primeClauseSpecs } from "./primeClauseSpecs";

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

const baseItem = (clauseValues?: CatalogueItemMetadata["clauseValues"]): CatalogueItemMetadata => ({
    id: "i1",
    name: "Widget",
    price: "1",
    available: true,
    ...(clauseValues && { clauseValues }),
});

describe("validateCatalogueClauseValues — off-chain gate, reused validator", () => {
    it("passes conforming values against the registered spec", async () => {
        await primeClauseSpecs(["figaro-freight-class", "figaro-cold-chain"]);
        const errors = validateCatalogueClauseValues(baseItem({
            "figaro-freight-class": { nmfcClass: "100" },
            "figaro-cold-chain": { tempClass: "refrigerated", tempMinC: 2, tempMaxC: 8, recordingIntervalSeconds: 900 },
        }));
        expect(errors).toEqual([]);
    });

    it("flags a value outside the clause's enum", async () => {
        await primeClauseSpecs(["figaro-freight-class"]);
        const errors = validateCatalogueClauseValues(baseItem({
            "figaro-freight-class": { nmfcClass: "999" }, // not one of the 18 NMFC classes
        }));
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain("figaro-freight-class");
    });

    it("flags a missing required field", async () => {
        await primeClauseSpecs(["figaro-hazmat"]);
        const errors = validateCatalogueClauseValues(baseItem({
            "figaro-hazmat": { hazardClass: "3" }, // missing unNumber + properShippingName
        }));
        expect(errors.length).toBeGreaterThan(0);
    });

    it("no clauseValues → no errors", () => {
        expect(validateCatalogueClauseValues(baseItem())).toEqual([]);
    });

    it("a clause whose spec is not loaded is skipped, not failed (resolved-empty)", () => {
        // Empty cache: nothing to validate against — do not fail the seller.
        expect(validateCatalogueClauseValues(baseItem({
            "figaro-freight-class": { nmfcClass: "whatever" },
        }))).toEqual([]);
    });
});

/** An `AssemblyChoice`-shaped row, reduced to the two fields the derivation
 *  reads. The real rows come from `useAssemblyChoices` (chain → IPFS). */
const choice = (slug: string, clauses: readonly string[] | null) => ({ slug, clauses });

describe("catalogueClausesForBindings — the bindings decide which item fields exist", () => {
    it("asks for nothing before an assembly is bound", async () => {
        await primeClauseSpecs();
        expect(catalogueClausesForBindings([], [
            choice("asm-haul", ["figaro-commerce", "figaro-hazmat", "figaro-freight-class"]),
        ])).toEqual([]);
    });

    it("asks only for the catalogue-authored clauses the bound assembly composes", async () => {
        await primeClauseSpecs();
        const derived = catalogueClausesForBindings(
            [{ assemblySlug: "asm-haul" }],
            [
                choice("asm-haul", ["figaro-commerce", "figaro-topology", "figaro-freight-class"]),
                choice("asm-reefer", ["figaro-commerce", "figaro-cold-chain", "figaro-hazmat"]),
            ],
        );
        // figaro-commerce and figaro-topology declare no catalogueFills, so
        // they contribute no section; the UNBOUND reefer assembly's cold-chain
        // and hazmat stay out of a haul seller's catalogue entirely.
        expect(derived.map((c) => c.clauseId)).toEqual(["figaro-freight-class"]);
    });

    it("a seller of one mug, bound to a counter-sale assembly, is asked for no logistics fields", async () => {
        await primeClauseSpecs();
        expect(catalogueClausesForBindings(
            [{ assemblySlug: "asm-pos" }],
            [choice("asm-pos", ["figaro-commerce", "figaro-topology"])],
        )).toEqual([]);
    });

    it("unions the clauses of every bound assembly", async () => {
        await primeClauseSpecs();
        const derived = catalogueClausesForBindings(
            [{ assemblySlug: "asm-haul" }, { assemblySlug: "asm-reefer" }],
            [
                choice("asm-haul", ["figaro-freight-class"]),
                choice("asm-reefer", ["figaro-cold-chain"]),
                choice("asm-data", ["figaro-data-license"]),
            ],
        );
        expect(derived.map((c) => c.clauseId).sort())
            .toEqual(["figaro-cold-chain", "figaro-freight-class"]);
    });

    it("a bound assembly whose template has not resolved contributes nothing, not everything", async () => {
        await primeClauseSpecs();
        expect(catalogueClausesForBindings(
            [{ assemblySlug: "asm-haul" }],
            [choice("asm-haul", null)],
        )).toEqual([]);
    });

    it("a binding with no matching published assembly asks for nothing", async () => {
        await primeClauseSpecs();
        expect(catalogueClausesForBindings(
            [{ assemblySlug: "asm-withdrawn" }],
            [choice("asm-haul", ["figaro-hazmat"])],
        )).toEqual([]);
    });

    it("is empty while the clause specs are uncached — resolved-empty, never a guess", () => {
        expect(catalogueClausesForBindings(
            [{ assemblySlug: "asm-haul" }],
            [choice("asm-haul", ["figaro-freight-class"])],
        )).toEqual([]);
    });

    it("carries a newly registered product-property clause with no code change", async () => {
        await primeClauseSpecs();
        // Nothing here names a clause: whatever the registry says declares
        // catalogueFills, and the bound assembly composes, is asked for.
        const everyCatalogueClause = catalogueClausesForBindings(
            [{ assemblySlug: "asm-everything" }],
            [choice("asm-everything", [
                "figaro-freight-class", "figaro-hazmat", "figaro-cold-chain", "figaro-data-license",
            ])],
        );
        expect(everyCatalogueClause.length).toBe(4);
        for (const { clauseId, version } of everyCatalogueClause) {
            expect(catalogueFieldsOfClause(clauseId, version).length).toBeGreaterThan(0);
        }
    });
});

describe("catalogueFieldsOfClause — only the clause's own catalogue fills", () => {
    it("returns the fields the clause assigns to the catalogue, in spec order", async () => {
        await primeClauseSpecs(["figaro-freight-class"]);
        expect(catalogueFieldsOfClause("figaro-freight-class").map((f) => f.name))
            .toEqual(["nmfcClass", "nmfcItem"]);
    });

    it("leaves out fields the clause assigns to another source", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        // The commerce clause's fields are the buyer's checkout particulars —
        // none of them is the catalogue's to author.
        expect(catalogueFieldsOfClause("figaro-commerce")).toEqual([]);
    });

    it("is empty for an unloaded spec", () => {
        expect(catalogueFieldsOfClause("figaro-freight-class")).toEqual([]);
    });
});
