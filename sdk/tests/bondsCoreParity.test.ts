/**
 * The SDK's bond and payout arithmetic (`src/bonds.ts`) against what
 * `FigaroCore` itself pulled and paid: `test/fixtures/kernel-transition-vectors.json`
 * is harvested from the live contract by `KernelTransitionVectorsTest`, and
 * records, per scenario, every party's total deposit and payout. The SDK's
 * figures, summed over the same orders, must equal them — buyer and seller
 * one wallet included. A drift here shows a party a bond the Core does not
 * pull, or a payout it does not pay.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { calculateBonds, calculateResolution } from "../src/bonds.js";

const FIXTURE = path.resolve(__dirname, "..", "..", "test", "fixtures", "kernel-transition-vectors.json");
const vectors = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;

interface Order { buyer: string; seller: string; payment: string; expectedCumulativeValue: string }
interface Party { address: string; deposit: string; payout: string }
interface Scenario { name: string; resolve: string; orderCount: string; partyCount: string; [k: string]: unknown }

const scenarios = Object.keys(vectors)
    .filter((k) => /^s\d+$/.test(k))
    .map((k) => vectors[k] as Scenario);

describe("SDK bonds and payouts equal what FigaroCore pulled and paid", () => {
    it("reads every recorded scenario", () => {
        expect(scenarios.length).toBe(Number(vectors.scenarioCount));
        expect(scenarios.length).toBeGreaterThan(0);
    });

    for (const s of scenarios) {
        it(s.name, () => {
            const orders = Array.from({ length: Number(s.orderCount) }, (_, i) => s[`o${i}`] as Order);
            const resolved = s.resolve === "true";
            const deposit = new Map<string, bigint>();
            const payout = new Map<string, bigint>();
            const add = (m: Map<string, bigint>, who: string, v: bigint) =>
                m.set(who.toLowerCase(), (m.get(who.toLowerCase()) ?? 0n) + v);

            for (const o of orders) {
                const payment = BigInt(o.payment);
                const bonds = calculateBonds(BigInt(o.expectedCumulativeValue), payment);
                add(deposit, o.buyer, bonds.buyerBond);
                add(deposit, o.seller, bonds.sellerBond);
                if (resolved) {
                    const r = calculateResolution(payment, bonds.sellerBond, bonds.buyerBond);
                    add(payout, o.seller, r.sellerPayout);
                    add(payout, o.buyer, r.buyerPayout);
                }
            }

            for (let i = 0; i < Number(s.partyCount); i++) {
                const p = s[`p${i}`] as Party;
                const who = p.address.toLowerCase();
                expect(deposit.get(who) ?? 0n, `${s.name}: ${p.address} deposit`).toBe(BigInt(p.deposit));
                expect(payout.get(who) ?? 0n, `${s.name}: ${p.address} payout`).toBe(BigInt(p.payout));
            }
        });
    }
});
