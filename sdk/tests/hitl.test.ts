import { describe, it, expect } from "vitest";
import { ActionQueue } from "../src/agent/hitl.js";
import type { ProposedAction, ResolveProcessAction } from "../src/agent/proposer.js";
import type { Hex, Address } from "../src/types.js";

const PID = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
const OH1 = "0x0000000000000000000000000000000000000000000000000000000000000010" as Hex;
const BUYER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const SELLER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

function mkAction(type: string = "resolve-process"): ProposedAction {
    return {
        type: "resolve-process",
        description: "Resolve test process",
        processId: PID,
        caller: BUYER,
        orderHashes: [OH1],
        settlements: [{
            orderHash: OH1,
            seller: SELLER,
            settlement: { sellerPayout: 300n, buyerPayout: 100n, netTransfer: 100n },
        }],
        totalBuyerPayout: 100n,
        totalSellerPayout: 300n,
    } as ResolveProcessAction;
}

describe("ActionQueue", () => {
    it("enqueues and retrieves pending items", () => {
        const queue = new ActionQueue();
        const id = queue.enqueue(mkAction());

        expect(id).toBe(1);
        expect(queue.pending()).toHaveLength(1);
        expect(queue.pending()[0].action.type).toBe("resolve-process");
        expect(queue.pendingCount).toBe(1);
    });

    it("enqueueAll returns multiple IDs", () => {
        const queue = new ActionQueue();
        const ids = queue.enqueueAll([mkAction(), mkAction()]);

        expect(ids).toEqual([1, 2]);
        expect(queue.pending()).toHaveLength(2);
    });

    it("stores approval context on queued items", () => {
        const queue = new ActionQueue<{
            bindingId: string;
            party: string;
        }>();

        queue.enqueue(mkAction(), {
            approvalContext: {
                bindingId: "binding:bobs-pizza-palace:local-anvil",
                party: "seller",
            },
        });

        const item = queue.approve(1);
        expect(item.approvalContext).toEqual({
            bindingId: "binding:bobs-pizza-palace:local-anvil",
            party: "seller",
        });
    });

    it("enqueueAll accepts action entries with approval context", () => {
        const queue = new ActionQueue<{ runtimeSummary: string }>();
        const ids = queue.enqueueAll([
            {
                action: mkAction(),
                approvalContext: {
                    runtimeSummary: "Bob's Pizza Palace · Figaro Local Commerce · Restaurant",
                },
            },
            mkAction(),
        ]);

        expect(ids).toEqual([1, 2]);
        expect(queue.get(1)?.approvalContext).toEqual({
            runtimeSummary: "Bob's Pizza Palace · Figaro Local Commerce · Restaurant",
        });
        expect(queue.get(2)?.approvalContext).toBeUndefined();
    });

    it("approve transitions to approved state", () => {
        const queue = new ActionQueue();
        queue.enqueue(mkAction());

        const item = queue.approve(1);
        expect(item.status).toBe("approved");
        expect(item.decidedAt).toBeGreaterThan(0);
        expect(queue.pending()).toHaveLength(0);
    });

    it("reject transitions to rejected state with reason", () => {
        const queue = new ActionQueue();
        queue.enqueue(mkAction());

        const item = queue.reject(1, "too risky");
        expect(item.status).toBe("rejected");
        expect(item.rejectionReason).toBe("too risky");
        expect(queue.pending()).toHaveLength(0);
    });

    it("markExecuted sets tx hash", () => {
        const queue = new ActionQueue();
        queue.enqueue(mkAction());
        queue.approve(1);
        queue.markExecuted(1, "0xabc");

        const item = queue.get(1)!;
        expect(item.status).toBe("executed");
        expect(item.txHash).toBe("0xabc");
    });

    it("throws on approve of non-pending item", () => {
        const queue = new ActionQueue();
        queue.enqueue(mkAction());
        queue.approve(1);

        expect(() => queue.approve(1)).toThrow("not pending");
    });

    it("throws on reject of non-pending item", () => {
        const queue = new ActionQueue();
        queue.enqueue(mkAction());
        queue.reject(1);

        expect(() => queue.reject(1)).toThrow("not pending");
    });

    it("throws on markExecuted of non-approved item", () => {
        const queue = new ActionQueue();
        queue.enqueue(mkAction());

        expect(() => queue.markExecuted(1)).toThrow("not approved");
    });

    it("throws on unknown ID", () => {
        const queue = new ActionQueue();
        expect(() => queue.approve(999)).toThrow("not found");
    });

    it("prune removes rejected and executed items", () => {
        const queue = new ActionQueue();
        queue.enqueue(mkAction()); // 1 - will reject
        queue.enqueue(mkAction()); // 2 - will execute
        queue.enqueue(mkAction()); // 3 - stays pending

        queue.reject(1);
        queue.approve(2);
        queue.markExecuted(2);

        const removed = queue.prune();
        expect(removed).toBe(2);
        expect(queue.all()).toHaveLength(1);
        expect(queue.all()[0].id).toBe(3);
    });

    it("get returns undefined for unknown ID", () => {
        const queue = new ActionQueue();
        expect(queue.get(999)).toBeUndefined();
    });
});
