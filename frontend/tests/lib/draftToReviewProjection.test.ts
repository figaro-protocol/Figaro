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
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs, primeMandatoryPick } from "./primeClauseSpecs";
import {
    projectSnapshotForReview,
    snapshotCompositionIdentity,
    snapshotToAssembly,
    assemblyComposedByAgreement,
    assemblyComposedClauses,
    assemblyMandatoryClauses,
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
import type { Order } from "@/lib/kernel/store";

/** The clauses the beta tester composed, by scope — the files the cache is
 *  primed from; every read below locates a clause by `keyOf(name)`. */
const ORDER_CLAUSES = ["figaro-schedule", "figaro-acceptance-criteria"] as const;
const ASSEMBLY_CLAUSES = [
    "figaro-arbitration-kleros",
    "figaro-applicable-law",
    "figaro-utility-token",
] as const;
const MANDATORY = ["figaro-commerce", "figaro-topology"] as const;
const keys = (names: readonly string[]) => names.map((n) => keyOf(n));

/** A canvas session: root + one sub-order, exactly as the designer draws them. */
function drawCanvas(): { orders: Order[]; processId: string; session: ReturnType<typeof startSyntheticSession> } {
    const session = startSyntheticSession();
    const root = createSyntheticRootOrder(session);
    const sub = createSyntheticSubOrder(session, root.order);
    return { orders: [root.order, sub.order], processId: session.processId, session };
}

/** The key of the registered agreement the designer picks in the mandatory
 *  article — the reference one, the mandatory clauses alone — primed into the
 *  verified cache by each describe's `beforeAll`. */
let pickKey: `0x${string}`;

/** Every drawn order picking `key` in the mandatory article. */
function picksFor(drawn: ReturnType<typeof drawCanvas>, key: `0x${string}` = pickKey): Record<string, `0x${string}`> {
    return Object.fromEntries(drawn.orders.map((o) => [o.orderHash, key]));
}

/** Wrap drawn orders + a clause composition into the snapshot the canvas
 *  autosaves; every order picks the reference agreement unless the
 *  composition says otherwise. */
function snapshotOf(
    drawn: ReturnType<typeof drawCanvas>,
    composition: Partial<Pick<DesignSnapshot, "clausesByOrderId" | "assemblyClauses" | "mandatoryByOrderId">> = {},
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
        mandatoryByOrderId: picksFor(drawn),
        ...composition,
    };
}

describe("projectSnapshotForReview — the review reads the bytes publish sends", () => {
    let drawn: ReturnType<typeof drawCanvas>;
    let composed: DesignSnapshot;

    beforeAll(async () => {
        await primeClauseSpecs([...ORDER_CLAUSES, ...ASSEMBLY_CLAUSES, ...MANDATORY]);
        pickKey = await primeMandatoryPick();
        drawn = drawCanvas();
        composed = snapshotOf(drawn, {
            // What ticking a checkbox in the order drawer leaves behind: the
            // clause key is the selection; `{}` is a clause with no design fills.
            clausesByOrderId: {
                [drawn.orders[0].orderHash]: { [keyOf("figaro-schedule")]: {}, [keyOf("figaro-acceptance-criteria")]: {} },
                [drawn.orders[1].orderHash]: { [keyOf("figaro-acceptance-criteria")]: {} },
            },
            assemblyClauses: {
                [keyOf("figaro-arbitration-kleros")]: { klerosCourt: "general", klerosMinJurors: 3 },
                [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY" },
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
        expect(assemblyComposedClauses(review.hydrated)["order-0"].map((c) => c.clauseKey).sort())
            .toEqual(keys(ORDER_CLAUSES).sort());
    });

    it("keys the projection by the CANVAS's order ids, not the assembly's local labels", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        expect(Object.keys(review.composedByOrderId).sort())
            .toEqual(drawn.orders.map((o) => o.orderHash).sort());
        // The assembly itself still speaks its own labels — the re-keying is
        // the projection's, so a review node finds its own composition.
        expect(review.assembly.agreements.map((a) => a.id)).toEqual(["order-0", "order-1"]);
    });

    it("is the SAME BYTES publish anchors — one assembly, one hash", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        const published = serializeAssembly(snapshotToAssembly(composed).assembly);
        expect(review.compositionHash).toBe(published.compositionHash);
        expect(review.slug).toBe(deriveAssemblySlug(published.compositionHash));
        // And the canvas's own identity readout agrees with the review's.
        expect(snapshotCompositionIdentity(composed).compositionHash).toBe(review.compositionHash);
    });

    it("shows the designer's composed clauses while the bytes still carry the mandatory pick's clauses", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        for (const clauseId of keys(MANDATORY)) {
            expect(
                review.composedByOrderId[drawn.orders[0].orderHash],
                "a clause the mandatory pick merged is listed apart from the designer's composition",
            ).not.toHaveProperty(clauseId);
            const entry = review.assembly.agreements[0];
            expect(
                review.newAgreements[entry.agreementHash].clauses,
                "…but the agreement the agreement binds carries it",
            ).toHaveProperty(clauseId);
        }
    });

    it("carries the assembly-scoped terms and their design fills", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        for (const clauseKey of keys(ASSEMBLY_CLAUSES)) {
            expect(review.assemblyClauses).toHaveProperty(clauseKey);
        }
        expect(review.assemblyClauses[keyOf("figaro-utility-token")]).toEqual({ currency: "MOCK" });
        expect(review.assemblyClauses[keyOf("figaro-applicable-law")]).toEqual({ applicableLaw: "US-NY" });
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
        expect(other.compositionHash).not.toBe(first.compositionHash);
    });

    it("reads a assembly's composition the same way for a published assembly", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        // The `/view` path reads the pinned bytes directly — keyed by the
        // assembly's agreement ids, the mandatory clauses listed apart.
        const byAgreement = assemblyComposedByAgreement(review.hydrated);
        expect(Object.keys(byAgreement)).toEqual(["order-0", "order-1"]);
        expect(Object.keys(byAgreement["order-0"]).sort()).toEqual(keys(ORDER_CLAUSES).sort());
    });
});

