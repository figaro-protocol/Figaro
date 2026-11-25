/**
 * The readers of a process's edges read a batched trade's topology leaf.
 * FigaroBatchVerifier emits the Core's own `OrderCommitted` for every batched
 * order (src/core/verifier/FigaroBatchVerifier.sol), so a batched process's
 * orders come from the verifier's address alone; the edges come from each
 * order's signed agreement (`Agreement.follows`), off the chain
 * (docs/DESIGN_DECISIONS.md § 31 and § 32).
 *
 * The logs are the bytes a node returns, read through the real indexer
 * (`getCoreEvents`) and folded as `useProcessOrders` folds them (the SDK's
 * `Topology`, projected by `orderFromSdk`). Each reader is then handed the
 * agreements map, keyed by checkout hash, as its page hands it.
 *
 * Proves, one reader per case, for a two-order batched process whose
 * sub-order's leaf names the opening order:
 * - the order page's process model (`deriveProcessModelFromRuntime`) shows the
 *   sub-order following the opening order, and the opening order following none;
 * - the evidence file's contract section (`buildAuditBundleData` →
 *   `extractContract`) states the same edges for each order.
 *
 * The analyst agent's reader is held in
 * `ecosystem-agents/runtime/tests/analyst.test.mjs`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Topology, type Agreement, type Hex } from "@figaro-protocol/sdk";
import { orderCommittedLog, word, type FixtureLog } from "./__fixtures__/coreLogs";

const { cachedGetLogsMock, CORE, VERIFIER } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    CORE: "0x1111111111111111111111111111111111111111",
    VERIFIER: "0x2222222222222222222222222222222222222222",
}));

vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { contracts: { core: CORE, batchVerifier: VERIFIER } }));

import { getCoreEvents } from "@/lib/core/indexer";
import { orderFromSdk, type Order } from "@/lib/core/store";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { buildAuditBundleData } from "@/lib/data/audit/auditBundlePdf";

const PROCESS = word(0xba7c);
const ROOT = word(0x0a01);
const SUB = word(0x0a02);
const ROOT_CHECKOUT = word(0xe1);
const SUB_CHECKOUT = word(0xe2);
const BUYER = "0x00000000000000000000000000000000000000b1" as const;
const ROOT_SELLER = "0x00000000000000000000000000000000000000a1" as const;
const SUB_SELLER = "0x00000000000000000000000000000000000000a2" as const;
const CHAIN_ID = 31337;

const committed: FixtureLog[] = [
    orderCommittedLog({ address: VERIFIER, blockNumber: 4n, orderHash: ROOT, processId: PROCESS, buyer: BUYER, seller: ROOT_SELLER, payment: 3n, runningTotal: 3n, checkoutHash: ROOT_CHECKOUT }),
    { ...orderCommittedLog({ address: VERIFIER, blockNumber: 4n, orderHash: SUB, processId: PROCESS, buyer: BUYER, seller: SUB_SELLER, payment: 2n, runningTotal: 5n, checkoutHash: SUB_CHECKOUT }), logIndex: 1 },
];

const agreementOf = (seller: `0x${string}`, follows: Hex[]): Agreement => ({
    version: "a1",
    buyer: BUYER,
    seller,
    clauses: [],
    follows,
});
const agreements = new Map<string, Agreement>([
    [ROOT_CHECKOUT, agreementOf(ROOT_SELLER, [])],
    [SUB_CHECKOUT, agreementOf(SUB_SELLER, [ROOT])],
]);

/** The batched process's orders, read and folded as the order page reads them. */
async function batchedOrders(): Promise<Order[]> {
    const { events } = await getCoreEvents({ chain: { id: CHAIN_ID } } as never, CHAIN_ID);
    const topology = new Topology();
    topology.applyEvents(events);
    const process = topology.getProcess(PROCESS);
    return process ? [...process.orders.values()].map(orderFromSdk) : [];
}

describe("the readers of a process's edges read a batched trade's topology leaf", () => {
    beforeEach(() => {
        cachedGetLogsMock.mockReset();
        // The verifier emits both commits; the Core emits nothing.
        cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
            opts.address === VERIFIER && opts.eventName === "OrderCommitted" ? committed : [],
        );
    });

    it("reads both orders from the verifier's address alone", async () => {
        const orders = await batchedOrders();
        expect(orders.map((o) => [o.orderHash, o.checkoutHash]).sort()).toEqual([[ROOT, ROOT_CHECKOUT], [SUB, SUB_CHECKOUT]]);
    });

    it("the order page's process model: the sub-order follows the opening order", async () => {
        const orders = await batchedOrders();
        const summary = { processId: PROCESS, orderCount: orders.length, hasActive: true, createdAt: 0, orders: [] };
        const model = deriveProcessModelFromRuntime(summary, orders, agreements, BUYER);
        expect(model.rootOrderId).toBe(ROOT);
        expect(model.orders.map((o) => [o.orderId, o.follows])).toEqual([[ROOT, []], [SUB, [ROOT]]]);
    });

    it("the evidence file's contract section: each order states the edges its leaf names", async () => {
        const orders = await batchedOrders();
        const data = await buildAuditBundleData(PROCESS, orders, undefined, CHAIN_ID, agreements, { includeTimeline: false });
        expect(data.perOrderBundles.map((b) => [b.contract.orderHash, b.contract.topology]).sort()).toEqual([
            [ROOT, { position: "root", composed: true, follows: [] }],
            [SUB, { position: "sub-order", composed: true, follows: [ROOT] }],
        ]);
    });
});
