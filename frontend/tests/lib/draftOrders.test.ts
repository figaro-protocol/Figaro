/**
 * draftOrders store — the buyer's localStorage draft-order persistence
 * (runtime deliverable ahead of its composition surface; the store is the
 * untested piece — the sign→share lifecycle it feeds is e2e-covered by
 * orders-accept / local-commerce / rate-pricing).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    deleteDraftOrder,
    listDraftOrders,
    loadDraftOrder,
    saveDraftOrder,
    type DraftOrder,
} from "@/lib/checkout/draftOrders";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const TOKEN = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

const draft = (over: Partial<DraftOrder> = {}): DraftOrder => ({
    buyer: BUYER,
    seller: SELLER,
    currency: TOKEN,
    payment: 1500000000000000000n,
    clauses: { "figaro-commerce": { payment: "1500000000000000000" } },
    ...over,
});

beforeEach(() => {
    localStorage.clear();
});

describe("draftOrders store", () => {
    it("round-trips a draft, payment preserved as bigint", () => {
        saveDraftOrder("d1", draft());
        const loaded = loadDraftOrder("d1");
        expect(loaded).not.toBeNull();
        expect(loaded!.payment).toBe(1500000000000000000n);
        expect(typeof loaded!.payment).toBe("bigint");
        expect(loaded!.buyer).toBe(BUYER);
        expect(loaded!.clauses["figaro-commerce"]).toEqual({ payment: "1500000000000000000" });
    });

    it("round-trips the optional topology position — present and absent", () => {
        saveDraftOrder("root", draft());
        saveDraftOrder("sub", draft({ parentOrderHashes: ["0xabc"] }));
        expect(loadDraftOrder("root")!.parentOrderHashes).toBeUndefined();
        expect("parentOrderHashes" in loadDraftOrder("root")!).toBe(false);
        expect(loadDraftOrder("sub")!.parentOrderHashes).toEqual(["0xabc"]);
    });

    it("save under an existing id replaces the draft", () => {
        saveDraftOrder("d1", draft());
        saveDraftOrder("d1", draft({ payment: 2n }));
        expect(loadDraftOrder("d1")!.payment).toBe(2n);
        expect(listDraftOrders()).toEqual(["d1"]);
    });

    it("load of an unknown id is null", () => {
        expect(loadDraftOrder("nope")).toBeNull();
    });

    it("load of corrupt JSON is null, never a throw", () => {
        localStorage.setItem("figaro:draft-order:bad", "{not json");
        expect(loadDraftOrder("bad")).toBeNull();
    });

    it("load of a stored draft with an unparseable payment is null, never a throw", () => {
        localStorage.setItem(
            "figaro:draft-order:badpay",
            JSON.stringify({ buyer: BUYER, seller: SELLER, currency: TOKEN, payment: "not-a-number", clauses: {} }),
        );
        expect(loadDraftOrder("badpay")).toBeNull();
    });

    it("lists exactly the held draft ids — other figaro keys stay out", () => {
        saveDraftOrder("a", draft());
        saveDraftOrder("b", draft());
        localStorage.setItem("figaro:designer:current", "{}");
        expect(listDraftOrders().sort()).toEqual(["a", "b"]);
    });

    it("delete drops the draft and the listing reflects it", () => {
        saveDraftOrder("a", draft());
        saveDraftOrder("b", draft());
        deleteDraftOrder("a");
        expect(loadDraftOrder("a")).toBeNull();
        expect(listDraftOrders()).toEqual(["b"]);
    });
});
