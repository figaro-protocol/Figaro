/**
 * CommitmentSharePanel — the checkout's Send of a signed order. Between the
 * click and the channel's answer the control says so and stays closed (beta r9:
 * a buyer read the wait as a frozen screen); the channel's answer, sent or
 * failed, replaces the pending line.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";

const BUYER = "0x00000000000000000000000000000000000000b1";
const SELLER = "0x00000000000000000000000000000000000000a1";

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: BUYER }),
    useWalletClient: () => ({ data: null }),
    useChainId: () => 31337,
}));

vi.mock("@/lib/shared/runtimeServicesContext", () => ({
    useRuntimeServices: () => ({ handoffMessaging: {}, evidenceTransport: {} }),
}));

vi.mock("qrcode", () => ({ toDataURL: async () => "data:image/png;base64," }));

// A plain function, not a spy: the channel's answer is a promise the test
// settles by hand, and the calls are recorded for the double-click check.
let shareImpl: () => Promise<string> = () => new Promise(() => {});
const shareCalls: Array<Record<string, unknown>> = [];
vi.mock("@/lib/checkout/orderSignedAndShared", () => ({
    shareSignedOrder: (params: Record<string, unknown>) => {
        shareCalls.push(params);
        return shareImpl();
    },
}));
vi.mock("@/lib/checkout/signedUnsentOrders", () => ({ forgetSignedUnsent: vi.fn() }));

import { CommitmentSharePanel } from "@/components/runtime/CommitmentSharePanel";

const PAYLOAD = {
    commitment: {
        processId: `0x${"00".repeat(32)}`,
        buyer: BUYER,
        seller: SELLER,
        currency: "0x00000000000000000000000000000000000000c1",
        payment: 25_000_000n,
        expectedCumulativeValue: 25_000_000n,
        agreementHash: `0x${"22".repeat(32)}`,
        salt: 7n,
        deadline: 1_893_456_000n,
    },
    agreement: { sections: [] },
    buyerSig: "0xabcdef",
} as unknown as CommitmentPayload;

function deferred() {
    let resolve!: (v: string) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function renderPanel() {
    render(<CommitmentSharePanel payload={PAYLOAD} step="awaiting-seller" tokenDecimals={6} />);
}

describe("CommitmentSharePanel — Send while the channel holds it", () => {
    beforeEach(() => { shareCalls.length = 0; });

    it("at rest, offers Send with no pending line", () => {
        renderPanel();
        expect(screen.getByTestId("send-commitment-xmtp")).toBeEnabled();
        expect(screen.getByTestId("send-commitment-xmtp").textContent).toBe("Send via XMTP");
        expect(screen.queryByTestId("commitment-xmtp-pending")).toBeNull();
    });

    it("between the click and the channel's answer, names the recipient and closes Send; the answer replaces the line", async () => {
        const relay = deferred();
        shareImpl = () => relay.promise;
        renderPanel();

        await act(async () => { fireEvent.click(screen.getByTestId("send-commitment-xmtp")); });
        const send = screen.getByTestId("send-commitment-xmtp");
        expect(send).toBeDisabled();
        expect(send.textContent).toBe("Sending…");
        expect(screen.getByTestId("commitment-xmtp-pending").textContent)
            .toBe("Sending the signed order to 0x0000…00a1. Waiting for the channel to accept it.");
        // A second click while the channel holds the send relays nothing more.
        fireEvent.click(send);
        expect(shareCalls).toHaveLength(1);
        expect(shareCalls[0]).toMatchObject({ recipientAddress: SELLER, senderAddress: BUYER });

        await act(async () => { relay.resolve(`0x${"33".repeat(32)}`); });
        expect(screen.queryByTestId("commitment-xmtp-pending")).toBeNull();
        expect(screen.getByTestId("commitment-xmtp-status").textContent).toContain("sent over XMTP to 0x0000…00a1");
        expect(screen.getByTestId("send-commitment-xmtp")).toBeEnabled();
    });

    it("a failed send drops the pending line, states the failure and reopens Send", async () => {
        const relay = deferred();
        shareImpl = () => relay.promise;
        renderPanel();

        await act(async () => { fireEvent.click(screen.getByTestId("send-commitment-xmtp")); });
        expect(screen.getByTestId("commitment-xmtp-pending")).toBeInTheDocument();
        await act(async () => { relay.reject(new Error("channel unreachable")); });
        expect(screen.queryByTestId("commitment-xmtp-pending")).toBeNull();
        expect(screen.getByTestId("commitment-xmtp-status").textContent).toContain("channel unreachable");
        expect(screen.getByTestId("send-commitment-xmtp")).toBeEnabled();
    });
});
