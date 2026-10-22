import { beforeAll, describe, expect, it } from "vitest";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import { extractContract } from "@/lib/audit/contractExtract";
import { OrderState, type Order } from "@/lib/kernel/store";
import type { Agreement } from "@figaro-protocol/sdk";

// The evidence a forum reads states only what the evidence holds: an order's
// place in its process comes from the chain (a root order's cumulative value
// equals its payment; every later order's is larger), and its parent links only
// from a topology clause its agreement composes. No order is reported as a root
// for lacking one.
beforeAll(async () => {
    await primeClauseSpecs(["figaro-topology"]);
});

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const PARENT = `0x${"aa".repeat(32)}`;

function order(payment: bigint, cumulativeValue: bigint): Order {
    return {
        orderHash: `0x${"01".repeat(32)}`, processId: `0x${"02".repeat(32)}`, buyer: BUYER, seller: SELLER,
        payment, cumulativeValue, state: OrderState.Active, sellerBond: 2n * cumulativeValue, buyerBond: 2n * payment,
        salt: 1n, deadline: 1n,
    } as Order;
}
function agreement(clauses: Agreement["clauses"]): Agreement {
    return { buyer: BUYER, seller: SELLER, clauses } as unknown as Agreement;
}

describe("extractContract — the order's place in its process", () => {
    it("reads a root order from the chain when no topology clause is composed", () => {
        const c = extractContract(order(100n, 100n), agreement([]));
        expect(c.topology).toEqual({ position: "root", composed: false, follows: [] });
    });

    it("never reports a sub-order as a root when its agreement composes no topology clause", () => {
        const c = extractContract(order(30n, 130n), agreement([]));
        expect(c.topology).toEqual({ position: "sub-order", composed: false, follows: [] });
    });

    it("carries the composed parent links beside the chain's position", () => {
        const c = extractContract(order(30n, 130n), agreement([{ clause: keyOf("figaro-topology"), data: { follows: [PARENT] } }]));
        expect(c.topology).toEqual({ position: "sub-order", composed: true, follows: [PARENT] });
    });
});
