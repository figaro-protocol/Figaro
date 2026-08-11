/**
 * reconstructOrders — the ONE template → orders walk. Structure via
 * `planTemplateOrders` (commit order, complete version maps, local parents)
 * and realization via `reconstructOrdersFromTemplate` (real parent hashes,
 * running cumulative value, root-derived processId, onOrder seam ordering).
 * The behavioral reference is the untouched originate-chain suite, which now
 * runs THROUGH this walk.
 */
import { describe, expect, it } from "vitest";
import {
    planTemplateOrders,
    reconstructOrdersFromTemplate,
} from "../src/reconstructOrders.js";
import type { AssemblyTemplate } from "../src/assembly.js";
import { specSourceFromFixtures } from "./specFixtures.js";

const SPECS = specSourceFromFixtures(["figaro-commerce", "figaro-topology"]);

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER_A = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;
const SELLER_B = "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as const;
const CURRENCY = "0x0000000000000000000000000000000000000001" as const;
const CORE = "0x00000000000000000000000000000000000000c0" as const;

/** Child listed FIRST to prove commit order comes from topology, not input. */
const template: AssemblyTemplate = {
    agreements: [
        {
            id: "courier",
            clauses: {
                "figaro-commerce": {},
                "figaro-topology": { parentOrderHashes: ["merchant"] },
            },
            clauseVersions: { "figaro-commerce": 2 },
        },
        {
            id: "merchant",
            clauses: { "figaro-commerce": {}, "figaro-topology": { parentOrderHashes: [] } },
        },
    ],
};

describe("planTemplateOrders — pure structure", () => {
    it("orders nodes root-first with local parents and COMPLETE version maps", () => {
        const planned = planTemplateOrders(template);
        expect(planned.map((p) => p.nodeId)).toEqual(["merchant", "courier"]);
        expect(planned[0].parentLocalIds).toEqual([]);
        expect(planned[1].parentLocalIds).toEqual(["merchant"]);
        // Complete maps: absent template entries resolve to 1 (the composition
        // pinned WHICH clause it composed — no registry fallback downstream).
        expect(planned[0].clauseVersions).toEqual({ "figaro-commerce": 1, "figaro-topology": 1 });
        expect(planned[1].clauseVersions).toEqual({ "figaro-commerce": 2, "figaro-topology": 1 });
    });

    it("throws on a cyclic topology", () => {
        const cyclic: AssemblyTemplate = {
            agreements: [
                { id: "a", clauses: { "figaro-topology": { parentOrderHashes: ["b"] } } },
                { id: "b", clauses: { "figaro-topology": { parentOrderHashes: ["a"] } } },
            ],
        };
        expect(() => planTemplateOrders(cyclic)).toThrow(/cycle/);
    });
});

describe("reconstructOrdersFromTemplate — realization", () => {
    it("realizes the chain: real parent hashes, running cumulative, root-derived processId", async () => {
        const seen: string[] = [];
        const orders = await reconstructOrdersFromTemplate(template, {
            buyer: BUYER,
            currency: CURRENCY,
            chainId: 31337,
            core: CORE,
            specs: SPECS,
            nodes: (p) =>
                p.nodeId === "merchant"
                    ? { seller: SELLER_A, payment: 100n }
                    : { seller: SELLER_B, payment: 40n },
            salt: () => 1n,
            deadline: 1770000000n,
            onOrder: (o) => {
                seen.push(o.nodeId);
            },
        });

        expect(seen).toEqual(["merchant", "courier"]);
        const [root, sub] = orders;
        expect(root.isRoot).toBe(true);
        expect(root.commitment.processId).toBe(`0x${"00".repeat(32)}`);
        expect(root.cumulativeValue).toBe(100n);
        expect(sub.isRoot).toBe(false);
        expect(sub.cumulativeValue).toBe(140n);
        // The sub-order's signed struct names the ROOT's derived process id.
        expect(sub.commitment.processId).toBe(root.processId);
        expect(sub.processId).toBe(root.processId);
        // The sub's topology section carries the root's REAL order hash.
        const topo = sub.agreement.sections.find((s) => s.clause === "figaro-topology");
        expect(topo?.data.parentOrderHashes).toEqual([root.orderHash]);
        // The composition's version pin survives into the section.
        const commerce = sub.agreement.sections.find((s) => s.clause === "figaro-commerce");
        expect(commerce?.version).toBe(2);
        // THE MERKLE-LEAF SEAM: with specs supplied, the walk fills the
        // commerce section's currency leaf to match the commitment struct —
        // on EVERY realized order, root and sub alike.
        for (const order of orders) {
            const commerceSection = order.agreement.sections.find((s) => s.clause === "figaro-commerce");
            expect(commerceSection?.data.currency).toBe(order.commitment.currency);
        }
    });

    it("rejects a template whose commit order starts with a parented node", async () => {
        const dangling: AssemblyTemplate = {
            agreements: [
                { id: "only", clauses: { "figaro-topology": { parentOrderHashes: ["ghost"] } } },
            ],
        };
        await expect(
            reconstructOrdersFromTemplate(dangling, {
                buyer: BUYER,
                currency: CURRENCY,
                chainId: 31337,
                core: CORE,
                nodes: () => ({ seller: SELLER_A, payment: 1n }),
            }),
        ).rejects.toThrow(/parent "ghost" was not built/);
    });
});
