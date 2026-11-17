/**
 * The `/data/explore` corpus reads a batched trade. FigaroBatchVerifier emits
 * the Core's own `OrderCommitted`, `OrderResolved` and `ProcessResolved` for
 * every batched order (src/core/verifier/FigaroBatchVerifier.sol), so each
 * layer of the page that shows orders folds what the verifier emitted.
 *
 * Every log here is at the verifier's address; the Core's address answers
 * nothing. The logs are the bytes a node returns, read through the real
 * indexer (`getCoreEvents`) and the real hook (`useGraphCorpus`), and each
 * layer is read with the row builder the page renders from
 * (`lib/data/explorer.ts`).
 *
 * Proves, one event and one layer per case:
 * - OrderCommitted from the verifier reaches the market layer (the process is
 *   counted and listed, unattributed), the value-flow layer (its denomination
 *   counts the process) and the wallet layer (the buyer's and the seller's
 *   orders).
 * - OrderResolved from the verifier reaches the value-flow layer (a resolved
 *   order and its volume) and the wallet layer (the order row is resolved).
 * - ProcessResolved from the verifier reaches the wallet layer (the root
 *   buyer's process counts as resolved).
 *
 * The trade layer reads no corpus: it opens `/audit/view`, whose batch path is
 * held by `processTimelineBatchPath.test.ts`. `OrderSeller` is read by no layer
 * of this page: the seller is a field of `OrderCommitted`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { walletRecord } from "@figaro-protocol/sdk/derive";
import { orderCommittedLog, orderResolvedLog, processResolvedLog, word, type FixtureLog } from "./__fixtures__/coreLogs";

const { cachedGetLogsMock, CORE, VERIFIER, CLIENT, NO_ASSEMBLIES, SPECS } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    CORE: "0x1111111111111111111111111111111111111111",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    // Token metadata is not answered: the rows keep base units and the address.
    CLIENT: { chain: { id: 31337 }, readContract: async () => { throw new Error("no token"); } },
    NO_ASSEMBLIES: { read: { status: "present" as const, value: [] }, refetch: () => undefined },
    SPECS: { version: 0, loaded: true },
}));

vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
}));
vi.mock("@/lib/shared/publicClient", () => ({ publicClient: CLIENT }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => SPECS }));
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: () => NO_ASSEMBLIES }));
vi.mock("@/lib/composition/indexer", () => ({ getAllAttestationRecords: async () => [] }));
vi.mock("@/lib/composition/contracts", () => ({
    getSwapRouter: () => null,
    getWitnessSwapAndCommitCoordinator: () => null,
}));

import { useGraphCorpus, type GraphCorpus } from "@/lib/data/graphCorpus";
import { denominationRows, processRowsForMarket, walletOrderRows, walletRecordSummary } from "@/lib/data/explorer";

const PROCESS = word(0xba7c);
const ORDER = word(0x0bd1);
const BUYER = "0x00000000000000000000000000000000000000b1" as const;
const SELLER = "0x00000000000000000000000000000000000000a1" as const;
const TOKEN = "0x00000000000000000000000000000000000000c1";
const PAYMENT = 7n;

const committed = orderCommittedLog({ address: VERIFIER, blockNumber: 4n, orderHash: ORDER, processId: PROCESS, buyer: BUYER, seller: SELLER, payment: PAYMENT });
const resolved = orderResolvedLog({ address: VERIFIER, blockNumber: 9n, orderHash: ORDER, processId: PROCESS, sellerPayout: 3n * PAYMENT, buyerPayout: PAYMENT });
const processClosed = processResolvedLog({ address: VERIFIER, blockNumber: 9n, processId: PROCESS, buyer: BUYER });

/** The verifier emits `logs`, each under its own event name; the Core emits nothing. */
function verifierEmits(logs: Record<string, FixtureLog[]>) {
    cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
        opts.address === VERIFIER ? (logs[opts.eventName] ?? []) : [],
    );
}

async function readCorpus(): Promise<GraphCorpus> {
    const { result } = renderHook(() => useGraphCorpus());
    await waitFor(() => expect(result.current.status).toBe("present"));
    if (result.current.status !== "present") throw new Error("corpus not present");
    return result.current.value;
}

describe("/data/explore reads a batched trade's order events from FigaroBatchVerifier", () => {
    beforeEach(() => {
        cachedGetLogsMock.mockReset();
    });

    it("OrderCommitted from the verifier — market layer: the process is counted and listed", async () => {
        verifierEmits({ OrderCommitted: [committed] });
        const corpus = await readCorpus();
        expect(corpus.market.unattributedProcessCount).toBe(1);
        expect(processRowsForMarket(corpus.process, corpus.attributionByProcess, null).map((r) => r.processId)).toEqual([PROCESS]);
    });

    it("OrderCommitted from the verifier — value-flow layer: its denomination counts the process", async () => {
        verifierEmits({ OrderCommitted: [committed] });
        const rows = denominationRows((await readCorpus()).valueFlow);
        expect(rows.map((r) => [r.token.toLowerCase(), r.processCount, r.settledOrderCount])).toEqual([[TOKEN, 1, 0]]);
    });

    it("OrderCommitted from the verifier — wallet layer: the buyer's and the seller's orders", async () => {
        verifierEmits({ OrderCommitted: [committed] });
        const corpus = await readCorpus();
        const buyer = walletRecordSummary(walletRecord(corpus.process, BUYER));
        const seller = walletRecordSummary(walletRecord(corpus.process, SELLER));
        expect([buyer.empty, buyer.processesAsRootBuyer, buyer.ordersAsBuyer]).toEqual([false, 1, 1]);
        expect([seller.empty, seller.ordersAsSeller]).toEqual([false, 1]);
    });

    it("OrderResolved from the verifier — value-flow layer: the resolved order and its volume", async () => {
        verifierEmits({ OrderCommitted: [committed], OrderResolved: [resolved] });
        const rows = denominationRows((await readCorpus()).valueFlow);
        expect(rows.map((r) => [r.token.toLowerCase(), r.settledOrderCount, r.settledVolume])).toEqual([[TOKEN, 1, PAYMENT]]);
    });

    it("OrderResolved from the verifier — wallet layer: the order row is resolved", async () => {
        verifierEmits({ OrderCommitted: [committed], OrderResolved: [resolved] });
        const rows = walletOrderRows(walletRecord((await readCorpus()).process, SELLER));
        expect(rows.map((r) => [r.orderHash, r.side, r.resolved])).toEqual([[ORDER, "seller", true]]);
    });

    it("ProcessResolved from the verifier — wallet layer: the root buyer's process is resolved", async () => {
        verifierEmits({ OrderCommitted: [committed], ProcessResolved: [processClosed] });
        const summary = walletRecordSummary(walletRecord((await readCorpus()).process, BUYER));
        expect([summary.processesAsRootBuyer, summary.resolvedProcesses]).toEqual([1, 1]);
    });
});
