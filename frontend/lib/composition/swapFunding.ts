/**
 * lib/composition/swapFunding.ts — build the buyer's swap-funded bond leg.
 *
 * The buyer holds an accepted token that is not the process bond currency;
 * the WitnessSwapAndCommitCoordinator swaps it at commit time and the kernel
 * pulls the bond as always. This module quotes the venue, builds the exact
 * swap route, and produces the witness-signed `SwapFundingLeg` that rides the
 * `CommitmentPayload` to whoever broadcasts (`@figaro/sdk` owns the leg type
 * and the Permit2 witness typed data; the route is bound into the buyer's
 * signature, so the relayer is untrusted by construction).
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

/** Input amount the venue needs to yield at least `bondAmount` of the bond
 *  currency, from the devnet venue's live rate (amountOut = in·num/den ⇒
 *  in = ceil(out·den/num)). */
async function quoteInputForBond(
    publicClient: PublicClient,
    router: `0x${string}`,
    bondAmount: bigint,
): Promise<bigint> {
    const [num, den] = await Promise.all([
        publicClient.readContract({ address: router, abi: SWAP_VENUE_ABI, functionName: "rateNumerator" }),
        publicClient.readContract({ address: router, abi: SWAP_VENUE_ABI, functionName: "rateDenominator" }),
    ]);
    if (num === 0n) throw new Error("Swap venue rate is zero — cannot fund the bond by swap.");
    return (bondAmount * den + num - 1n) / num;
}

/** A never-used unordered Permit2 nonce: 256 bits of client randomness. */
function randomPermitNonce(): bigint {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return BigInt(
        `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`,
    );
}

export interface BuildBuyerFundingLegArgs {
    publicClient: PublicClient;
    chainId: number;
    /** The accepted token the buyer funds from. */
    inputToken: Hex;
    /** The process bond currency the swap must yield. */
    currency: Hex;
    /** The buyer's bond for this order (2·payment — the kernel pull). */
    bondAmount: bigint;
    /** Signature window — the order's own deadline. */
    deadline: bigint;
    /** The wallet's typed-data signer (wagmi `signTypedDataAsync`). */
    signTypedData: (typedData: ReturnType<typeof buildSwapWitnessTypedData>) => Promise<Hex>;
}

/** Quote the venue, build the exact route, and witness-sign it: one
 *  swap-funded bond leg, ready to ride the payload. Throws when the
 *  composition addresses are unconfigured. */
export async function buildBuyerFundingLeg(args: BuildBuyerFundingLegArgs): Promise<SwapFundingLeg> {
    const contracts = resolveSwapFundingContracts();
    if (!contracts) {
        throw new Error(
            "Swap-funded checkout is not available: coordinator, Permit2, or venue address is unconfigured.",
        );
    }
    const maxInput = await quoteInputForBond(args.publicClient, contracts.router, args.bondAmount);
    // The exact route the witness binds: input → bond currency, proceeds to
    // the coordinator (it forwards them to the buyer before the kernel pull).
    const swapData = encodeFunctionData({
        abi: SWAP_VENUE_ABI,
        functionName: "swap",
        args: [args.inputToken, args.currency, maxInput, contracts.coordinator],
    });
    const nonce = randomPermitNonce();
    const permitSignature = await args.signTypedData(
        buildSwapWitnessTypedData({
            chainId: args.chainId,
            permit2: contracts.permit2,
            coordinator: contracts.coordinator,
            router: contracts.router,
            inputToken: args.inputToken,
            maxInput,
            nonce,
            deadline: args.deadline,
            swapData,
        }),
    );
    return {
        enabled: true,
        inputToken: args.inputToken,
        maxInput,
        permitNonce: nonce,
        permitDeadline: args.deadline,
        permitSignature,
        swapData,
    };
}
