import { beforeEach, describe, expect, it, vi } from "vitest";

// Point the composition-address resolvers at fixed devnet-shaped addresses.
vi.mock("@/lib/composition/contracts", () => ({
    getWitnessSwapAndCommitCoordinator: () => "0x" + "c0".repeat(20),
    getPermit2: () => "0x" + "a2".repeat(20),
    getSwapRouter: () => "0x" + "d0".repeat(20),
}));

import { quoteFundingLeg, signFundingLeg } from "@/lib/composition/swapFunding";

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

    beforeEach(() => vi.clearAllMocks());

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
        const leg = await signFundingLeg(quote, async (typedData) => {
            // The witness the wallet would sign must carry the quoted maxInput.
            signedMaxInput = (typedData.message as { permitted: { amount: bigint } }).permitted.amount;
            return ("0x" + "ab".repeat(65)) as `0x${string}`;
        });

        expect(signedMaxInput).toBe(quote.maxInput);       // signed == shown
        expect(leg.maxInput).toBe(quote.maxInput);
        expect(leg.permitNonce).toBe(quote.nonce);
        expect(leg.swapData).toBe(quote.swapData);
        expect(leg.enabled).toBe(true);
    });
});
