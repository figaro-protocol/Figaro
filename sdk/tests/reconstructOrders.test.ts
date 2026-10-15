/**
 * reconstructOrders — the ONE template → orders walk. Structure via
 * `planTemplateOrders` (commit order, clause bags, local parents)
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
import { templateCompositionHash, type AssemblyTemplate } from "../src/assembly.js";
import { computeAgreementHash, buildProvenanceInclusionProof, verifyInclusionProof } from "../src/agreement.js";
import { keyOf, rawSpecOf, specSourceFromFixtures, specSourceWithRegistrations, viewOf } from "./specFixtures.js";

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
                [keyOf("figaro-commerce")]: {},
                [keyOf("figaro-topology")]: { parentOrderHashes: ["merchant"] },
            },
        },
        {
            id: "merchant",
            clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: { parentOrderHashes: [] } },
        },
    ],
};

describe("planTemplateOrders — pure structure", () => {
    it("orders nodes root-first with local parents and the template's clause bags", () => {
        const planned = planTemplateOrders(template);
        expect(planned.map((p) => p.nodeId)).toEqual(["merchant", "courier"]);
        expect(planned[0].parentLocalIds).toEqual([]);
        expect(planned[1].parentLocalIds).toEqual(["merchant"]);
        // The bag is keyed by clause key: the composition pinned WHICH clause
        // it composed, so nothing downstream reads a registry by name.
        expect(Object.keys(planned[0].clauses).sort()).toEqual([keyOf("figaro-commerce"), keyOf("figaro-topology")].sort());
    });

    it("throws on a cyclic topology", () => {
        const cyclic: AssemblyTemplate = {
            agreements: [
                { id: "a", clauses: { [keyOf("figaro-topology")]: { parentOrderHashes: ["b"] } } },
                { id: "b", clauses: { [keyOf("figaro-topology")]: { parentOrderHashes: ["a"] } } },
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
        const topo = sub.agreement.sections.find((s) => s.clause === keyOf("figaro-topology"));
        expect(topo?.data.parentOrderHashes).toEqual([root.orderHash]);
        // THE MERKLE-LEAF SEAM: with specs supplied, the walk fills the
        // commerce section's currency leaf to match the commitment struct —
        // on EVERY realized order, root and sub alike.
        for (const order of orders) {
            const commerceSection = order.agreement.sections.find((s) => s.clause === keyOf("figaro-commerce"));
            expect(commerceSection?.data.currency).toBe(order.commitment.currency);
        }
    });

    it("every realized order carries the template's own composition hash as agreement.provenance, under its signed root", async () => {
        for (const specs of [SPECS, undefined]) {
            const orders = await reconstructOrdersFromTemplate(template, {
                buyer: BUYER,
                currency: CURRENCY,
                chainId: 31337,
                core: CORE,
                specs,
                nodes: (p) =>
                    p.nodeId === "merchant"
                        ? { seller: SELLER_A, payment: 100n, overrides: specs ? undefined : { [keyOf("figaro-commerce")]: { currency: CURRENCY } } }
                        : { seller: SELLER_B, payment: 40n, overrides: specs ? undefined : { [keyOf("figaro-commerce")]: { currency: CURRENCY } } },
                salt: () => 1n,
                deadline: 1770000000n,
            });
            for (const order of orders) {
                expect(order.agreement.provenance).toBe(templateCompositionHash(template));
                expect(order.agreementHash).toBe(computeAgreementHash(order.agreement));
                expect(order.commitment.agreementHash).toBe(order.agreementHash);
                const { leaf, proof } = buildProvenanceInclusionProof(order.agreement);
                expect(verifyInclusionProof(order.agreementHash, leaf, proof)).toBe(true);
            }
        }
    });

    it("rejects a template whose commit order starts with a parented node", async () => {
        const dangling: AssemblyTemplate = {
            agreements: [
                { id: "only", clauses: { [keyOf("figaro-topology")]: { parentOrderHashes: ["ghost"] } } },
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

describe("reconstructOrdersFromTemplate — the walk's fills read the spec each key names", () => {
    // A lookalike of the commerce clause (same clauseId and version, other
    // bytes) that declares `currency` as a DESIGN FILL — a pin, not content.
    // It is another clause: a template composing the real key fills the real
    // currency leaf, and only one composing the lookalike's key reads it.
    const raw = rawSpecOf("figaro-commerce");
    const lookalike = viewOf({
        ...raw,
        title: "a stranger's registration",
        block: { ...(raw.block as Record<string, Record<string, unknown>>), design: { ...((raw.block as { design?: object }).design ?? {}), fills: ["currency"] } },
    });
    const specs = specSourceWithRegistrations(SPECS, [lookalike]);
    const params = {
        buyer: BUYER,
        currency: CURRENCY,
        chainId: 31337,
        core: CORE,
        specs,
        nodes: () => ({ seller: SELLER_A, payment: 1n }),
        salt: () => 1n,
        deadline: 1770000000n,
    };

    it("the real key fills the real currency leaf", async () => {
        const [root] = await reconstructOrdersFromTemplate(
            { agreements: [{ id: "only", clauses: { [keyOf("figaro-commerce")]: {} } }] },
            params,
        );
        const commerce = root.agreement.sections.find((s) => s.clause === keyOf("figaro-commerce"));
        expect(commerce?.data?.currency).toBe(CURRENCY);
    });

    it("the lookalike's key is read as the lookalike, whose currency is no content leaf", async () => {
        const [root] = await reconstructOrdersFromTemplate(
            { agreements: [{ id: "only", clauses: { [lookalike.clauseKey]: {} } }] },
            params,
        );
        const commerce = root.agreement.sections.find((s) => s.clause === lookalike.clauseKey);
        expect(commerce?.data?.currency).toBeUndefined();
    });
});
