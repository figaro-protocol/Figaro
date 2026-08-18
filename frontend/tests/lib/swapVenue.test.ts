import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeAbiParameters, getAddress, parseAbi } from "viem";

const quoterMock = vi.fn();
vi.mock("@/lib/composition/contracts", () => ({
    getSwapQuoter: () => quoterMock(),
}));

import { _resetSwapVenueCache_TESTING_ONLY, capWithSlippage, detectSwapVenue } from "@/lib/composition/swapVenue";

const ROUTER = ("0x" + "d0".repeat(20)) as `0x${string}`;
const QUOTER = ("0x" + "e0".repeat(20)) as `0x${string}`;
const WETH = ("0x" + "11".repeat(20)) as `0x${string}`;
const USDC = ("0x" + "22".repeat(20)) as `0x${string}`;
const COORD = getAddress("0x" + "c0".repeat(20));
const SWAP_ROUTER02_ABI = parseAbi([
    "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)",
]);
const MOCK_ABI = parseAbi(["function swap(address tokenIn, address tokenOut, uint256 amountIn, address recipient) returns (uint256)"]);

/** A publicClient that behaves like SwapRouter02 + QuoterV2: factory() answers,
 *  rateNumerator() reverts, and QuoterV2 prices each fee tier differently. */
function uniswapClient(quotesByFee: Record<number, bigint | null>) {
    return {
        readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
            if (functionName === "factory") return ("0x" + "f0".repeat(20));
            if (functionName === "decimals") return 6;
            throw new Error(`no such function ${functionName}`);
        }),
        call: vi.fn(async ({ data }: { data: `0x${string}` }) => {
            const { args } = decodeFunctionData({
                abi: parseAbi(["function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params)"]),
                data,
            });
            const fee = Number((args[0] as { fee: number }).fee);
            const q = quotesByFee[fee];
            if (q == null) throw new Error("no pool");
            return { data: encodeAbiParameters(
                [{ type: "uint256" }, { type: "uint160" }, { type: "uint32" }, { type: "uint256" }],
                [q, 0n, 0, 0n],
            ) };
        }),
    } as never;
}
function mockClient(num: bigint, den: bigint) {
    return {
        readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
            if (functionName === "rateNumerator") return num;
            if (functionName === "rateDenominator") return den;
            throw new Error(`no such function ${functionName}`);
        }),
    } as never;
}

describe("swapVenue — the venue is DERIVED from the router; two siblings behind one seam", () => {
    beforeEach(() => { _resetSwapVenueCache_TESTING_ONLY(); quoterMock.mockReturnValue(QUOTER); });
    afterEach(() => vi.clearAllMocks());

    it("Uniswap v3: quotes every fee tier, takes the cheapest input, routes exactOutputSingle with the signed cap as amountInMaximum", async () => {
        const venue = await detectSwapVenue(uniswapClient({ 100: 1_242n, 500: 1_253n, 3000: 1_262n, 10000: null }), ROUTER);
        expect(venue.kind).toBe("uniswap-v3");
        expect(venue.slippageBps).toBe(100);
        const quote = await venue.quote(WETH, USDC, 3_000_000n);
        expect(quote.amountIn).toBe(1_242n);
        const maxInput = capWithSlippage(quote.amountIn, venue.slippageBps);
        expect(maxInput).toBe(1_255n); // 1242 + ceil(1242·1%) = 1242 + 13
        const { functionName, args } = decodeFunctionData({ abi: SWAP_ROUTER02_ABI, data: quote.route(maxInput, COORD) });
        expect(functionName).toBe("exactOutputSingle");
        expect(args[0]).toMatchObject({ tokenIn: WETH, tokenOut: USDC, fee: 100, recipient: COORD, amountOut: 3_000_000n, amountInMaximum: 1_255n });
    });

    it("Uniswap v3 without a quoter configured is a named configuration error, never a silent fallback", async () => {
        quoterMock.mockReturnValue(null);
        await expect(detectSwapVenue(uniswapClient({ 500: 1n }), ROUTER)).rejects.toThrow(/NEXT_PUBLIC_SWAP_QUOTER/);
    });

    it("Uniswap v3 with no pool for the pair refuses to quote", async () => {
        const venue = await detectSwapVenue(uniswapClient({}), ROUTER);
        await expect(venue.quote(WETH, USDC, 1n)).rejects.toThrow(/no pool/);
    });

    it("devnet mock: exact input from the global rate, no headroom, the mock's own swap() route", async () => {
        const venue = await detectSwapVenue(mockClient(1n, 2n), ROUTER); // out = in/2 ⇒ in = 2·out
        expect(venue.kind).toBe("devnet-mock");
        const quote = await venue.quote(WETH, USDC, 500n);
        expect(quote.amountIn).toBe(1_000n);
        expect(capWithSlippage(quote.amountIn, venue.slippageBps)).toBe(1_000n);
        const { functionName, args } = decodeFunctionData({ abi: MOCK_ABI, data: quote.route(1_000n, COORD) });
        expect(functionName).toBe("swap");
        expect(args).toEqual([WETH, USDC, 1_000n, COORD]);
    });

    it("a router that is neither venue is refused", async () => {
        const client = { readContract: vi.fn(async () => { throw new Error("revert"); }) } as never;
        await expect(detectSwapVenue(client, ROUTER)).rejects.toThrow(/neither/);
    });
});
