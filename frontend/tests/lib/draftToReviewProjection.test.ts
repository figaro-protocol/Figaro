/**
 * draftToReviewProjection.test.ts — the designer's draft → REVIEW projection.
 *
 * The review screen is the last thing a designer reads before an irreversible
 * anchor, so the terms it shows must be the terms in the bytes it sends. This
 * pins that: `projectSnapshotForReview` returns the composition of the SAME
 * template `snapshotToAssemblyTemplate` builds and publish serializes — same
 * clauses, same hash — keyed back onto the canvas's own order ids.
 *
 * The regression it guards: a review that read the composition its own way
 * showed every order as "No terms yet" while the draft, and the template
 * publish would have anchored, carried the composed clauses.
 *
 * Orders are composed the way the canvas composes them (synthetic session →
 * root → sub-order, then the drawer's clause map), never hand-written.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { serializeAssemblyTemplate } from "@figaro-protocol/sdk";
import { primeClauseSpecs } from "./primeClauseSpecs";
import {
    projectSnapshotForReview,
    snapshotCompositionIdentity,
    snapshotToAssemblyTemplate,
    templateComposedByAgreement,
} from "@/lib/designer/draftToAssemblyTemplate";
import {
    createSyntheticRootOrder,
    createSyntheticSubOrder,
    startSyntheticSession,
} from "@/lib/designer/syntheticProcess";
import { deriveAssemblySlug } from "@/lib/shared/assemblyTemplate";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import type { Order } from "@/lib/kernel/store";

/** The clauses the beta tester composed, by scope. */
const ORDER_CLAUSES = ["figaro-schedule", "figaro-acceptance-criteria"] as const;
const ASSEMBLY_CLAUSES = [
    "figaro-arbitration-kleros",
    "figaro-applicable-law",
    "figaro-utility-token",
] as const;
const MANDATORY = ["figaro-commerce", "figaro-topology"] as const;

/** A canvas session: root + one sub-order, exactly as the designer draws them. */
function drawCanvas(): { orders: Order[]; processId: string; session: ReturnType<typeof startSyntheticSession> } {
    const session = startSyntheticSession();
    const root = createSyntheticRootOrder(session);
    const sub = createSyntheticSubOrder(session, root.order);
    return { orders: [root.order, sub.order], processId: session.processId, session };
}

/** Wrap drawn orders + a clause composition into the snapshot the canvas autosaves. */
function snapshotOf(
    drawn: ReturnType<typeof drawCanvas>,
    composition: Partial<Pick<DesignSnapshot, "clausesByOrderId" | "assemblyClauses">> = {},
): DesignSnapshot {
    return {
        slug: "asm-draft-review",
        name: "Equipment hire",
        summary: "Hirer and owner, condition attested on return.",
        description: "A two-order composition drawn on the canvas.",
        processId: drawn.processId,
        nextOrderIndex: drawn.session.nextOrderIndex,
        nextSellerIndex: drawn.session.nextSellerIndex,
        orders: drawn.orders,
        createdAt: 1,
        updatedAt: 1,
        ...composition,
    };
}

