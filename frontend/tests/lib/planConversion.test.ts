import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeAbiParameters, parseAbi } from "viem";

const quoterMock = vi.fn();
vi.mock("@/lib/composition/contracts", () => ({
    getSwapQuoter: () => quoterMock(),
}));

import { _resetSwapVenueCache_TESTING_ONLY, detectSwapVenue } from "@/lib/composition/swapVenue";
import {
    conversionNeed,
    effectiveUnitCost,
    formatFeeTier,
    inputForOutput,
    quotePlanConversion,
    sellerConversions,
} from "@/lib/composition/swapFunding";

const ROUTER = ("0x" + "d0".repeat(20)) as `0x${string}`;
const QUOTER = ("0x" + "e0".repeat(20)) as `0x${string}`;
const PICKED = ("0x" + "11".repeat(20)) as `0x${string}`; // the buyer's pick (tokenIn)
const BASIS = ("0x" + "22".repeat(20)) as `0x${string}`;  // the seller's quote basis (tokenOut)
const QUOTE_ABI = parseAbi(["function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params)"]);

/** A pool: `amountIn(amountOut)` or null when it cannot fill that amount. */
type Pool = (amountOut: bigint) => bigint | null;

/** SwapRouter02 + QuoterV2 whose pools are functions of the exact output, so a
 *  dust pool can price one unit cheaply and still be unable to fill a cart.
 *  Records every tier the quoter was asked about. */
function uniswapClient(pools: Record<number, Pool>, decimals: Record<string, number>) {
    const asked: number[] = [];
    const client = {
        readContract: vi.fn(async ({ functionName, address }: { functionName: string; address: string }) => {
            if (functionName === "factory") return ("0x" + "f0".repeat(20));
            if (functionName === "decimals") return decimals[address.toLowerCase()];
            throw new Error(`no such function ${functionName}`);
        }),
        call: vi.fn(async ({ data }: { data: `0x${string}` }) => {
            const { args } = decodeFunctionData({ abi: QUOTE_ABI, data });
            const { fee, amount } = args[0] as { fee: number; amount: bigint };
            asked.push(Number(fee));
            const amountIn = pools[Number(fee)]?.(amount) ?? null;
            if (amountIn === null) throw new Error("no pool / cannot fill");
            return { data: encodeAbiParameters(
                [{ type: "uint256" }, { type: "uint160" }, { type: "uint32" }, { type: "uint256" }],
                [amountIn, 0n, 0, 0n],
            ) };
        }),
    } as never;
    return { client, asked };
}

const E18 = 10n ** 18n;
// The declared pool: 2 picked per basis unit plus 0.3%, rounded up.
const declaredPool: Pool = (out) => (out * 2n * 1003n + 999n) / 1000n;
// A dust pool on an unused tier: one unit at a tenth of the price, nothing past
// one unit of depth.
const dustPool: Pool = (out) => (out <= E18 ? out / 5n : null);

