/**
 * lib/composition/swapFunding.ts — build a swap-funded bond leg (buyer OR
 * seller) and read the venue rate the checkout converts prices at.
 *
 * A party holds a token that is not the process denomination; the
 * WitnessSwapAndCommitCoordinator swaps it at commit time (the buyer's leg at
 * commit, the seller's leg at accept — the same atomic call) and the kernel
 * pulls the bond as always: swap-and-commit is the ON-RAMP into the process
 * denomination, never the order's denomination itself. This module quotes the
 * venue, builds the exact swap route, and produces the witness-signed
 * `SwapFundingLeg` that rides the `CommitmentPayload` to whoever broadcasts
 * (`@figaro/sdk` owns the leg type and the Permit2 witness typed data; the
 * route is bound into the signing party's signature, so the relayer is
 * untrusted by construction).
 *
 * Route building is inherently VENUE-specific: this is the devnet venue
 * (`MockUniversalRouter` — `swap(tokenIn, tokenOut, amountIn, recipient)` at a
 * settable rate). A production venue (the Uniswap Universal Router) plugs in
 * as a sibling route builder against the same coordinator surface — growth is
 * parallel venues/coordinators, never a clause.
 */
import { encodeFunctionData, parseAbi, type PublicClient } from "viem";
import {
    buildSwapWitnessTypedData,
    type Hex,
    type SwapFundingLeg,
} from "@figaro/sdk";
import {
    getPermit2,
    getSwapRouter,
    getWitnessSwapAndCommitCoordinator,
} from "@/lib/composition/contracts";

/** The devnet swap venue's surface (MockUniversalRouter). */
const SWAP_VENUE_ABI = parseAbi([
    "function swap(address tokenIn, address tokenOut, uint256 amountIn, address recipient) returns (uint256)",
    "function rateNumerator() view returns (uint256)",
    "function rateDenominator() view returns (uint256)",
]);

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

/** The venue's live rate (amountOut = amountIn·num/den). */
export interface VenueRate {
    num: bigint;
    den: bigint;
}

/** Read the devnet venue's live rate. Throws on a zero numerator (a venue
 *  that yields nothing can neither fund a bond nor quote a price). */
export async function readVenueRate(
    publicClient: PublicClient,
    router: `0x${string}`,
): Promise<VenueRate> {
    const [num, den] = await Promise.all([
        publicClient.readContract({ address: router, abi: SWAP_VENUE_ABI, functionName: "rateNumerator" }),
        publicClient.readContract({ address: router, abi: SWAP_VENUE_ABI, functionName: "rateDenominator" }),
    ]);
    if (num === 0n) throw new Error("Swap venue rate is zero — cannot fund or quote through it.");
    return { num, den };
}

/** Input amount the venue needs to yield at least `amountOut` of the target
 *  token (amountOut = in·num/den ⇒ in = ceil(out·den/num)). This is ALSO the
 *  checkout's price conversion, default → picked payment token: the converted
 *  price is the amount of the picked token that swaps into the default-quoted
 *  amount, so a seller quoting in their default is made whole in it. */
export function inputForOutput(amountOut: bigint, rate: VenueRate): bigint {
    return (amountOut * rate.den + rate.num - 1n) / rate.num;
}

/** Input amount the venue needs to yield at least `bondAmount` of the bond
 *  currency, from the live rate. */
async function quoteInputForBond(
    publicClient: PublicClient,
    router: `0x${string}`,
    bondAmount: bigint,
): Promise<bigint> {
    return inputForOutput(bondAmount, await readVenueRate(publicClient, router));
}

/** A never-used unordered Permit2 nonce: 256 bits of client randomness. */
function randomPermitNonce(): bigint {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return BigInt(
        `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`,
    );
}

export interface QuoteFundingLegArgs {
    publicClient: PublicClient;
    chainId: number;
    /** The token the party funds from. */
    inputToken: Hex;
    /** The process denomination the swap must yield. */
    currency: Hex;
    /** The signing party's bond for this order (the kernel pull: 2·payment
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
    const maxInput = await quoteInputForBond(args.publicClient, contracts.router, args.bondAmount);
    // The exact route the witness binds: input → the process denomination,
    // proceeds to the coordinator (it forwards them to the funded party
    // before the kernel pull).
    const swapData = encodeFunctionData({
        abi: SWAP_VENUE_ABI,
        functionName: "swap",
        args: [args.inputToken, args.currency, maxInput, contracts.coordinator],
    });
    return {
        inputToken: args.inputToken,
        currency: args.currency,
        router: contracts.router,
        maxInput,
        nonce: randomPermitNonce(),
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
