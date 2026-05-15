import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HandoffKeyExchangeModule } from "@/components/modules/HandoffKeyExchangeModule";

const sendHandoffKeyMock = vi.fn();
const getHandoffKeyMock = vi.fn();
const walletClientMock = {
    signMessage: vi.fn(),
};

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x1234567890123456789012345678901234567890" }),
    useWalletClient: () => ({
        data: walletClientMock,
    }),
}));

function createProps(overrides?: Record<string, unknown>) {
    return {
        moduleId: "handoff-key-exchange",
        binding: {} as never,
        context: {
            services: {
                coordinationMessaging: {
                    sendHandoffKey: (...args: unknown[]) => sendHandoffKeyMock(...args),
                },
                handoffPersistence: {
                    getHandoffKey: (...args: unknown[]) => getHandoffKeyMock(...args),
                },
            },
            selectedOrder: {
                orderId: "order-1",
                processId: "process-1",
            },
            mechanisms: [
                {
                    kind: "coordinator",
                    assignedFulfiller: "0x9999999999999999999999999999999999999999",
                },
            ],
            ...(overrides ?? {}),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
}

describe("HandoffKeyExchangeModule", () => {
    beforeEach(() => {
        sendHandoffKeyMock.mockReset();
        sendHandoffKeyMock.mockResolvedValue(undefined);
        getHandoffKeyMock.mockReset();
        getHandoffKeyMock.mockReturnValue({ keyB64: "key-123" });
        walletClientMock.signMessage.mockReset();
    });

    it("shows the waiting state before a fulfiller is assigned", () => {
        render(
            <HandoffKeyExchangeModule
                {...createProps({
                    mechanisms: [{ kind: "coordinator", assignedFulfiller: null }],
                })}
            />,
        );

        expect(
            screen.getByText(/waiting for a fulfiller to claim your order/i),
        ).toBeInTheDocument();
        expect(sendHandoffKeyMock).not.toHaveBeenCalled();
    });

    it("sends the stored handoff key through the shared coordination messaging service", async () => {
        render(<HandoffKeyExchangeModule {...createProps()} />);

        await waitFor(() => {
            expect(sendHandoffKeyMock).toHaveBeenCalledWith({
                address: "0x1234567890123456789012345678901234567890",
                walletClient: expect.objectContaining({ signMessage: expect.any(Function) }),
                recipientAddress: "0x9999999999999999999999999999999999999999",
                orderId: "order-1",
                keyB64: "key-123",
            });
        });

        await waitFor(() => {
            expect(screen.getByTestId("key-exchange-status")).toHaveTextContent(/key sent to fulfiller/i);
        });
    });
});