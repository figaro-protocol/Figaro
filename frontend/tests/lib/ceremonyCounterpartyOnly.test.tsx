/**
 * useCeremonyChannel takes a key or a sealed blob from the order's
 * counterparty alone: the message must name the counterparty as its sender
 * and its wallet signature must verify (`verifyEcdhMessageAuth`). Anyone can
 * write to the channel; only those messages reach the ceremony.
 *
 * Proves: a message signed by a third wallet, and a message naming the
 * counterparty whose signature does not verify, set nothing; the
 * counterparty's verified message sets the peer key and the blob. Does not
 * prove: the secrecy of the sealing itself, which is the SDK's
 * (`sdk/tests/handoff.test.ts`, golden vectors).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { AuthenticatedEcdhMessage } from "@figaro-protocol/sdk/handoff";

type Listener = (msg: AuthenticatedEcdhMessage) => void;
const h = vi.hoisted(() => ({
    pubkey: [] as ((msg: unknown) => void)[],
    wrapped: [] as ((msg: unknown) => void)[],
    /** The senders whose signatures verify. */
    signedBy: new Set<string>(),
}));
const channel = {
    onEcdhPubkey: (_id: string, cb: Listener) => { h.pubkey.push(cb as (m: unknown) => void); return () => undefined; },
    onWrappedKey: (_id: string, cb: Listener) => { h.wrapped.push(cb as (m: unknown) => void); return () => undefined; },
};

vi.mock("wagmi", () => ({ useChainId: () => 31337, usePublicClient: () => ({}) }));
vi.mock("@/lib/data/handoff/channel", () => ({ getHandoffChannel: async () => channel }));
vi.mock("@/lib/data/handoff/ecdh", () => ({ getOrderEcdhKeypair: () => null }));
vi.mock("@/lib/data/handoff/handoffAnchorState", () => ({ attestationAnchorMatches: async () => true }));
vi.mock("@figaro-protocol/sdk/handoff", () => ({
    verifyEcdhMessageAuth: async (msg: { senderAddress: string }) => h.signedBy.has(msg.senderAddress.toLowerCase()),
}));

import { useCeremonyChannel } from "@/lib/data/handoff/useCeremonyChannel";

const ME = "0x00000000000000000000000000000000000000a1" as const;
const PEER = "0x00000000000000000000000000000000000000b2";
const THIRD = "0x00000000000000000000000000000000000000c3";
const decrypt = async ({ blobB64 }: { blobB64: string }) => `decrypted:${blobB64}`;
const expectedAnchor = () => null;

function emit(sender: string, tag: string) {
    const msg = { senderAddress: sender, pubKeyHex: `0x${tag}`, wrappedKeyB64: `blob-${tag}` };
    for (const cb of h.pubkey) cb(msg);
    for (const cb of h.wrapped) cb(msg);
}

async function mounted() {
    const hook = renderHook(() => useCeremonyChannel<string>({
        address: ME, enabled: true, ceremonyId: "order-1", orderHash: "order-1", counterparty: PEER, decrypt, expectedAnchor,
    }));
    await waitFor(() => expect(h.pubkey.length).toBe(1));
    return hook;
}

/** Wait until every pending verification has answered. */
const answered = () => new Promise((r) => setTimeout(r, 20));

describe("useCeremonyChannel accepts the counterparty's signed messages only", () => {
    beforeEach(() => {
        h.pubkey.length = 0;
        h.wrapped.length = 0;
        h.signedBy = new Set([PEER, THIRD]);
    });

    it("a third wallet's message, though its signature verifies, sets nothing", async () => {
        const { result } = await mounted();
        emit(THIRD, "third");
        await answered();
        expect(result.current.peerPubKey).toBeNull();
        expect(result.current.received).toBeNull();
    });

    it("a message naming the counterparty whose signature does not verify sets nothing", async () => {
        h.signedBy = new Set([THIRD]);
        const { result } = await mounted();
        emit(PEER, "forged");
        await answered();
        expect(result.current.peerPubKey).toBeNull();
        expect(result.current.received).toBeNull();
    });

    it("the counterparty's verified message sets the peer key and the blob", async () => {
        const { result } = await mounted();
        emit(PEER, "peer");
        await waitFor(() => expect(result.current.received).toBe("decrypted:blob-peer"));
        expect(result.current.peerPubKey).toBe("0xpeer");
    });
});
