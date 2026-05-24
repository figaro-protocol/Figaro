import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const payload = {
    commitment: {
        processId: "0x" + "00".repeat(32),
        buyer: "0x1234567890123456789012345678901234567890",
        seller: "0x9999999999999999999999999999999999999999",
        currency: "0x2222222222222222222222222222222222222222",
        payment: 1n,
        expectedCumulativeValue: 1n,
        agreementHash: "0x" + "11".repeat(32),
        salt: 1n,
        deadline: 2n,
    },
    buyerSig: "0x" + "12".repeat(65),
};

const mocks = vi.hoisted(() => ({
    signAndBroadcast: vi.fn(async () => undefined),
    counterSign: vi.fn(async () => payload),
    broadcast: vi.fn(async () => undefined),
    reset: vi.fn(),
    subscribeAnyCommitmentPayload: vi.fn(async () => vi.fn()),
    fetchCommitmentPayloadJsonByCid: vi.fn(async () => "payload"),
}));

const navigationMocks = vi.hoisted(() => ({
    searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
    useSearchParams: () => navigationMocks.searchParams,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x1234567890123456789012345678901234567890" }),
    useWalletClient: () => ({ data: { signMessage: vi.fn(async () => "0xabc123") } }),
    useReadContract: () => ({ data: 999999999999n }),
}));

vi.mock("@/hooks/core/useTokenApproval", () => ({
    __esModule: true,
    default: () => ({
        needsApproval: () => false,
        approve: vi.fn(),
        isApprovePending: false,
        isApproveConfirming: false,
        isApproveSuccess: false,
    }),
}));

vi.mock("@/hooks/core/useTokenDecimals", () => ({
    __esModule: true,
    default: () => ({ decimals: 6, loading: false }),
}));

vi.mock("@/lib/core/useCommitmentFlow", () => ({
    useCommitmentFlow: () => ({
        signAndBroadcast: mocks.signAndBroadcast,
        counterSign: mocks.counterSign,
        broadcast: mocks.broadcast,
        step: "idle",
        error: null,
        payload: null,
        reset: mocks.reset,
    }),
}));

vi.mock("@/lib/core/useFigaroActions", () => ({
    ZERO_PROCESS_ID: "0x" + "00".repeat(32),
}));

vi.mock("@/components/core/TokenApprovalFlow", () => ({
    TokenApprovalFlow: () => <div>token approval</div>,
}));

vi.mock("@/components/core/CommitmentSharePanel", () => ({
    deserializePayload: vi.fn(() => payload),
}));

vi.mock("@/lib/core/agreementStore", () => ({
    primeAgreementArtifact: vi.fn(async () => undefined),
}));

vi.mock("@/lib/shared/runtimeServicesContext", () => ({
    useRuntimeServices: () => ({
        coordinationMessaging: {
            subscribeAnyCommitmentPayload: mocks.subscribeAnyCommitmentPayload,
        },
        evidenceTransport: {
            resolveFetchUrl: vi.fn(() => "http://localhost/ipfs/QmStub"),
        },
    }),
}));

vi.mock("@/lib/shared/coordinationMessagingService", () => ({
    fetchCommitmentPayloadJsonByCid: mocks.fetchCommitmentPayloadJsonByCid,
}));

import SignPage from "@/app/(app)/sign/page";

describe("token-decimal display flows", () => {
    beforeEach(() => {
        mocks.signAndBroadcast.mockReset();
        mocks.counterSign.mockReset();
        mocks.broadcast.mockReset();
        mocks.reset.mockReset();
        mocks.subscribeAnyCommitmentPayload.mockReset();
        mocks.subscribeAnyCommitmentPayload.mockResolvedValue(vi.fn());
        mocks.fetchCommitmentPayloadJsonByCid.mockReset();
        mocks.fetchCommitmentPayloadJsonByCid.mockResolvedValue("payload");
        navigationMocks.searchParams = new URLSearchParams();
    });

    it("formats SignPage commitment amounts with token decimals", async () => {
        const user = userEvent.setup();
        render(<SignPage />);

        await user.type(screen.getByTestId("input-commitment-payload"), "payload");
        await user.click(screen.getByTestId("btn-parse-payload"));

        await waitFor(() => {
            expect(screen.getByText("0.000001 tokens")).toBeInTheDocument();
        });

        expect(screen.getByText("0.000002 tokens")).toBeInTheDocument();
    });

    it("hydrates SignPage directly from a shared payload link", async () => {
        navigationMocks.searchParams = new URLSearchParams([["payload", "payload"]]);

        render(<SignPage />);

        await waitFor(() => {
            expect(screen.getByText("0.000001 tokens")).toBeInTheDocument();
        });

        expect(screen.queryByTestId("input-commitment-payload")).not.toBeInTheDocument();
        expect(screen.getByText("Buyer: Signed")).toBeInTheDocument();
    });

    it("hydrates SignPage from the XMTP inbox when a commitment arrives", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mocks.subscribeAnyCommitmentPayload.mockImplementation((async ({ callback }: { callback: (payloadCid: string, orderId: string) => Promise<void> | void }) => {
            await callback("QmStub", "order-1");
            return vi.fn();
        }) as any);

        render(<SignPage />);

        await waitFor(() => {
            expect(screen.getByText("Buyer: Signed")).toBeInTheDocument();
        });

        expect(mocks.subscribeAnyCommitmentPayload).toHaveBeenCalled();
        expect(mocks.fetchCommitmentPayloadJsonByCid).toHaveBeenCalledWith(expect.anything(), "QmStub");
        expect(screen.queryByTestId("input-commitment-payload")).not.toBeInTheDocument();
    });
});