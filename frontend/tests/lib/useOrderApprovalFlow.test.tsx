import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    approveAmount: vi.fn(),
    isApprovalSatisfied: vi.fn(),
    signPermitWithFallback: vi.fn(),
    useTokenApproval: vi.fn(),
}));

vi.mock("@/hooks/core/useTokenApproval", () => ({
    default: mocks.useTokenApproval,
}));

vi.mock("@/lib/core/orderApproval", () => ({
    approveAmount: mocks.approveAmount,
    isApprovalSatisfied: mocks.isApprovalSatisfied,
    signPermitWithFallback: mocks.signPermitWithFallback,
}));

import { useOrderApprovalFlow } from "@/lib/core/useOrderApprovalFlow";

describe("useOrderApprovalFlow", () => {
    beforeEach(() => {
        mocks.approveAmount.mockReset();
        mocks.isApprovalSatisfied.mockReset();
        mocks.signPermitWithFallback.mockReset();
        mocks.useTokenApproval.mockReset();

        mocks.useTokenApproval.mockReturnValue({
            approve: vi.fn(),
            refetchAllowance: vi.fn(),
            signPermitForTx: vi.fn(),
            needsApproval: vi.fn(),
            supportsPermit: true,
        });
        mocks.isApprovalSatisfied.mockReturnValue(false);
        mocks.approveAmount.mockResolvedValue("chain");
        mocks.signPermitWithFallback.mockResolvedValue(undefined);
    });

    it("delegates approval satisfaction through the shared helper", () => {
        mocks.isApprovalSatisfied.mockReturnValue(true);

        const { result } = renderHook(() => useOrderApprovalFlow({
            tokenAddress: "0x0000000000000000000000000000000000000001",
            owner: "0x0000000000000000000000000000000000000002",
            spender: "0x0000000000000000000000000000000000000003",
            amount: 15n,
            currency: "0x0000000000000000000000000000000000000001",
            hasPermit: true,
            onPermitSigned: vi.fn(),
        }));

        expect(result.current.approved).toBe(true);
        expect(mocks.isApprovalSatisfied).toHaveBeenCalledWith(expect.objectContaining({
            amount: 15n,
            currency: "0x0000000000000000000000000000000000000001",
            hasPermit: true,
            mockApproved: false,
        }));
    });

    it("marks mock approvals locally when the shared approve helper returns mock mode", async () => {
        mocks.approveAmount.mockResolvedValue("mock");
        const onPermitSigned = vi.fn();

        const { result } = renderHook(() => useOrderApprovalFlow({
            tokenAddress: "0x0000000000000000000000000000000000000001",
            owner: "0x0000000000000000000000000000000000000002",
            spender: "0x0000000000000000000000000000000000000003",
            amount: 9n,
            currency: "0x0000000000000000000000000000000000000001",
            onPermitSigned,
        }));

        await act(async () => {
            await result.current.approveBond();
        });

        expect(mocks.approveAmount).toHaveBeenCalledWith(expect.objectContaining({
            amount: 9n,
            currency: "0x0000000000000000000000000000000000000001",
        }));
        expect(result.current.mockApproved).toBe(true);

        act(() => {
            result.current.resetApprovalState();
        });

        expect(result.current.mockApproved).toBe(false);
    });

    it("routes permit signing through the shared fallback helper", async () => {
        const onPermitSigned = vi.fn();

        const { result } = renderHook(() => useOrderApprovalFlow({
            tokenAddress: "0x0000000000000000000000000000000000000001",
            owner: "0x0000000000000000000000000000000000000002",
            spender: "0x0000000000000000000000000000000000000003",
            amount: 21n,
            currency: "0x0000000000000000000000000000000000000001",
            onPermitSigned,
        }));

        await act(async () => {
            await result.current.signPermitForBond();
        });

        expect(mocks.signPermitWithFallback).toHaveBeenCalledWith(expect.objectContaining({
            amount: 21n,
            onPermitSigned,
            onFallbackApprove: expect.any(Function),
        }));
    });
});
