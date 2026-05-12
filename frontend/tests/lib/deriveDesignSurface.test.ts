import { describe, expect, it, beforeEach } from "vitest";
import {
    getMechanismKindsForDesign,
    getRoleKindsForDesign,
} from "@/lib/designer/deriveDesignSurface";
import {
    startSyntheticSession,
    createSyntheticRootOrder,
    createSyntheticSubOrder,
    editSyntheticAgreement,
} from "@/lib/designer/syntheticProcess";
import type { Order } from "@/lib/core/store";

describe("getMechanismKindsForDesign", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("returns empty array for empty orders", () => {
        expect(getMechanismKindsForDesign([])).toEqual([]);
    });

    it("returns 'core' for a default root order (figaro-commerce-v1 → core)", () => {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        // The default root carries figaro-commerce-v1 (cart/order schema) and
        // figaro-fulfilment-v2 (pickup modality). SCHEMA_OWNERSHIP maps
        // commerce → core and fulfilment → coordinator.
        const kinds = getMechanismKindsForDesign([root.order]);
        expect(kinds).toContain("core");
        expect(kinds).toContain("coordinator");
    });

    it("dedups kinds across multiple orders that reference the same schema", () => {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const sub = createSyntheticSubOrder(session, root.order);
        const kinds = getMechanismKindsForDesign([root.order, sub.order]);
        // Both root and sub-order carry figaro-commerce-v1; "core" should
        // appear once, not twice.
        const coreCount = kinds.filter((k) => k === "core").length;
        expect(coreCount).toBe(1);
    });

    it("returns sorted output for stable display order", () => {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const kinds = getMechanismKindsForDesign([root.order]);
        const sortedCopy = [...kinds].sort();
        expect(kinds).toEqual(sortedCopy);
    });
});

describe("getRoleKindsForDesign", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("always includes 'buyer' even on empty orders", () => {
        expect(getRoleKindsForDesign([])).toEqual(["buyer"]);
    });

    it("includes 'merchant' for a root order", () => {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const kinds = getRoleKindsForDesign([root.order]);
        expect(kinds).toContain("buyer");
        expect(kinds).toContain("merchant");
    });

    it("includes 'courier' for a sub-order with courierProcessIncluded", () => {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const courier = createSyntheticSubOrder(session, root.order, {
            roleHint: "courier",
            courierProcessIncluded: true,
        });
        // Reload the sub-order via the agreement so courierProcessIncluded is
        // recoverable from the saved agreement (roleHint is not).
        const kinds = getRoleKindsForDesign([root.order, courier.order]);
        expect(kinds).toContain("courier");
    });

    it("includes 'offset' for a sub-order with offsetProviders", () => {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const offset = createSyntheticSubOrder(session, root.order);
        // Add offset providers via editSyntheticAgreement so the agreement
        // gets rebuilt with offset-policy clause.
        const offsetEdited: Order = editSyntheticAgreement(offset.order, {
            manifestFields: {
                origin: "—",
                offsetProviders: ["klima"],
            },
        });
        const kinds = getRoleKindsForDesign([root.order, offsetEdited]);
        expect(kinds).toContain("offset");
    });

    it("falls back to 'co-seller' for a non-courier non-offset sub-order", () => {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const sub = createSyntheticSubOrder(session, root.order);
        const kinds = getRoleKindsForDesign([root.order, sub.order]);
        expect(kinds).toContain("co-seller");
    });

    it("returns sorted output", () => {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const sub = createSyntheticSubOrder(session, root.order, {
            roleHint: "courier",
            courierProcessIncluded: true,
        });
        const kinds = getRoleKindsForDesign([root.order, sub.order]);
        const sortedCopy = [...kinds].sort();
        expect(kinds).toEqual(sortedCopy);
    });
});
