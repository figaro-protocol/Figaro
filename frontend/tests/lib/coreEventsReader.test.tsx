/**
 * One read path for the Core's order events. Every consumer of the order
 * history — a process's orders, a wallet's processes, the /orders rows and
 * the explorer's graph corpus — reads through `getCoreEvents`, the indexer's
 * one parsed reader over every order emitter. A consumer that paired the
 * low-level readers with its own cast-and-parse is a copy that drifts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { CoreEvents, OrderCommittedEvent } from "@figaro-protocol/sdk";
import { word } from "./__fixtures__/coreLogs";

const { BUYER, SELLER, PROCESS, CLIENT, NO_ASSEMBLIES, SPECS, getCoreEventsMock } = vi.hoisted(() => ({
    CLIENT: { chain: { id: 31337 } },
    NO_ASSEMBLIES: { read: { status: "present" as const, value: [] }, refetch: () => undefined },
    SPECS: { version: 0, loaded: true },
    BUYER: "0x00000000000000000000000000000000000000b1" as const,
    SELLER: "0x00000000000000000000000000000000000000a1" as const,
    PROCESS: `0x${"51".repeat(32)}` as const,
    getCoreEventsMock: vi.fn(),
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: BUYER, isConnected: true }),
    useChainId: () => 31337,
    usePublicClient: () => CLIENT,
    useWatchContractEvent: () => undefined,
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: "0x1111111111111111111111111111111111111111", batchVerifier: "0x2222222222222222222222222222222222222222" },
}));
// The one reader answers; the low-level per-event readers refuse, so a
// consumer that bypasses the one reader reads nothing.
vi.mock("@/lib/core/indexer", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/core/indexer")>();
    const refuse = async () => {
        throw new Error("read outside getCoreEvents");
    };
    return {
        ...actual,
        getCoreEvents: (...args: unknown[]) => getCoreEventsMock(...args),
        getAllOrderCommitted: refuse,
        getAllOrderResolved: refuse,
    };
});
vi.mock("@/lib/shared/wagmi", () => ({ publicClient: CLIENT, activeChain: { id: 31337 } }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => SPECS }));
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: () => NO_ASSEMBLIES }));
vi.mock("@/lib/composition/indexer", () => ({ getAllAttestationRecords: async () => [] }));
vi.mock("@/lib/composition/contracts", () => ({
    getSwapRouter: () => null,
    getWitnessSwapAndCommitCoordinator: () => null,
}));

import { useProcessOrders } from "@/hooks/useProcessOrders";
import { useWalletProcessIds } from "@/hooks/useWalletProcessIds";
import { useWalletProcessRows } from "@/lib/core/walletProcessQueries";
import { useGraphCorpus } from "@/lib/data/graphCorpus";
import { mapRead, present } from "@/lib/shared/networkRead";

const COMMITTED: OrderCommittedEvent = {
    orderHash: word(0x50),
    processId: PROCESS,
    buyer: BUYER,
    seller: SELLER,
    currency: "0x00000000000000000000000000000000000000c1",
    payment: 10n,
    cumulativeValue: 10n,
    checkoutHash: word(0xc4ec),
    salt: 1n,
    deadline: 2_000_000_000n,
    blockNumber: 7,
    transactionHash: word(0x50),
};
const EVENTS: CoreEvents = { orderCommitted: [COMMITTED], orderResolved: [], processResolved: [] };

describe("the order consumers read through getCoreEvents", () => {
    beforeEach(() => {
        getCoreEventsMock.mockReset();
        getCoreEventsMock.mockResolvedValue({ events: EVENTS, committedLogs: [] });
    });

    it("useProcessOrders", async () => {
        const { result } = renderHook(() => useProcessOrders(PROCESS));
        await waitFor(() => expect(mapRead(result.current, (orders) => orders.map((o) => o.processId))).toEqual(present([PROCESS])));
        expect(getCoreEventsMock).toHaveBeenCalled();
    });

    it("useWalletProcessIds", async () => {
        const { result } = renderHook(() => useWalletProcessIds(BUYER));
        await waitFor(() => expect(result.current.map((s) => s.processId)).toEqual([PROCESS]));
        expect(getCoreEventsMock).toHaveBeenCalled();
    });

    it("useWalletProcessRows", async () => {
        const { result } = renderHook(() => useWalletProcessRows("buyer"));
        await waitFor(() => expect(mapRead(result.current.read, (rows) => rows.map((r) => r.processId))).toEqual(present([PROCESS])));
        expect(getCoreEventsMock).toHaveBeenCalled();
    });

    it("useGraphCorpus", async () => {
        const { result } = renderHook(() => useGraphCorpus());
        await waitFor(() => expect(result.current.status).toBe("present"));
        expect(mapRead(result.current, (corpus) => [...corpus.process.processes.keys()])).toEqual(present([PROCESS]));
        expect(getCoreEventsMock).toHaveBeenCalled();
    });
});
