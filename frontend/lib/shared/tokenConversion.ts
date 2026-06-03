/**
 * lib/shared/tokenConversion.ts
 *
 * Token conversion service — converts a source-token amount into the
 * equivalent destination-token amount at the current rate.
 *
 * Used at two points in the buyer flow:
 *   1. Display: the catalogue is denominated in the seller's profile
 *      `defaultTokenAddress`. The buyer's frontend converts to whatever
 *      accepted token the buyer chose to pay in, so the displayed price
 *      reflects what they will actually commit.
 *   2. Commit: at signing time, the buyer's frontend re-quotes (under
 *      the buyer's chosen slippage tolerance) and the kernel commitment
 *      records the chosen-token amount.
 *
 * Pluggable per the runtime-services pattern. The protocol does not pick
 * a quoter; the buyer's frontend (or the assembly's service binding)
 * registers whichever provider it wants. Default in this module is the
 * identity quoter — same-address → 1:1, otherwise null. Production
 * environments register a Uniswap V3 quoter (or any other provider) for
 * the active chain.
 *
 * Two implementations are shipped here:
 *   - `createUniswapV3Quoter` — calls Uniswap V3's `QuoterV2` via viem.
 *   - `createFixedRateQuoter` — table-driven; useful for devnet, tests,
 *     or any environment where on-chain liquidity is not available.
 */

import type { PublicClient } from "viem";
import { hexEqual } from "@/lib/shared/evm";

// ── Public types ─────────────────────────────────────────────────────────────

interface TokenConversionQuoteRequest {
    fromTokenAddress: `0x${string}`;
    toTokenAddress: `0x${string}`;
    /** Amount in `fromTokenAddress`'s smallest unit. */
    amountIn: bigint;
}

export interface TokenConversionQuote {
    fromTokenAddress: `0x${string}`;
    toTokenAddress: `0x${string}`;
    amountIn: bigint;
    /** Equivalent amount in `toTokenAddress`'s smallest unit at the current rate. */
    amountOut: bigint;
    /** Block at which the quote was computed (when available). */
    blockNumber?: bigint;
    /** Identifier of the quote source (e.g. "uniswap-v3-fee-3000", "fixed-rate", "identity"). */
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

// ── Uniswap V3 QuoterV2 implementation ───────────────────────────────────────

const QUOTER_V2_ABI = [
    {
        inputs: [
            {
                components: [
                    { internalType: "address", name: "tokenIn", type: "address" },
                    { internalType: "address", name: "tokenOut", type: "address" },
                    { internalType: "uint256", name: "amountIn", type: "uint256" },
                    { internalType: "uint24", name: "fee", type: "uint24" },
                    { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
                ],
                internalType: "struct IQuoterV2.QuoteExactInputSingleParams",
                name: "params",
                type: "tuple",
            },
        ],
        name: "quoteExactInputSingle",
        outputs: [
            { internalType: "uint256", name: "amountOut", type: "uint256" },
            { internalType: "uint160", name: "sqrtPriceX96After", type: "uint160" },
            { internalType: "uint32", name: "initializedTicksCrossed", type: "uint32" },
            { internalType: "uint256", name: "gasEstimate", type: "uint256" },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
] as const;

/**
 * Uniswap V3 fee tier in hundredths-of-a-bip (1e-6). The V3 contracts
 * support 100, 500, 3000, 10000. The conventional defaults for stable
 * pairs / mid-volatility / exotic pairs are 100/500, 3000, 10000.
 */
type UniswapV3FeeTier = 100 | 500 | 3000 | 10000;

export interface UniswapV3QuoterConfig {
    /** Viem public client connected to the chain whose Uniswap deployment is used. */
    publicClient: PublicClient;
    /** Address of the QuoterV2 deployment on the active chain. */
    quoterAddress: `0x${string}`;
    /**
     * Fee tier(s) to attempt. When multiple tiers are listed, the quoter
     * tries them in order and returns the first one that produces a
     * non-zero quote. Defaults to [500, 3000, 10000] if not specified.
     */
    feeTiers?: UniswapV3FeeTier[];
}

const DEFAULT_FEE_TIER_ATTEMPTS: UniswapV3FeeTier[] = [500, 3000, 10000];

/**
 * Build a `TokenConversionService` backed by Uniswap V3's QuoterV2.
 *
 * Tries each configured fee tier in order; returns the first one with a
 * non-zero quote. Returns null if no tier responds with liquidity.
 */
export function createUniswapV3Quoter(config: UniswapV3QuoterConfig): TokenConversionService {
    const tiers = config.feeTiers && config.feeTiers.length > 0
        ? config.feeTiers
        : DEFAULT_FEE_TIER_ATTEMPTS;

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

            for (const fee of tiers) {
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
                    if (amountOut > 0n) {
                        return {
                            fromTokenAddress: request.fromTokenAddress,
                            toTokenAddress: request.toTokenAddress,
                            amountIn: request.amountIn,
                            amountOut,
                            source: `uniswap-v3-fee-${fee}`,
                        };
                    }
                } catch {
                    // Pool does not exist at this fee tier — try the next one.
                    continue;
                }
            }

            return null;
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