describe("projectSnapshotForReview — malformed and empty compositions", () => {
    let drawn: ReturnType<typeof drawCanvas>;

    beforeAll(async () => {
        await primeClauseSpecs([...ORDER_CLAUSES, ...ASSEMBLY_CLAUSES, ...MANDATORY]);
        pickKey = await primeMandatoryPick();
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

    it("refuses, without throwing, an order with no registered agreement picked in the mandatory article", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn, {
            mandatoryByOrderId: { [drawn.orders[0].orderHash]: pickKey },
        }));
        expect(review.ok).toBe(false);
        if (review.ok) return;
        expect(review.error).toMatch(/order-1 has no registered agreement picked in the mandatory article/);
        const none = projectSnapshotForReview(snapshotOf(drawn, { mandatoryByOrderId: {} }));
        expect(none.ok).toBe(false);
    });

    it("refuses, without throwing, a pick this tab has not read from the AgreementRegistry", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn, { mandatoryByOrderId: picksFor(drawn, `0x${"6d".repeat(32)}`) }));
        expect(review.ok).toBe(false);
        if (review.ok) return;
        expect(review.error).toMatch(/has not been read/);
    });

    it("handles a draft that composed nothing — every order projects to an empty map", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn));
        expect(review.ok).toBe(true);
        if (!review.ok) return;
        for (const order of drawn.orders) {
            expect(review.composedByOrderId[order.orderHash]).toEqual({});
        }
        for (const clauseKey of keys(ASSEMBLY_CLAUSES)) {
            expect(review.assemblyClauses).not.toHaveProperty(clauseKey);
        }
    });
});

