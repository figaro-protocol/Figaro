/**
 * useIsUncommitted — the predicate behind the pending views. A failed order
 * read leaves nothing known: the predicate answers false, `known` is false,
 * and the read is retried on the content schedule; once a read lands, the
 * payloads whose orders the chain has not seen are uncommitted. Before, one
 * failed read hid every pending order for the rest of the session and the
 * list then claimed the wallet had no orders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { contentRetryDelayMs } from "@/lib/shared/ipfsService";

const { CLIENT, CORE, getCoreEventsMock } = vi.hoisted(() => ({
    CLIENT: { chain: { id: 31337 } },
    CORE: "0x00000000000000000000000000000000000000c0" as const,
    getCoreEventsMock: vi.fn(),
}));
vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x00000000000000000000000000000000000000a1", isConnected: true }),
    useChainId: () => 31337,
    usePublicClient: () => CLIENT,
    useWalletClient: () => ({ data: undefined }),
    useWatchContractEvent: () => undefined,
}));
vi.mock("@/lib/kernel/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/kernel/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: "0x00000000000000000000000000000000000000c9" },
}));
vi.mock("@/lib/kernel/indexer", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/kernel/indexer")>()),
    getCoreEvents: (...a: unknown[]) => getCoreEventsMock(...a),
    useWatchOrderEvents: () => undefined,
}));
vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({ useRuntimeServices: () => ({}) }));

import { useIsUncommitted } from "@/lib/checkout/orderPendingSellerSignature";

const PAYLOAD = {
    commitment: {
        processId: `0x${"00".repeat(32)}`,
        buyer: "0x00000000000000000000000000000000000000b1",
        seller: "0x00000000000000000000000000000000000000a1",
        currency: "0x00000000000000000000000000000000000000d1",
        payment: 10n,
        expectedCumulativeValue: 10n,
        checkoutHash: `0x${"c4".repeat(32)}`,
        salt: 1n,
        deadline: 2_000_000_000n,
    },
    agreement: { clauses: [] },
    buyerSig: "0xdeadbeef",
} as unknown as CommitmentPayload;
const EMPTY = { events: { orderCommitted: [], orderResolved: [], processResolved: [] }, committedLogs: [] };
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

describe("useIsUncommitted — a failed read is unknown, retried on the schedule, then known", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        getCoreEventsMock.mockReset();
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("answers false with nothing known while the read is in flight and after it failed; the retry lands and the payload reads uncommitted", async () => {
        getCoreEventsMock.mockRejectedValueOnce(new Error("fetch failed: RPC unreachable")).mockResolvedValue(EMPTY);
        const { result } = renderHook(() => useIsUncommitted());
        expect(result.current.known).toBe(false);
        expect(result.current.isUncommitted(PAYLOAD)).toBe(false);

        await flush();
        expect(getCoreEventsMock).toHaveBeenCalledTimes(1);
        expect(result.current.known).toBe(false);
        expect(result.current.isUncommitted(PAYLOAD)).toBe(false);

        await act(async () => { vi.advanceTimersByTime(contentRetryDelayMs(0)); });
        await flush();
        expect(getCoreEventsMock).toHaveBeenCalledTimes(2);
        expect(result.current.known).toBe(true);
        expect(result.current.isUncommitted(PAYLOAD)).toBe(true);
    });

    it("a read that lands first time is known at once", async () => {
        getCoreEventsMock.mockResolvedValue(EMPTY);
        const { result } = renderHook(() => useIsUncommitted());
        await flush();
        expect(getCoreEventsMock).toHaveBeenCalledTimes(1);
        expect(result.current.known).toBe(true);
        expect(result.current.isUncommitted(PAYLOAD)).toBe(true);
    });
});
