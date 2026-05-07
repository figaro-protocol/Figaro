import { describe, expect, it } from "vitest";

import {
    ZERO_ADDRESS,
    addressIntegrity,
    classifyTokenError,
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

describe("classifyTokenError", () => {
    it("returns null for null / undefined", () => {
        expect(classifyTokenError(null)).toBeNull();
        expect(classifyTokenError(undefined)).toBeNull();
    });

    it("returns 'no-rpc' for HttpRequestError class", () => {
        const err = Object.assign(new Error("HTTP request failed"), { name: "HttpRequestError" });
        expect(classifyTokenError(err)).toBe("no-rpc");
    });

    it("returns 'no-rpc' for connection-refused messages", () => {
        const err = new Error("fetch failed: connect ECONNREFUSED 127.0.0.1:8545");
        expect(classifyTokenError(err)).toBe("no-rpc");
    });

    it("returns 'no-rpc' for 'failed to fetch' (browser network failure)", () => {
        const err = new TypeError("Failed to fetch");
        expect(classifyTokenError(err)).toBe("no-rpc");
    });

    it("returns 'no-rpc' for 'chain not configured'", () => {
        const err = Object.assign(new Error("Chain not configured for id 31337"), {
            name: "ChainNotConfiguredError",
        });
        expect(classifyTokenError(err)).toBe("no-rpc");
    });

    it("classifies via the cause field too (wrapped wagmi errors)", () => {
        const cause = Object.assign(new Error("Connection refused"), { name: "HttpRequestError" });
        const wrapped = Object.assign(new Error("Contract call failed"), {
            name: "ContractFunctionExecutionError",
            cause,
        });
        expect(classifyTokenError(wrapped)).toBe("no-rpc");
    });

    it("returns 'no-symbol' for execution-revert / no-data errors", () => {
        const err = Object.assign(
            new Error("returned no data ('0x'). The contract does not have the function 'symbol'."),
            { name: "ContractFunctionZeroDataError" },
        );
        expect(classifyTokenError(err)).toBe("no-symbol");
    });

    it("returns 'no-symbol' for unknown errors that aren't transport-flavored", () => {
        const err = new Error("Something went wrong");
        expect(classifyTokenError(err)).toBe("no-symbol");
    });
});
