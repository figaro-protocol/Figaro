import { describe, expect, it } from "vitest";

import { hasRequiredClauseLocations, parsePositiveTokenInput } from "@/lib/core/orderEntryValidation";

describe("orderEntryValidation", () => {
    it("requires both origin and destination", () => {
        expect(hasRequiredClauseLocations({ origin: "A", destination: "B" })).toBe(true);
        expect(hasRequiredClauseLocations({ origin: "A", destination: "" })).toBe(false);
        expect(hasRequiredClauseLocations({ origin: "", destination: "B" })).toBe(false);
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
