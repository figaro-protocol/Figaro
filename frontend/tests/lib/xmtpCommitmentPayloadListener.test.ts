/**
 * xmtpCommitmentPayloadListener.test.ts — the real XMTP channel's
 * `onCommitmentPayload` listener delivers EVERY matching envelope. The sender's
 * own relayed draft echoes on the same order key ahead of the counterparty's
 * counter-signed reply; a listener that stopped at the first match would drop
 * the reply. Drives the real pump and listener over a fake XMTP client (no
 * live network).
 */
import { describe, expect, it, vi } from "vitest";

type WireMessage = { id: string; content: string; senderInboxId: string };

/** A live stream the test pushes into. */
function controllableStream() {
    const queue: WireMessage[] = [];
    let wake: (() => void) | null = null;
    return {
        push(msg: WireMessage) {
            queue.push(msg);
            wake?.();
        },
        async *iterate(): AsyncGenerator<WireMessage> {
            for (;;) {
                while (queue.length > 0) yield queue.shift()!;
                await new Promise<void>((r) => { wake = r; });
                wake = null;
            }
        },
    };
}

const stream = controllableStream();

vi.mock("@xmtp/browser-sdk", () => ({
    IdentifierKind: { Ethereum: "Ethereum" },
    generateInboxId: vi.fn(),
    Client: {
        create: vi.fn(async () => ({
            installationId: "inst",
            preferences: { inboxState: async () => ({ installations: [] }) },
            revokeInstallations: vi.fn(),
            close: vi.fn(),
            conversations: {
                streamAllMessages: async () => stream.iterate(),
                syncAll: async () => undefined,
                list: async () => [],
            },
        })),
    },
}));

import { createXmtpChannel } from "@/lib/handoff/xmtpChannel";

const signMessage = async () => `0x${"11".repeat(65)}` as `0x${string}`;

function envelope(id: string, orderId: string, payload: string, senderInboxId: string): WireMessage {
    return {
        id,
        senderInboxId,
        content: JSON.stringify({ type: "COMMITMENT_PAYLOAD", orderId, payload, ts: Date.now() }),
    };
}

describe("xmtpChannel onCommitmentPayload", () => {
    it("delivers the counterparty's reply that follows the sender's own echo on the same key", async () => {
        const channel = await createXmtpChannel("0xAaAa000000000000000000000000000000000001", signMessage);
        const received: Array<{ payload: string; sender: string }> = [];
        const unsubscribe = channel.onCommitmentPayload("0xorder", (payload, sender) => {
            received.push({ payload, sender });
        });

        stream.push(envelope("m1", "0xorder", "draft-echo", "buyer-inbox"));
        stream.push(envelope("m2", "0xother", "unrelated", "someone"));
        stream.push(envelope("m3", "0xorder", "countersigned-reply", "seller-inbox"));

        await vi.waitFor(() => expect(received).toHaveLength(2));
        expect(received).toEqual([
            { payload: "draft-echo", sender: "buyer-inbox" },
            { payload: "countersigned-reply", sender: "seller-inbox" },
        ]);

        // Unsubscribing stops delivery.
        unsubscribe();
        stream.push(envelope("m4", "0xorder", "late", "seller-inbox"));
        await new Promise((r) => setTimeout(r, 20));
        expect(received).toHaveLength(2);
        channel.destroy();
    });
});
