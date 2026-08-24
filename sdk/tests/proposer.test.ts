import { describe, it, expect } from "vitest";
import { proposeActions, proposeInitiations, filterActions } from "../src/agent/proposer.js";
import type { Process, Order, RegisteredAssembly } from "../src/types.js";
import { OrderState } from "../src/types.js";
import type { Hex, Address } from "../src/types.js";

const BUYER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const SELLER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const SELLER2 = "0xdddddddddddddddddddddddddddddddddddddd" as Address;
const TOKEN = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const PID = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
const OH1 = "0x0000000000000000000000000000000000000000000000000000000000000010" as Hex;
const OH2 = "0x0000000000000000000000000000000000000000000000000000000000000020" as Hex;

function mkOrder(overrides: Partial<Order> = {}): Order {
    return {
        orderHash: OH1,
        processId: PID,
        buyer: BUYER,
        seller: SELLER,
        currency: TOKEN,
        payment: 100n,
        cumulativeValue: 100n,
        agreementHash: "0x" as Hex,
        salt: 1n,
        deadline: 999999999n,
        state: OrderState.Active,
        blockNumber: 1,
        ...overrides,
    };
}

function mkProcess(overrides: Partial<Process> = {}): Process {
    const orders = new Map<Hex, Order>();
    orders.set(OH1, mkOrder());
    return {
        processId: PID,
        rootBuyer: BUYER,
        currency: TOKEN,
        cumulativeValue: 100n,
        orders,
        resolved: false,
        ...overrides,
    };
}

describe("proposeActions", () => {
    it("proposes resolve + attest for buyer with active orders — and NO runtime compose verb", () => {
        const process = mkProcess();
        const actions = proposeActions(process, BUYER);

        // Composition is the designer's act: the buyer resolves and attests,
        // never extends a live process ad hoc (a commit-sub-order arm would
        // be an authority violation).
        expect(actions.length).toBe(2);
        expect(actions[0].type).toBe("resolve-process");
        expect(actions[1].type).toBe("attest-as-buyer");
    });

    it("resolve action includes correct settlement math", () => {
        const process = mkProcess();
        const actions = proposeActions(process, BUYER);
        const resolve = actions[0];

        expect(resolve.type).toBe("resolve-process");
        if (resolve.type === "resolve-process") {
            // Commitments are reconstructed from the active orders (the executor
            // restores each root's signed processId at submission).
            expect(resolve.commitments).toHaveLength(1);
            expect(resolve.commitments[0].seller).toBe(SELLER);
            expect(resolve.commitments[0].payment).toBe(100n);
            expect(resolve.commitments[0].expectedCumulativeValue).toBe(100n);
            expect(resolve.settlements).toHaveLength(1);
            // payment=100, sellerBond=2*100=200, buyerBond=2*100=200
            // sellerPayout = 100+200 = 300, buyerPayout = 200-100 = 100
            expect(resolve.settlements[0].settlement.sellerPayout).toBe(300n);
            expect(resolve.settlements[0].settlement.buyerPayout).toBe(100n);
            expect(resolve.totalSellerPayout).toBe(300n);
            expect(resolve.totalBuyerPayout).toBe(100n);
        }
    });

    it("proposes attest-as-seller for seller", () => {
        const process = mkProcess();
        const actions = proposeActions(process, SELLER);

        expect(actions.length).toBe(1);
        expect(actions[0].type).toBe("attest-as-seller");
        if (actions[0].type === "attest-as-seller") {
            expect(actions[0].orderHashes).toEqual([OH1]);
        }
    });

    it("proposes nothing for unrelated address", () => {
        const process = mkProcess();
        const actions = proposeActions(process, "0x1111111111111111111111111111111111111111" as Address);
        expect(actions.length).toBe(0);
    });

    it("proposes nothing for resolved process", () => {
        const process = mkProcess({ resolved: true });
        // Mark order as resolved too
        process.orders.get(OH1)!.state = OrderState.Resolved;
        const actions = proposeActions(process, BUYER);
        expect(actions.length).toBe(0);
    });

    it("handles multiple active orders in resolve", () => {
        const process = mkProcess();
        process.orders.set(OH2, mkOrder({
            orderHash: OH2,
            seller: SELLER2,
            payment: 50n,
            cumulativeValue: 150n,
            blockNumber: 2,
        }));
        process.cumulativeValue = 150n;

        const actions = proposeActions(process, BUYER);
        const resolve = actions.find((a) => a.type === "resolve-process")!;
        if (resolve.type === "resolve-process") {
            expect(resolve.commitments).toHaveLength(2);
            expect(resolve.settlements).toHaveLength(2);
        }
    });

});

describe("proposeInitiations", () => {
    const COMP = "0x00000000000000000000000000000000000000000000000000000000000000ab" as Hex;
    const REGISTERED_BY = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;

    it("proposes one initiate-process per discovered assembly, buyer = me", () => {
        const assemblies: RegisteredAssembly[] = [
            { compositionHash: COMP, registeredBy: REGISTERED_BY, contentURI: "ipfs://asm" },
        ];
        const inits = proposeInitiations(assemblies, BUYER);
        expect(inits).toHaveLength(1);
        expect(inits[0].type).toBe("initiate-process");
        expect(inits[0].buyer).toBe(BUYER);
        expect(inits[0].compositionHash).toBe(COMP);
        expect(inits[0].contentURI).toBe("ipfs://asm");
        // No process exists yet — the kernel derives the id at root commit.
        expect(inits[0].processId).toBe(`0x${"0".repeat(64)}`);
    });

    it("proposes nothing when no assemblies are discovered", () => {
        expect(proposeInitiations([], BUYER)).toEqual([]);
    });
});

describe("filterActions", () => {
    it("filters by type", () => {
        const process = mkProcess();
        const actions = proposeActions(process, BUYER);

        const resolves = filterActions(actions, "resolve-process");
        expect(resolves).toHaveLength(1);
        expect(resolves[0].type).toBe("resolve-process");

        const attests = filterActions(actions, "attest-as-buyer");
        expect(attests).toHaveLength(1);
    });
});
