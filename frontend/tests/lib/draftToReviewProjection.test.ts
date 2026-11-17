/**
 * draftToReviewProjection.test.ts — the designer's draft → REVIEW projection.
 *
 * The review screen is the last thing a designer reads before an irreversible
 * anchor, so the terms it shows must be the terms in the bytes it sends. This
 * pins that: `projectSnapshotForReview` returns the composition of the SAME
 * assembly `snapshotToAssembly` builds and publish serializes — same
 * clauses, same hash — keyed back onto the canvas's own order ids.
 *
 * The regression it guards: a review that read the composition its own way
 * showed every order as "No terms yet" while the draft, and the assembly
 * publish would have anchored, carried the composed clauses.
 *
 * Orders are composed the way the canvas composes them (synthetic session →
 * root → sub-order, then the drawer's clause map), never hand-written.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { serializeAssembly } from "@figaro-protocol/sdk";
import { _primeRegisteredAgreement_TESTING_ONLY } from "@/lib/protocol/useAgreementRegistry";
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";
import {
    projectSnapshotForReview,
    snapshotAssemblyIdentity,
    snapshotToAssembly,
    assemblyComposedByAgreement,
    assemblyComposedClauses,
    unfilledAssemblyTerms,
    assemblyClauseDefaults,
} from "@/lib/designer/draftToAssembly";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import {
    createSyntheticRootOrder,
    createSyntheticSubOrder,
    startSyntheticSession,
} from "@/lib/designer/syntheticProcess";
import { deriveAssemblySlug } from "@/lib/shared/assembly";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import type { Order } from "@/lib/core/store";

/** The clauses the beta tester composed, by scope — the files the cache is
 *  primed from; every read below locates a clause by `keyOf(name)`. */
const ORDER_CLAUSES = ["figaro-schedule", "figaro-acceptance-criteria"] as const;
const ASSEMBLY_CLAUSES = [
    "figaro-arbitration-kleros",
    "figaro-applicable-law",
    "figaro-utility-token",
] as const;
const COMMERCE = ["figaro-commerce"] as const;
const keys = (names: readonly string[]) => names.map((n) => keyOf(n));

/** A canvas session: root + one sub-order, exactly as the designer draws them. */
function drawCanvas(): { orders: Order[]; processId: string; session: ReturnType<typeof startSyntheticSession> } {
    const session = startSyntheticSession();
    const root = createSyntheticRootOrder(session);
    const sub = createSyntheticSubOrder(session, root.order);
    return { orders: [root.order, sub.order], processId: session.processId, session };
}


/** Wrap drawn orders + a clause composition into the snapshot the canvas
 *  autosaves. */
