/**
 * useCeremonyChannel — a change of wallet, ceremony id or counterparty is a
 * new ceremony: the previous one's peer key, wrapped blob, decrypted payload
 * and anchor verdict read as absent, never carried over to the new one.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { AuthenticatedEcdhMessage } from "@figaro-protocol/sdk/handoff";

type Listener = (msg: AuthenticatedEcdhMessage) => void;
const pubkeyListeners = new Map<string, Listener[]>();
const wrappedListeners = new Map<string, Listener[]>();
const add = (m: Map<string, Listener[]>, id: string, cb: Listener) => {
    m.set(id, [...(m.get(id) ?? []), cb]);
    return () => m.set(id, (m.get(id) ?? []).filter((x) => x !== cb));
};
const channel = {
    onEcdhPubkey: (id: string, cb: Listener) => add(pubkeyListeners, id, cb),
    onWrappedKey: (id: string, cb: Listener) => add(wrappedListeners, id, cb),
};

vi.mock("wagmi", () => ({ useChainId: () => 31337, usePublicClient: () => ({}) }));
vi.mock("@/lib/handoff/channel", () => ({ getHandoffChannel: async () => channel }));
vi.mock("@/lib/handoff/ecdh", () => ({ getOrderEcdhKeypair: () => null }));
vi.mock("@/lib/handoff/handoffAnchorState", () => ({ attestationAnchorMatches: async () => true }));
vi.mock("@figaro-protocol/sdk/handoff", () => ({ verifyEcdhMessageAuth: async () => true }));

import { useCeremonyChannel } from "@/lib/handoff/useCeremonyChannel";

const ME = "0x00000000000000000000000000000000000000a1" as const;
const PEER = "0x00000000000000000000000000000000000000b2";
const decrypt = async ({ blobB64 }: { blobB64: string }) => `decrypted:${blobB64}`;
const expectedAnchor = () => `0x${"cd".repeat(32)}` as `0x${string}`;

function emit(ceremonyId: string) {
    const msg = { senderAddress: PEER, pubKeyHex: "0xpeer", wrappedKeyB64: "blob-A" } as unknown as AuthenticatedEcdhMessage;
    for (const cb of pubkeyListeners.get(ceremonyId) ?? []) cb(msg);
    for (const cb of wrappedListeners.get(ceremonyId) ?? []) cb(msg);
}

describe("useCeremonyChannel", () => {
    it("drops the previous ceremony's received state when the ceremony id changes", async () => {
        const { result, rerender } = renderHook(
            ({ ceremonyId }) => useCeremonyChannel<string>({
                address: ME, enabled: true, ceremonyId, orderHash: ceremonyId, counterparty: PEER, decrypt, expectedAnchor,
            }),
            { initialProps: { ceremonyId: "order-A" } },
        );
        await waitFor(() => expect(pubkeyListeners.get("order-A")?.length).toBe(1));
        emit("order-A");
        await waitFor(() => expect(result.current.anchored).toBe("verified"));
        expect(result.current.received).toBe("decrypted:blob-A");
        expect(result.current.peerPubKey).toBe("0xpeer");

        rerender({ ceremonyId: "order-B" });
        expect(result.current.peerPubKey).toBeNull();
        expect(result.current.received).toBeNull();
        expect(result.current.anchored).toBe("unknown");
        // The old ceremony's subscription is released.
        await waitFor(() => expect(pubkeyListeners.get("order-A")?.length ?? 0).toBe(0));
    });

    it("drops it when the connected wallet changes", async () => {
        const { result, rerender } = renderHook(
            ({ address }) => useCeremonyChannel<string>({
                address, enabled: true, ceremonyId: "order-C", orderHash: "order-C", counterparty: PEER, decrypt, expectedAnchor,
            }),
            { initialProps: { address: ME as `0x${string}` | undefined } },
        );
        await waitFor(() => expect(pubkeyListeners.get("order-C")?.length).toBe(1));
        emit("order-C");
        await waitFor(() => expect(result.current.received).toBe("decrypted:blob-A"));

        rerender({ address: undefined });
        expect(result.current.received).toBeNull();
        expect(result.current.peerPubKey).toBeNull();
        expect(result.current.channel).toBeNull();
    });
});
