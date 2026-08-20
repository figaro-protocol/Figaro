/**
 * lib/composition/swapVenue.ts — THE swap venue seam behind the swap-funded
 * on-ramp (`WitnessSwapAndCommitCoordinator`, fifth-noun composition).
 *
 * The coordinator forwards the party's witness-signed calldata to an
 * immutable router after approving it for the input token, then requires the
 * swap to have delivered at least the bond to itself. So a VENUE is anything
 * that (a) quotes how much input yields an exact output and (b) builds ONE
 * router call that pulls ≤ maxInput by ERC-20 allowance and delivers ≥ the
 * output to a recipient. Two venues exist as siblings behind this interface:
 *
 * - the DEVNET mock (`MockUniversalRouter`: `swap(tokenIn, tokenOut, amountIn,
 *   recipient)` at one settable global rate) — Anvil only;
 * - Uniswap v3 through SwapRouter02 (`exactOutputSingle`, pulls by allowance;
 *   quotes from QuoterV2) — Sepolia and mainnet.
 *
 * Which venue a router IS is DERIVED by probing the router (the mock answers
 * `rateNumerator()`, SwapRouter02 answers `factory()`), never configured —
 * the same router address could not be both. Growth is another sibling here,
 * never a clause.
 */
import { encodeFunctionData, decodeFunctionResult, parseAbi, type PublicClient } from "viem";
import type { Hex } from "@figaro-protocol/sdk";
import { getSwapQuoter } from "@/lib/composition/contracts";

type SwapVenueKind = "devnet-mock" | "uniswap-v3";

/** A live quote for one exact-output swap and the route that executes it. */
interface SwapQuote {
    /** Input the venue needs NOW to yield exactly `amountOut` of the output token. */
    amountIn: bigint;
    /** The router calldata the coordinator forwards: spend ≤ `maxInput` of the
     *  input token, deliver ≥ the quoted output to `recipient`. */
    route(maxInput: bigint, recipient: Hex): Hex;
}

export interface SwapVenue {
    kind: SwapVenueKind;
    router: Hex;
    /** Headroom the signed cap (`maxInput`) carries over the quote, in basis
     *  points: 0 on the fixed-rate mock; on a live pool the price can move
     *  between quote and execution, and a swap that would exceed the cap
     *  reverts inside the coordinator (`SwapCallFailed`) — the party keeps
     *  every token, the commit simply does not happen. */
    slippageBps: number;
    quote(tokenIn: Hex, tokenOut: Hex, amountOut: bigint): Promise<SwapQuote>;
}

/** Add the venue's headroom to a quoted input (rounded up). */
export function capWithSlippage(amountIn: bigint, slippageBps: number): bigint {
    if (slippageBps === 0) return amountIn;
    return amountIn + (amountIn * BigInt(slippageBps) + 9_999n) / 10_000n;
}

// ── Devnet venue: MockUniversalRouter ───────────────────────────────────────

const MOCK_VENUE_ABI = parseAbi([
    "function swap(address tokenIn, address tokenOut, uint256 amountIn, address recipient) returns (uint256)",
    "function rateNumerator() view returns (uint256)",
    "function rateDenominator() view returns (uint256)",
]);

function mockVenue(publicClient: PublicClient, router: Hex): SwapVenue {
    return {
        kind: "devnet-mock",
        router,
        slippageBps: 0,
        async quote(tokenIn, tokenOut, amountOut) {
            const [num, den] = await Promise.all([
                publicClient.readContract({ address: router, abi: MOCK_VENUE_ABI, functionName: "rateNumerator" }),
                publicClient.readContract({ address: router, abi: MOCK_VENUE_ABI, functionName: "rateDenominator" }),
            ]);
            if (num === 0n) throw new Error("Swap venue rate is zero — cannot fund or quote through it.");
            // amountOut = amountIn·num/den ⇒ amountIn = ceil(amountOut·den/num)
            const amountIn = (amountOut * den + num - 1n) / num;
            return {
                amountIn,
                route: (maxInput, recipient) => encodeFunctionData({
                    abi: MOCK_VENUE_ABI,
                    functionName: "swap",
                    args: [tokenIn, tokenOut, maxInput, recipient],
                }),
            };
        },
    };
}

// ── Uniswap v3 venue: SwapRouter02 + QuoterV2 ───────────────────────────────

