/**
 * lib/shared/tokenConversion.ts
 *
 * Token conversion service — converts a source-token amount into the
 * equivalent destination-token amount at the current rate.
 *
 * Used at two points in the buyer flow:
 *   1. Display: the catalog is denominated in the member's profile
 *      `defaultTokenAddress`. The buyer's frontend converts to whatever
 *      accepted token the buyer chose to pay in, so the displayed price
 *      reflects what they will actually commit.
 *   2. Commit: at signing time, the buyer's frontend re-quotes (under
 *      the buyer's chosen slippage tolerance) and FigaroCore commitment
 *      carries the chosen-token amount.
 *
 * Pluggable per the runtime-services pattern. The protocol does not pick
 * a quoter; the buyer's frontend (or the assembly's service binding)
 * registers whichever provider it wants. Default in this module is the
 * identity quoter — same-address → 1:1, otherwise null. Production
 * environments register a Uniswap V3 quoter (or any other provider) for
 * the active chain.
 *
 * Which pool a conversion runs through is the SELLER's declaration, never
 * the code's choice: the request carries `poolFeeTier`, read from the
 * seller's accepted-token entry for the token being converted
 * (`AcceptedTokenMetadata.poolFeeTier` — the same declaration the checkout's
 * `conversionNeed` reads). A pool-based quoter quotes that one pool; a
 * request with no declared pool is not convertible (null).
 *
 * Two implementations are shipped here:
 *   - `createUniswapV3Quoter` — calls Uniswap V3's `QuoterV2` via viem, on
 *     the declared pool alone.
 *   - `createFixedRateQuoter` — table-driven; useful for devnet, tests,
 *     or any environment where on-chain liquidity is not available.
 */

import type { PublicClient } from "viem";
import { QUOTER_V2_ABI, type AcceptedTokenMetadata } from "@figaro-protocol/sdk";
import { hexEqual } from "@/lib/shared/evm";

// ── Public types ─────────────────────────────────────────────────────────────

interface TokenConversionQuoteRequest {
    fromTokenAddress: `0x${string}`;
    toTokenAddress: `0x${string}`;
    /** Amount in `fromTokenAddress`'s smallest unit. */
    amountIn: bigint;
    /** The pool the seller declared for this conversion — the
     *  `poolFeeTier` of its accepted-token entry for the token being
     *  converted. Absent ⇒ the seller declared no pool: a pool-based quoter
     *  returns null rather than choose one. */
    poolFeeTier?: AcceptedTokenMetadata["poolFeeTier"];
}

export interface TokenConversionQuote {
    fromTokenAddress: `0x${string}`;
    toTokenAddress: `0x${string}`;
    amountIn: bigint;
    /** Equivalent amount in `toTokenAddress`'s smallest unit at the current rate. */
    amountOut: bigint;
    /** Block at which the quote was computed (when available). */
    blockNumber?: bigint;
    /** Identifier of the quote source (e.g. `uniswap-v3-fee-3000`, `fixed-rate`, `identity`). */
    source: string;
}

export interface TokenConversionService {
    quote(request: TokenConversionQuoteRequest): Promise<TokenConversionQuote | null>;
}

// ── Default identity quoter ──────────────────────────────────────────────────

/**
 * Default service: returns 1:1 when from == to, null otherwise. The
 * caller is expected to register a chain-specific provider for any
 * cross-token conversion path it wants to support.
 */
export const DEFAULT_TOKEN_CONVERSION_SERVICE: TokenConversionService = {
    async quote(request) {
        if (hexEqual(request.fromTokenAddress, request.toTokenAddress)) {
            return {
                fromTokenAddress: request.fromTokenAddress,
                toTokenAddress: request.toTokenAddress,
                amountIn: request.amountIn,
                amountOut: request.amountIn,
                source: "identity",
            };
        }
        return null;
    },
};

// ── Uniswap V3 QuoterV2 implementation (SDK canonical ABI) ───────────────────

export interface UniswapV3QuoterConfig {
    /** Viem public client connected to the chain whose Uniswap deployment is used. */
    publicClient: PublicClient;
    /** Address of the QuoterV2 deployment on the active chain. */
    quoterAddress: `0x${string}`;
}

/**
 * Build a `TokenConversionService` backed by Uniswap V3's QuoterV2.
 *
 * Quotes the request's declared pool (`poolFeeTier`) and no other. Returns
 * null when no pool is declared, or when the declared pool does not exist
 * or quotes zero — never a quote from a pool the seller did not name.
 */
