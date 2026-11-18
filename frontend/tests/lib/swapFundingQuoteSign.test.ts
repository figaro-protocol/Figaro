import { beforeEach, describe, expect, it, vi } from "vitest";

// Point the composition-address resolvers at fixed devnet-shaped addresses.
vi.mock("@/lib/composition/contracts", () => ({
    getWitnessSwapAndCommitCoordinator: () => "0x" + "c0".repeat(20),
    getPermit2: () => "0x" + "a2".repeat(20),
    getSwapRouter: () => "0x" + "d0".repeat(20),
}));

import { decodeFunctionData, parseAbi } from "viem";
import { hashCommitmentStruct, type Commitment } from "@figaro-protocol/sdk";
import { quoteFundingLeg, signFundingLeg } from "@/lib/composition/swapFunding";
import { _resetSwapVenueCache_TESTING_ONLY } from "@/lib/composition/swapVenue";

/** The one commitment a signed leg funds, in the buyer's place. */
const COMMITMENT: Commitment = {
    processId: `0x${"00".repeat(32)}`,
    buyer: `0x${"0b".repeat(20)}`,
    seller: `0x${"05".repeat(20)}`,
    token: `0x${"22".repeat(20)}`,
    payment: 2500n,
    runningTotal: 2500n,
    checkoutHash: `0x${"c4".repeat(32)}`,
    salt: 1n,
    commitDeadline: 9_999_999_999n,
};
const BINDING = { commitment: COMMITMENT, role: "buyer" as const };

/**
 * Item 1 — Permit2 swap-leg confirmation. The confirm gate shows the quote's
 * maxInput BEFORE the wallet opens; signFundingLeg must bind that SAME quote,
 * so what the party reviewed is exactly what they witness-sign (shown == signed).
 */
describe("quoteFundingLeg → signFundingLeg (item 1)", () => {
    const publicClient = {
        // Venue rate 1:1 (num == den) so maxInput == bondAmount.
        readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
            functionName === "rateNumerator" ? 1n : 1n,
        ),
    } as never;

    beforeEach(() => { vi.clearAllMocks(); _resetSwapVenueCache_TESTING_ONLY(); });

    it("signs the exact quote it produced — maxInput/nonce/swapData match", async () => {
        const quote = await quoteFundingLeg({
            publicClient,
            chainId: 31337,
            inputToken: ("0x" + "11".repeat(20)) as `0x${string}`,
            currency: ("0x" + "22".repeat(20)) as `0x${string}`,
            bondAmount: 5000n,
            deadline: 9_999_999_999n,
        });
        expect(quote.maxInput).toBe(5000n); // 1:1 rate

        let signedMaxInput: bigint | null = null;
        let witness: { commitmentHash: string; role: number } | null = null;
        const leg = await signFundingLeg(quote, BINDING, async (typedData) => {
            // The witness the wallet would sign must carry the quoted maxInput.
            signedMaxInput = (typedData.message as { permitted: { amount: bigint } }).permitted.amount;
            witness = typedData.message.witness;
            return ("0x" + "ab".repeat(65)) as `0x${string}`;
        });

        expect(signedMaxInput).toBe(quote.maxInput);       // signed == shown
        // The leg is bound to the one commitment it funds, in the buyer's place.
        expect(witness).toMatchObject({ commitmentHash: hashCommitmentStruct(COMMITMENT), role: 0 });
        expect(leg.maxInput).toBe(quote.maxInput);
        expect(leg.permitNonce).toBe(quote.nonce);
        expect(leg.swapData).toBe(quote.swapData);
        expect(leg.enabled).toBe(true);
    });

    const leg = {
        chainId: 31337,
        inputToken: ("0x" + "11".repeat(20)) as `0x${string}`,
        currency: ("0x" + "22".repeat(20)) as `0x${string}`,
        bondAmount: 5000n,
        deadline: 9_999_999_999n,
    };
    const MOCK_SWAP = parseAbi(["function swap(address tokenIn, address tokenOut, uint256 amountIn, address recipient) returns (uint256)"]);

    it("with no margin chosen, the cap carries the venue's own margin (0 on the devnet venue) and the quote says so", async () => {
        const quote = await quoteFundingLeg({ publicClient, ...leg });
        expect(quote.slippageBps).toBe(0);
        expect(quote.maxInput).toBe(5000n);
    });

    it("the party's chosen margin sets the cap, the rebuilt route, and the witness the party signs", async () => {
        const quote = await quoteFundingLeg({ publicClient, ...leg, slippageBps: 250 });
        expect(quote.slippageBps).toBe(250);
        expect(quote.maxInput).toBe(5125n); // 5000 + 2.5%
        // The route the witness binds spends the same cap.
        const { args } = decodeFunctionData({ abi: MOCK_SWAP, data: quote.swapData });
        expect(args[2]).toBe(5125n);

        let signed: { permitted: { amount: bigint }; witness: { swapDataHash?: unknown } } | null = null;
        const signedLeg = await signFundingLeg(quote, BINDING, async (typedData) => {
            signed = typedData.message as never;
            return ("0x" + "ab".repeat(65)) as `0x${string}`;
        });
        expect(signed!.permitted.amount).toBe(5125n);
        expect(signedLeg.maxInput).toBe(5125n);
        expect(signedLeg.swapData).toBe(quote.swapData);
    });

    it("refuses a margin below 0 or above the 10% cap, and builds no quote", async () => {
        await expect(quoteFundingLeg({ publicClient, ...leg, slippageBps: -1 })).rejects.toThrow(/out of range/);
        await expect(quoteFundingLeg({ publicClient, ...leg, slippageBps: 1_001 })).rejects.toThrow(/out of range/);
    });
});
