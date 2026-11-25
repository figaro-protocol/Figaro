/**
 * rootAgreementOf — the one rule for which agreement of a process design is
 * the root: the first entry, in the design's order, that follows nothing. Its order opens the process, so the rule fixes the commit order
 * and the running total each seller bonds against. A design may hold several
 * entries that follow nothing; the first is the root and the others commit
 * after it. Every SDK reader of the root uses the rule
 * (`instantiateRootAgreement`, `planSubOrderSellers`).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rootAgreementOf, type ProcessDesignAgreement } from "../src/assembly.js";
import { instantiateRootAgreement } from "../src/agent/originate.js";
import { planSubOrderSellers } from "../src/checkoutPlan.js";
import { planProcessOrders } from "../src/reconstructOrders.js";
import { hydrateAuthored } from "./hydrate.js";
import { keyOf } from "./specFixtures.js";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const H = `0x${"11".repeat(32)}` as const;
const entry = (id: string, follows?: unknown[]): ProcessDesignAgreement =>
    ({ id, agreementHash: H, clauses: {}, ...(follows === undefined ? {} : { follows: follows as string[] }) });
/** A hydrated design of the given topology, each agreement one clause. */
const design = (...entries: { id: string; follows: string[] }[]) =>
    hydrateAuthored({ agreements: entries.map((e) => ({ ...e, clauses: { [keyOf("figaro-modalities")]: {} } })) });

describe("rootAgreementOf", () => {
    it("is the entry that follows nothing, wherever it stands in the list", () => {
        expect(rootAgreementOf({ agreements: [entry("a", [])] }).id).toBe("a");
        expect(rootAgreementOf({ agreements: [entry("b", ["a"]), entry("c", ["a"]), entry("a", [])] }).id).toBe("a");
        // An absent `follows` follows nothing.
        expect(rootAgreementOf({ agreements: [entry("b", ["a"]), entry("a")] }).id).toBe("a");
    });

    it.each([
        ["an empty design", []],
        ["a cycle", [entry("a", ["b"]), entry("b", ["a"])]],
        ["an entry that follows itself", [entry("a", ["a"])]],
        ["a design whose every entry names a parent, one of them outside the design", [entry("a", ["ghost"]), entry("b", ["a"])]],
    ])("refuses %s: no entry follows nothing", (_label, agreements) => {
        expect(() => rootAgreementOf({ agreements })).toThrow(/no root agreement: every entry follows another/);
    });

    it("takes the first of several entries that follow nothing", () => {
        expect(rootAgreementOf({ agreements: [entry("a", []), entry("b"), entry("c", ["a"])] }).id).toBe("a");
        expect(rootAgreementOf({ agreements: [entry("c", ["a"]), entry("b"), entry("a", [])] }).id).toBe("b");
    });

    it("in every reference process design the root is the first entry that follows nothing", () => {
        const dir = path.resolve(__dirname, "../../assemblies");
        const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const written = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as { agreements: { id: string; follows?: string[] }[] };
            const roots = written.agreements.filter((a) => (a.follows ?? []).length === 0);
            expect(roots.length, file).toBeGreaterThan(0);
            expect(rootAgreementOf(written).id, file).toBe(roots[0]!.id);
        }
    });
});

describe("the SDK's readers of the root use the one rule", () => {
    it("the root is the order the planner commits first, and the one instantiateRootAgreement signs", () => {
        const d = design({ id: "b", follows: ["a"] }, { id: "a", follows: [] });
        expect(planProcessOrders(d)[0]!.nodeId).toBe("a");
        expect(rootAgreementOf(d.assembly).id).toBe("a");
        expect(instantiateRootAgreement(d, { buyer: BUYER, seller: SELLER }).follows).toEqual([]);
        expect(planSubOrderSellers({ hydratedAssembly: d, coSellerBindings: [] }).map((s) => s.node.nodeId)).toEqual(["b"]);
    });

    it("a design whose every entry names a parent is refused by both readers, never planned around a stand-in root", () => {
        // Its first entry follows a parent no entry carries. One reader took
        // the list's first entry as a stand-in root and the other refused;
        // both refuse.
        const d = design({ id: "b", follows: ["a"] }, { id: "a", follows: ["ghost"] });
        expect(() => planSubOrderSellers({ hydratedAssembly: d, coSellerBindings: [] })).toThrow(/no root agreement/);
        expect(() => instantiateRootAgreement(d, { buyer: BUYER, seller: SELLER })).toThrow(/no root agreement/);
    });

    it("a design with two entries that follow nothing: the first is the root, and the second is planned as a sub-order", () => {
        const d = design({ id: "a", follows: [] }, { id: "b", follows: [] });
        expect(planProcessOrders(d)[0]!.nodeId).toBe("a");
        expect(rootAgreementOf(d.assembly).id).toBe("a");
        expect(instantiateRootAgreement(d, { buyer: BUYER, seller: SELLER }).follows).toEqual([]);
        expect(planSubOrderSellers({ hydratedAssembly: d, coSellerBindings: [] }).map((s) => s.node.nodeId)).toEqual(["b"]);
    });
});
