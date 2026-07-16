import { describe, expect, it, vi } from "vitest";

import {
    DEFAULT_TOKEN_CONVERSION_SERVICE,
    applySlippageFloor,
    buildFixedRateTable,
    createFixedRateQuoter,
    createUniswapV3Quoter,
} from "@/lib/shared/tokenConversion";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const FLORIN = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const QUOTER = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as const;

describe("DEFAULT_TOKEN_CONVERSION_SERVICE", () => {
    it("returns 1:1 for the identity case (same address)", async () => {
        const result = await DEFAULT_TOKEN_CONVERSION_SERVICE.quote({
            fromTokenAddress: USDC,
            toTokenAddress: USDC,
            amountIn: 1_000_000n,
        });
        expect(result?.amountOut).toBe(1_000_000n);
        expect(result?.source).toBe("identity");
    });

    it("returns null for cross-token without registered provider", async () => {
        const result = await DEFAULT_TOKEN_CONVERSION_SERVICE.quote({
            fromTokenAddress: USDC,
            toTokenAddress: FLORIN,
            amountIn: 1_000_000n,
        });
        expect(result).toBeNull();
    });

    it("treats lowercase / uppercase address pairs as the identity case", async () => {
        const lower = USDC.toLowerCase() as `0x${string}`;
        const result = await DEFAULT_TOKEN_CONVERSION_SERVICE.quote({
            fromTokenAddress: USDC,
            toTokenAddress: lower,
            amountIn: 42n,
        });
        expect(result?.amountOut).toBe(42n);
    });
});

describe("createFixedRateQuoter", () => {
    it("returns identity 1:1 when from == to", async () => {
        const quoter = createFixedRateQuoter({ rates: new Map() });
        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: USDC,
            amountIn: 100n,
        });
        expect(result?.amountOut).toBe(100n);
        expect(result?.source).toBe("identity");
    });

    it("returns the configured rate (USDC → FLORIN @ 2.0)", async () => {
        const quoter = createFixedRateQuoter({
            rates: buildFixedRateTable({
                [USDC]: { [FLORIN]: 2 },
            }),
        });
        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: FLORIN,
            amountIn: 100n,
        });
        expect(result?.amountOut).toBe(200n);
        expect(result?.source).toBe("fixed-rate");
    });

    it("returns null when the rate is not in the table", async () => {
        const quoter = createFixedRateQuoter({ rates: new Map() });
        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: FLORIN,
            amountIn: 100n,
        });
        expect(result).toBeNull();
    });

    it("returns null when the configured rate is zero or negative", async () => {
        const quoter = createFixedRateQuoter({
            rates: buildFixedRateTable({
                [USDC]: { [FLORIN]: 0 },
            }),
        });
        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: FLORIN,
            amountIn: 100n,
        });
        expect(result).toBeNull();
    });

    it("preserves precision on bigint amounts at sub-rate fractions", async () => {
        const quoter = createFixedRateQuoter({
            rates: buildFixedRateTable({
                [USDC]: { [FLORIN]: 0.5 },
            }),
        });
        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: FLORIN,
            amountIn: 10_000_000_000n,
        });
        expect(result?.amountOut).toBe(5_000_000_000n);
    });
});

describe("buildFixedRateTable", () => {
    it("lowercases address keys for lookup tolerance", () => {
        const table = buildFixedRateTable({
            "0xAA": { "0xBB": 1.5 },
        });
        expect(table.get("0xaa")?.get("0xbb")).toBe(1.5);
        expect(table.get("0xAA")).toBeUndefined();
    });
});