describe("the plan's total is quoted on the seller's declared pool", () => {
    beforeEach(() => { _resetSwapVenueCache_TESTING_ONLY(); quoterMock.mockReturnValue(QUOTER); });
    afterEach(() => vi.clearAllMocks());

    it("the hazard: undeclared, a one-unit quote takes the dust pool's price", async () => {
        const { client } = uniswapClient({ 100: dustPool, 3000: declaredPool }, { [PICKED]: 18, [BASIS]: 18 });
        const venue = await detectSwapVenue(client, ROUTER);
        const { amountIn } = await venue.quote(PICKED, BASIS, E18);
        expect(amountIn).toBe(E18 / 5n); // the dust pool set the one-unit rate
    });

    it("a dust pool on another tier does not set the rate; the declared tier does", async () => {
        const { client, asked } = uniswapClient({ 100: dustPool, 3000: declaredPool }, { [PICKED]: 18, [BASIS]: 18 });
        const planBasis = 7n * E18; // seven basis units across the plan
        const conv = await quotePlanConversion(client, ROUTER, {
            tokenIn: PICKED, tokenOut: BASIS, feeTier: 3000, planBasis, tokenInDecimals: 18,
        });
        expect(asked).toEqual([3000]); // no other pool was consulted
        expect(conv.feeTier).toBe(3000);
        expect(conv.basisTotal).toBe(planBasis);
        expect(conv.amountIn).toBe(declaredPool(planBasis));
        // The plan's total converts to the quote itself, exactly.
        expect(inputForOutput(planBasis, conv.rate)).toBe(conv.amountIn);
        // A part converts at the same effective rate, rounded up — never short.
        const part = 3n * E18;
        const converted = inputForOutput(part, conv.rate);
        expect(converted * planBasis).toBeGreaterThanOrEqual(part * conv.amountIn);
        expect((converted - 1n) * planBasis).toBeLessThan(part * conv.amountIn);
        // The displayed effective rate: picked per one basis unit.
        expect(effectiveUnitCost(conv)).toBe(conv.amountIn / 7n);
    });

    it("the actual total, not a unit: the quote is for the plan's whole amount", async () => {
        const { client } = uniswapClient({ 3000: declaredPool }, { [PICKED]: 18, [BASIS]: 18 });
        const planBasis = 2n * E18 + 5n;
        const conv = await quotePlanConversion(client, ROUTER, {
            tokenIn: PICKED, tokenOut: BASIS, feeTier: 3000, planBasis, tokenInDecimals: 18,
        });
        expect(conv.amountIn).toBe(declaredPool(planBasis));
    });

    it("a declared pool that cannot fill the plan refuses — no fallback to another tier", async () => {
        const { client, asked } = uniswapClient({ 100: dustPool, 3000: declaredPool }, { [PICKED]: 18, [BASIS]: 18 });
        await expect(quotePlanConversion(client, ROUTER, {
            tokenIn: PICKED, tokenOut: BASIS, feeTier: 100, planBasis: 7n * E18, tokenInDecimals: 18,
        })).rejects.toThrow(/declared pool \(fee tier 100\)/);
        expect(asked).toEqual([100]);
    });

    it("rescales the plan's total into the quote basis's own decimals (rounded up)", async () => {
        // The pick has 18 decimals, the quote basis 6: the checkout parses the
        // basis-quoted prices at 18, the quote is for the basis's own units.
        const { client } = uniswapClient({ 500: (out) => out * 10n ** 12n }, { [PICKED]: 18, [BASIS]: 6 });
        const planBasis = 12_500_000_000_000_000_001n; // 12.500000000000000001 at 18 decimals
        const conv = await quotePlanConversion(client, ROUTER, {
            tokenIn: PICKED, tokenOut: BASIS, feeTier: 500, planBasis, tokenInDecimals: 18,
        });
        expect(conv.basisDecimals).toBe(6);
        expect(conv.basisTotal).toBe(12_500_001n); // ceil to the basis's precision
        expect(inputForOutput(planBasis, conv.rate)).toBe(conv.amountIn);
    });

    it("a zero total is not quoted", async () => {
        const { client } = uniswapClient({ 3000: declaredPool }, { [PICKED]: 18, [BASIS]: 18 });
        await expect(quotePlanConversion(client, ROUTER, {
            tokenIn: PICKED, tokenOut: BASIS, feeTier: 3000, planBasis: 0n, tokenInDecimals: 18,
        })).rejects.toThrow(/zero/);
    });

    it("the devnet venue is one linear rate: any declared tier quotes the total at it", async () => {
        const client = {
            readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
                if (functionName === "rateNumerator") return 3n;
                if (functionName === "rateDenominator") return 7n;
                if (functionName === "decimals") return 18;
                throw new Error(`no such function ${functionName}`);
            }),
        } as never;
        const conv = await quotePlanConversion(client, ROUTER, {
            tokenIn: PICKED, tokenOut: BASIS, feeTier: 3000, planBasis: E18, tokenInDecimals: 18,
        });
        expect(conv.amountIn).toBe((E18 * 7n + 2n) / 3n);
    });
});

describe("conversionNeed — the seller's declaration, never a coined pool", () => {
    const tokens = [
        { address: BASIS, symbol: "BAS" },
        { address: PICKED, symbol: "PIK", poolFeeTier: 3000 },
        { address: ("0x" + "33".repeat(20)) as `0x${string}`, symbol: "UND" },
    ];

    it("the quote basis itself needs no conversion", () => {
        expect(conversionNeed(tokens, BASIS, BASIS)).toEqual({ kind: "none" });
        expect(conversionNeed(tokens, BASIS.toUpperCase().replace("0X", "0x"), BASIS)).toEqual({ kind: "none" });
    });

    it("a declared pool is read from the token's entry", () => {
        expect(conversionNeed(tokens, PICKED, BASIS)).toEqual({ kind: "declared", feeTier: 3000 });
    });

    it("an undeclared pool, or a token outside the set, is not convertible", () => {
        expect(conversionNeed(tokens, "0x" + "33".repeat(20), BASIS)).toEqual({ kind: "undeclared" });
        expect(conversionNeed(tokens, "0x" + "44".repeat(20), BASIS)).toEqual({ kind: "undeclared" });
        expect(conversionNeed(undefined, PICKED, BASIS)).toEqual({ kind: "undeclared" });
    });

    it("no denomination or no quote basis means nothing to convert", () => {
        expect(conversionNeed(tokens, undefined, BASIS)).toEqual({ kind: "none" });
        expect(conversionNeed(tokens, PICKED, undefined)).toEqual({ kind: "none" });
    });

    it("formats a fee tier as a percentage", () => {
        expect(formatFeeTier(100)).toBe("0.01%");
        expect(formatFeeTier(500)).toBe("0.05%");
        expect(formatFeeTier(3000)).toBe("0.30%");
        expect(formatFeeTier(10000)).toBe("1.00%");
    });
});