function snapshotOf(
    drawn: ReturnType<typeof drawCanvas>,
    composition: Partial<Pick<DesignSnapshot, "clausesByOrderId" | "assemblyClauses" | "registeredByOrderId">> = {},
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
        await primeClauseSpecs([...ORDER_CLAUSES, ...ASSEMBLY_CLAUSES, ...COMMERCE]);
        drawn = drawCanvas();
        composed = snapshotOf(drawn, {
            // What ticking a checkbox in the order drawer leaves behind: the
            // clause key is the selection; `{}` is a clause with no design fills.
            clausesByOrderId: {
                [drawn.orders[0].orderHash]: { [keyOf("figaro-schedule")]: {}, [keyOf("figaro-acceptance-criteria")]: {} },
                [drawn.orders[1].orderHash]: { [keyOf("figaro-acceptance-criteria")]: {} },
            },
            assemblyClauses: {
                // The forum clauses carry no design fill: the designer composes
                // them with no values and the buyer fills them at checkout.
                [keyOf("figaro-arbitration-kleros")]: {},
                [keyOf("figaro-applicable-law")]: {},
                [keyOf("figaro-utility-token")]: { currency: "MOCK" },
            },
        });
    });

    it("projects each order's composed clauses — never an empty order the canvas holds terms for", () => {
        const review = projectSnapshotForReview(composed);
        expect(review.ok).toBe(true);
        if (!review.ok) return;

        // THE REGRESSION: both orders carry the clauses ticked in the drawer.
        expect(Object.keys(review.composedByOrderId[drawn.orders[0].orderHash]).sort())
            .toEqual(keys(ORDER_CLAUSES).sort());
        expect(Object.keys(review.composedByOrderId[drawn.orders[1].orderHash]))
            .toEqual([keyOf("figaro-acceptance-criteria")]);
        for (const order of drawn.orders) {
            expect(
                Object.keys(review.composedByOrderId[order.orderHash]).length,
                "an order the canvas composed terms on never reviews as empty",
            ).toBeGreaterThan(0);
        }
    });

    it("lists each order's picks by key, labeled by the spec's own name and version", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        const listed = (orderHash: string) => review.composedClausesByOrderId[orderHash]
            .map((c) => `${c.clauseId}#${c.version}`).sort();
        expect(listed(drawn.orders[0].orderHash)).toEqual(["figaro-acceptance-criteria#1", "figaro-schedule#1"]);
        expect(listed(drawn.orders[1].orderHash)).toEqual(["figaro-acceptance-criteria#1"]);
        // The same listing the /view path reads off a published assembly.
        expect(assemblyComposedClauses(review.hydrated)["agreement-0"].map((c) => c.clauseKey).sort())
            .toEqual(keys(ORDER_CLAUSES).sort());
    });

    it("keys the projection by the CANVAS's order ids, not the assembly's local labels", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        expect(Object.keys(review.composedByOrderId).sort())
            .toEqual(drawn.orders.map((o) => o.orderHash).sort());
        // The assembly itself still speaks its own labels — the re-keying is
        // the projection's, so a review node finds its own composition.
        expect(review.assembly.agreements.map((a) => a.id)).toEqual(["agreement-0", "agreement-1"]);
    });

    it("is the SAME BYTES publish anchors — one assembly, one hash", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        const published = serializeAssembly(snapshotToAssembly(composed).assembly);
        expect(review.assemblyHash).toBe(published.assemblyHash);
        expect(review.slug).toBe(deriveAssemblySlug(published.assemblyHash));
        // And the canvas's own identity readout agrees with the review's.
        expect(snapshotAssemblyIdentity(composed).assemblyHash).toBe(review.assemblyHash);
    });

    it("carries the assembly-scoped terms and their design fills", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        for (const clauseKey of keys(ASSEMBLY_CLAUSES)) {
            expect(review.assemblyClauses).toHaveProperty(clauseKey);
        }
        expect(review.assemblyClauses[keyOf("figaro-utility-token")]).toEqual({ currency: "MOCK" });
        expect(review.assemblyClauses[keyOf("figaro-applicable-law")]).toEqual({});
    });

    it("moves the hash when a composed value moves — the gate is value-sensitive", () => {
        const first = projectSnapshotForReview(composed);
        const other = projectSnapshotForReview({
            ...composed,
            assemblyClauses: {
                ...composed.assemblyClauses,
                [keyOf("figaro-utility-token")]: { currency: "0x0000000000000000000000000000000000000001" },
            },
        });
        if (!first.ok || !other.ok) throw new Error("both compositions build");
        expect(other.assemblyHash).not.toBe(first.assemblyHash);
    });

    it("reads a assembly's composition the same way for a published assembly", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        // The `/view` path reads the pinned bytes directly — keyed by the
        // assembly's agreement ids.
        const byAgreement = assemblyComposedByAgreement(review.hydrated);
        expect(Object.keys(byAgreement)).toEqual(["agreement-0", "agreement-1"]);
        expect(Object.keys(byAgreement["agreement-0"]).sort()).toEqual(keys(ORDER_CLAUSES).sort());
    });
});

describe("projectSnapshotForReview — malformed and empty compositions", () => {
    let drawn: ReturnType<typeof drawCanvas>;

    beforeAll(async () => {
        await primeClauseSpecs([...ORDER_CLAUSES, ...ASSEMBLY_CLAUSES, ...COMMERCE]);
        drawn = drawCanvas();
    });

    it("refuses, without throwing, when an assembly-scoped clause sits on an order", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn, {
            clausesByOrderId: { [drawn.orders[0].orderHash]: { [keyOf("figaro-applicable-law")]: {} } },
        }));
        expect(review.ok).toBe(false);
        if (review.ok) return;
        expect(review.error).toContain("figaro-applicable-law");
    });

    it("refuses, without throwing, when an agreement-scoped clause sits at assembly level", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn, {
            assemblyClauses: { [keyOf("figaro-schedule")]: {} },
        }));
        expect(review.ok).toBe(false);
        if (review.ok) return;
        expect(review.error).toContain("figaro-schedule");
    });

    it("refuses, without throwing, a draft whose orders compose no clause", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn));
        expect(review.ok).toBe(false);
        if (review.ok) return;
        expect(review.error).toMatch(/composes no clause/);
    });
});

