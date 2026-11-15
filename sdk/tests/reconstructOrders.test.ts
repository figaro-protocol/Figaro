/**
 * reconstructOrders — the ONE assembly → orders walk. Structure via
 * `planAssemblyOrders` (commit order, clause bags, local parents)
 * and realization via `reconstructOrdersFromAssembly` (real parent hashes,
 * running cumulative value, root-derived processId, onOrder seam ordering).
 * The behavioral reference is the untouched originate-chain suite, which now
 * runs THROUGH this walk.
 */
import { describe, expect, it } from "vitest";
import {
    planAssemblyOrders,
    reconstructOrdersFromAssembly,
} from "../src/reconstructOrders.js";
import { assemblyHashOf } from "../src/assembly.js";
import { computeCheckoutHash, buildProvenanceInclusionProof, verifyInclusionProof } from "../src/agreement.js";
import { keyOf, specSourceFromFixtures } from "./specFixtures.js";
import { hydrateAuthored } from "./hydrate.js";

const SPECS = specSourceFromFixtures(["figaro-commerce"]);

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER_A = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;
const SELLER_B = "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as const;
const CURRENCY = "0x0000000000000000000000000000000000000001" as const;
const CORE = "0x00000000000000000000000000000000000000c0" as const;

/** Child listed FIRST to prove commit order comes from topology, not input. */
const assembly = hydrateAuthored({
    agreements: [
        {
            id: "courier",
            clauses: { [keyOf("figaro-commerce")]: {} },
            follows: ["merchant"],
        },
        {
            id: "merchant",
            clauses: { [keyOf("figaro-commerce")]: {} },
            follows: [],
        },
    ],
});

describe("planAssemblyOrders — pure structure", () => {
    it("orders nodes root-first with local parents and the assembly's clause bags", () => {
        const planned = planAssemblyOrders(assembly);
        expect(planned.map((p) => p.nodeId)).toEqual(["merchant", "courier"]);
        expect(planned[0].parentLocalIds).toEqual([]);
        expect(planned[1].parentLocalIds).toEqual(["merchant"]);
        // The bag is keyed by clause key: the composition pinned WHICH clause
        // it composed, so nothing downstream reads a registry by name.
        expect(Object.keys(planned[0].clauses).sort()).toEqual([keyOf("figaro-commerce")]);
    });

    it("throws on a cyclic topology", () => {
        const cyclic = hydrateAuthored({
            agreements: [
                { id: "a", clauses: {}, follows: ["b"] },
                { id: "b", clauses: {}, follows: ["a"] },
            ],
        });
        expect(() => planAssemblyOrders(cyclic)).toThrow(/cycle/);
    });
});

describe("reconstructOrdersFromAssembly — realization", () => {
    it("realizes the chain: real parent hashes, running cumulative, root-derived processId", async () => {
        const seen: string[] = [];
        const orders = await reconstructOrdersFromAssembly(assembly, {
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
        // The sub's topology leaf carries the root's REAL order hash; the
        // root's carries an empty list, never an absent one.
        expect(sub.agreement.follows).toEqual([root.orderHash]);
        expect(root.agreement.follows).toEqual([]);
        expect(sub.agreement.clauses.some((c) => c.data !== undefined && "follows" in c.data)).toBe(false);
        // The token and the payment live in the commitment only: no
        // realized order's clause carries either, root and sub alike.
        for (const order of orders) {
            expect(order.commitment.currency).toBe(CURRENCY);
            for (const clause of order.agreement.clauses) {
                expect(clause.data).not.toHaveProperty("currency");
                expect(clause.data).not.toHaveProperty("payment");
            }
        }
    });

    it("every realized order carries the assembly's own assembly hash as agreement.provenance, under its signed root", async () => {
        for (const specs of [SPECS, undefined]) {
            const orders = await reconstructOrdersFromAssembly(assembly, {
                buyer: BUYER,
                currency: CURRENCY,
                chainId: 31337,
                core: CORE,
                specs,
                nodes: (p) =>
                    p.nodeId === "merchant"
                        ? { seller: SELLER_A, payment: 100n }
                        : { seller: SELLER_B, payment: 40n },
                salt: () => 1n,
                deadline: 1770000000n,
            });
            for (const order of orders) {
                const entry = assembly.assembly.agreements.find((a) => a.id === order.nodeId)!;
                expect(order.agreement.provenance).toEqual({
                    agreementHash: entry.agreementHash,
                    assemblyHash: assemblyHashOf(assembly.assembly),
                });
                expect(order.checkoutHash).toBe(computeCheckoutHash(order.agreement));
                expect(order.commitment.checkoutHash).toBe(order.checkoutHash);
                const { leaf, proof } = buildProvenanceInclusionProof(order.agreement);
                expect(verifyInclusionProof(order.checkoutHash, leaf, proof)).toBe(true);
            }
        }
    });

    it("rejects a assembly whose commit order starts with a parented node", async () => {
        const dangling = hydrateAuthored({
            agreements: [
                { id: "only", clauses: {}, follows: ["ghost"] },
            ],
        });
        await expect(
            reconstructOrdersFromAssembly(dangling, {
                buyer: BUYER,
                currency: CURRENCY,
                chainId: 31337,
                core: CORE,
                nodes: () => ({ seller: SELLER_A, payment: 1n }),
            }),
        ).rejects.toThrow(/parent "ghost" was not built/);
    });
});

