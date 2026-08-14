/**
 * handoffChannelSingleFlight.test.ts — the channel factory's single-flight
 * gate. Concurrent `getHandoffChannel` calls for one address must share
 * ONE creation: XMTP's OPFS store uses exclusive sync access handles, so two
 * concurrent `Client.create` calls fight over the same database (relay smoke
 * 2026-07-23). A failed flight must clear so a later caller — e.g. one that
 * now has the wallet signer — retries cleanly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandoffChannel } from "@figaro/sdk/handoff";

vi.mock("@/lib/shared/e2e", () => ({
    isE2EMockSession: () => false,
    isE2EDevnetSession: () => false,
}));
const createXmtpChannelMock = vi.fn();
const walletHasXmtpInboxMock = vi.fn(async (_address: string) => true);
vi.mock("@/lib/handoff/xmtpChannel", () => ({
    createXmtpChannel: (...args: unknown[]) => createXmtpChannelMock(...args),
    walletHasXmtpInbox: (address: string) => walletHasXmtpInboxMock(address),
}));

import { getHandoffChannel } from "@/lib/handoff/channel";

const signMessage = async () => "0xsig" as `0x${string}`;

describe("getHandoffChannel single-flight", () => {
    beforeEach(() => {
        createXmtpChannelMock.mockReset();
    });

    it("concurrent callers for one address share a single channel creation", async () => {
        let release!: (ch: HandoffChannel) => void;
        const channel = { tag: "one" } as unknown as HandoffChannel;
        createXmtpChannelMock.mockImplementation(
            () => new Promise<HandoffChannel>((resolve) => { release = resolve; }),
        );

        // Both requests arrive while creation is in flight (the header badge
        // and the /orders subscriptions retrying on the same render pass).
        const a = getHandoffChannel("0xAaAa000000000000000000000000000000000001", signMessage);
        const b = getHandoffChannel("0xaaaa000000000000000000000000000000000001", signMessage);
        // The flight reaches Client.create only after its lazy import resolves.
        await vi.waitFor(() => expect(createXmtpChannelMock).toHaveBeenCalledTimes(1));
        release(channel);

        expect(await a).toBe(channel);
        expect(await b).toBe(channel);
        expect(createXmtpChannelMock).toHaveBeenCalledTimes(1);
    });

    it("a failed flight rejects every joiner and clears, so the next call retries", async () => {
        const channel = { tag: "two" } as unknown as HandoffChannel;
        createXmtpChannelMock
            .mockRejectedValueOnce(new Error("network down"))
            .mockResolvedValueOnce(channel);

        const addr = "0xBbBb000000000000000000000000000000000002";
        const a = getHandoffChannel(addr, signMessage);
        const b = getHandoffChannel(addr, signMessage);
        await expect(a).rejects.toThrow("network down");
        await expect(b).rejects.toThrow("network down");

        expect(await getHandoffChannel(addr, signMessage)).toBe(channel);
        expect(createXmtpChannelMock).toHaveBeenCalledTimes(2);
    });

    it("a signer-less caller lands on the links-only floor without an XMTP flight (derived, never a setting)", async () => {
        const channel = { tag: "three" } as unknown as HandoffChannel;
        createXmtpChannelMock.mockResolvedValue(channel);

        const addr = "0xCcCc000000000000000000000000000000000003";
        const floor = await getHandoffChannel(addr);
        expect(createXmtpChannelMock).not.toHaveBeenCalled();
        // The inert floor still satisfies the channel surface.
        expect(typeof floor.destroy).toBe("function");
    });

    it("a wallet with no XMTP inbox stays on the floor even with a signer", async () => {
        walletHasXmtpInboxMock.mockResolvedValueOnce(false);
        const addr = "0xDdDd000000000000000000000000000000000004";
        await getHandoffChannel(addr, signMessage);
        expect(createXmtpChannelMock).not.toHaveBeenCalled();
    });
});
