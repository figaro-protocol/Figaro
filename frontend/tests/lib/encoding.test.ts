import { describe, it, expect } from "vitest";
import {
    encodeLocationBytes32,
    decodeLocationBytes32,
} from "@/lib/core/encoding";
import { ZERO_BYTES32 } from "@/lib/shared/evm";

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
        expect(encodeLocationBytes32("")).toBe(ZERO_BYTES32);
    });

    it("returns empty string for zero-bytes32 input", () => {
        expect(decodeLocationBytes32(ZERO_BYTES32)).toBe("");
    });

    it("payload is always 66 chars (0x + 64 hex digits)", () => {
        expect(encodeLocationBytes32("Hello", "World")).toHaveLength(66);
    });
});
