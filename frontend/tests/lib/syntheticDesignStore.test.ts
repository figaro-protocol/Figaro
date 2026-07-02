/**
 * Draft persistence round-trip through the REAL localStorage store.
 *
 * Regression: `writeJson` deliberately swallows serialization failures (an
 * authoring session must survive a quota error), which means a stray bigint
 * field on an `Order` makes `saveNamedDraft` silently persist NOTHING — the
 * review page then reports "Assembly not found" for a draft the user just
 * saved. That exact bug shipped when `buildSyntheticOrder` spread
 * `...calculateBonds(...)` (whose `totalLocked` is a bigint the serializer
 * doesn't convert). Only a round-trip through the real store catches the
 * class, so this test builds orders via the REAL canvas builders and asserts
 * the draft comes back.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    loadNamedDraft,
    saveNamedDraft,
    type DesignSnapshot,
} from "@/lib/designer/syntheticDesignStore";
import {
    createSyntheticRootOrder,
    createSyntheticSubOrder,
    startSyntheticSession,
} from "@/lib/designer/syntheticProcess";
import { primeClauseSpecs } from "./primeClauseSpecs";

describe("syntheticDesignStore round-trip", () => {
    beforeEach(async () => {
        window.localStorage.clear();
        await primeClauseSpecs();
    });

    it("a draft built by the real canvas builders survives save -> load", () => {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const sub = createSyntheticSubOrder(session, root.order, [root.order]);

        const snapshot: DesignSnapshot = {
            slug: "asm-draft-roundtrip",
            name: "round-trip",
            processId: session.processId,
            nextOrderIndex: session.nextOrderIndex,
            nextSellerIndex: session.nextSellerIndex,
            orders: [root.order, sub.order],
            clausesByOrderId: {},
            createdAt: 1,
            updatedAt: 1,
        };

        saveNamedDraft(snapshot);
        const loaded = loadNamedDraft("asm-draft-roundtrip");

        // A silent serialization failure comes back as null — the exact
        // "Assembly not found" review-page symptom.
        expect(loaded).not.toBeNull();
        expect(loaded!.orders).toHaveLength(2);
        expect(loaded!.orders[0].sellerBond).toBe(root.order.sellerBond);
        expect(loaded!.orders[1].cumulativeValue).toBe(sub.order.cumulativeValue);
        expect(loaded!.orders[1].parentOrderHashes).toEqual([root.order.id]);
    });

    it("every field the canvas puts on an Order is JSON-serializable after bigint conversion", () => {
        const session = startSyntheticSession();
        const { order } = createSyntheticRootOrder(session);
        const nonSerializable = Object.entries(order).filter(
            ([key, v]) =>
                typeof v === "bigint" &&
                !["cumulativeValue", "payment", "sellerBond", "buyerBond", "salt", "deadline"].includes(key),
        );
        // Any hit here is a field the store's serializer doesn't know — it
        // would throw inside JSON.stringify and be silently swallowed.
        expect(nonSerializable).toEqual([]);
    });
});
