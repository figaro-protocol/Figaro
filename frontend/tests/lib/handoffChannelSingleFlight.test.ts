/**
 * handoffChannelSingleFlight.test.ts — the channel factory's single-flight
 * gate. Concurrent `getCoordinationChannel` calls for one address must share
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
vi.mock("@/lib/shared/userTransport", () => ({
    readUserTransport: () => "xmtp",
}));

const createXmtpChannelMock = vi.fn();
vi.mock("@/lib/handoff/xmtpChannel", () => ({
    createXmtpChannel: (...args: unknown[]) => createXmtpChannelMock(...args),
}));

import { getCoordinationChannel } from "@/lib/handoff/channel";

const signMessage = async () => "0xsig" as `0x${string}`;

describe("getCoordinationChannel single-flight", () => {
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
        const a = getCoordinationChannel("0xAaAa000000000000000000000000000000000001", signMessage);
        const b = getCoordinationChannel("0xaaaa000000000000000000000000000000000001", signMessage);
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
        const a = getCoordinationChannel(addr, signMessage);
        const b = getCoordinationChannel(addr, signMessage);
        await expect(a).rejects.toThrow("network down");
        await expect(b).rejects.toThrow("network down");

        expect(await getCoordinationChannel(addr, signMessage)).toBe(channel);
        expect(createXmtpChannelMock).toHaveBeenCalledTimes(2);
    });

    it("a signer-less caller throws without starting a flight; the signered retry succeeds", async () => {
        const channel = { tag: "three" } as unknown as HandoffChannel;
        createXmtpChannelMock.mockResolvedValue(channel);

        const addr = "0xCcCc000000000000000000000000000000000003";
        await expect(getCoordinationChannel(addr)).rejects.toThrow(/signMessage callback required/);
        expect(createXmtpChannelMock).not.toHaveBeenCalled();

        expect(await getCoordinationChannel(addr, signMessage)).toBe(channel);
        expect(createXmtpChannelMock).toHaveBeenCalledTimes(1);
    });
});
