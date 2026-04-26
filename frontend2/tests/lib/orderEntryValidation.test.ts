import { describe, expect, it } from "vitest";

import { hasRequiredManifestLocations, parsePositiveTokenInput } from "@/lib/core/orderEntryValidation";

describe("orderEntryValidation", () => {
    it("requires both origin and destination", () => {
        expect(hasRequiredManifestLocations({ origin: "A", destination: "B" })).toBe(true);
        expect(hasRequiredManifestLocations({ origin: "A", destination: "" })).toBe(false);
        expect(hasRequiredManifestLocations({ origin: "", destination: "B" })).toBe(false);
    });

    it("parses positive token inputs and rejects non-positive values", () => {
        expect(parsePositiveTokenInput("1.5", 18)).toEqual({ amount: 1500000000000000000n, error: null });
        expect(parsePositiveTokenInput("0", 18)).toEqual({ amount: null, error: "Payment must be positive" });
    });

    it("returns the configured invalid message when precision overflows", () => {
        expect(parsePositiveTokenInput("0.1234567", 6, {
            invalidMessage: "Too many decimals",
        })).toEqual({ amount: null, error: "Too many decimals" });
    });
});