describe("projectSnapshotForReview — the review reads the bytes publish sends", () => {
    let drawn: ReturnType<typeof drawCanvas>;
    let composed: DesignSnapshot;

    beforeAll(async () => {
        await primeClauseSpecs([...ORDER_CLAUSES, ...ASSEMBLY_CLAUSES, ...MANDATORY, "figaro-assembly-provenance"]);
        drawn = drawCanvas();
        composed = snapshotOf(drawn, {
            // What ticking a checkbox in the order drawer leaves behind: the
            // clause id is the selection; `{}` is a clause with no design fills.
            clausesByOrderId: {
                [drawn.orders[0].orderHash]: { "figaro-schedule": {}, "figaro-acceptance-criteria": {} },
                [drawn.orders[1].orderHash]: { "figaro-acceptance-criteria": {} },
            },
            assemblyClauses: {
                "figaro-arbitration-kleros": { klerosCourt: "general", klerosMinJurors: 3 },
                "figaro-applicable-law": { applicableLaw: "US-NY" },
                "figaro-utility-token": { currency: "MOCK" },
            },
        });
    });

    it("projects each order's composed clauses — never an empty order the canvas holds terms for", () => {
        const review = projectSnapshotForReview(composed);
        expect(review.ok).toBe(true);
        if (!review.ok) return;

        // THE REGRESSION: both orders carry the clauses ticked in the drawer.
        expect(Object.keys(review.composedByOrderId[drawn.orders[0].orderHash]).sort())
            .toEqual([...ORDER_CLAUSES].sort());
        expect(Object.keys(review.composedByOrderId[drawn.orders[1].orderHash]))
            .toEqual(["figaro-acceptance-criteria"]);
        for (const order of drawn.orders) {
            expect(
                Object.keys(review.composedByOrderId[order.orderHash]).length,
                "an order the canvas composed terms on never reviews as empty",
            ).toBeGreaterThan(0);
        }
    });

    it("keys the projection by the CANVAS's order ids, not the template's local labels", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        expect(Object.keys(review.composedByOrderId).sort())
            .toEqual(drawn.orders.map((o) => o.orderHash).sort());
        // The template itself still speaks its own labels — the re-keying is
        // the projection's, so a review node finds its own composition.
        expect(review.template.agreements.map((a) => a.id)).toEqual(["order-0", "order-1"]);
    });

    it("is the SAME BYTES publish anchors — one template, one hash", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        const published = serializeAssemblyTemplate(snapshotToAssemblyTemplate(composed));
        expect(review.compositionHash).toBe(published.compositionHash);
        expect(review.slug).toBe(deriveAssemblySlug(published.compositionHash));
        // And the canvas's own identity readout agrees with the review's.
        expect(snapshotCompositionIdentity(composed).compositionHash).toBe(review.compositionHash);
    });

    it("shows the designer's picks while the bytes still carry the mandatory folds", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        for (const clauseId of MANDATORY) {
            expect(
                review.composedByOrderId[drawn.orders[0].orderHash],
                "an auto-folded mandatory clause is not a term the designer composed",
            ).not.toHaveProperty(clauseId);
            expect(
                review.template.agreements[0].clauses,
                "…but the published bytes carry it",
            ).toHaveProperty(clauseId);
        }
    });

    it("carries the assembly-scoped terms and their design fills", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        for (const clauseId of ASSEMBLY_CLAUSES) {
            expect(review.assemblyClauses).toHaveProperty(clauseId);
        }
        expect(review.assemblyClauses["figaro-utility-token"]).toEqual({ currency: "MOCK" });
        expect(review.assemblyClauses["figaro-applicable-law"]).toEqual({ applicableLaw: "US-NY" });
    });

    it("moves the hash when a composed value moves — the gate is value-sensitive", () => {
        const first = projectSnapshotForReview(composed);
        const other = projectSnapshotForReview({
            ...composed,
            assemblyClauses: {
                ...composed.assemblyClauses,
                "figaro-utility-token": { currency: "0x0000000000000000000000000000000000000001" },
            },
        });
        if (!first.ok || !other.ok) throw new Error("both compositions build");
        expect(other.compositionHash).not.toBe(first.compositionHash);
    });

    it("reads a template's composition the same way for a published assembly", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        // The `/view` path reads the pinned bytes directly — keyed by the
        // template's agreement ids, same mandatory-fold exclusion.
        const byAgreement = templateComposedByAgreement(review.template);
        expect(Object.keys(byAgreement)).toEqual(["order-0", "order-1"]);
        expect(Object.keys(byAgreement["order-0"]).sort()).toEqual([...ORDER_CLAUSES].sort());
    });
});

describe("projectSnapshotForReview — malformed and empty compositions", () => {
    let drawn: ReturnType<typeof drawCanvas>;

    beforeAll(async () => {
        await primeClauseSpecs([...ORDER_CLAUSES, ...ASSEMBLY_CLAUSES, ...MANDATORY, "figaro-assembly-provenance"]);
        drawn = drawCanvas();
    });

    it("refuses, without throwing, when an assembly-scoped clause sits on an order", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn, {
            clausesByOrderId: { [drawn.orders[0].orderHash]: { "figaro-applicable-law": {} } },
        }));
        expect(review.ok).toBe(false);
        if (review.ok) return;
        expect(review.error).toContain("figaro-applicable-law");
    });

    it("refuses, without throwing, when an agreement-scoped clause sits at assembly level", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn, {
            assemblyClauses: { "figaro-schedule": {} },
        }));
        expect(review.ok).toBe(false);
        if (review.ok) return;
        expect(review.error).toContain("figaro-schedule");
    });

    it("handles a draft that composed nothing — every order projects to an empty map", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn));
        expect(review.ok).toBe(true);
        if (!review.ok) return;
        for (const order of drawn.orders) {
            expect(review.composedByOrderId[order.orderHash]).toEqual({});
        }
        for (const clauseId of ASSEMBLY_CLAUSES) {
            expect(review.assemblyClauses).not.toHaveProperty(clauseId);
        }
    });
});
