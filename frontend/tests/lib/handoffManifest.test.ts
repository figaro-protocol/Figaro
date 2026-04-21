import { describe, it, expect } from "vitest";
import {
    encodeManifest,
    decodeManifest,
    encodeLineItems,
    decodeLineItems,
} from "@/lib/handoff/manifest";
import type { HandoffManifest, LineItem } from "@/lib/handoff/manifest";

// ---------------------------------------------------------------------------
// Line-item encode / decode
// ---------------------------------------------------------------------------

describe("encodeLineItems / decodeLineItems", () => {
    it("round-trips a list of items", () => {
        const items: LineItem[] = [
            { name: "Margherita Pizza", quantity: 2 },
            { name: "Tiramisu", quantity: 1 },
        ];
        const encoded = encodeLineItems(items);
        expect(encoded).toMatch(/^items:/);

        const decoded = decodeLineItems(encoded);
        expect(decoded).toHaveLength(2);
        expect(decoded[0]).toEqual({ name: "Margherita Pizza", quantity: 2 });
        expect(decoded[1]).toEqual({ name: "Tiramisu", quantity: 1 });
    });

    it("returns empty array for empty input", () => {
        expect(encodeLineItems([])).toBe("");
        expect(decodeLineItems("")).toEqual([]);
        expect(decodeLineItems("notitems:abc")).toEqual([]);
    });

    it("handles single item", () => {
        const items: LineItem[] = [{ name: "Coffee", quantity: 1 }];
        const decoded = decodeLineItems(encodeLineItems(items));
        expect(decoded).toEqual(items);
    });

    it("handles items with special characters in name", () => {
        const items: LineItem[] = [{ name: "Crème Brûlée (large)", quantity: 1 }];
        const decoded = decodeLineItems(encodeLineItems(items));
        expect(decoded[0].name).toBe("Crème Brûlée (large)");
    });
});

// ---------------------------------------------------------------------------
// v1 manifest with line items (cleartext)
// ---------------------------------------------------------------------------

describe("encodeManifest with lineItems (v1)", () => {
    it("includes line items and round-trips via decodeManifest", () => {
        const m: HandoffManifest = {
            version: "v1",
            pickupGeohash: "u4pru0",
            dropoffGeohash: "u4pru1",
            cos: "S",
            massGrams: 500,
            volumeMl: 0,
            destinationAddress: "123 Main St",
            notes: "Ring bell",
            lineItems: [
                { name: "Pasta", quantity: 1 },
                { name: "Salad", quantity: 2 },
            ],
        };
        const hex = encodeManifest(m);
        const decoded = decodeManifest(hex);

        expect(decoded).not.toBeNull();
        expect(decoded!.pickupGeohash).toBe("u4pru0");
        expect(decoded!.dropoffGeohash).toBe("u4pru1");
        expect(decoded!.lineItems).toHaveLength(2);
        expect(decoded!.lineItems![0]).toEqual({ name: "Pasta", quantity: 1 });
        expect(decoded!.lineItems![1]).toEqual({ name: "Salad", quantity: 2 });
    });

    it("omits items field when lineItems is empty", () => {
        const m: HandoffManifest = {
            version: "v1",
            pickupGeohash: "u4pru0",
            dropoffGeohash: "u4pru1",
            cos: "S",
            massGrams: 0,
            volumeMl: 0,
            destinationAddress: "",
            notes: "",
        };
        const hex = encodeManifest(m);
        // Decode raw to verify no items: field present
        const bytes: number[] = [];
        for (let i = 2; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.slice(i, i + 2), 16));
        }
        const raw = new TextDecoder().decode(new Uint8Array(bytes));
        expect(raw).not.toContain("items:");
    });
});

// ---------------------------------------------------------------------------
// Backward compatibility — v1/v2 without items decode clean
// ---------------------------------------------------------------------------

describe("backward compatibility", () => {
    it("decodes v1 manifest without lineItems as empty array", () => {
        const m: HandoffManifest = {
            version: "v1",
            pickupGeohash: "u4pru0",
            dropoffGeohash: "u4pru1",
            cos: "E",
            massGrams: 100,
            volumeMl: 200,
            destinationAddress: "456 Oak Ave",
            notes: "",
        };
        const hex = encodeManifest(m);
        const decoded = decodeManifest(hex);

        expect(decoded).not.toBeNull();
        expect(decoded!.pickupGeohash).toBe("u4pru0");
        expect(decoded!.cos).toBe("E");
        // No items field → empty array
        expect(decoded!.lineItems ?? []).toEqual([]);
    });

    it("decodes null for invalid hex", () => {
        expect(decodeManifest("")).toBeNull();
        expect(decodeManifest("0x")).toBeNull();
        expect(decodeManifest("0x01")).toBeNull();
    });
});
