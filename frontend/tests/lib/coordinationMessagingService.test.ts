import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COORDINATION_MESSAGING_SERVICE } from "@/lib/shared/coordinationMessagingService";

const sendHandoffKeyMock = vi.fn();
const onWrappedKeyMock = vi.fn();
const sendCommitmentPayloadMock = vi.fn();
const onAnyCommitmentPayloadMock = vi.fn();
const getCoordinationChannelMock = vi.fn();

vi.mock("@/lib/handoff/channel", () => ({
    getCoordinationChannel: (...args: unknown[]) => getCoordinationChannelMock(...args),
}));

describe("coordinationMessagingService", () => {
    beforeEach(() => {
        sendHandoffKeyMock.mockReset();
        onWrappedKeyMock.mockReset();
        sendCommitmentPayloadMock.mockReset();
        onAnyCommitmentPayloadMock.mockReset();
        getCoordinationChannelMock.mockReset();
        getCoordinationChannelMock.mockResolvedValue({
            sendHandoffKey: (...args: unknown[]) => sendHandoffKeyMock(...args),
            onWrappedKey: (...args: unknown[]) => onWrappedKeyMock(...args),
            sendCommitmentPayload: (...args: unknown[]) => sendCommitmentPayloadMock(...args),
            onAnyCommitmentPayload: (...args: unknown[]) => onAnyCommitmentPayloadMock(...args),
        });
    });

    it("bridges wallet signMessage into coordination channel resolution", async () => {
        const walletClient = {
            signMessage: vi.fn().mockResolvedValue("0xabc123"),
        };

        await DEFAULT_COORDINATION_MESSAGING_SERVICE.getChannel({
            address: "0x1234",
            walletClient,
        });

        expect(getCoordinationChannelMock).toHaveBeenCalledTimes(1);
        const [, signMessage] = getCoordinationChannelMock.mock.calls[0];
        expect(typeof signMessage).toBe("function");
        await expect(signMessage("hello")).resolves.toBe("0xabc123");
        expect(walletClient.signMessage).toHaveBeenCalledWith({ message: "hello" });
    });

    it("delegates handoff-key sends through the resolved channel", async () => {
        await DEFAULT_COORDINATION_MESSAGING_SERVICE.sendHandoffKey({
            address: "0x1234",
            recipientAddress: "0xabcd",
            orderId: "order-1",
            keyB64: "key-123",
        });

        expect(sendHandoffKeyMock).toHaveBeenCalledWith({
            recipientAddress: "0xabcd",
            orderId: "order-1",
            keyB64: "key-123",
        });
    });

    it("delegates wrapped-key subscriptions and returns the unsubscribe handle", async () => {
        const unsubscribe = vi.fn();
        const callback = vi.fn();
        onWrappedKeyMock.mockReturnValue(unsubscribe);

        const result = await DEFAULT_COORDINATION_MESSAGING_SERVICE.subscribeWrappedKey({
            address: "0x1234",
            orderId: "order-2",
            callback,
        });

        expect(onWrappedKeyMock).toHaveBeenCalledWith("order-2", callback);
        expect(result).toBe(unsubscribe);
    });

    it("delegates commitment payload sends through the resolved channel", async () => {
        await DEFAULT_COORDINATION_MESSAGING_SERVICE.sendCommitmentPayload({
            address: "0x1234",
            recipientAddress: "0xabcd",
            orderId: "order-3",
            payloadJson: '{"hello":"world"}',
        });

        expect(sendCommitmentPayloadMock).toHaveBeenCalledWith({
            recipientAddress: "0xabcd",
            orderId: "order-3",
            payloadJson: '{"hello":"world"}',
        });
    });

    it("delegates any-commitment subscriptions and returns the unsubscribe handle", async () => {
        const unsubscribe = vi.fn();
        const callback = vi.fn();
        onAnyCommitmentPayloadMock.mockReturnValue(unsubscribe);

        const result = await DEFAULT_COORDINATION_MESSAGING_SERVICE.subscribeAnyCommitmentPayload({
            address: "0x1234",
            callback,
        });

        expect(onAnyCommitmentPayloadMock).toHaveBeenCalledWith(callback);
        expect(result).toBe(unsubscribe);
    });
});