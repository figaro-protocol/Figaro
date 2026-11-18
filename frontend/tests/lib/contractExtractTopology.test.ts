import { describe, expect, it } from "vitest";
import { extractContract } from "@/lib/audit/contractExtract";
import { OrderState, type Order } from "@/lib/core/store";
import type { Agreement } from "@figaro-protocol/sdk";

// The evidence a forum reads states only what the evidence holds: an order's
// place in its process comes from the chain (a root order's cumulative value
// equals its payment; every later order's is larger), and its parent links only
// from the topology leaf its agreement carries (`Agreement.follows`). No order
// is reported as a root for lacking one.
const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const PARENT = `0x${"aa".repeat(32)}`;

function order(payment: bigint, runningTotal: bigint): Order {
    return {
        orderHash: `0x${"01".repeat(32)}`, processId: `0x${"02".repeat(32)}`, buyer: BUYER, seller: SELLER,
        payment, runningTotal, state: OrderState.Active, sellerBond: 2n * runningTotal, buyerBond: 2n * payment,
        salt: 1n, deadline: 1n,
    } as Order;
}
function agreement(follows?: string[]): Agreement {
    return { buyer: BUYER, seller: SELLER, clauses: [], ...(follows === undefined ? {} : { follows }) } as unknown as Agreement;
}

describe("extractContract — the order's place in its process", () => {
    it("reads a root order from the chain when the agreement carries no topology leaf", () => {
        const c = extractContract(order(100n, 100n), agreement());
        expect(c.topology).toEqual({ position: "root", composed: false, follows: [] });
    });

    it("never reports a sub-order as a root when its agreement carries no topology leaf", () => {
        const c = extractContract(order(30n, 130n), agreement());
        expect(c.topology).toEqual({ position: "sub-order", composed: false, follows: [] });
    });

    it("reads a root's empty topology leaf as carried, with no parent", () => {
        const c = extractContract(order(100n, 100n), agreement([]));
        expect(c.topology).toEqual({ position: "root", composed: true, follows: [] });
    });

    it("carries the parent links of the agreement's topology leaf beside the chain's position", () => {
        const c = extractContract(order(30n, 130n), agreement([PARENT]));
        expect(c.topology).toEqual({ position: "sub-order", composed: true, follows: [PARENT] });
    });

    it("drops empty and blank parent links, as the canvas reading of the same leaf does", () => {
        const c = extractContract(order(30n, 130n), agreement([PARENT, "", "   "]));
        expect(c.topology).toEqual({ position: "sub-order", composed: true, follows: [PARENT] });
    });

    it("reads no parent from a clause that happens to carry a follows field", () => {
        const withClause = { ...agreement([]), clauses: [{ clause: `0x${"0c".repeat(32)}`, data: { follows: [PARENT] } }] } as unknown as Agreement;
        expect(extractContract(order(30n, 130n), withClause).topology.follows).toEqual([]);
    });
});