export function createUniswapV3Quoter(config: UniswapV3QuoterConfig): TokenConversionService {
    return {
        async quote(request) {
            // Identity: skip the quoter entirely.
            if (hexEqual(request.fromTokenAddress, request.toTokenAddress)) {
                return {
                    fromTokenAddress: request.fromTokenAddress,
                    toTokenAddress: request.toTokenAddress,
                    amountIn: request.amountIn,
                    amountOut: request.amountIn,
                    source: "identity",
                };
            }

            // No declared pool ⇒ not convertible: the code names no pool.
            const fee = request.poolFeeTier;
            if (fee === undefined) return null;
            try {
                const result = await config.publicClient.simulateContract({
                    address: config.quoterAddress,
                    abi: QUOTER_V2_ABI,
                    functionName: "quoteExactInputSingle",
                    args: [
                        {
                            tokenIn: request.fromTokenAddress,
                            tokenOut: request.toTokenAddress,
                            amountIn: request.amountIn,
                            fee,
                            sqrtPriceLimitX96: 0n,
                        },
                    ],
                });

                const amountOut = (result.result as readonly [bigint, bigint, number, bigint])[0];
                if (amountOut === 0n) return null;
                return {
                    fromTokenAddress: request.fromTokenAddress,
                    toTokenAddress: request.toTokenAddress,
                    amountIn: request.amountIn,
                    amountOut,
                    source: `uniswap-v3-fee-${fee}`,
                };
            } catch {
                // The declared pool does not exist, or cannot quote this amount.
                return null;
            }
        },
    };
}

// ── Fixed-rate quoter (devnet, tests) ────────────────────────────────────────

/** Map: from-token-address → (to-token-address → rate as a decimal multiplier). */
export type FixedRateTable = Map<string, Map<string, number>>;

export interface FixedRateQuoterConfig {
    rates: FixedRateTable;
}

/**
 * Build a `TokenConversionService` backed by an in-memory rate table.
 *
 * Useful in dev environments where Uniswap is not deployed, in tests
 * where determinism matters, or in any environment where the seller
 * declares a manual rate table (e.g. a stable-pair desk that prices
 * its own tokens 1:1 against USDC).
 *
 * `amountOut = amountIn * rate`, scaled through fixed-point arithmetic
 * to preserve precision on bigints.
 */
export function createFixedRateQuoter(config: FixedRateQuoterConfig): TokenConversionService {
    return {
        async quote(request) {
            const fromKey = request.fromTokenAddress.toLowerCase();
            const toKey = request.toTokenAddress.toLowerCase();

            if (fromKey === toKey) {
                return {
                    fromTokenAddress: request.fromTokenAddress,
                    toTokenAddress: request.toTokenAddress,
                    amountIn: request.amountIn,
                    amountOut: request.amountIn,
                    source: "identity",
                };
            }

            const rate = config.rates.get(fromKey)?.get(toKey);
            if (rate === undefined || rate <= 0) {
                return null;
            }

            // Scale the rate to a bigint multiplier with 18 fractional digits,
            // then divide back. This keeps precision for typical token decimals
            // without losing the bigint codomain.
            const SCALE = 10n ** 18n;
            const scaledRate = BigInt(Math.round(rate * 1e18));
            const amountOut = (request.amountIn * scaledRate) / SCALE;

            return {
                fromTokenAddress: request.fromTokenAddress,
                toTokenAddress: request.toTokenAddress,
                amountIn: request.amountIn,
                amountOut,
                source: "fixed-rate",
            };
        },
    };
}

/**
 * Construct a fixed-rate table from a more readable nested object literal.
 * Both keys are lowercased so caller can pass mixed-case addresses.
 */
export function buildFixedRateTable(
    rates: Record<string, Record<string, number>>,
): FixedRateTable {
    const table: FixedRateTable = new Map();
    for (const [from, inner] of Object.entries(rates)) {
        const innerMap = new Map<string, number>();
        for (const [to, rate] of Object.entries(inner)) {
            innerMap.set(to.toLowerCase(), rate);
        }
        table.set(from.toLowerCase(), innerMap);
    }
    return table;
}

// ── Buyer-side helpers ───────────────────────────────────────────────────────

export interface BuyerSlippageTolerance {
    /** Tolerance as a fraction (e.g. 0.005 = 0.5%). */
    toleranceFraction: number;
}

/**
 * Apply a slippage floor: returns the minimum acceptable `amountOut` the
 * buyer is willing to receive given a quote. Use at commit time to gate
 * the on-chain commitment.
 */
export function applySlippageFloor(
    quote: TokenConversionQuote,
    slippage: BuyerSlippageTolerance,
): bigint {
    if (slippage.toleranceFraction < 0) {
        throw new Error("toleranceFraction must be non-negative");
    }
    if (slippage.toleranceFraction === 0) {
        return quote.amountOut;
    }
    // floor = amountOut * (1 - tolerance), implemented in 1e6 fixed point.
    const SCALE = 1_000_000n;
    const toleranceBP = BigInt(Math.round(slippage.toleranceFraction * 1_000_000));
    const remaining = SCALE - toleranceBP;
    if (remaining <= 0n) {
        return 0n;
    }
    return (quote.amountOut * remaining) / SCALE;
}