describe("createUniswapV3Quoter", () => {
    function makeClient(simulate: ReturnType<typeof vi.fn>) {
        return {
            simulateContract: simulate,
        } as unknown as Parameters<typeof createUniswapV3Quoter>[0]["publicClient"];
    }

    it("returns the QuoterV2's amountOut at the first responding fee tier", async () => {
        const simulate = vi.fn().mockResolvedValue({
            result: [1_900_000n, 0n, 0, 0n] as const,
        });
        const quoter = createUniswapV3Quoter({
            publicClient: makeClient(simulate),
            quoterAddress: QUOTER,
        });

        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: FLORIN,
            amountIn: 1_000_000n,
        });

        expect(result?.amountOut).toBe(1_900_000n);
        expect(result?.source).toBe("uniswap-v3-fee-500");
        expect(simulate).toHaveBeenCalledTimes(1);
    });

    it("falls through fee tiers when the first one has no liquidity (zero amountOut)", async () => {
        const simulate = vi.fn()
            .mockResolvedValueOnce({ result: [0n, 0n, 0, 0n] })
            .mockResolvedValueOnce({ result: [1_500_000n, 0n, 0, 0n] });
        const quoter = createUniswapV3Quoter({
            publicClient: makeClient(simulate),
            quoterAddress: QUOTER,
        });

        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: FLORIN,
            amountIn: 1_000_000n,
        });

        expect(result?.amountOut).toBe(1_500_000n);
        expect(result?.source).toBe("uniswap-v3-fee-3000");
        expect(simulate).toHaveBeenCalledTimes(2);
    });

    it("falls through fee tiers when a pool simulation throws (pool does not exist)", async () => {
        const simulate = vi.fn()
            .mockRejectedValueOnce(new Error("pool not found"))
            .mockRejectedValueOnce(new Error("pool not found"))
            .mockResolvedValueOnce({ result: [99n, 0n, 0, 0n] });
        const quoter = createUniswapV3Quoter({
            publicClient: makeClient(simulate),
            quoterAddress: QUOTER,
        });

        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: FLORIN,
            amountIn: 1n,
        });

        expect(result?.amountOut).toBe(99n);
        expect(result?.source).toBe("uniswap-v3-fee-10000");
        expect(simulate).toHaveBeenCalledTimes(3);
    });

    it("returns null when no fee tier produces a non-zero quote", async () => {
        const simulate = vi.fn().mockResolvedValue({ result: [0n, 0n, 0, 0n] });
        const quoter = createUniswapV3Quoter({
            publicClient: makeClient(simulate),
            quoterAddress: QUOTER,
        });

        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: FLORIN,
            amountIn: 1_000_000n,
        });

        expect(result).toBeNull();
        expect(simulate).toHaveBeenCalledTimes(3);
    });

    it("respects custom feeTiers override", async () => {
        const simulate = vi.fn().mockResolvedValue({ result: [42n, 0n, 0, 0n] });
        const quoter = createUniswapV3Quoter({
            publicClient: makeClient(simulate),
            quoterAddress: QUOTER,
            feeTiers: [100],
        });

        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: FLORIN,
            amountIn: 1n,
        });

        expect(result?.source).toBe("uniswap-v3-fee-100");
        expect(simulate.mock.calls[0]?.[0]?.args[0]?.fee).toBe(100);
    });

    it("short-circuits on identity (does not call the quoter)", async () => {
        const simulate = vi.fn();
        const quoter = createUniswapV3Quoter({
            publicClient: makeClient(simulate),
            quoterAddress: QUOTER,
        });

        const result = await quoter.quote({
            fromTokenAddress: USDC,
            toTokenAddress: USDC,
            amountIn: 1_000n,
        });

        expect(result?.amountOut).toBe(1_000n);
        expect(result?.source).toBe("identity");
        expect(simulate).not.toHaveBeenCalled();
    });
});

describe("applySlippageFloor", () => {
    const QUOTE = {
        fromTokenAddress: USDC,
        toTokenAddress: FLORIN,
        amountIn: 1_000_000n,
        amountOut: 1_900_000n,
        source: "uniswap-v3-fee-500",
    };

    it("returns amountOut unchanged at zero tolerance", () => {
        expect(applySlippageFloor(QUOTE, { toleranceFraction: 0 })).toBe(1_900_000n);
    });

    it("applies a 0.5% slippage floor", () => {
        // 1_900_000 * 0.995 = 1_890_500
        expect(applySlippageFloor(QUOTE, { toleranceFraction: 0.005 })).toBe(1_890_500n);
    });

    it("applies a 1% slippage floor", () => {
        // 1_900_000 * 0.99 = 1_881_000
        expect(applySlippageFloor(QUOTE, { toleranceFraction: 0.01 })).toBe(1_881_000n);
    });

    it("returns 0n when tolerance >= 100%", () => {
        expect(applySlippageFloor(QUOTE, { toleranceFraction: 1 })).toBe(0n);
        expect(applySlippageFloor(QUOTE, { toleranceFraction: 1.5 })).toBe(0n);
    });

    it("throws on negative tolerance", () => {
        expect(() => applySlippageFloor(QUOTE, { toleranceFraction: -0.01 })).toThrow();
    });
});