// No clause is required, and the list of what a payment buys may sit in any
// clause under any field name: a stranger's itemized clause is composed as any
// clause is. The review classifies no clause by a field's name or shape
// (docs/CLAUSES.md, "block.design.article is the one grouping word"), so it
// names no order as lacking line items.
describe("projectSnapshotForReview — an order's line items are any clause's", () => {
    let drawn: ReturnType<typeof drawCanvas>;
    let itemized: `0x${string}`;

    beforeAll(async () => {
        await primeClauseSpecs([...ORDER_CLAUSES, ...ASSEMBLY_CLAUSES, ...COMMERCE]);
        drawn = drawCanvas();
        const stranger = {
            clauseId: "a-strangers-itemized-bill",
            version: 1,
            title: "An itemized bill",
            description: "The articles an order covers, each with its count and its price.",
            fields: [{
                name: "articles",
                type: "array",
                required: true,
                minItems: 0,
                items: {
                    name: "article",
                    type: "object",
                    required: true,
                    fields: [
                        { name: "label", type: "string", required: true, minLength: 1 },
                        { name: "count", type: "integer", required: true, min: 1 },
                        { name: "price", type: "bigint", required: true, min: "0" },
                    ],
                },
            }],
            stages: {},
            block: {
                design: { article: "billing", scope: "agreement", nestsUnder: null, fills: [], composes: null },
                checkout: { catalogueFills: [], profileFills: [], catalogueMeasures: {} },
                runtime: { interaction: null, fields: [] },
            },
        };
        const { clauseKey, bytes } = pinSpec(stranger);
        const uri = "mem://a-strangers-itemized-bill";
        setClauseSpecFetcher(async (u) => (u === uri ? bytes : canonicalFileBytes(u)));
        await loadClauseSpec(clauseKey, uri);
        itemized = clauseKey;
    });

    it("names no order of a draft whose orders compose a stranger's itemized clause under another field name", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn, {
            clausesByOrderId: Object.fromEntries(drawn.orders.map((o) => [o.orderHash, { [itemized]: {} }])),
        }));
        if (!review.ok) throw new Error(review.error);
        expect(review).not.toHaveProperty("withoutLineItems");
    });

    it("names no order of a draft whose orders compose figaro-commerce, or no itemized clause at all", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn, {
            clausesByOrderId: {
                [drawn.orders[0].orderHash]: { [keyOf("figaro-commerce")]: {} },
                [drawn.orders[1].orderHash]: { [keyOf("figaro-schedule")]: {} },
            },
        }));
        if (!review.ok) throw new Error(review.error);
        expect(review).not.toHaveProperty("withoutLineItems");
    });
});

// A required assembly term left empty is named, and a filled one is not —
// the review's Confirm reads this list (beta r5: a utility-token pin
// published with no currency).
describe("unfilledAssemblyTerms", () => {
    beforeAll(async () => {
        await primeClauseSpecs([...ASSEMBLY_CLAUSES, ...COMMERCE]);
    });

    it("names a selected term whose required design fill is empty", () => {
        const missing = unfilledAssemblyTerms({ [keyOf("figaro-utility-token")]: {} });
        expect(missing).toEqual([
            { clauseKey: keyOf("figaro-utility-token"), clauseTitle: expect.any(String), fieldLabel: expect.any(String) },
        ]);
        expect(missing[0]!.fieldLabel.toLowerCase()).toContain("currency");
    });

    it("is empty once the fill is present", () => {
        expect(unfilledAssemblyTerms({
            [keyOf("figaro-utility-token")]: { currency: "0x000000000000000000000000000000000000dEaD" },
        })).toEqual([]);
    });

    it("ignores a term with no required design fill, and an unknown clause", () => {
        expect(unfilledAssemblyTerms({ [keyOf("figaro-commerce")]: {}, [`0x${"ee".repeat(32)}`]: {} })).toEqual([]);
    });
});

// Toggling an assembly term on starts from the spec's declared defaults, so a
// required fill with a default is filled from the first moment; one without
// a default stays for the designer.
describe("assemblyClauseDefaults", () => {
    it("seeds a required design fill from its declared default", async () => {
        // No protocol clause declares a default on an assembly-scoped design
        // fill (the forum clauses are the buyer's), so the exemplar is a
        // registered spec of its own: the kleros spec with the subcourt as a
        // defaulted design fill, under another id.
        const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");
        const kleros = JSON.parse(readFileSync(path.join(CLAUSES_DIR, "figaro-arbitration-kleros.json"), "utf8")) as {
            fields: Record<string, unknown>[]; block: { design: Record<string, unknown> };
        };
        const defaulted = {
            ...kleros,
            clauseId: "figaro-arbitration-defaulted",
            title: "A forum the designer pins, with a default",
            fields: kleros.fields.map((f) => (f.name === "klerosCourt" ? { ...f, default: "general" } : f)),
            block: { ...kleros.block, design: { ...kleros.block.design, fills: ["klerosCourt"] } },
        };
        const { clauseKey, bytes } = pinSpec(defaulted);
        const uri = "mem://arbitration-defaulted";
        setClauseSpecFetcher(async (u) => (u === uri ? bytes : canonicalFileBytes(u)));
        await loadClauseSpec(clauseKey, uri);
        const seeded = assemblyClauseDefaults(clauseKey);
        expect(seeded.klerosCourt).toBe("general");
        expect(unfilledAssemblyTerms({ [clauseKey]: seeded })).toEqual([]);
    });

    it("seeds nothing for a buyer-filled clause — the forum clauses have no design fill", () => {
        expect(assemblyClauseDefaults(keyOf("figaro-arbitration-kleros"))).toEqual({});
        expect(assemblyClauseDefaults(keyOf("figaro-applicable-law"))).toEqual({});
    });

    it("leaves a fill with no default empty, and an unknown clause seeds nothing", () => {
        expect(assemblyClauseDefaults(keyOf("figaro-utility-token"))).not.toHaveProperty("currency");
        expect(assemblyClauseDefaults(`0x${"ee".repeat(32)}`)).toEqual({});
    });
});
