/**
 * lib/composition/swapFunding.ts — build a swap-funded bond leg (buyer OR
 * seller) and quote the plan conversion the checkout prices at.
 *
 * A party holds a token that is not the process denomination; the
 * WitnessSwapAndCommitCoordinator swaps it at commit time (the buyer's leg at
 * commit, the seller's leg at accept — the same atomic call) and FigaroCore
 * pulls the bond as always: swap-and-commit is the ON-RAMP into the process
 * denomination, never the order's denomination itself. This module quotes the
 * venue, builds the exact swap route, and produces the witness-signed
 * `SwapFundingLeg` that rides the `CommitmentPayload` to whoever broadcasts
 * (`@figaro-protocol/sdk` owns the leg type and the Permit2 witness typed data; the
 * route is bound into the signing party's signature, so the relayer is
 * untrusted by construction).
 *
 * Route building is inherently VENUE-specific and lives behind
 * `lib/composition/swapVenue.ts` (the devnet mock and Uniswap v3 through
 * SwapRouter02 as siblings, the venue DERIVED by probing the router). This
 * module owns what is venue-neutral: the quote → witness → leg choreography.
 */
import { parseAbi, type PublicClient } from "viem";
import {
    buildSwapWitnessTypedData,
    generateSalt,
    type Hex,
    type SwapFundingLeg,
} from "@figaro-protocol/sdk";
import {
    getPermit2,
    getSwapRouter,
    getWitnessSwapAndCommitCoordinator,
} from "@/lib/composition/contracts";
import { capWithSlippage, detectSwapVenue } from "@/lib/composition/swapVenue";

const ERC20_DECIMALS_ABI = parseAbi(["function decimals() view returns (uint8)"]);

/** All three composition addresses, or null if any is unconfigured —
 *  resolved-empty means the swap-funded path is unavailable. */
export function resolveSwapFundingContracts(): {
    coordinator: `0x${string}`;
    permit2: `0x${string}`;
    router: `0x${string}`;
} | null {
    const coordinator = getWitnessSwapAndCommitCoordinator();
    const permit2 = getPermit2();
    const router = getSwapRouter();
    if (!coordinator || !permit2 || !router) return null;
    return { coordinator, permit2, router };
}

/** A conversion rate (amountOut = amountIn·num/den). */
export interface VenueRate {
    num: bigint;
    den: bigint;
}

/** What converting into the process denomination needs, read from the
 *  seller's own declaration: nothing (the denomination IS the quote basis),
 *  a pool the seller declared for that token, or — no pool declared — no
 *  conversion at all. The code never picks a pool for the seller. */
export type ConversionNeed =
    | { kind: "none" }
    | { kind: "undeclared" }
    | { kind: "declared"; feeTier: number };

export function conversionNeed(
    acceptedTokens: ReadonlyArray<{ address: string; poolFeeTier?: number }> | undefined,
    currency: string | undefined,
    quoteBasis: string | undefined,
): ConversionNeed {
    if (!currency || !quoteBasis || currency.toLowerCase() === quoteBasis.toLowerCase()) return { kind: "none" };
    const entry = (acceptedTokens ?? []).find((t) => t.address.toLowerCase() === currency.toLowerCase());
    return entry?.poolFeeTier === undefined ? { kind: "undeclared" } : { kind: "declared", feeTier: entry.poolFeeTier };
}

/** One seller's part of a plan, in that seller's OWN quote basis (its
 *  catalog's `defaultTokenAddress`): the lead's cart, a bound contributor's
 *  sub-order, a manual pick. */
export interface SellerPlanPart {
    seller: string;
    basisAmount: bigint;
}

/** One seller's conversion into the process denomination: its quote basis,
 *  what its OWN declaration says converting into the denomination needs, and
 *  its whole part of the plan in that basis (the amount its pool is quoted
 *  for). */
export interface SellerConversion {
    seller: `0x${string}`;
    quoteBasis: `0x${string}` | undefined;
    need: ConversionNeed;
    basisTotal: bigint;
}

/** Per seller, never per plan: each seller's prices convert through the pool
 *  THAT seller declared for the denomination, so a contributor's catalog is
 *  never converted on the lead's pool. One entry per distinct seller, in the
 *  order the parts first name it; a seller's parts sum into its total. A
 *  seller whose own accepted set declares no pool for the denomination is
 *  `undeclared` — not convertible — whatever any other seller declared. */
