import { describe, it, expect } from "vitest";
import {
    encodeManifest,
    decodeManifest,
    encodeLineItems,
    decodeLineItems,
    encryptLineItems,
    decryptLineItems,
    sealManifest,
    openManifest,
    generateHandoffKey,
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

// ---------------------------------------------------------------------------
// v6/v7 — encrypted line items
// ---------------------------------------------------------------------------

describe("encryptLineItems / decryptLineItems", () => {
    it("round-trips items through AES-GCM with a per-order key", async () => {
        const key = await generateHandoffKey();
        const items: LineItem[] = [
            { name: "Margherita Pizza", quantity: 2 },
            { name: "Tiramisu", quantity: 1 },
        ];
        const sealed = await encryptLineItems(items, key);
        expect(sealed).toMatch(/^enc:items:/);
        // Sealed bytes do not contain the cleartext name.
        expect(sealed).not.toContain("Margherita");

        const decrypted = await decryptLineItems(sealed, key);
        expect(decrypted).toEqual(items);
    });

    it("produces empty string for empty input", async () => {
        const key = await generateHandoffKey();
        expect(await encryptLineItems([], key)).toBe("");
    });

    it("returns empty array on wrong key", async () => {
        const k1 = await generateHandoffKey();
        const k2 = await generateHandoffKey();
        const sealed = await encryptLineItems([{ name: "x", quantity: 1 }], k1);
        expect(await decryptLineItems(sealed, k2)).toEqual([]);
    });

    it("returns empty array if the field is not enc:items:", async () => {
        const key = await generateHandoffKey();
        expect(await decryptLineItems("items:abc", key)).toEqual([]);
        expect(await decryptLineItems("", key)).toEqual([]);
    });
});

describe("sealManifest produces v6 (no ECDH) when items are present", () => {
    it("emits v6 with enc:items: field, openManifest decrypts round-trip", async () => {
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
        const { hex, keyB64 } = await sealManifest(m);

        // Verify the on-the-wire format: "v6" + enc:items:
        const bytes: number[] = [];
        for (let i = 2; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
        const raw = new TextDecoder().decode(new Uint8Array(bytes));
        expect(raw.startsWith("v6|")).toBe(true);
        expect(raw).toContain("enc:items:");
        expect(raw).not.toContain("Pasta");
        expect(raw).not.toContain("Salad");
        expect(raw).not.toContain("123 Main St");

        // Open with the per-order key — full round-trip
        const opened = await openManifest(hex, keyB64);
        expect(opened).not.toBeNull();
        expect(opened!.destinationAddress).toBe("123 Main St");
        expect(opened!.notes).toBe("Ring bell");
        expect(opened!.lineItems).toEqual([
            { name: "Pasta", quantity: 1 },
            { name: "Salad", quantity: 2 },
        ]);

        // Open without key — items + address sealed
        const sealed = await openManifest(hex, null);
        expect(sealed).not.toBeNull();
        expect(sealed!.destinationAddress).toMatch(/sealed/i);
        expect(sealed!.lineItems).toBeUndefined();
    });

    it("emits v2 (no items) when lineItems is absent — no version regression", async () => {
        const m: HandoffManifest = {
            version: "v1",
            pickupGeohash: "u4pru0",
            dropoffGeohash: "u4pru1",
            cos: "S",
            massGrams: 0,
            volumeMl: 0,
            destinationAddress: "no items",
            notes: "",
        };
        const { hex } = await sealManifest(m);
        const bytes: number[] = [];
        for (let i = 2; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
        const raw = new TextDecoder().decode(new Uint8Array(bytes));
        expect(raw.startsWith("v2|")).toBe(true);
        expect(raw).not.toContain("items:");
    });
});

describe("sealManifest produces v7 (with ECDH) when items + ephemeral pubkey", () => {
    const FAKE_EPK = "02".padEnd(66, "a"); // 33-byte compressed pubkey hex

    it("emits v7 with epk: + enc:items:, openManifest decrypts round-trip", async () => {
        const m: HandoffManifest = {
            version: "v1",
            pickupGeohash: "u4pru0",
            dropoffGeohash: "u4pru1",
            cos: "F",
            massGrams: 100,
            volumeMl: 200,
            destinationAddress: "456 Oak Ave",
            notes: "fragile",
            lineItems: [{ name: "Vase", quantity: 1 }],
        };
        const { hex, keyB64 } = await sealManifest(m, FAKE_EPK);

        const bytes: number[] = [];
        for (let i = 2; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
        const raw = new TextDecoder().decode(new Uint8Array(bytes));
        expect(raw.startsWith("v7|")).toBe(true);
        expect(raw).toContain("epk:" + FAKE_EPK);
        expect(raw).toContain("enc:items:");
        expect(raw).not.toContain("Vase");

        const opened = await openManifest(hex, keyB64);
        expect(opened).not.toBeNull();
        expect(opened!.ephemeralPublicKey).toBe(FAKE_EPK);
        expect(opened!.destinationAddress).toBe("456 Oak Ave");
        expect(opened!.lineItems).toEqual([{ name: "Vase", quantity: 1 }]);
    });

    it("emits v3 (no items) when ECDH provided but no items", async () => {
        const m: HandoffManifest = {
            version: "v1",
            pickupGeohash: "u4pru0",
            dropoffGeohash: "u4pru1",
            cos: "S",
            massGrams: 0,
            volumeMl: 0,
            destinationAddress: "nada",
            notes: "",
        };
        const { hex } = await sealManifest(m, FAKE_EPK);
        const bytes: number[] = [];
        for (let i = 2; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
        const raw = new TextDecoder().decode(new Uint8Array(bytes));
        expect(raw.startsWith("v3|")).toBe(true);
        expect(raw).not.toContain("items:");
    });
});

describe("decodeManifest sync handles v6/v7 (sealed items → undefined)", () => {
    it("v6: returns lineItems undefined when no key is available", async () => {
        const m: HandoffManifest = {
            version: "v1",
            pickupGeohash: "u4pru0",
            dropoffGeohash: "u4pru1",
            cos: "S",
            massGrams: 0,
            volumeMl: 0,
            destinationAddress: "x",
            notes: "",
            lineItems: [{ name: "x", quantity: 1 }],
        };
        const { hex } = await sealManifest(m);
        const decoded = decodeManifest(hex);
        expect(decoded).not.toBeNull();
        expect(decoded!.lineItems).toBeUndefined();
        expect(decoded!.destinationAddress).toMatch(/sealed/i);
    });

    it("v7: returns lineItems undefined + surfaces ephemeralPublicKey", async () => {
        const FAKE_EPK = "03".padEnd(66, "b");
        const m: HandoffManifest = {
            version: "v1",
            pickupGeohash: "u4pru0",
            dropoffGeohash: "u4pru1",
            cos: "C",
            massGrams: 0,
            volumeMl: 0,
            destinationAddress: "x",
            notes: "",
            lineItems: [{ name: "x", quantity: 1 }],
        };
        const { hex } = await sealManifest(m, FAKE_EPK);
        const decoded = decodeManifest(hex);
        expect(decoded).not.toBeNull();
        expect(decoded!.lineItems).toBeUndefined();
        expect(decoded!.ephemeralPublicKey).toBe(FAKE_EPK);
    });
});

// ---------------------------------------------------------------------------
// v4/v5 backwards compatibility — legacy hex with cleartext items still decodes
// ---------------------------------------------------------------------------

describe("legacy v4/v5 cleartext-items hex decodes via decodeManifest + openManifest", () => {
    // Fabricate a legacy v4 hex literal (no production code path emits this
    // anymore; this guards the compat decoder).
    function toHex(s: string): `0x${string}` {
        const bytes = new TextEncoder().encode(s);
        const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
        return `0x${hex}`;
    }
    const v4Cleartext = toHex(
        "v4|u4pru0|u4pru1|S|0|0|enc:|enc:|" + encodeLineItems([{ name: "Pizza", quantity: 1 }])
    );

    it("decodeManifest reads legacy v4 cleartext items as the items array", () => {
        const decoded = decodeManifest(v4Cleartext);
        expect(decoded).not.toBeNull();
        expect(decoded!.lineItems).toEqual([{ name: "Pizza", quantity: 1 }]);
    });

    it("openManifest with no key reads legacy v4 cleartext items as the items array", async () => {
        const opened = await openManifest(v4Cleartext, null);
        expect(opened).not.toBeNull();
        expect(opened!.lineItems).toEqual([{ name: "Pizza", quantity: 1 }]);
    });
});
