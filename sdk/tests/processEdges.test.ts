/**
 * A process's orders and the edges its parties signed (`processEdges`,
 * `@figaro-protocol/sdk/derive`).
 *
 * FigaroCore orders a process's commits by the running total each carried,
 * and fixes no order among sibling orders: a seller may accept before its
 * sibling does. So a reader names an edge between two orders only from the
 * order's own agreement, whose leaves hash to the order's `checkoutHash`. The
 * design R; A follows R; B follows R; C follows A, committed R, A, C, B, is the
 * case a positional reading gets wrong ("C follows R", "B follows A").
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { commitOrder, projectProcessGraph } from "../src/derive/graphs.js";
import { followsOfEdges, marketShape, processEdges } from "../src/derive/queries.js";
import { reconstructOrdersFromProcessDesign, type ReconstructedOrder } from "../src/reconstructOrders.js";
import { composeAuthoredAgreements, composeAuthoredProcessDesign } from "../src/projection.js";
import { computeCheckoutHash, type Agreement } from "../src/agreement.js";
import type { HydratedProcessDesign, RegisteredAgreement } from "../src/assembly.js";
import type { CoreEvents } from "../src/state.js";
import type { Address, Hex, Order, OrderCommittedEvent } from "../src/types.js";
import { specSourceOf, viewOf } from "./specFixtures.js";

const ROOT = path.resolve(__dirname, "../..");
const word = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const PROCESS = word(0xf00);
const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as Address;
const TOKEN = "0x0000000000000000000000000000000000000001" as Address;
const CORE = "0x00000000000000000000000000000000000000c0" as Address;

// ── A fan-out with a chain below one branch, committed out of the design's order ──

const [R, A, B, C] = [word(0x01), word(0x02), word(0x03), word(0x04)];

/** Each order's signed agreement: its topology leaf names the orders it follows. */
const SIGNED: Record<Hex, Agreement> = {
    [R]: { version: "a1", buyer: BUYER, seller: SELLER, clauses: [], follows: [] },
    [A]: { version: "a1", buyer: BUYER, seller: SELLER, clauses: [], follows: [R] },
    [B]: { version: "a1", buyer: BUYER, seller: SELLER, clauses: [], follows: [R] },
    [C]: { version: "a1", buyer: BUYER, seller: SELLER, clauses: [], follows: [A] },
};

/** The `OrderCommitted` events of R, A, C, B in that order: C's seller
 *  accepted before B's. `block` gives each commit its block. */
function outOfDesignOrder(block: (i: number) => number): CoreEvents {
    let total = 0n;
    const orderCommitted: OrderCommittedEvent[] = [R, A, C, B].map((orderHash, i) => {
        const payment = BigInt(10 * (i + 1));
        total += payment;
        return {
            orderHash, processId: PROCESS, buyer: BUYER, seller: SELLER, token: TOKEN, payment,
            runningTotal: total, checkoutHash: computeCheckoutHash(SIGNED[orderHash]), salt: 1n,
            commitDeadline: 1n, blockNumber: block(i), transactionHash: null,
        };
    });
    return { orderCommitted, orderResolved: [], processResolved: [] };
}

const held = (order: Order): Agreement | undefined => SIGNED[order.orderHash];

describe("processEdges — sibling orders committed out of the design's order", () => {
    it("states each order's signed edges, never one taken from its commit position", () => {
        const got = processEdges(projectProcessGraph(outOfDesignOrder((i) => 10 + i)), held).get(PROCESS)!;
        expect(got.orders).toEqual([R, A, C, B]);
        expect(new Map(got.follows)).toEqual(new Map([[R, []], [A, [R]], [C, [A]], [B, [R]]]));
    });

    it("states the same edges on the batch path (every commit in one block)", () => {
        const got = processEdges(projectProcessGraph(outOfDesignOrder(() => 42)), held).get(PROCESS)!;
        expect(got.orders).toEqual([R, A, C, B]);
        expect(new Map(got.follows)).toEqual(new Map([[R, []], [A, [R]], [C, [A]], [B, [R]]]));
    });

    it("a reader that holds no agreement states no edge: only the commit order", () => {
        const got = processEdges(projectProcessGraph(outOfDesignOrder((i) => 10 + i)), () => undefined).get(PROCESS)!;
        expect(got.orders).toEqual([R, A, C, B]);
        expect(got.follows.size).toBe(0);
    });

    it("an agreement held for another order, or altered, yields no edge for that order", () => {
        const graph = projectProcessGraph(outOfDesignOrder((i) => 10 + i));
        const got = processEdges(graph, (order) => {
            if (order.orderHash === B) return SIGNED[C];
            if (order.orderHash === C) return { ...SIGNED[C], follows: [R] };
            return SIGNED[order.orderHash];
        }).get(PROCESS)!;
        expect(got.follows.has(B)).toBe(false);
        expect(got.follows.has(C)).toBe(false);
        expect(got.follows.get(A)).toEqual([R]);
    });

    it("an agreement with no topology leaf leaves its order's edges unknown, never empty", () => {
        const bare: Agreement = { version: "a1", buyer: BUYER, seller: SELLER, clauses: [] };
        const events = outOfDesignOrder((i) => 10 + i);
        events.orderCommitted[2] = { ...events.orderCommitted[2], checkoutHash: computeCheckoutHash(bare) };
        const got = processEdges(projectProcessGraph(events), (order) => (order.orderHash === C ? bare : SIGNED[order.orderHash])).get(PROCESS)!;
        expect(got.follows.has(C)).toBe(false);
    });

    it("marketShape counts the signed shape, and a process with an unread agreement as unshaped", () => {
        const graph = projectProcessGraph(outOfDesignOrder((i) => 10 + i));
        const signed = marketShape(graph, () => "m", followsOfEdges(processEdges(graph, held))).groups.get("m")!;
        expect(signed.shapes).toEqual([{ orderCount: 4, depth: 2, maxWidth: 2, processCount: 1 }]);
        const partial = processEdges(graph, (order) => (order.orderHash === B ? undefined : SIGNED[order.orderHash]));
        const unread = marketShape(graph, () => "m", followsOfEdges(partial)).groups.get("m")!;
        expect(unread.shapes).toEqual([]);
        expect(unread.unshapedProcessCount).toBe(1);
    });
});

