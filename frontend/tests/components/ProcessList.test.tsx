import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
    address: undefined as `0x${string}` | undefined,
    summaries: [] as Array<{
        processId: `0x${string}`;
        createdAt: number;
        orderCount: number;
        hasActive: boolean;
        orders: Array<{ id: bigint; state: number }>;
    }>,
    viewedProcessId: null as `0x${string}` | null,
    setViewedProcessId: vi.fn(),
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: mocks.address }),
}));

vi.mock("@/hooks/core/useWalletProcessIds", () => ({
    useWalletProcessIds: () => mocks.summaries,
}));

vi.mock("@/lib/core/store", () => ({
    OrderState: {
        Active: 1,
        Resolved: 2,
    },
    useOrderStore: (selector: (state: {
        viewedProcessId: `0x${string}` | null;
        setViewedProcessId: typeof mocks.setViewedProcessId;
    }) => unknown) => selector({
        viewedProcessId: mocks.viewedProcessId,
        setViewedProcessId: mocks.setViewedProcessId,
    }),
}));

import { ProcessList } from "@/components/core/ProcessList";

describe("ProcessList", () => {
    beforeEach(() => {
        mocks.address = undefined;
        mocks.summaries = [];
        mocks.viewedProcessId = null;
        mocks.setViewedProcessId.mockReset();
    });

    it("shows a connect-wallet empty state when no wallet is connected", () => {
        render(<ProcessList />);

        expect(screen.getByTestId("process-list-empty")).toBeInTheDocument();
        expect(screen.getByText(/connect a wallet to load your process history/i)).toBeInTheDocument();
    });

    it("shows a no-processes empty state for connected wallets with no history", () => {
        mocks.address = "0x1234567890123456789012345678901234567890";

        render(<ProcessList />);

        expect(screen.getByTestId("process-list-empty")).toBeInTheDocument();
        expect(screen.getByText(/no processes yet\. commit an order to start your first process graph/i)).toBeInTheDocument();
    });
});