// A required assembly term left empty is named, and a filled one is not —
// the review's Confirm reads this list (beta r5: a utility-token pin
// published with no currency).
describe("unfilledAssemblyTerms", () => {
    beforeAll(async () => {
        await primeClauseSpecs([...ASSEMBLY_CLAUSES, ...MANDATORY]);
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
    it("seeds a required design fill from its declared default", () => {
        const seeded = assemblyClauseDefaults(keyOf("figaro-arbitration-kleros"));
        expect(seeded.klerosCourt).toBe("general");
        expect(unfilledAssemblyTerms({ [keyOf("figaro-arbitration-kleros")]: seeded })).toEqual([]);
    });

    it("leaves a fill with no default empty, and an unknown clause seeds nothing", () => {
        expect(assemblyClauseDefaults(keyOf("figaro-utility-token"))).not.toHaveProperty("currency");
        expect(assemblyClauseDefaults(`0x${"ee".repeat(32)}`)).toEqual({});
    });
});

// A spec marks itself mandatory in its own `block`, written by whoever
// registered it, and any registration is anyone's. Nothing folds: a mandatory
// clause enters an agreement only through the registered agreement the
// designer picks for it in the mandatory article, and the review lists every
// mandatory clause the bytes carry, by key, for the designer to confirm.
// Runs LAST in this file: it adds strangers' specs to the module cache.
describe("the mandatory pick — its clauses merged, each listed on the review", () => {
    let drawn: ReturnType<typeof drawCanvas>;
    const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");
    const commerce = JSON.parse(readFileSync(path.join(CLAUSES_DIR, "figaro-commerce.json"), "utf8")) as Record<string, unknown>;

    /** Register (into the cache, as `useClauseSpecs` would from the chain) a
     *  stranger's spec: the real commerce spec under another name or version. */
    async function registerStranger(clauseId: string, version: number): Promise<`0x${string}`> {
        const { clauseKey, bytes } = pinSpec({ ...commerce, clauseId, version, title: `${clauseId} v${version}` });
        const uri = `stranger://${clauseId}/${version}`;
        setClauseSpecFetcher(async (u) => (u === uri ? bytes : canonicalFileBytes(u)));
        await loadClauseSpec(clauseKey, uri);
        return clauseKey;
    }

    beforeAll(async () => {
        await primeClauseSpecs([...ORDER_CLAUSES, ...ASSEMBLY_CLAUSES, ...MANDATORY]);
        pickKey = await primeMandatoryPick();
        drawn = drawCanvas();
    });

    it("lists every mandatory clause the bytes carry, by key, with what carries it", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn));
        if (!review.ok) throw new Error(review.error);
        const listed = review.mandatory.map((f) => `${f.clauseId}#${f.version}:${f.carriedBy.join(",")}`).sort();
        expect(listed).toEqual([
            "figaro-commerce#1:order-0,order-1",
            "figaro-topology#1:order-0,order-1",
        ]);
        expect(review.mandatory.map((f) => f.clauseKey).sort()).toEqual(keys(MANDATORY).sort());
        // The complement of the composed readout: together they are the assembly.
        for (const entry of review.assembly.agreements) {
            const composed = Object.keys(assemblyComposedByAgreement(review.hydrated)[entry.id]);
            const mandatory = assemblyMandatoryClauses(review.hydrated)
                .filter((f) => f.carriedBy.includes(entry.id)).map((f) => f.clauseKey);
            const carried = review.hydrated.agreements[entry.agreementHash.toLowerCase() as `0x${string}`].clauses;
            expect([...composed, ...mandatory].sort()).toEqual(Object.keys(carried).sort());
        }
    });

    it("a stranger's mandatory registration — even one sharing commerce's name — enters no agreement it is not picked for", async () => {
        const before = projectSnapshotForReview(snapshotOf(drawn));
        if (!before.ok) throw new Error(before.error);
        const lookalike = await registerStranger("figaro-commerce", 99);
        const after = projectSnapshotForReview(snapshotOf(drawn));
        if (!after.ok) throw new Error(after.error);
        expect(after.compositionHash).toBe(before.compositionHash);
        expect(after.mandatory.map((f) => f.clauseKey)).not.toContain(lookalike);
    });

    it("picked, another wallet's registered agreement merges its own mandatory clauses, each listed by key", async () => {
        const lookalike = await registerStranger("figaro-commerce", 98);
        const theirs = _primeRegisteredAgreement_TESTING_ONLY({ clauses: { [lookalike]: {}, [keyOf("figaro-topology")]: {} } });
        const review = projectSnapshotForReview(snapshotOf(drawn, { mandatoryByOrderId: picksFor(drawn, theirs) }));
        if (!review.ok) throw new Error(review.error);
        expect(review.mandatory).toContainEqual(expect.objectContaining({
            clauseKey: lookalike,
            clauseId: "figaro-commerce",
            version: 98,
            carriedBy: ["order-0", "order-1"],
        }));
        // The original commerce key is not carried: the pick names what merges.
        expect(review.mandatory.map((f) => f.clauseKey)).not.toContain(keyOf("figaro-commerce", 1));
    });
});
