import { describe, expect, it } from "vitest";

import {
    ZERO_ADDRESS,
    addressIntegrity,
    isValidAddress,
} from "@/components/operators/TokenAddressInput";

// USDC mainnet — known checksum address.
const USDC_CHECKSUM = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_LOWER = USDC_CHECKSUM.toLowerCase();
// Tampered version: same letters but with one case-flipped to break
// the EIP-55 checksum (uppercase 'A' at index 0 → lowercase 'a').
const USDC_BAD_CHECKSUM = "0xa0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describe("addressIntegrity", () => {
    it("returns 'empty' on the empty string", () => {
        expect(addressIntegrity("")).toBe("empty");
    });

    it("returns 'not-address' on malformed input", () => {
        expect(addressIntegrity("0x1234")).toBe("not-address");
        expect(addressIntegrity("nope")).toBe("not-address");
        // 41 hex chars
        expect(addressIntegrity("0x" + "a".repeat(41))).toBe("not-address");
    });

    it("returns 'zero' on the all-zero address", () => {
        expect(addressIntegrity(ZERO_ADDRESS)).toBe("zero");
        expect(addressIntegrity(ZERO_ADDRESS.toUpperCase().replace("X", "x"))).toBe("zero");
    });

    it("returns 'lowercase' on an all-lowercase valid address", () => {
        expect(addressIntegrity(USDC_LOWER)).toBe("lowercase");
    });

    it("returns 'checksum-valid' on a correctly-checksummed address", () => {
        expect(addressIntegrity(USDC_CHECKSUM)).toBe("checksum-valid");
    });

    it("returns 'checksum-invalid' on a mixed-case address with bad checksum", () => {
        expect(addressIntegrity(USDC_BAD_CHECKSUM)).toBe("checksum-invalid");
    });
});

describe("isValidAddress", () => {
    it("accepts both lowercase and checksum-mixed-case", () => {
        expect(isValidAddress(USDC_LOWER)).toBe(true);
        expect(isValidAddress(USDC_CHECKSUM)).toBe(true);
    });

    it("rejects malformed addresses", () => {
        expect(isValidAddress("")).toBe(false);
        expect(isValidAddress("0x1234")).toBe(false);
        expect(isValidAddress("nope")).toBe(false);
    });
});
