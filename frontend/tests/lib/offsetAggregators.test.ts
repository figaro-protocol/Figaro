/**
 * offsetAggregators — per-chain registry tests.
 *
 * Verifies the registry returns the right adapter set for each supported
 * chain, returns empty for unsupported chains, and the adapter contract
 * (address / inputToken / quote / buildRetireCall) is shaped correctly.
 *
 * Quote / retire side-effects (network reads + writes) live in
 * useOffsetRetirement.test.ts; this file is pure-shape only.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

// Mock CONTRACTS so the devnet branch resolves to known addresses without
// requiring real env vars in the test runner.
vi.mock("@/lib/core/contracts", async () => {
    const actual = await vi.importActual<typeof import("@/lib/core/contracts")>("@/lib/core/contracts");
    return {
        ...actual,
        CONTRACTS: {
            ...actual.CONTRACTS,
            mockOffsetAggregator: "0x1111111111111111111111111111111111111111",
            mockErc20: "0x2222222222222222222222222222222222222222",
        },
    };
});

import { getOffsetAggregators } from "@/lib/composition/offsetAggregators";

describe("getOffsetAggregators", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns klima + toucan adapters on chainId 137 (Polygon)", () => {
        const reg = getOffsetAggregators(137);
        expect(reg.providers).toEqual(["klima", "toucan"]);
        const klima = reg.get("klima");
        const toucan = reg.get("toucan");
        expect(klima).not.toBeNull();
        expect(toucan).not.toBeNull();
        expect(klima!.address.toLowerCase()).toBe("0x8ce54d9625371fb2a068986d32c85de8e6e995f8");
        expect(toucan!.address.toLowerCase()).toBe("0x7cb7c0484d4f2324f51d81e2368823c20aef8072");
    });

    it("klima + toucan share USDC.e as inputToken on Polygon", () => {
        const reg = getOffsetAggregators(137);
        const klima = reg.get("klima");
        const toucan = reg.get("toucan");
        expect(klima!.inputToken.toLowerCase()).toBe("0x2791bca1f2de4661ed88a30c99a7a9449aa84174");
        expect(toucan!.inputToken).toBe(klima!.inputToken);
    });

    it("returns the mock adapter for both klima and toucan keys on chainId 31337 (devnet)", () => {
        const reg = getOffsetAggregators(31337);
        expect(reg.providers).toEqual(["klima", "toucan"]);
        const klima = reg.get("klima");
        const toucan = reg.get("toucan");
        expect(klima).not.toBeNull();
        expect(toucan).not.toBeNull();
        expect(klima!.address.toLowerCase()).toBe("0x1111111111111111111111111111111111111111");
        expect(toucan!.address).toBe(klima!.address); // same mock instance
        expect(klima!.inputToken.toLowerCase()).toBe("0x2222222222222222222222222222222222222222");
    });

    it("returns empty registry for unsupported chains", () => {
        for (const chainId of [1, 5, 10, 42161, 8453, undefined]) {
            const reg = getOffsetAggregators(chainId);
            expect(reg.providers).toEqual([]);
            expect(reg.get("klima")).toBeNull();
            expect(reg.get("toucan")).toBeNull();
            expect(reg.get("custom")).toBeNull();
        }
    });

    // (devnet-empty-env case is exercised by the integration env, not unit
    // tested here — vi.doMock can't reliably re-evaluate the registry's
    // memoized adapter builder, so the test would only test the mocking
    // mechanism, not the registry. The "unsupported chain" test above
    // covers the empty-registry shape.)

    it("buildRetireCall produces the expected function name + arg order for Klima", () => {
        const reg = getOffsetAggregators(137);
        const klima = reg.get("klima")!;
        const call = klima.buildRetireCall({
            tonsToRetire: 10n ** 18n,
            beneficiary: "0xBuyer000000000000000000000000000000000000" as `0x${string}`,
            maxAmountIn: 30_000_000n,
        });
        expect(call.functionName).toBe("retireExactCarbonDefault");
        // Arg order: sourceToken, poolToken, maxAmountIn, retireAmount, retiringEntityString,
        //            beneficiaryAddress, beneficiaryString, retirementMessage, fromMode
        expect(call.args[2]).toBe(30_000_000n); // maxAmountIn
        expect(call.args[3]).toBe(10n ** 18n);  // retireAmount
        expect(call.args[5]).toBe("0xBuyer000000000000000000000000000000000000"); // beneficiary
        expect(call.args[8]).toBe(0); // fromMode = EXTERNAL
    });

    it("buildRetireCall produces the expected function name + arg order for Toucan", () => {
        const reg = getOffsetAggregators(137);
        const toucan = reg.get("toucan")!;
        const call = toucan.buildRetireCall({
            tonsToRetire: 10n ** 18n,
            beneficiary: "0xBuyer000000000000000000000000000000000000" as `0x${string}`,
            maxAmountIn: 30_000_000n,
        });
        expect(call.functionName).toBe("autoOffsetExactOutToken");
        // Toucan signature: (fromToken, poolToken, amountToOffset). No beneficiary,
        // no maxAmountIn — slippage handled via the approval cap.
        expect(call.args).toHaveLength(3);
        expect(call.args[2]).toBe(10n ** 18n);
    });

    it("buildRetireCall produces the expected function name + arg order for the mock", () => {
        const reg = getOffsetAggregators(31337);
        const mock = reg.get("klima")!;
        const call = mock.buildRetireCall({
            tonsToRetire: 5n * 10n ** 17n, // 0.5 tonne
            beneficiary: "0xBuyer000000000000000000000000000000000000" as `0x${string}`,
            maxAmountIn: 100n,
        });
        expect(call.functionName).toBe("retire");
        expect(call.args).toEqual([5n * 10n ** 17n, "0xBuyer000000000000000000000000000000000000", 100n]);
    });
});
