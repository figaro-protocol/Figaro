import { describe, expect, it } from "vitest";

import {
    parseMemberCatalogueDocument,
    type MemberCatalogueMetadata,
} from "../src/memberCatalogue.js";

const subjectAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const VALID_DOC: MemberCatalogueMetadata = {
    subjectAddress,
    items: [
        {
            id: "item1",
            name: "Margherita",
            description: "Classic pizza",
            price: "0.01",
            category: "Pizza",
            available: true,
        },
    ],
    version: "1",
};

describe("parseMemberCatalogueDocument (strict)", () => {
    it("parses a valid catalogue document", () => {
        const parsed = parseMemberCatalogueDocument(VALID_DOC);
        expect(parsed.subjectAddress).toBe(subjectAddress);
        expect(parsed.items).toHaveLength(1);
        expect(parsed.items[0].name).toBe("Margherita");
        expect(parsed.version).toBe("1");
    });

    it("accepts an empty item list", () => {
        const parsed = parseMemberCatalogueDocument({ ...VALID_DOC, items: [] });
        expect(parsed.items).toEqual([]);
    });

    it("throws when items is missing", () => {
        expect(() => parseMemberCatalogueDocument({ subjectAddress, version: "1" }))
            .toThrow(/items must be an array/);
    });

    it("throws when subjectAddress is malformed", () => {
        expect(() => parseMemberCatalogueDocument({ ...VALID_DOC, subjectAddress: "not-an-address" }))
            .toThrow(/subjectAddress must be a 20-byte hex address/);
    });

    it("throws when an item is missing a required field (available)", () => {
        expect(() => parseMemberCatalogueDocument({
            subjectAddress,
            version: "1",
            items: [{ id: "i1", name: "X", price: "1" }],
        })).toThrow(/items\[0\]\.available must be a boolean/);
    });

    it("rejects an out-of-set pricingPolicy", () => {
        expect(() => parseMemberCatalogueDocument({
            subjectAddress,
            version: "1",
            items: [{ id: "i1", name: "X", price: "1", available: true, pricingPolicy: "auction" }],
        })).toThrow(/pricingPolicy must be one of/);
    });

    it("carries a rate item's pricingPolicy/rateUnit/rateQuantitySource through a parse", () => {
        const parsed = parseMemberCatalogueDocument({
            subjectAddress,
            version: "1",
            items: [{
                id: "i1", name: "Courier leg", price: "2", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }],
        });
        expect(parsed.items[0]).toMatchObject({
            pricingPolicy: "rate",
            rateUnit: "km",
            rateQuantitySource: "order-geodistance",
        });
    });

    it("carries lengthMm/widthMm/heightMm + mass/volume through a parse (physical dims floor)", () => {
        const parsed = parseMemberCatalogueDocument({
            subjectAddress,
            version: "1",
            items: [{
                id: "i1", name: "Box", price: "1", available: true,
                massGrams: 500, volumeMl: 1000, lengthMm: 300, widthMm: 200, heightMm: 150,
            }],
        });
        expect(parsed.items[0]).toMatchObject({
            massGrams: 500, volumeMl: 1000, lengthMm: 300, widthMm: 200, heightMm: 150,
        });
    });

    it("carries a data-product dataSold reference through a parse", () => {
        const dataSold = {
            compositionHash: `0x${"ef".repeat(32)}`,
            clauseId: "figaro-geolocation",
            posture: "buyer",
        };
        const parsed = parseMemberCatalogueDocument({
            subjectAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            version: "1",
            items: [{ id: "i1", name: "Flight record", price: "5", available: true, dataSold }],
        });
        expect(parsed.items[0].dataSold).toEqual(dataSold);
    });

    it("throws on a dataSold with a malformed compositionHash", () => {
        expect(() => parseMemberCatalogueDocument({
            subjectAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            version: "1",
            items: [{ id: "i1", name: "Bad", price: "5", available: true, dataSold: { compositionHash: "0x12", clauseId: "c", posture: "buyer" } }],
        })).toThrow(/dataSold\.compositionHash must be a 32-byte hex hash/);
    });

    it("carries the catalogue-sourced clauseValues map through a parse", () => {
        const clauseValues = {
            "figaro-hazmat": { unNumber: "UN1203", properShippingName: "Petrol", hazardClass: "3" },
        };
        const parsed = parseMemberCatalogueDocument({
            subjectAddress,
            version: "1",
            items: [{ id: "i1", name: "Drum", price: "1", available: true, clauseValues }],
        });
        expect(parsed.items[0].clauseValues).toEqual(clauseValues);
    });

    it("parses the optional unitSystem preference", () => {
        const parsed = parseMemberCatalogueDocument({ ...VALID_DOC, unitSystem: "imperial" });
        expect(parsed.unitSystem).toBe("imperial");
    });
});
