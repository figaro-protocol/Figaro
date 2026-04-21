import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
    address: "0x1234567890123456789012345678901234567890" as `0x${string}` | undefined,
    balance: 0n as bigint | undefined,
    allowance: 0n as bigint | undefined,
    decimals: 18,
    needsApproval: vi.fn<(amount?: bigint) => boolean>(),
    approve: vi.fn(async (_amount: bigint) => undefined),
    onApprovalComplete: vi.fn(),
    onCancel: vi.fn(),
    isApprovePending: false,
    isApproveConfirming: false,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: mocks.address }),
    useReadContract: (options: { functionName?: string }) => {
        if (options.functionName === "balanceOf") {
            return { data: mocks.balance };
        }
        return { data: undefined };
    },
}));

vi.mock("@/hooks/core/useTokenApproval", () => ({
    __esModule: true,
    default: () => ({
        allowance: mocks.allowance,
        needsApproval: mocks.needsApproval,
        approve: mocks.approve,
        isApprovePending: mocks.isApprovePending,
        isApproveConfirming: mocks.isApproveConfirming,
    }),
}));

vi.mock("@/hooks/core/useTokenDecimals", () => ({
    __esModule: true,
    default: () => ({
        decimals: mocks.decimals,
        loading: false,
    }),
}));

import { TokenApprovalFlow } from "@/components/core/TokenApprovalFlow";

describe("TokenApprovalFlow", () => {
    beforeEach(() => {
        mocks.address = "0x1234567890123456789012345678901234567890";
        mocks.balance = 0n;
        mocks.allowance = 0n;
        mocks.decimals = 18;
        mocks.needsApproval.mockReset();
        mocks.approve.mockReset();
        mocks.onApprovalComplete.mockReset();
        mocks.onCancel.mockReset();
        mocks.isApprovePending = false;
        mocks.isApproveConfirming = false;
    });

    it("calls onApprovalComplete when allowance already covers the bond", async () => {
        mocks.balance = 500n;
        mocks.allowance = 250n;
        mocks.needsApproval.mockReturnValue(false);

        render(
            <TokenApprovalFlow
                tokenAddress={"0x2222222222222222222222222222222222222222"}
                requiredAmount={100n}
                onApprovalComplete={mocks.onApprovalComplete}
            />,
        );

        await waitFor(() => {
            expect(mocks.onApprovalComplete).toHaveBeenCalledTimes(1);
        });

        expect(screen.getByText(/Payment authorized/i)).toBeInTheDocument();
    });

    it("approves a buffered amount through the shared approval hook", async () => {
        const user = userEvent.setup();
        mocks.balance = 5000n;
        mocks.allowance = 0n;
        mocks.decimals = 2;
        mocks.needsApproval.mockReturnValue(true);

        render(
            <TokenApprovalFlow
                tokenAddress={"0x2222222222222222222222222222222222222222"}
                requiredAmount={100n}
                onApprovalComplete={mocks.onApprovalComplete}
                onCancel={mocks.onCancel}
            />,
        );

        expect(screen.getByText(/Deposit amount: 1/i)).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Authorize Payment" }));

        await waitFor(() => {
            expect(mocks.approve).toHaveBeenCalledWith(100n);
        });
    });

    it("shows insufficient-balance errors using token decimals", () => {
        mocks.balance = 50n;
        mocks.allowance = 0n;
        mocks.decimals = 2;
        mocks.needsApproval.mockReturnValue(true);

        render(
            <TokenApprovalFlow
                tokenAddress={"0x2222222222222222222222222222222222222222"}
                requiredAmount={100n}
                onApprovalComplete={mocks.onApprovalComplete}
            />,
        );

        expect(screen.getByText(/Insufficient funds/i)).toBeInTheDocument();
        expect(screen.getByText(/Required: 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Available: 0.5/i)).toBeInTheDocument();
    });

    it("surfaces short approval errors from the shared failure helper", async () => {
        const user = userEvent.setup();
        mocks.balance = 5000n;
        mocks.allowance = 0n;
        mocks.needsApproval.mockReturnValue(true);
        mocks.approve.mockImplementation(async () => {
            throw { shortMessage: "Allowance call failed", message: "long approval failure" };
        });

        render(
            <TokenApprovalFlow
                tokenAddress={"0x2222222222222222222222222222222222222222"}
                requiredAmount={100n}
                onApprovalComplete={mocks.onApprovalComplete}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Authorize Payment" }));

        await waitFor(() => {
            expect(screen.getByText("Allowance call failed")).toBeInTheDocument();
        });
    });
});