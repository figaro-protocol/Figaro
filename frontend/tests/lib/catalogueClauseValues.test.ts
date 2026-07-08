import { afterEach, describe, expect, it } from "vitest";
import { validateCatalogueClauseValues } from "@/lib/seller/catalogueClauseValues";
import { _resetClauseSpecCache_TESTING_ONLY } from "@/lib/shared/clauseSpecSource";
import type { CatalogueItemMetadata } from "@/lib/seller/sellerCatalogueMetadata";
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

describe("validateCatalogueClauseValues — Layer-A gate, reused validator", () => {
    it("passes conforming values against the registered spec", async () => {
        await primeClauseSpecs(["figaro-freight-class", "figaro-cold-chain"]);
        const errors = validateCatalogueClauseValues(baseItem({
            "figaro-freight-class": { nmfcClass: "100" },
            "figaro-cold-chain": { tempClass: "refrigerated", tempMinC: 2, tempMaxC: 8 },
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
