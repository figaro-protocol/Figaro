/**
 * The one handoff-channel stub the unit tests share: it records every send,
 * with the sender and the signature the production channel passes, so a test
 * can rebuild each wire message and verify its authentication. The transport
 * is not under test where it is used; the crypto, the auth and the ceremony
 * scoping are.
 */
import { vi } from "vitest";
import type { AuthenticatedEcdhMessage, HandoffChannel } from "@figaro-protocol/sdk/handoff";

export interface SentMessage {
    kind: "pubkey" | "blob";
    orderId: string;
    value: string;
    senderAddress: string;
    sig: string;
}

export function recordingChannel(): { channel: HandoffChannel; sent: SentMessage[] } {
    const sent: SentMessage[] = [];
    const channel = {
        sendEcdhPubkey: vi.fn(async ({ orderId, pubKeyHex, senderAddress, sig }) => {
            sent.push({ kind: "pubkey", orderId, value: pubKeyHex, senderAddress, sig });
        }),
        sendWrappedKey: vi.fn(async ({ orderId, wrappedKeyB64, senderAddress, sig }) => {
            sent.push({ kind: "blob", orderId, value: wrappedKeyB64, senderAddress, sig });
        }),
    } as unknown as HandoffChannel;
    return { channel, sent };
}

/** The wire message a recorded send represents (ts is unsigned metadata —
 *  any value verifies). */
export function asWireMessage(m: SentMessage): AuthenticatedEcdhMessage {
    return m.kind === "pubkey"
        ? { type: "ECDH_PUBKEY", orderId: m.orderId, pubKeyHex: m.value, senderAddress: m.senderAddress, sig: m.sig, ts: 0 }
        : { type: "ECDH_WRAPPED_KEY", orderId: m.orderId, wrappedKeyB64: m.value, senderAddress: m.senderAddress, sig: m.sig, ts: 0 };
}
