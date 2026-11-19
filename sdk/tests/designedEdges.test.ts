/**
 * A process's designed edges, rebuilt from the order events and the
 * registered process design alone (`processEdges`, `@figaro-protocol/sdk/derive`).
 *
 * The reference process design `assemblies/tradelens.json` fans out from its root
 * and runs a chain below one branch. It is realized through the one
 * process design → orders walk (`reconstructOrdersFromProcessDesign`), which writes each
 * order's parents' real order hashes into its agreement's topology leaf: the
 * edges the parties sign. No event carries that leaf. The test hands the
 * reader only what a stranger holds, the `OrderCommitted` events and the
 * registered process design, and checks that the edges it rebuilds by position are
 * the signed ones, on either path (the batch path emits the same events).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { commitOrder, projectProcessGraph } from "../src/derive/graphs.js";
import { followsOfEdges, marketShape, processEdges } from "../src/derive/queries.js";
import { planProcessOrders, reconstructOrdersFromProcessDesign, type ReconstructedOrder } from "../src/reconstructOrders.js";
import { composeAuthoredAgreements, composeAuthoredProcessDesign } from "../src/projection.js";
import { processDesignHashOf, type HydratedProcessDesign, type RegisteredAgreement } from "../src/assembly.js";
import type { CoreEvents } from "../src/state.js";
import type { Address, Hex, OrderCommittedEvent } from "../src/types.js";
import { specSourceOf, viewOf } from "./specFixtures.js";

const ROOT = path.resolve(__dirname, "../..");
const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const SELLERS = [
    "0x2546BcD3c84621e976D8185a91A922aE77ECEc30",
    "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
    "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
    "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
    "0xBcd4042DE499D14e55001CcbB24a551F3b954096",
] as Address[];
const CURRENCY = "0x0000000000000000000000000000000000000001" as Address;
const CORE = "0x00000000000000000000000000000000000000c0" as Address;

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
        currency: CURRENCY,
        chainId: 31337,
        core: CORE,
        nodes: (p) => ({ seller: SELLERS[p.index % SELLERS.length], payment: BigInt(10 * (p.index + 1)) }),
        salt: (id) => BigInt(id.length + 7),
        deadline: 1770000000n,
    });
}

/** The `OrderCommitted` events the Core (or the verifier, for a batch) emits
 *  for the realized orders, in commit order. `blocks` gives each its block. */
function committedEvents(orders: readonly ReconstructedOrder[], blocks: (i: number) => number): CoreEvents {
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
        blockNumber: blocks(i),
        transactionHash: null,
    }));
    return { orderCommitted, orderResolved: [], processResolved: [] };
}

/** The edges the parties signed: each realized agreement's topology leaf. */
function signedEdges(orders: readonly ReconstructedOrder[]): Map<Hex, Hex[]> {
    return new Map(orders.map((o) => [o.orderHash, [...(o.agreement.follows ?? [])]]));
}

