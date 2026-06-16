import { describe, expect, it } from "vitest";
import { parseCatalogueCsv } from "@/lib/seller/parseCatalogueCsv";

describe("parseCatalogueCsv", () => {
    it("parses a minimal CSV with the required columns", () => {
        const csv = "name,price\nPizza,12.00\nSalad,8.50";
        const { items, errors } = parseCatalogueCsv(csv);
        expect(errors).toEqual([]);
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            name: "Pizza",
            price: "12.00",
            category: "General",
            available: true,
        });
        expect(items[1]).toMatchObject({ name: "Salad", price: "8.50" });
    });

    it("respects case-insensitive headers in any order", () => {
        const csv = "Price,NAME,Category\n10,Coffee,Drinks\n5,Croissant,Pastry";
        const { items, errors } = parseCatalogueCsv(csv);
        expect(errors).toEqual([]);
        expect(items[0]).toMatchObject({ name: "Coffee", price: "10", category: "Drinks" });
        expect(items[1]).toMatchObject({ name: "Croissant", category: "Pastry" });
    });

    it("handles quoted fields with embedded commas and newlines", () => {
        const csv = 'name,price,description\n"Pizza, large","12.00","Two slices, plenty of cheese"\nSalad,8.50,"Crisp\ngreens"';
        const { items, errors } = parseCatalogueCsv(csv);
        expect(errors).toEqual([]);
        expect(items).toHaveLength(2);
        expect(items[0].name).toBe("Pizza, large");
        expect(items[0].description).toBe("Two slices, plenty of cheese");
        expect(items[1].description).toBe("Crisp\ngreens");
    });

    it("escapes literal quotes via doubled-quote", () => {
        const csv = 'name,price\n"He said ""hi""",1';
        const { items } = parseCatalogueCsv(csv);
        expect(items[0].name).toBe('He said "hi"');
    });

    it("parses optional numeric + boolean fields", () => {
        const csv = "name,price,massGrams,volumeMl,available\nA,1,250,500,true\nB,2,,,false";
        const { items, errors } = parseCatalogueCsv(csv);
        expect(errors).toEqual([]);
        expect(items[0]).toMatchObject({
            massGrams: 250,
            volumeMl: 500,
            available: true,
        });
        expect(items[1].available).toBe(false);
        expect(items[1].massGrams).toBeUndefined();
    });

    it("flags rows missing required fields and skips them", () => {
        const csv = "name,price\nA,1\n,2\nC,";
        const { items, errors } = parseCatalogueCsv(csv);
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe("A");
        expect(errors).toHaveLength(2);
        expect(errors[0]).toMatch(/Row 3:/);
        expect(errors[1]).toMatch(/Row 4:/);
    });

    it("fails fast if required header columns are missing", () => {
        const csv = "name,description\nPizza,Hot";
        const { items, errors } = parseCatalogueCsv(csv);
        expect(items).toEqual([]);
        expect(errors[0]).toMatch(/Header row must include/);
    });

    it("returns empty on an empty file", () => {
        const { items, errors } = parseCatalogueCsv("");
        expect(items).toEqual([]);
        expect(errors[0]).toMatch(/empty/i);
    });

    it("ignores unknown columns silently", () => {
        const csv = "name,price,sku,colour\nA,1,SKU001,red";
        const { items, errors } = parseCatalogueCsv(csv);
        expect(errors).toEqual([]);
        expect(items[0].name).toBe("A");
        expect((items[0] as unknown as { sku?: string }).sku).toBeUndefined();
    });

    it("normalises CRLF line endings", () => {
        const csv = "name,price\r\nA,1\r\nB,2";
        const { items, errors } = parseCatalogueCsv(csv);
        expect(errors).toEqual([]);
        expect(items).toHaveLength(2);
    });
});