// ── The reference process design, realized through the one design → orders walk ──

/** The reference process design, derived as the seeding derives it. */
function referenceDesign(file: string): HydratedProcessDesign {
    const clausesDir = path.join(ROOT, "clauses");
    const specs = specSourceOf(readdirSync(clausesDir).filter((f) => f.endsWith(".json"))
        .map((f) => viewOf(JSON.parse(readFileSync(path.join(clausesDir, f), "utf8")))));
    const agreementsDir = path.join(ROOT, "agreements");
    const written: Record<string, object> = {};
    for (const f of readdirSync(agreementsDir).filter((f) => f.endsWith(".json"))) {
        written[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(path.join(agreementsDir, f), "utf8"));
    }
    const byName: Record<string, RegisteredAgreement> = {};
    for (const [name, { document }] of Object.entries(composeAuthoredAgreements(written, specs))) byName[name] = document;
    const authored = JSON.parse(readFileSync(path.join(ROOT, "assemblies", file), "utf8"));
    return composeAuthoredProcessDesign(authored, byName, specs);
}

async function realize(hydrated: HydratedProcessDesign): Promise<ReconstructedOrder[]> {
    return reconstructOrdersFromProcessDesign(hydrated, {
        buyer: BUYER,
        currency: TOKEN,
        chainId: 31337,
        core: CORE,
        nodes: (p) => ({ seller: SELLER, payment: BigInt(10 * (p.index + 1)) }),
        salt: (id) => BigInt(id.length + 7),
        deadline: 1770000000n,
    });
}

function committedEvents(orders: readonly ReconstructedOrder[]): CoreEvents {
    const orderCommitted: OrderCommittedEvent[] = orders.map((o, i) => ({
        orderHash: o.orderHash,
        processId: o.processId,
        buyer: o.commitment.buyer,
        seller: o.commitment.seller,
        token: o.commitment.token,
        payment: o.commitment.payment,
        runningTotal: o.runningTotal,
        checkoutHash: o.checkoutHash,
        salt: o.commitment.salt,
        commitDeadline: o.commitment.commitDeadline,
        blockNumber: 10 + i,
        transactionHash: null,
    }));
    return { orderCommitted, orderResolved: [], processResolved: [] };
}

describe("processEdges — the reference process design's realized agreements", () => {
    it("reads each order's topology leaf from its agreement, anchored to its checkoutHash", async () => {
        const orders = await realize(referenceDesign("tradelens.json"));
        expect(orders.length).toBeGreaterThan(2);
        const byOrder = new Map(orders.map((o) => [o.orderHash, o.agreement]));
        const got = processEdges(projectProcessGraph(committedEvents(orders)), (order) => byOrder.get(order.orderHash)).get(orders[0].processId)!;
        expect(new Map(got.follows)).toEqual(new Map(orders.map((o) => [o.orderHash, [...(o.agreement.follows ?? [])]])));
    });

    it("commitOrder reads the commits by the running total, whatever order the map holds them in", async () => {
        const orders = await realize(referenceDesign("tradelens.json"));
        const graph = projectProcessGraph(committedEvents([...orders].reverse()));
        expect(commitOrder(graph.processes.get(orders[0].processId)!).map((o) => o.orderHash)).toEqual(orders.map((o) => o.orderHash));
    });
});
