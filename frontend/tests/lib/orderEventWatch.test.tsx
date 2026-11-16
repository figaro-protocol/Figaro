/**
 * Live order updates watch every order emitter. FigaroBatchVerifier emits
 * FigaroCore's own order events for every batched order, so a watcher on the
 * Core alone never hears a batch-path commit: the order appears only after a
 * reload. Each consumer of the order events must see a batch-path order the
 * moment its event lands.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { getAbiItem, type Abi } from "viem";
import { orderCommittedLog, selectorOf, word, type FixtureLog } from "./__fixtures__/coreLogs";

const { CORE, VERIFIER, BUYER, SELLER, chain, watchers } = vi.hoisted(() => ({
    CORE: "0x1111111111111111111111111111111111111111",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    BUYER: "0x00000000000000000000000000000000000000b1" as const,
    SELLER: "0x00000000000000000000000000000000000000a1" as const,
    // The logs the node holds; the history read returns them.
    chain: { logs: [] as FixtureLog[] },
    watchers: new Set<{ address?: string | string[]; abi: unknown; eventName?: string; onLogs: (logs: unknown[]) => void; enabled?: boolean }>(),
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: BUYER, isConnected: true }),
    useChainId: () => 31337,
    usePublicClient: () => CLIENT,
    useWatchContractEvent: (params: { address?: string | string[]; abi: unknown; eventName?: string; onLogs: (logs: unknown[]) => void; enabled?: boolean }) => {
        watchers.add(params);
    },
}));
const CLIENT = { chain: { id: 31337 } };

vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
}));
vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: async (_client: unknown, _chainId: number, opts: { address: string; event: unknown }) =>
        chain.logs.filter((l) => l.address.toLowerCase() === opts.address.toLowerCase() && l.topics[0] === selectorOf(opts.event)),
    cachedGetReceiptLogs: async () => [],
}));

import { useWalletProcessIds } from "@/hooks/useWalletProcessIds";
import { useProcessOrders } from "@/hooks/useProcessOrders";
import { useWalletProcessRows } from "@/lib/core/walletProcessQueries";
import { mapRead, present } from "@/lib/shared/networkRead";

/** A log reaches every watcher a node would report it to: the watcher's
 *  address set names the emitter, and its event filter (if any) matches. */
function land(log: FixtureLog) {
    chain.logs.push(log);
    for (const w of [...watchers]) {
        if (w.enabled === false) continue;
        const addresses = (Array.isArray(w.address) ? w.address : [w.address]).filter(Boolean) as string[];
        if (!addresses.some((a) => a.toLowerCase() === log.address.toLowerCase())) continue;
        if (w.eventName) {
            const item = getAbiItem({ abi: w.abi as Abi, name: w.eventName });
            if (!item || selectorOf(item) !== log.topics[0]) continue;
        }
        w.onLogs([log]);
    }
}

const PROCESS = word(0x51);
const batchCommit = () =>
    orderCommittedLog({ address: VERIFIER, blockNumber: 7n, orderHash: word(0x50), processId: PROCESS, buyer: BUYER, seller: SELLER });

describe("a batch-path order event reaches the live watchers", () => {
    beforeEach(() => {
        chain.logs.length = 0;
        watchers.clear();
    });

    it("useWalletProcessIds", async () => {
        const { result } = renderHook(() => useWalletProcessIds(BUYER));
        await waitFor(() => expect(watchers.size).toBeGreaterThan(0));
        act(() => land(batchCommit()));
        await waitFor(() => expect(result.current.map((s) => s.processId)).toEqual([PROCESS]));
    });

    it("useProcessOrders", async () => {
        const { result } = renderHook(() => useProcessOrders(PROCESS));
        await waitFor(() => expect(watchers.size).toBeGreaterThan(0));
        act(() => land(batchCommit()));
        await waitFor(() => expect(mapRead(result.current, (orders) => orders.map((o) => o.processId))).toEqual(present([PROCESS])));
    });

    it("useWalletProcessRows", async () => {
        const { result } = renderHook(() => useWalletProcessRows("buyer"));
        await waitFor(() => expect(result.current.read.status).toBe("present"));
        act(() => land(batchCommit()));
        await waitFor(() => expect(mapRead(result.current.read, (rows) => rows.map((r) => r.processId))).toEqual(present([PROCESS])));
    });
});
