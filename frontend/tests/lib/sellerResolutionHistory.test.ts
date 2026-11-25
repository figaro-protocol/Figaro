/**
 * getSellerResolutionHistory — a party attests for itself, so the member's
 * attestation tally counts the attestations the member filed: never its
 * buyer's, never a co-seller's. And every figure folds both paths: an order
 * the batch verifier committed and resolved, and an attestation it
 * re-emitted, count as the Core's and the coordinator's do.
 *
 * The rows are the event cache's (`cachedGetLogs`, decoded arguments
 * attached), answered per emitter and event; the order, resolution and
 * attestation readers under test are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cachedGetLogsMock, CORE, VERIFIER, COORDINATOR } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    CORE: "0x1111111111111111111111111111111111111111",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    COORDINATOR: "0x00000000000000000000000000000000000000f1",
}));

vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
}));
vi.mock("@/lib/registries/membersRegistryIndexer", () => ({ getAllMemberRegistered: async () => [] }));
vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { contracts: { core: CORE, batchVerifier: VERIFIER }, coordinator: () => COORDINATOR, batchVerifier: () => VERIFIER }));

import { getSellerResolutionHistory } from "@/lib/registries/memberResolutionHistory";

const MEMBER = "0x00000000000000000000000000000000000000a1";
const BUYER = "0x00000000000000000000000000000000000000b1";
const CO_SELLER = "0x00000000000000000000000000000000000000c1";
const TOKEN = `0x${"77".repeat(20)}`;
const CLAUSE = `0x${"cc".repeat(32)}`;
const BATCH_CLAUSE = `0x${"dd".repeat(32)}`;

type Row = { args: Record<string, unknown>; blockNumber: bigint; logIndex: number; transactionHash: string };
const row = (blockNumber: bigint, args: Record<string, unknown>): Row =>
    ({ args, blockNumber, logIndex: 0, transactionHash: `0x${blockNumber.toString(16).padStart(64, "0")}` });

/** One order the member sold in `processId`, as its emitter's three rows. */
function sale(orderHash: string, processId: string, block: bigint) {
    return {
        OrderSeller: row(block, { orderHash, seller: MEMBER }),
        OrderCommitted: row(block, { orderHash, processId, buyer: BUYER, seller: MEMBER, token: TOKEN, payment: 5n }),
        OrderResolved: row(block + 1n, { orderHash, processId }),
    };
}
const attestation = (orderHash: string, processId: string, attester: string, clauseId: string, block: bigint) =>
    row(block, { orderHash, processId, attester, clauseId, stage: 0, contentRef: `0x${"00".repeat(32)}` });

/** The chain: each emitter answers its own rows by event name. */
function chain(rows: Record<string, Record<string, Row[]>>) {
    cachedGetLogsMock.mockReset().mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
        rows[opts.address.toLowerCase()]?.[opts.eventName] ?? []);
}

const DIRECT_ORDER = `0x${"0a".repeat(32)}`;
const DIRECT_PROCESS = `0x${"01".repeat(32)}`;

describe("getSellerResolutionHistory attestation tally", () => {
    beforeEach(() => {
        const direct = sale(DIRECT_ORDER, DIRECT_PROCESS, 1n);
        chain({
            [CORE]: { OrderSeller: [direct.OrderSeller], OrderCommitted: [direct.OrderCommitted] },
            [COORDINATOR]: {
                Attestation: [
                    attestation(DIRECT_ORDER, DIRECT_PROCESS, MEMBER, CLAUSE, 2n),    // the member's own
                    attestation(DIRECT_ORDER, DIRECT_PROCESS, BUYER, CLAUSE, 2n),     // the buyer's
                    attestation(DIRECT_ORDER, DIRECT_PROCESS, CO_SELLER, CLAUSE, 2n), // a co-seller's
                ],
            },
        });
    });

    it("counts the member's own attestation, never the buyer's or a co-seller's", async () => {
        const history = await getSellerResolutionHistory({} as never, 31337, MEMBER);
        expect(history.attestationsEmitted).toBe(1);
        expect(history.attestationsByClause).toEqual([{ clauseId: CLAUSE, count: 1 }]);
    });
});

describe("getSellerResolutionHistory folds the batch path", () => {
    const BATCH_ORDER = `0x${"0b".repeat(32)}`;
    const BATCH_PROCESS = `0x${"02".repeat(32)}`;

    beforeEach(() => {
        const direct = sale(DIRECT_ORDER, DIRECT_PROCESS, 1n);
        const batched = sale(BATCH_ORDER, BATCH_PROCESS, 10n);
        chain({
            // The direct order is committed and still open.
            [CORE]: { OrderSeller: [direct.OrderSeller], OrderCommitted: [direct.OrderCommitted] },
            // The batched order is committed and resolved by the verifier alone.
            [VERIFIER]: {
                OrderSeller: [batched.OrderSeller],
                OrderCommitted: [batched.OrderCommitted],
                OrderResolved: [batched.OrderResolved],
                Attestation: [
                    attestation(BATCH_ORDER, BATCH_PROCESS, MEMBER, BATCH_CLAUSE, 11n),
                    attestation(BATCH_ORDER, BATCH_PROCESS, BUYER, BATCH_CLAUSE, 11n),
                ],
            },
            [COORDINATOR]: { Attestation: [attestation(DIRECT_ORDER, DIRECT_PROCESS, MEMBER, CLAUSE, 2n)] },
        });
    });

    it("counts the batched order as sold and its process as completed", async () => {
        const history = await getSellerResolutionHistory({} as never, 31337, MEMBER);
        expect(history.ordersSold).toBe(2);
        expect(history.completedProcesses).toBe(1);
        expect(history.activeProcesses).toBe(1);
        expect(history.valueTransacted).toEqual([{ currency: TOKEN, total: 10n }]);
    });

    it("counts the member's batch attestation beside its direct one", async () => {
        const history = await getSellerResolutionHistory({} as never, 31337, MEMBER);
        expect(history.attestationsEmitted).toBe(2);
        expect([...history.attestationsByClause].sort((a, b) => a.clauseId.localeCompare(b.clauseId)))
            .toEqual([{ clauseId: CLAUSE, count: 1 }, { clauseId: BATCH_CLAUSE, count: 1 }]);
    });
});
