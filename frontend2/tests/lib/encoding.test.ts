import { describe, it, expect } from "vitest";
import {
    encodeManifest,
    decodeManifest,
    encodeManifestFields,
    decodeManifestFields,
    encodeLocationBytes32,
    decodeLocationBytes32,
    type ManifestFields,
} from "@/lib/core/encoding";

// ──────────────────────────────────────────────────────────────────────────────
// encodeManifest / decodeManifest — raw string round-trip
// ──────────────────────────────────────────────────────────────────────────────
describe("encodeManifest / decodeManifest", () => {
    it("round-trips an ASCII string", () => {
        const hex = encodeManifest("hello world");
        expect(decodeManifest(hex)).toBe("hello world");
    });

    it("returns 0x01 for an empty / blank string", () => {
        expect(encodeManifest("")).toBe("0x01");
        expect(encodeManifest("   ")).toBe("0x01");
    });

    it("decodeManifest returns '' for 0x01 sentinel", () => {
        expect(decodeManifest("0x01")).toBe("");
    });

    it("decodeManifest returns '' for empty hex", () => {
        expect(decodeManifest("")).toBe("");
        expect(decodeManifest("0x")).toBe("");
    });

    it("round-trips unicode characters", () => {
        const text = "São Paulo → Münster";
        expect(decodeManifest(encodeManifest(text))).toBe(text);
    });

    it("produce hex that starts with 0x", () => {
        expect(encodeManifest("test").startsWith("0x")).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// encodeManifestFields / decodeManifestFields
// ──────────────────────────────────────────────────────────────────────────────
describe("encodeManifestFields / decodeManifestFields", () => {
    it("round-trips origin only", () => {
        const fields: ManifestFields = { origin: "WarehouseA" };
        const hex = encodeManifestFields(fields);
        const decoded = decodeManifestFields(hex);
        expect(decoded.origin).toBe("WarehouseA");
        expect(decoded.destination).toBeUndefined();
    });

    it("round-trips origin + destination", () => {
        const fields: ManifestFields = { origin: "NYC", destination: "LAX" };
        const hex = encodeManifestFields(fields);
        const decoded = decodeManifestFields(hex);
        expect(decoded.origin).toBe("NYC");
        expect(decoded.destination).toBe("LAX");
    });

    it("round-trips all standard fields", () => {
        const fields: ManifestFields = {
            origin: "factory-1",
            destination: "customer-99",
            mass: "5 kg",
            volume: "10 L",
            class_: "Perishables",
        };
        const hex = encodeManifestFields(fields);
        const decoded = decodeManifestFields(hex);
        expect(decoded.origin).toBe("factory-1");
        expect(decoded.destination).toBe("customer-99");
        expect(decoded.mass).toBe("5 kg");
        expect(decoded.volume).toBe("10 L");
        expect(decoded.class_).toBe("Perishables");
    });

    it("omits empty / undefined advanced fields from encoding", () => {
        const fields: ManifestFields = { origin: "A", destination: "B", mass: "", volume: undefined };
        const hex = encodeManifestFields(fields);
        const text = decodeManifest(hex);
        expect(text).not.toContain("mass");
        expect(text).not.toContain("vol");
    });

    it("returns 0x01 sentinel for completely empty fields", () => {
        const hex = encodeManifestFields({ origin: "" });
        expect(hex).toBe("0x01");
    });

    it("returns 0x01 sentinel for whitespace-only origin", () => {
        const hex = encodeManifestFields({ origin: "  ", destination: "  " });
        expect(hex).toBe("0x01");
    });

    it("decodeManifestFields returns empty origin for 0x01 sentinel", () => {
        const decoded = decodeManifestFields("0x01");
        expect(decoded.origin).toBe("");
    });

    it("trims whitespace from field values", () => {
        const hex = encodeManifestFields({ origin: "  Berlin  ", destination: "  Paris  " });
        const decoded = decodeManifestFields(hex);
        expect(decoded.origin).toBe("Berlin");
        expect(decoded.destination).toBe("Paris");
    });

    it("encodes class_ as 'class' key in the payload", () => {
        const hex = encodeManifestFields({ origin: "A", class_: "Hazmat A" });
        const text = decodeManifest(hex);
        expect(text).toContain("class:Hazmat A");
    });

    it("passes through extra custom keys round-trip", () => {
        const fields: ManifestFields = { origin: "X", sku: "ABC-123" };
        const hex = encodeManifestFields(fields);
        const decoded = decodeManifestFields(hex);
        expect(decoded.origin).toBe("X");
        expect(decoded["sku"]).toBe("ABC-123");
    });

    // ── Backward compatibility ─────────────────────────────────────────────
    it("decodes legacy 'Origin|Destination' format (no keys)", () => {
        // Simulate old encodeLocationBytes32 style stored as manifest bytes
        const legacyHex = encodeManifest("NYC|LAX");
        const decoded = decodeManifestFields(legacyHex);
        expect(decoded.origin).toBe("NYC");
        expect(decoded.destination).toBe("LAX");
    });

    it("decodes legacy single-value format (origin only, no pipe)", () => {
        const legacyHex = encodeManifest("Paris");
        const decoded = decodeManifestFields(legacyHex);
        expect(decoded.origin).toBe("Paris");
        expect(decoded.destination).toBeUndefined();
    });

    // ── Serialised payload format ──────────────────────────────────────────
    it("serialises all fields in correct o|d|mass|vol|class order", () => {
        const hex = encodeManifestFields({
            origin: "A",
            destination: "B",
            mass: "1kg",
            volume: "2L",
            class_: "C",
        });
        const text = decodeManifest(hex);
        expect(text).toBe("o:A|d:B|mass:1kg|vol:2L|class:C");
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Legacy helpers — encodeLocationBytes32 / decodeLocationBytes32
// ──────────────────────────────────────────────────────────────────────────────
describe("encodeLocationBytes32 / decodeLocationBytes32 (legacy)", () => {
    it("round-trips origin-only", () => {
        const hex = encodeLocationBytes32("NYC");
        expect(decodeLocationBytes32(hex)).toBe("NYC");
    });

    it("round-trips origin + destination", () => {
        const hex = encodeLocationBytes32("NYC", "LAX");
        expect(decodeLocationBytes32(hex)).toBe("NYC|LAX");
    });

    it("returns zero-bytes32 for empty input", () => {
        expect(encodeLocationBytes32("")).toBe("0x" + "0".repeat(64));
    });

    it("returns empty string for zero-bytes32 input", () => {
        expect(decodeLocationBytes32("0x" + "0".repeat(64))).toBe("");
    });

    it("payload is always 66 chars (0x + 64 hex digits)", () => {
        expect(encodeLocationBytes32("Hello", "World")).toHaveLength(66);
    });
});
