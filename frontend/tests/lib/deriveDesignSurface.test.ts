import { describe, expect, it, beforeEach } from "vitest";
import { getMechanismKindsForDesign } from "@/lib/designer/deriveDesignSurface";
import {
    startSyntheticSession,
    createSyntheticRootOrder,
    createSyntheticSubOrder,
} from "@/lib/designer/syntheticProcess";

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
        // The default root carries figaro-commerce-v1 (cart/order clause) and
        // figaro-fulfilment-v2 (pickup modality). Each spec's `block`
        // binding declares commerce → core and fulfilment → coordinator.
        const kinds = getMechanismKindsForDesign([root.order]);
        expect(kinds).toContain("core");
        expect(kinds).toContain("coordinator");
    });

    it("dedups kinds across multiple orders that reference the same clause", () => {
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

