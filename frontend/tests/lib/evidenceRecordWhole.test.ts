/**
 * The evidence file a party hands a forum is whole, and says what it lacks.
 *
 * The record for ONE process is built from a fixed set of chain events (the
 * encoded logs of `__fixtures__/coreLogs.ts`, served where a node would serve
 * them) and compared with those events: every committed order, every
 * resolution and every attestation of the process appears once, tagged with the
 * path that emitted it, with its transaction and its amounts in the process's
 * token. When one input is missing, the record names the missing part and the
 * reason in `missing`, and invents nothing.
 *
 * Proves: the record's timeline and per-order bundles hold the events of both
 * paths once each; each of five missing inputs (an agreement, a clause spec, the
 * attestation read, the timeline, the token's decimals) reaches `missing`; the
 * process's token comes from the commitment, never from a clause.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { attestationLog, orderCommittedLog, orderResolvedLog, word, type FixtureLog } from "./__fixtures__/coreLogs";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import { activeChain } from "@/lib/shared/chains";
import { OrderState, type Order } from "@/lib/kernel/store";
import type { Agreement } from "@figaro-protocol/sdk";

const { logsMock, CORE, VERIFIER, COORD } = vi.hoisted(() => ({
    logsMock: vi.fn(),
    CORE: "0x3333333333333333333333333333333333333333",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    COORD: "0x1111111111111111111111111111111111111111",
}));

vi.mock("@/lib/kernel/eventCache", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/kernel/eventCache")>()),
    cachedGetContractEvents: (...a: unknown[]) => logsMock("timeline", ...a),
    cachedGetLogs: (...a: unknown[]) => logsMock("indexer", ...a),
    deploymentBlock: () => 0n,
}));
vi.mock("@/lib/kernel/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/kernel/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
}));
vi.mock("@/lib/composition/contracts", () => ({
    getAttestationCoordinator: () => COORD,
    getBatchVerifier: () => VERIFIER,
}));
vi.mock("@/lib/protocol/membersRegistryIndexer", () => ({ getAllMemberRegistered: async () => [], getActiveMembers: async () => [] }));
vi.mock("@/lib/audit/documentProjection", () => ({ projectDocuments: () => [], projectAllFinancialStatements: () => [] }));

import { buildAuditBundleData } from "@/lib/audit/auditBundlePdf";

const PROCESS = word(0xab);
const BUYER = "0x00000000000000000000000000000000000000b1" as const;
const SELLER = "0x00000000000000000000000000000000000000a1" as const;
const TOKEN = "0x00000000000000000000000000000000000000c1";
const OTHER_TOKEN = "0x00000000000000000000000000000000000000d2";
const ORDER_A = word(0x0a);
const ORDER_B = word(0x0b);
const ORDER_C = word(0x0c);
const CHECKOUT = { [ORDER_A]: word(0xca), [ORDER_B]: word(0xcb), [ORDER_C]: word(0xcc) } as Record<string, string>;
const UNLOADED_CLAUSE = word(0xdead);
const PAYMENT = { [ORDER_A]: 5_000_000n, [ORDER_B]: 3_000_000n, [ORDER_C]: 2_000_000n } as Record<string, bigint>;

let processLogClause: `0x${string}`;
let commerceClause: `0x${string}`;
beforeAll(async () => {
    await primeClauseSpecs(["figaro-courier-process", "figaro-commerce"]);
    processLogClause = keyOf("figaro-courier-process");
    commerceClause = keyOf("figaro-commerce");
});

function commit(address: string, block: bigint, orderHash: `0x${string}`): FixtureLog {
    return {
        ...orderCommittedLog({ address, blockNumber: block, orderHash, processId: PROCESS, buyer: BUYER, seller: SELLER, payment: PAYMENT[orderHash] }),
        args: { orderHash, processId: PROCESS, buyer: BUYER, seller: SELLER, currency: TOKEN, payment: PAYMENT[orderHash] },
    };
}
const resolve = (address: string, block: bigint, orderHash: `0x${string}`) =>
    orderResolvedLog({ address, blockNumber: block, orderHash, processId: PROCESS, sellerPayout: PAYMENT[orderHash], buyerPayout: 0n });
const attest = (address: string, block: bigint, orderHash: `0x${string}`, clauseId: `0x${string}`, contentRef: `0x${string}`) =>
    attestationLog({ address, blockNumber: block, orderHash, processId: PROCESS, attester: SELLER, clauseId, stage: 1, contentRef });

// Two orders committed and resolved on the direct path, one on the batch path.
const COMMITS = [commit(CORE, 1n, ORDER_A), commit(CORE, 2n, ORDER_B), commit(VERIFIER, 3n, ORDER_C)];
const RESOLVES = [resolve(CORE, 7n, ORDER_A), resolve(CORE, 7n, ORDER_B), resolve(VERIFIER, 8n, ORDER_C)];
const REF_A = word(0xa1);
const REF_C = word(0xc1);

let attestations: FixtureLog[];
let failures: { timeline?: string; attestationIndexer?: boolean; decimals?: boolean };

function serve(kind: string, _client: unknown, _chainId: number, p: { address: string; eventName: string }) {
    if (kind === "timeline" && failures.timeline === p.eventName) throw new Error("rpc down");
    if (kind === "indexer" && failures.attestationIndexer && p.eventName === "Attestation") throw new Error("rpc down");
    const table: Record<string, FixtureLog[]> = { OrderCommitted: COMMITS, OrderResolved: RESOLVES, Attestation: attestations };
    return (table[p.eventName] ?? []).filter((l) => l.address.toLowerCase() === p.address.toLowerCase());
}

function client() {
    return {
        getChainId: async () => activeChain.id,
        getBlock: async () => ({ timestamp: 1_700_000_000n }),
        readContract: async () => { if (failures.decimals) throw new Error("no decimals"); return 6; },
    };
}

function orderOf(orderHash: `0x${string}`): Order {
    return {
        orderHash, processId: PROCESS, buyer: BUYER, seller: SELLER, currency: TOKEN, checkoutHash: CHECKOUT[orderHash],
        payment: PAYMENT[orderHash], cumulativeValue: PAYMENT[orderHash], state: OrderState.Resolved,
        sellerBond: 0n, buyerBond: 0n, salt: 1n, deadline: 1n,
    } as Order;
}
const ORDERS = [orderOf(ORDER_A), orderOf(ORDER_B), orderOf(ORDER_C)];
function agreementsFor(clauses: Agreement["clauses"] = [], skip: string[] = []) {
    return new Map(
        [ORDER_A, ORDER_B, ORDER_C]
            .filter((o) => !skip.includes(o))
            .map((o) => [CHECKOUT[o], { buyer: BUYER, seller: SELLER, clauses } as unknown as Agreement] as const),
    );
}
const build = (agreements = agreementsFor()) =>
    buildAuditBundleData(PROCESS, ORDERS, client() as never, activeChain.id, agreements, {});

beforeEach(() => {
    failures = {};
    attestations = [attest(COORD, 5n, ORDER_A, processLogClause, REF_A), attest(VERIFIER, 6n, ORDER_C, processLogClause, REF_C)];
    logsMock.mockReset();
    logsMock.mockImplementation(serve);
});

describe("the evidence file holds the process's events, once each", () => {
    it("lists every commit, resolution and attestation with its path, transaction and amount in the token", async () => {
        const data = await build();
        const events = data.timeline!.events;
        const row = (name: string, orderHash: string) => events.filter((e) => e.eventName === name && e.orderHash === orderHash);

        for (const log of COMMITS) {
            const orderHash = log.args!.orderHash as string;
            const rows = row("OrderCommitted", orderHash);
            expect(rows).toHaveLength(1);
            expect(rows[0].universe).toBe(log.address === VERIFIER ? "batch" : "direct");
            expect(rows[0].txHash).toBe(log.transactionHash);
            expect(rows[0].details.currency).toBe(TOKEN);
            expect(rows[0].details.payment).toBe(String(Number(PAYMENT[orderHash]) / 1e6));
        }
        for (const log of RESOLVES) {
            const orderHash = log.args!.orderHash as string;
            const rows = row("OrderResolved", orderHash);
            expect(rows).toHaveLength(1);
            expect(rows[0].universe).toBe(log.address === VERIFIER ? "batch" : "direct");
            expect(rows[0].txHash).toBe(log.transactionHash);
            expect(rows[0].details.sellerPayout).toBe(String(Number(PAYMENT[orderHash]) / 1e6));
        }
        for (const log of attestations) {
            const rows = row("Attestation", log.args!.orderHash as string);
            expect(rows).toHaveLength(1);
            expect(rows[0].universe).toBe(log.address === VERIFIER ? "batch" : "direct");
            expect(rows[0].txHash).toBe(log.transactionHash);
            expect(rows[0].details.contentRef).toBe(log.args!.contentRef);
        }
        expect(events).toHaveLength(COMMITS.length + RESOLVES.length + attestations.length);
        expect(data.timeline!.summary).toMatchObject({ orderCount: 3, resolvedCount: 3, totalPayment: "10" });
    });

    it("holds one bundle per order, each with its own attestations tagged by path, and says nothing is missing", async () => {
        const data = await build();
        expect(data.perOrderBundles.map((b) => b.contract.orderHash)).toEqual([ORDER_A, ORDER_B, ORDER_C]);
        const entries = (orderHash: string) => data.perOrderBundles.find((b) => b.contract.orderHash === orderHash)!
            .processLogs.logs.flatMap((g) => g.events.map((e) => [e.universe, e.contentRef, e.transactionHash]));
        expect(entries(ORDER_A)).toEqual([["direct", REF_A, attestations[0].transactionHash]]);
        expect(entries(ORDER_B)).toEqual([]);
        expect(entries(ORDER_C)).toEqual([["batch", REF_C, attestations[1].transactionHash]]);
        expect(data.tokenDecimals).toBe(6);
        expect(data.missing).toEqual([]);
    });
});

describe("the evidence file names what it does not contain", () => {
    const parts = (data: { missing: readonly { part: string; reason: string }[] }) => data.missing.map((m) => `${m.part} | ${m.reason}`);

    it("names an order whose agreement was not loaded, and still lists its events", async () => {
        const data = await build(agreementsFor([], [ORDER_B]));
        expect(data.perOrderBundles.map((b) => b.contract.orderHash)).toEqual([ORDER_A, ORDER_C]);
        const missing = data.missing.filter((m) => m.orderHash === ORDER_B);
        expect(missing).toHaveLength(1);
        expect(missing[0].part).toMatch(/agreement/i);
        expect(missing[0].reason).toContain("not loaded");
        expect(data.timeline!.events.some((e) => e.orderHash === ORDER_B && e.eventName === "OrderCommitted")).toBe(true);
    });

    it("names an attestation whose clause spec was not loaded, with its fingerprint, and a clause whose spec was not loaded", async () => {
        attestations = [attest(COORD, 5n, ORDER_A, UNLOADED_CLAUSE, REF_A)];
        const agreements = agreementsFor([{ clause: UNLOADED_CLAUSE, data: { x: "1" } } as never]);
        const data = await build(agreements);
        const text = parts(data).join("\n");
        expect(text).toContain(REF_A);
        expect(text).toContain(`Spec of clause ${UNLOADED_CLAUSE}`);
        expect(text).toContain("spec");
        // Nothing is invented: the attestation is in no clause's timeline.
        expect(data.perOrderBundles[0].processLogs.logs).toEqual([]);
    });

    it("names the attestations of an order whose attestation read failed, instead of an empty list", async () => {
        failures.attestationIndexer = true;
        const data = await build();
        const missing = data.missing.filter((m) => m.part.includes("ttestation"));
        expect(missing.map((m) => m.orderHash).sort()).toEqual([ORDER_A, ORDER_B, ORDER_C].sort());
        expect(missing[0].reason).toContain("failed");
        expect(data.perOrderBundles).toHaveLength(3);
    });

    it("names the timeline when its read failed", async () => {
        failures.timeline = "OrderCommitted";
        const data = await build();
        expect(data.timeline).toBeNull();
        expect(data.missing.map((m) => m.part)).toContain("Process timeline");
        expect(data.missing.find((m) => m.part === "Process timeline")!.reason).toContain("failed");
    });

    it("names the amounts' unit when the token's decimals could not be read", async () => {
        failures.decimals = true;
        const data = await build();
        expect(data.tokenDecimals).toBeUndefined();
        expect(parts(data).join("\n")).toContain("decimals");
        expect(data.timeline!.missing.length).toBeGreaterThan(0);
    });
});

describe("the process's token is the commitment's", () => {
    it("shows the token the chain's event names when a clause names another", async () => {
        const agreements = agreementsFor([{ clause: commerceClause, data: { currency: OTHER_TOKEN, lineItems: [] } } as never]);
        const data = await build(agreements);
        for (const b of data.perOrderBundles) expect(b.contract.currency).toBe(TOKEN);
    });
});