export function sellerConversions(
    catalogs: ReadonlyArray<{
        address: string;
        defaultTokenAddress?: string;
        acceptedTokens?: ReadonlyArray<{ address: string; poolFeeTier?: number }>;
    }>,
    currency: string | undefined,
    parts: ReadonlyArray<SellerPlanPart>,
): SellerConversion[] {
    const bySeller = new Map<string, SellerConversion>();
    for (const part of parts) {
        const key = part.seller.toLowerCase();
        const known = bySeller.get(key);
        if (known) {
            known.basisTotal += part.basisAmount;
            continue;
        }
        const catalog = catalogs.find((c) => c.address.toLowerCase() === key);
        const quoteBasis = catalog?.defaultTokenAddress as `0x${string}` | undefined;
        bySeller.set(key, {
            seller: key as `0x${string}`,
            quoteBasis,
            need: conversionNeed(catalog?.acceptedTokens, currency, quoteBasis),
            basisTotal: part.basisAmount,
        });
    }
    return [...bySeller.values()];
}

/** The plan's total quoted on the seller's declared pool. `rate` converts any
 *  quote-basis figure parsed at the denomination's decimals (how the checkout
 *  parses catalog prices) into the denomination: `inputForOutput(planBasis,
 *  rate)` is exactly `amountIn`, so the plan's total converts to the quote
 *  itself and every part of it at the same effective rate. */
export interface PlanConversion {
    rate: VenueRate;
    feeTier: number;
    /** The plan's total in the quote basis, in the basis token's own units —
     *  the exact output the quote is for. */
    basisTotal: bigint;
    basisDecimals: number;
    /** Input of the denomination the declared pool needs to yield `basisTotal`. */
    amountIn: bigint;
}

/** Quote the plan's ACTUAL total exact-output on the pool the seller declared
 *  for the denomination (`tokenIn`) into its quote basis (`tokenOut`).
 *  `planBasis` is the total as the checkout computes it — quote-basis prices
 *  parsed at `tokenInDecimals` — and is rescaled to the basis token's own
 *  decimals (rounded up, so the quote never falls short of the seller's
 *  price). Throws when the declared pool cannot quote the amount. */
export async function quotePlanConversion(
    publicClient: PublicClient,
    router: `0x${string}`,
    args: { tokenIn: Hex; tokenOut: Hex; feeTier: number; planBasis: bigint; tokenInDecimals: number },
): Promise<PlanConversion> {
    if (args.planBasis <= 0n) throw new Error("Nothing to quote — the plan's total is zero.");
    const venue = await detectSwapVenue(publicClient, router);
    const basisDecimals = Number(await publicClient.readContract({ address: args.tokenOut, abi: ERC20_DECIMALS_ABI, functionName: "decimals" }));
    const up = 10n ** BigInt(basisDecimals);
    const down = 10n ** BigInt(args.tokenInDecimals);
    const basisTotal = (args.planBasis * up + down - 1n) / down;
    const { amountIn } = await venue.quote(args.tokenIn, args.tokenOut, basisTotal, args.feeTier);
    if (amountIn === 0n) throw new Error("The declared pool quotes zero input — it cannot price this plan.");
    return { rate: { num: args.planBasis, den: amountIn }, feeTier: args.feeTier, basisTotal, basisDecimals, amountIn };
}

/** The effective rate a plan conversion commits at: the denomination's base
 *  units one whole quote-basis unit costs (rounded down — a display figure;
 *  the committed amounts come from `rate`). */
export function effectiveUnitCost(conversion: PlanConversion): bigint {
    return (conversion.amountIn * 10n ** BigInt(conversion.basisDecimals)) / conversion.basisTotal;
}

/** A fee tier as a percentage (hundredths of a basis point → "0.30%"). */
export function formatFeeTier(feeTier: number): string {
    return `${(feeTier / 10_000).toFixed(2)}%`;
}

