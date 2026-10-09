/**
 * lib/composition/swapFunding.ts — build the funding leg of a bond (buyer OR
 * seller), and quote a listed price in the process denomination for the
 * buyer to read.
 *
 * A party holds a token that is not the process denomination; the
 * WitnessSwapAndCommitCoordinator swaps it at commit time (the buyer's leg at
 * commit, the seller's leg at accept — the same atomic call) and FigaroCore
 * pulls the bond as always: the funding leg is the party's own act, never a
 * term of the order and never its denomination. This module quotes the
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
import { parseAbi, parseUnits, type PublicClient } from "viem";
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
import { capWithSlippage, detectSwapVenue, type SwapVenue } from "@/lib/composition/swapVenue";

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

/** A listed price stated in the process denomination: the input of the
 *  denomination the venue quotes for exactly the listed amount of the token
 *  the seller lists in. It is a figure the buyer reads and may change; the
 *  amount the parties sign is the buyer's, never this quote's. */
export interface ListedPriceTranslation {
    /** The listed amount, in the listed token's own units. */
    listedAmount: bigint;
    /** The denomination the venue quotes for it, in the denomination's units. */
    amount: bigint;
    /** Where the quote comes from. */
    source: { venue: SwapVenue["kind"]; router: Hex };
}

/** Quote one listed price in the denomination: `listedPrice` is the catalog's
 *  human decimal in `listedToken` (the seller's default), parsed at that
 *  token's own decimals; the venue quotes the `denomination` input that
 *  yields exactly that amount. Throws when the venue cannot quote the pair. */
export async function translateListedPrice(
    publicClient: PublicClient,
    router: Hex,
    args: { denomination: Hex; listedToken: Hex; listedPrice: string },
): Promise<ListedPriceTranslation> {
    const venue = await detectSwapVenue(publicClient, router);
    const listedDecimals = Number(await publicClient.readContract({ address: args.listedToken, abi: ERC20_DECIMALS_ABI, functionName: "decimals" }));
    const listedAmount = parseUnits(args.listedPrice || "0", listedDecimals);
    if (listedAmount === 0n) return { listedAmount, amount: 0n, source: { venue: venue.kind, router } };
    const { amountIn } = await venue.quote(args.denomination, args.listedToken, listedAmount);
    return { listedAmount, amount: amountIn, source: { venue: venue.kind, router } };
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
