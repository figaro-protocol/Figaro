import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    mockApprove: undefined as ((currency: string, amount: string) => Promise<void>) | undefined,
    allowances: {} as Record<string, string>,
}));

vi.mock("@/lib/core/testHelpers", () => ({
    TEST_HELPERS_ENABLED: true,
    windowSafe: () => ({
        __FIGARO_ALLOWANCES__: mocks.allowances,
    }),
    getMockFn: (name: string) => name === "__FIGARO_MOCK_APPROVE__" ? mocks.mockApprove : undefined,
}));

import { approveAmount, clearTestHelperAllowance, getTestHelperAllowance, isApprovalSatisfied, signPermitWithFallback } from "@/lib/core/orderApproval";

describe("orderApproval", () => {
    beforeEach(() => {
        mocks.mockApprove = undefined;
        mocks.allowances = {};
    });

    it("treats mock approvals, permits, and shim allowances as approved", () => {
        expect(isApprovalSatisfied({
            amount: 10n,
            currency: "0xabc",
            mockApproved: true,
            needsApproval: () => true,
        })).toBe(true);

        expect(isApprovalSatisfied({
            amount: 10n,
            currency: "0xabc",
            hasPermit: true,
            needsApproval: () => true,
        })).toBe(true);

        mocks.allowances["0xabc"] = "12";
        expect(isApprovalSatisfied({
            amount: 10n,
            currency: "0xabc",
            needsApproval: () => true,
        })).toBe(true);
        expect(getTestHelperAllowance("0xabc")).toBe(12n);
        clearTestHelperAllowance("0xabc");
        expect(getTestHelperAllowance("0xabc")).toBeNull();
    });

    it("uses the mock approve shim before on-chain approval", async () => {
        const approve = vi.fn(async () => undefined);
        const refetchAllowance = vi.fn(async () => undefined);
        mocks.mockApprove = vi.fn(async (_currency: string, _amount: string) => undefined);

        const mode = await approveAmount({
            amount: 15n,
            currency: "0xabc",
            approve,
            refetchAllowance,
        });

        expect(mode).toBe("mock");
        expect(mocks.mockApprove).toHaveBeenCalledWith("0xabc", "15");
        expect(refetchAllowance).toHaveBeenCalledTimes(1);
        expect(approve).not.toHaveBeenCalled();
    });

    it("falls back to approval when permit signing fails", async () => {
        const onPermitSigned = vi.fn();
        const onFallbackApprove = vi.fn(async () => undefined);

        await signPermitWithFallback({
            amount: 5n,
            signPermitForTx: vi.fn(async () => {
                throw new Error("rejected");
            }),
            onPermitSigned,
            onFallbackApprove,
        });

        expect(onPermitSigned).not.toHaveBeenCalled();
        expect(onFallbackApprove).toHaveBeenCalledTimes(1);
    });
});