/** Input amount the venue needs to yield at least `amountOut` of the target
 *  token (amountOut = in·num/den ⇒ in = ceil(out·den/num)). This is ALSO the
 *  checkout's price conversion, default → picked payment token, at a
 *  `PlanConversion`'s rate: the converted price is the share of the plan's
 *  quoted input that swaps into the default-quoted amount, rounded up, so a
 *  seller quoting in their default is made whole in it. */
export function inputForOutput(amountOut: bigint, rate: VenueRate): bigint {
    return (amountOut * rate.den + rate.num - 1n) / rate.num;
}


export interface QuoteFundingLegArgs {
    publicClient: PublicClient;
    chainId: number;
    /** The token the party swaps from. */
    inputToken: Hex;
    /** The process denomination the swap must yield. */
    currency: Hex;
    /** The signing party's bond for this order (FigaroCore pull: 2·payment
     *  for the buyer, 2·expectedCumulativeValue for the seller). */
    bondAmount: bigint;
    /** Signature window — the order's own deadline. */
    deadline: bigint;
}

/** Everything about a swap-funded leg EXCEPT the party's witness signature —
 *  the quote surfaced to the confirm gate before the wallet opens. `maxInput`
 *  is the cap the party is about to authorize (the Permit2 `permitted.amount`),
 *  so it is the figure a Figaro-side review must show. */
export interface FundingQuote {
    inputToken: Hex;
    currency: Hex;
    router: Hex;
    maxInput: bigint;
    nonce: bigint;
    deadline: bigint;
    chainId: number;
    permit2: Hex;
    coordinator: Hex;
    swapData: Hex;
}

/** Quote the venue and build the exact route — NO signature yet. This is the
 *  half whose `maxInput` the confirm gate surfaces; `signFundingLeg` binds the
 *  SAME quote, so what the party reviews is exactly what they witness-sign.
 *  Throws when the composition addresses are unconfigured. */
export async function quoteFundingLeg(
    args: QuoteFundingLegArgs,
): Promise<FundingQuote> {
    const contracts = resolveSwapFundingContracts();
    if (!contracts) {
        throw new Error(
            "Swap funding is not available: coordinator, Permit2, or venue address is unconfigured.",
        );
    }
    // The venue quotes the exact bond as output; the cap the party signs is
    // that quote plus the venue's headroom (0 on the fixed-rate mock). The
    // exact route the witness binds: input → the process denomination,
    // proceeds to the coordinator (it forwards them to the funded party
    // before FigaroCore pull, and refunds any input the swap did not spend).
    const venue = await detectSwapVenue(args.publicClient, contracts.router);
    const quote = await venue.quote(args.inputToken, args.currency, args.bondAmount);
    const maxInput = capWithSlippage(quote.amountIn, venue.slippageBps);
    const swapData = quote.route(maxInput, contracts.coordinator);
    return {
        inputToken: args.inputToken,
        currency: args.currency,
        router: contracts.router,
        maxInput,
        // A never-used unordered Permit2 nonce: 256 bits of client
        // randomness — the SDK's salt generator, which is the same draw.
        nonce: generateSalt(),
        deadline: args.deadline,
        chainId: args.chainId,
        permit2: contracts.permit2,
        coordinator: contracts.coordinator,
        swapData,
    };
}

/** Witness-sign a previously quoted leg. The signature binds the quote's exact
 *  route + `maxInput`, so the relayer is untrusted by construction and the
 *  party signs precisely what the confirm gate showed. */
export async function signFundingLeg(
    quote: FundingQuote,
    signTypedData: (typedData: ReturnType<typeof buildSwapWitnessTypedData>) => Promise<Hex>,
): Promise<SwapFundingLeg> {
    const permitSignature = await signTypedData(
        buildSwapWitnessTypedData({
            chainId: quote.chainId,
            permit2: quote.permit2,
            coordinator: quote.coordinator,
            router: quote.router,
            inputToken: quote.inputToken,
            maxInput: quote.maxInput,
            nonce: quote.nonce,
            deadline: quote.deadline,
            swapData: quote.swapData,
        }),
    );
    return {
        enabled: true,
        inputToken: quote.inputToken,
        maxInput: quote.maxInput,
        permitNonce: quote.nonce,
        permitDeadline: quote.deadline,
        permitSignature,
        swapData: quote.swapData,
    };
}
