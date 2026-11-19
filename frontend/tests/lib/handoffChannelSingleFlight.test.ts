/**
 * handoffChannelSingleFlight.test.ts — the channel factory's single-flight
 * gate. Concurrent `getHandoffChannel` calls for one address must share
 * ONE creation: XMTP's OPFS store uses exclusive sync access handles, so two
 * concurrent `Client.create` calls fight over the same database (as the relay
 * smoke shows). A failed flight must clear so a later caller — e.g. one that
 * now has the wallet signer — retries cleanly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandoffChannel } from "@figaro-protocol/sdk/handoff";

vi.mock("@/lib/shared/e2e", () => ({
    isE2EMockSession: () => false,
    isE2EDevnetSession: () => false,
}));
const createXmtpChannelMock = vi.fn();
const walletHasXmtpInboxMock = vi.fn(async (_address: string) => true);
vi.mock("@/lib/data/handoff/xmtpChannel", () => ({
    createXmtpChannel: (...args: unknown[]) => createXmtpChannelMock(...args),
    walletHasXmtpInbox: (address: string) => walletHasXmtpInboxMock(address),
}));

import { getHandoffChannel } from "@/lib/data/handoff/channel";

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

    it("the signer-less floor is not cached: a caller that comes back WITH the signer reaches the wallet's inbox", async () => {
        const channel = { tag: "five" } as unknown as HandoffChannel;
        createXmtpChannelMock.mockResolvedValue(channel);
        const addr = "0xEeEe000000000000000000000000000000000005";
        const floor = await getHandoffChannel(addr);
        expect(floor).not.toBe(channel);
        expect(await getHandoffChannel(addr, signMessage)).toBe(channel);
        expect(createXmtpChannelMock).toHaveBeenCalledTimes(1);
    });
});

describe("getHandoffChannel in an e2e build that runs devnet sessions over XMTP", () => {
    /** The factory reads the setting when its module loads, as the build
     *  inlines it; each case loads a fresh copy under a devnet session. */
    async function loadWith(handoffChannel: string) {
        vi.resetModules();
        vi.stubEnv("NEXT_PUBLIC_E2E_HANDOFF_CHANNEL", handoffChannel);
        vi.doMock("@/lib/shared/e2e", () => ({
            isE2EMockSession: () => false,
            isE2EDevnetSession: () => true,
        }));
        const mod = await import("@/lib/data/handoff/channel");
        vi.unstubAllEnvs();
        return mod.getHandoffChannel;
    }

    beforeEach(() => {
        createXmtpChannelMock.mockReset();
        walletHasXmtpInboxMock.mockClear();
    });

    it("without the setting, a devnet session keeps the mock bus", async () => {
        const get = await loadWith("");
        const ch = await get("0xF1F1000000000000000000000000000000000006", signMessage);
        expect(createXmtpChannelMock).not.toHaveBeenCalled();
        expect(typeof ch.onAnyCommitmentPayload).toBe("function");
    });

    it("with it, the session crosses XMTP and registers the inbox without the probe (the broker starts empty)", async () => {
        const channel = { tag: "six" } as unknown as HandoffChannel;
        createXmtpChannelMock.mockResolvedValue(channel);
        const get = await loadWith("xmtp");
        expect(await get("0xF2F2000000000000000000000000000000000007", signMessage)).toBe(channel);
        expect(walletHasXmtpInboxMock).not.toHaveBeenCalled();
    });
});
