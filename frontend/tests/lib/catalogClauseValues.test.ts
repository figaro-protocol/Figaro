import { afterEach, describe, expect, it } from "vitest";
import {
    catalogClausesForBindings,
    catalogFieldsOfClause,
    validateCatalogClauseValues,
} from "@/lib/member/catalogClauseValues";
import { _resetClauseSpecCache_TESTING_ONLY } from "@/lib/shared/clauseSpecSource";
import type { CatalogItemMetadata } from "@/lib/member/memberCatalogMetadata";
import { primeClauseSpecs } from "./primeClauseSpecs";

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

const baseItem = (clauseValues?: CatalogItemMetadata["clauseValues"]): CatalogItemMetadata => ({
    id: "i1",
    name: "Widget",
    price: "1",
    available: true,
    ...(clauseValues && { clauseValues }),
});

describe("validateCatalogClauseValues — off-chain gate, reused validator", () => {
    it("passes conforming values against the registered spec", async () => {
        await primeClauseSpecs(["figaro-freight-class", "figaro-cold-chain"]);
        const errors = validateCatalogClauseValues(baseItem({
            "figaro-freight-class": { nmfcClass: "100" },
            "figaro-cold-chain": { tempClass: "refrigerated", tempMinC: 2, tempMaxC: 8, recordingIntervalSeconds: 900 },
        }));
        expect(errors).toEqual([]);
    });

    it("flags a value outside the clause's enum", async () => {
        await primeClauseSpecs(["figaro-freight-class"]);
        const errors = validateCatalogClauseValues(baseItem({
            "figaro-freight-class": { nmfcClass: "999" }, // not one of the 18 NMFC classes
        }));
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain("figaro-freight-class");
    });

    it("flags a missing required field", async () => {
        await primeClauseSpecs(["figaro-hazmat"]);
        const errors = validateCatalogClauseValues(baseItem({
            "figaro-hazmat": { hazardClass: "3" }, // missing unNumber + properShippingName
        }));
        expect(errors.length).toBeGreaterThan(0);
    });

    it("no clauseValues → no errors", () => {
        expect(validateCatalogClauseValues(baseItem())).toEqual([]);
    });

    it("a clause whose spec is not loaded is skipped, not failed (resolved-empty)", () => {
        // Empty cache: nothing to validate against — do not fail the seller.
        expect(validateCatalogClauseValues(baseItem({
            "figaro-freight-class": { nmfcClass: "whatever" },
        }))).toEqual([]);
    });
});

/** An `AssemblyChoice`-shaped row, reduced to the two fields the derivation
 *  reads. The real rows come from `useAssemblyChoices` (chain → IPFS). */
const choice = (slug: string, clauses: readonly string[] | null) => ({ slug, clauses });

describe("catalogClausesForBindings — the bindings decide which item fields exist", () => {
    it("asks for nothing before an assembly is bound", async () => {
        await primeClauseSpecs();
        expect(catalogClausesForBindings([], [
            choice("asm-haul", ["figaro-commerce", "figaro-hazmat", "figaro-freight-class"]),
        ])).toEqual([]);
    });

    it("asks only for the catalog-authored clauses the bound assembly composes", async () => {
        await primeClauseSpecs();
        const derived = catalogClausesForBindings(
            [{ assemblySlug: "asm-haul" }],
            [
                choice("asm-haul", ["figaro-commerce", "figaro-topology", "figaro-freight-class"]),
                choice("asm-reefer", ["figaro-commerce", "figaro-cold-chain", "figaro-hazmat"]),
            ],
        );
        // figaro-commerce and figaro-topology declare no catalogueFills, so
        // they contribute no section; the UNBOUND reefer assembly's cold-chain
        // and hazmat stay out of a haul seller's catalog entirely.
        expect(derived.map((c) => c.clauseId)).toEqual(["figaro-freight-class"]);
    });

    it("a seller of one mug, bound to a counter-sale assembly, is asked for no logistics fields", async () => {
        await primeClauseSpecs();
        expect(catalogClausesForBindings(
            [{ assemblySlug: "asm-pos" }],
            [choice("asm-pos", ["figaro-commerce", "figaro-topology"])],
        )).toEqual([]);
    });

    it("unions the clauses of every bound assembly", async () => {
        await primeClauseSpecs();
        const derived = catalogClausesForBindings(
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
        expect(catalogClausesForBindings(
            [{ assemblySlug: "asm-haul" }],
            [choice("asm-haul", null)],
        )).toEqual([]);
    });

    it("a binding with no matching published assembly asks for nothing", async () => {
        await primeClauseSpecs();
        expect(catalogClausesForBindings(
            [{ assemblySlug: "asm-withdrawn" }],
            [choice("asm-haul", ["figaro-hazmat"])],
        )).toEqual([]);
    });

    it("is empty while the clause specs are uncached — resolved-empty, never a guess", () => {
        expect(catalogClausesForBindings(
            [{ assemblySlug: "asm-haul" }],
            [choice("asm-haul", ["figaro-freight-class"])],
        )).toEqual([]);
    });

    it("carries a newly registered product-property clause with no code change", async () => {
        await primeClauseSpecs();
        // Nothing here names a clause: whatever the registry says declares
        // catalogueFills, and the bound assembly composes, is asked for.
        const everyCatalogClause = catalogClausesForBindings(
            [{ assemblySlug: "asm-everything" }],
            [choice("asm-everything", [
                "figaro-freight-class", "figaro-hazmat", "figaro-cold-chain", "figaro-data-license",
            ])],
        );
        expect(everyCatalogClause.length).toBe(4);
        for (const { clauseId, version } of everyCatalogClause) {
            expect(catalogFieldsOfClause(clauseId, version).length).toBeGreaterThan(0);
        }
    });
});

describe("catalogFieldsOfClause — only the clause's own catalog fills", () => {
    it("returns the fields the clause assigns to the catalog, in spec order", async () => {
        await primeClauseSpecs(["figaro-freight-class"]);
        expect(catalogFieldsOfClause("figaro-freight-class", 1).map((f) => f.name))
            .toEqual(["nmfcClass", "nmfcItem"]);
    });

    it("leaves out fields the clause assigns to another source", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        // The commerce clause's fields are the buyer's checkout particulars —
        // none of them is the catalog's to author.
        expect(catalogFieldsOfClause("figaro-commerce", 1)).toEqual([]);
    });

    it("is empty for an unloaded spec", () => {
        expect(catalogFieldsOfClause("figaro-freight-class", 1)).toEqual([]);
    });
});