describe("processEdges — a process's designed edges from the events and the registered process design", () => {
    it("rebuilds the reference process design's signed edges on the direct path (one block per commit)", async () => {
        const hydrated = referenceDesign("tradelens.json");
        const orders = await realize(hydrated);
        expect(orders.length).toBeGreaterThan(2);
        const graph = projectProcessGraph(committedEvents(orders, (i) => 10 + i));
        const pid = orders[0].processId;
        const processDesignHash = processDesignHashOf(hydrated.assembly);

        const edges = processEdges(graph, (id) =>
            id === pid ? { processDesignHash, planned: planProcessOrders(hydrated) } : undefined);
        const got = edges.get(pid)!;
        expect(got.source).toBe("design");
        expect(got.processDesignHash).toBe(processDesignHash);
        expect(got.orders).toEqual(orders.map((o) => o.orderHash));
        expect(new Map(got.follows)).toEqual(signedEdges(orders));
        // The design fans out: some order follows the root beside another.
        const rootChildren = [...got.follows.values()].filter((f) => f.length === 1 && f[0] === orders[0].orderHash);
        expect(rootChildren.length).toBeGreaterThan(1);
    });

    it("rebuilds the same edges on the batch path (every commit in one block)", async () => {
        const hydrated = referenceDesign("tradelens.json");
        const orders = await realize(hydrated);
        // A batch lands every commit in one transaction: the events are the
        // Core's own, in the order the verifier emits them.
        const graph = projectProcessGraph(committedEvents(orders, () => 42));
        const pid = orders[0].processId;
        const edges = processEdges(graph, () => ({ processDesignHash: processDesignHashOf(hydrated.assembly), planned: planProcessOrders(hydrated) }));
        expect(new Map(edges.get(pid)!.follows)).toEqual(signedEdges(orders));
    });

    it("matches an open process's commits so far to the design's first positions", async () => {
        const hydrated = referenceDesign("tradelens.json");
        const orders = (await realize(hydrated)).slice(0, 3);
        const graph = projectProcessGraph(committedEvents(orders, (i) => 10 + i));
        const edges = processEdges(graph, () => ({ processDesignHash: processDesignHashOf(hydrated.assembly), planned: planProcessOrders(hydrated) }));
        expect(edges.get(orders[0].processId)!.source).toBe("design");
        expect(new Map(edges.get(orders[0].processId)!.follows)).toEqual(signedEdges(orders));
    });

    it("a process with no link to a process design keeps FigaroCore's linear view", async () => {
        const hydrated = referenceDesign("tradelens.json");
        const orders = await realize(hydrated);
        const graph = projectProcessGraph(committedEvents(orders, (i) => 10 + i));
        const got = processEdges(graph, () => undefined).get(orders[0].processId)!;
        expect(got.source).toBe("linear");
        expect(got.processDesignHash).toBeNull();
        orders.forEach((o, i) => expect(got.follows.get(o.orderHash)).toEqual(i === 0 ? [] : [orders[i - 1].orderHash]));
    });

    it("a process with more commits than the design has positions keeps the linear view", async () => {
        const local = referenceDesign("local-commerce.json");
        const orders = await realize(referenceDesign("tradelens.json"));
        const graph = projectProcessGraph(committedEvents(orders, (i) => 10 + i));
        const got = processEdges(graph, () => ({ processDesignHash: processDesignHashOf(local.assembly), planned: planProcessOrders(local) })).get(orders[0].processId)!;
        expect(got.source).toBe("linear");
    });

    it("commitOrder reads the commits by the running total, whatever order the map holds them in", async () => {
        const orders = await realize(referenceDesign("tradelens.json"));
        const reversed = committedEvents([...orders].reverse(), () => 42);
        const graph = projectProcessGraph(reversed);
        expect(commitOrder(graph.processes.get(orders[0].processId)!).map((o) => o.orderHash)).toEqual(orders.map((o) => o.orderHash));
    });

    it("marketShape over the edges gives the design's depth and width to a linked process, and a chain to the rest", async () => {
        const hydrated = referenceDesign("tradelens.json");
        const orders = await realize(hydrated);
        const graph = projectProcessGraph(committedEvents(orders, (i) => 10 + i));
        const planned = planProcessOrders(hydrated);
        const linked = processEdges(graph, () => ({ processDesignHash: processDesignHashOf(hydrated.assembly), planned }));
        const unlinked = processEdges(graph, () => undefined);
        const designed = marketShape(graph, () => "a", followsOfEdges(linked)).groups.get("a")!.shapes[0];
        const linear = marketShape(graph, () => "a", followsOfEdges(unlinked)).groups.get("a")!.shapes[0];
        expect(linear).toMatchObject({ orderCount: orders.length, depth: orders.length - 1, maxWidth: 1 });
        expect(designed.orderCount).toBe(orders.length);
        expect(designed.maxWidth).toBeGreaterThan(1);
        expect(designed.depth).toBeLessThan(orders.length - 1);
    });
});
