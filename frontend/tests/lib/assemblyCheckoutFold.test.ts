import { afterEach, describe, expect, it } from "vitest";
import {
    fillCargoSection,
    fillClassSections,
    fillDimweightSection,
    type AssemblyCheckoutLineItem,
} from "@/lib/checkout/assemblyCheckout";
import { _resetClauseSpecCache_TESTING_ONLY } from "@/lib/shared/clauseSpecSource";
import type { ClauseFields } from "@/lib/shared/clauseFields";
import { primeClauseSpecs } from "./primeClauseSpecs";

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

const line = (over: Partial<AssemblyCheckoutLineItem>): AssemblyCheckoutLineItem => ({
    itemId: "i", name: "Item", quantity: 1, unitPrice: "1", ...over,
});

describe("fillCargoSection — physical measure folded by declared field", () => {
    it("sums mass + volume across lines × quantity", async () => {
        await primeClauseSpecs(["figaro-cargo"]);
        const out = fillCargoSection({ "figaro-cargo": {} }, [
            line({ massGrams: 500, volumeMl: 1000, quantity: 2 }),
            line({ massGrams: 100, volumeMl: 200, quantity: 1 }),
        ]);
        expect(out["figaro-cargo"]).toMatchObject({ massGrams: 1100, volumeMl: 2200 });
    });

    it("writes packaged dims only for a single parcel (1 line, qty 1)", async () => {
        await primeClauseSpecs(["figaro-cargo"]);
        const single = fillCargoSection({ "figaro-cargo": {} }, [
            line({ massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 }),
        ]);
        expect(single["figaro-cargo"]).toMatchObject({ lengthMm: 300, widthMm: 200, heightMm: 150 });
    });

    it("omits dims when the order is multi-line (dims don't sum)", async () => {
        await primeClauseSpecs(["figaro-cargo"]);
        const multi = fillCargoSection({ "figaro-cargo": {} }, [
            line({ massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 }),
            line({ massGrams: 100, lengthMm: 100, widthMm: 100, heightMm: 100 }),
        ]);
        expect(multi["figaro-cargo"].lengthMm).toBeUndefined();
        // ...but mass still sums.
        expect(multi["figaro-cargo"].massGrams).toBe(600);
    });

    it("no-ops when no cargo clause is composed (services → absence)", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const clauses: ClauseFields = { "figaro-commerce": {} };
        expect(fillCargoSection(clauses, [line({ massGrams: 500 })])).toEqual(clauses);
    });
});

describe("fillClassSections — catalogue-sourced values folded onto their leaves", () => {
    it("folds a line's authored freight-class value", async () => {
        await primeClauseSpecs(["figaro-freight-class"]);
        const out = fillClassSections({ "figaro-freight-class": {} }, [
            line({ clauseValues: { "figaro-freight-class": { nmfcClass: "100" } } }),
        ]);
        expect(out["figaro-freight-class"]).toMatchObject({ nmfcClass: "100" });
    });

    it("no-ops when the composed clause isn't catalogue-sourced", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const clauses: ClauseFields = { "figaro-commerce": {} };
        expect(fillClassSections(clauses, [line({ clauseValues: { "figaro-commerce": { x: 1 } } })])).toEqual(clauses);
    });
});

describe("fillDimweightSection — derived billed weight", () => {
    it("computes billed = max(gross, volumetric) with per-dimension round-up", async () => {
        await primeClauseSpecs(["figaro-cargo", "figaro-dimweight"]);
        // 305×200×150 mm → round each up to the next cm → 310×200×150 = 9,300,000 mm³
        // ÷ 5000 = 1860 g volumetric > 1000 g gross → billed 1860.
        const out = fillDimweightSection(
            { "figaro-cargo": { massGrams: 1000, lengthMm: 305, widthMm: 200, heightMm: 150 }, "figaro-dimweight": {} },
            5000,
        );
        expect(out["figaro-dimweight"]).toMatchObject({ billedMassGrams: 1860, divisor: 5000 });
    });

    it("uses gross mass when it exceeds the volumetric weight", async () => {
        await primeClauseSpecs(["figaro-cargo", "figaro-dimweight"]);
        const out = fillDimweightSection(
            { "figaro-cargo": { massGrams: 9000, lengthMm: 300, widthMm: 200, heightMm: 150 }, "figaro-dimweight": {} },
            5000,
        );
        expect(out["figaro-dimweight"].billedMassGrams).toBe(9000); // gross > 1800 volumetric
    });

    it("no-ops without a divisor, without dims, or without the dimweight clause", async () => {
        await primeClauseSpecs(["figaro-cargo", "figaro-dimweight"]);
        const withDims = { "figaro-cargo": { massGrams: 1000, lengthMm: 300, widthMm: 200, heightMm: 150 }, "figaro-dimweight": {} };
        expect(fillDimweightSection(withDims, undefined)).toEqual(withDims); // no divisor
        const noDims = { "figaro-cargo": { massGrams: 1000 }, "figaro-dimweight": {} };
        expect(fillDimweightSection(noDims, 5000)).toEqual(noDims); // no dims
        const noClause = { "figaro-cargo": { massGrams: 1000, lengthMm: 300, widthMm: 200, heightMm: 150 } };
        expect(fillDimweightSection(noClause, 5000)).toEqual(noClause); // no dimweight clause
    });
});