const SWAP_ROUTER02_ABI = parseAbi([
    "function factory() view returns (address)",
    "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)",
]);
const QUOTER_V2_ABI = parseAbi([
    "function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
/** Uniswap v3's fee tiers; the venue quotes every one and takes the cheapest
 *  input — the pool set is a fact of the chain, read per quote. */
const UNISWAP_V3_FEE_TIERS: readonly number[] = [100, 500, 3000, 10000];
/** Live-pool headroom between quote and execution. */
const UNISWAP_SLIPPAGE_BPS = 100;

function uniswapV3Venue(publicClient: PublicClient, router: Hex, quoter: Hex): SwapVenue {
    return {
        kind: "uniswap-v3",
        router,
        slippageBps: UNISWAP_SLIPPAGE_BPS,
        async quote(tokenIn, tokenOut, amountOut) {
            // QuoterV2's quote functions are not `view` (they revert-and-decode
            // internally), so they are read through eth_call, not readContract.
            const quotes = await Promise.all(UNISWAP_V3_FEE_TIERS.map(async (fee) => {
                try {
                    const { data } = await publicClient.call({
                        to: quoter,
                        data: encodeFunctionData({
                            abi: QUOTER_V2_ABI,
                            functionName: "quoteExactOutputSingle",
                            args: [{ tokenIn, tokenOut, amount: amountOut, fee, sqrtPriceLimitX96: 0n }],
                        }),
                    });
                    if (!data) return null;
                    const [amountIn] = decodeFunctionResult({ abi: QUOTER_V2_ABI, functionName: "quoteExactOutputSingle", data });
                    return { fee, amountIn };
                } catch {
                    return null; // no pool at this tier, or not enough liquidity
                }
            }));
            const priced: Array<{ fee: number; amountIn: bigint }> = [];
            for (const q of quotes) if (q) priced.push(q);
            const best = priced.sort((a, b) => (a.amountIn < b.amountIn ? -1 : a.amountIn > b.amountIn ? 1 : 0))[0];
            if (!best) throw new Error("Swap venue has no pool for this pair — cannot fund or quote through it.");
            return {
                amountIn: best.amountIn,
                route: (maxInput, recipient) => encodeFunctionData({
                    abi: SWAP_ROUTER02_ABI,
                    functionName: "exactOutputSingle",
                    args: [{ tokenIn, tokenOut, fee: best.fee, recipient, amountOut, amountInMaximum: maxInput, sqrtPriceLimitX96: 0n }],
                }),
            };
        },
    };
}

// ── Detection ───────────────────────────────────────────────────────────────

const VENUE_CACHE = new Map<string, Promise<SwapVenue>>();

/** Which venue the configured router IS — probed once per router: the devnet
 *  mock answers `rateNumerator()`, SwapRouter02 answers `factory()`. A router
 *  that answers neither is refused (the coordinator would forward calldata a
 *  stranger contract cannot execute). The Uniswap venue also needs QuoterV2
 *  (`NEXT_PUBLIC_SWAP_QUOTER`) — its absence is a configuration error named
 *  at first use, never a silent fallback. */
export function detectSwapVenue(publicClient: PublicClient, router: Hex): Promise<SwapVenue> {
    const key = router.toLowerCase();
    let pending = VENUE_CACHE.get(key);
    if (!pending) {
        pending = (async () => {
            const answers = async (abi: typeof MOCK_VENUE_ABI | typeof SWAP_ROUTER02_ABI, functionName: "rateNumerator" | "factory") => {
                try {
                    await publicClient.readContract({ address: router, abi, functionName } as never);
                    return true;
                } catch {
                    return false;
                }
            };
            if (await answers(MOCK_VENUE_ABI, "rateNumerator")) return mockVenue(publicClient, router);
            if (await answers(SWAP_ROUTER02_ABI, "factory")) {
                const quoter = getSwapQuoter();
                if (!quoter) throw new Error("Swap venue is Uniswap v3 but NEXT_PUBLIC_SWAP_QUOTER (QuoterV2) is unconfigured.");
                return uniswapV3Venue(publicClient, router, quoter);
            }
            throw new Error(`Swap router ${router} answers neither as the devnet venue nor as SwapRouter02.`);
        })();
        pending.catch(() => VENUE_CACHE.delete(key)); // a failed probe is retried next time
        VENUE_CACHE.set(key, pending);
    }
    return pending;
}

/** Test-only — forget probed venues. */
export function _resetSwapVenueCache_TESTING_ONLY(): void {
    VENUE_CACHE.clear();
}