describe("sellerConversions — each seller converts on ITS OWN declared pool", () => {
    const LEAD = ("0x" + "a1".repeat(20)) as `0x${string}`;
    const CONTRIB = ("0x" + "b2".repeat(20)) as `0x${string}`;
    const SILENT = ("0x" + "c3".repeat(20)) as `0x${string}`;
    const SAME = ("0x" + "d4".repeat(20)) as `0x${string}`;
    const OTHER_BASIS = ("0x" + "55".repeat(20)) as `0x${string}`;
    const catalogs = [
        // The lead quotes in BASIS and converts PICKED on the 3000 pool.
        { address: LEAD, defaultTokenAddress: BASIS, acceptedTokens: [{ address: BASIS }, { address: PICKED, poolFeeTier: 3000 }] },
        // A contributor quoting in another basis declares its OWN pool (500).
        { address: CONTRIB, defaultTokenAddress: OTHER_BASIS, acceptedTokens: [{ address: OTHER_BASIS }, { address: PICKED, poolFeeTier: 500 }] },
        // A contributor that accepts PICKED but declares no pool for it.
        { address: SILENT, defaultTokenAddress: BASIS, acceptedTokens: [{ address: BASIS }, { address: PICKED }] },
        // A contributor whose quote basis IS the picked token.
        { address: SAME, defaultTokenAddress: PICKED, acceptedTokens: [{ address: PICKED }] },
    ];

    it("a contributor's part converts on the contributor's pool, never the lead's", () => {
        const out = sellerConversions(catalogs, PICKED, [
            { seller: LEAD, basisAmount: 5n },
            { seller: CONTRIB, basisAmount: 7n },
        ]);
        expect(out).toEqual([
            { seller: LEAD.toLowerCase(), quoteBasis: BASIS, need: { kind: "declared", feeTier: 3000 }, basisTotal: 5n },
            { seller: CONTRIB.toLowerCase(), quoteBasis: OTHER_BASIS, need: { kind: "declared", feeTier: 500 }, basisTotal: 7n },
        ]);
    });

    it("a contributor with no declaration for the token is not convertible, whatever the lead declared", () => {
        const out = sellerConversions(catalogs, PICKED, [
            { seller: LEAD, basisAmount: 5n },
            { seller: SILENT, basisAmount: 3n },
        ]);
        expect(out[0].need).toEqual({ kind: "declared", feeTier: 3000 });
        expect(out[1]).toEqual({ seller: SILENT.toLowerCase(), quoteBasis: BASIS, need: { kind: "undeclared" }, basisTotal: 3n });
    });

    it("a contributor quoting in the denomination itself needs no conversion", () => {
        const [, same] = sellerConversions(catalogs, PICKED, [
            { seller: LEAD, basisAmount: 1n },
            { seller: SAME, basisAmount: 9n },
        ]);
        expect(same.need).toEqual({ kind: "none" });
    });

    it("a seller's parts sum into one quoted total, case-insensitively, in first-named order", () => {
        const out = sellerConversions(catalogs, PICKED, [
            { seller: CONTRIB, basisAmount: 2n },
            { seller: LEAD, basisAmount: 5n },
            { seller: CONTRIB.toUpperCase().replace("0X", "0x"), basisAmount: 4n },
        ]);
        expect(out.map((c) => [c.seller, c.basisTotal])).toEqual([
            [CONTRIB.toLowerCase(), 6n],
            [LEAD.toLowerCase(), 5n],
        ]);
    });

    it("a seller with no catalog has no declared basis and nothing to convert", () => {
        const [stranger] = sellerConversions(catalogs, PICKED, [{ seller: "0x" + "99".repeat(20), basisAmount: 1n }]);
        expect(stranger.quoteBasis).toBeUndefined();
        expect(stranger.need).toEqual({ kind: "none" });
    });
});
