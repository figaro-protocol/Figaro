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
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalContentHash, serializeAssemblyTemplate } from "@figaro-protocol/sdk";
import { primeClauseSpecs } from "./primeClauseSpecs";
import {
    projectSnapshotForReview,
    snapshotCompositionIdentity,
    snapshotToAssemblyTemplate,
    templateComposedByAgreement,
    templateComposedClauses,
    templateFoldedClauses,
    unfilledAssemblyTerms,
    assemblyClauseDefaults,
} from "@/lib/designer/draftToAssemblyTemplate";
import { assemblyTemplateToDraft } from "@/lib/designer/assemblyTemplateToDraft";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
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

    it("lists each order's picks by id AND version, read from the bytes", () => {
        const review = projectSnapshotForReview(composed);
        if (!review.ok) throw new Error(review.error);
        const listed = (orderHash: string) => review.composedClausesByOrderId[orderHash]
            .map((c) => `${c.clauseId}#${c.version}`).sort();
        expect(listed(drawn.orders[0].orderHash)).toEqual(["figaro-acceptance-criteria#1", "figaro-schedule#1"]);
        expect(listed(drawn.orders[1].orderHash)).toEqual(["figaro-acceptance-criteria#1"]);
        // The same listing the /view path reads off a published template.
        expect(templateComposedClauses(review.template)["order-0"].map((c) => c.clauseId).sort())
            .toEqual([...ORDER_CLAUSES].sort());
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

// A required assembly term left empty is named, and a filled one is not —
// the review's Confirm reads this list (beta r5: a utility-token pin
// published with no currency).
describe("unfilledAssemblyTerms", () => {
    it("names a selected term whose required design fill is empty", () => {
        const missing = unfilledAssemblyTerms({ "figaro-utility-token": {} });
        expect(missing).toEqual([
            { clauseId: "figaro-utility-token", clauseTitle: expect.any(String), fieldLabel: expect.any(String) },
        ]);
        expect(missing[0]!.fieldLabel.toLowerCase()).toContain("currency");
    });

    it("is empty once the fill is present", () => {
        expect(unfilledAssemblyTerms({
            "figaro-utility-token": { currency: "0x000000000000000000000000000000000000dEaD" },
        })).toEqual([]);
    });

    it("ignores a term with no required design fill, and an unknown clause", () => {
        expect(unfilledAssemblyTerms({ "figaro-assembly-provenance": {}, "figaro-never-seen": {} })).toEqual([]);
    });
});

// Toggling an assembly term on starts from the spec's declared defaults, so a
// required fill with a default is filled from the first moment; one without
// a default stays for the designer.
describe("assemblyClauseDefaults", () => {
    it("seeds a required design fill from its declared default", () => {
        const seeded = assemblyClauseDefaults("figaro-arbitration-kleros");
        expect(seeded.klerosCourt).toBe("general");
        expect(unfilledAssemblyTerms({ "figaro-arbitration-kleros": seeded })).toEqual([]);
    });

    it("leaves a fill with no default empty, and an unknown clause seeds nothing", () => {
        expect(assemblyClauseDefaults("figaro-utility-token")).not.toHaveProperty("currency");
        expect(assemblyClauseDefaults("figaro-never-seen")).toEqual({});
    });
});

// A spec marks itself mandatory in its own `block`, written by whoever
// registered it, and any (clauseId, version) slot is anyone's. The review
// lists every mandatory clause the bytes carry by id AND version, and a
// stranger's later registration neither displaces the version a new design
// folds nor the version a fork states. Runs LAST in this file: it adds the
// stranger's specs to the module cache.
describe("the mandatory fold — listed on the review, never displaced by a stranger's registration", () => {
    let drawn: ReturnType<typeof drawCanvas>;
    const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");
    const commerce = JSON.parse(readFileSync(path.join(CLAUSES_DIR, "figaro-commerce.json"), "utf8")) as Record<string, unknown>;

    /** Register (into the cache, as `useClauseSpecs` would from the chain) a
     *  stranger's spec: the real commerce spec under another id or version. */
    async function registerStranger(clauseId: string, version: number): Promise<void> {
        const document = { ...commerce, clauseId, version, title: `${clauseId} v${version}` };
        const uri = `stranger://${clauseId}/${version}`;
        setClauseSpecFetcher(async (u) => (u === uri ? document : JSON.parse(readFileSync(u, "utf8"))));
        await loadClauseSpec(clauseId, version, uri, canonicalContentHash(document));
    }

    beforeAll(async () => {
        await primeClauseSpecs([...ORDER_CLAUSES, ...ASSEMBLY_CLAUSES, ...MANDATORY, "figaro-assembly-provenance"]);
        drawn = drawCanvas();
    });

    it("lists every mandatory clause the bytes carry, by id and version, with what carries it", () => {
        const review = projectSnapshotForReview(snapshotOf(drawn));
        if (!review.ok) throw new Error(review.error);
        const listed = review.folded.map((f) => `${f.clauseId}#${f.version}:${f.carriedBy.join(",")}`).sort();
        expect(listed).toEqual([
            "figaro-assembly-provenance#1:assembly",
            "figaro-commerce#1:order-0,order-1",
            "figaro-topology#1:order-0,order-1",
        ]);
        // The complement of the composed readout: together they are the template.
        for (const agreement of review.template.agreements) {
            const composed = Object.keys(templateComposedByAgreement(review.template)[agreement.id]);
            const folded = templateFoldedClauses(review.template)
                .filter((f) => f.carriedBy.includes(agreement.id)).map((f) => f.clauseId);
            expect([...composed, ...folded].sort()).toEqual(Object.keys(agreement.clauses).sort());
        }
    });

    it("a later registration of commerce marked mandatory displaces neither a new design nor a fork", async () => {
        const before = projectSnapshotForReview(snapshotOf(drawn));
        if (!before.ok) throw new Error(before.error);
        await registerStranger("figaro-commerce", 99);

        const after = projectSnapshotForReview(snapshotOf(drawn));
        if (!after.ok) throw new Error(after.error);
        expect(after.compositionHash).toBe(before.compositionHash);
        expect(after.folded.some((f) => f.clauseId === "figaro-commerce" && f.version === 99)).toBe(false);

        const fork = assemblyTemplateToDraft(before.template, { slug: "asm-fork" });
        const forked = projectSnapshotForReview(fork);
        if (!forked.ok) throw new Error(forked.error);
        expect(forked.compositionHash).toBe(before.compositionHash);
    });

    it("a new clause id marked mandatory is listed on the review, never folded out of sight", async () => {
        await registerStranger("stranger-term", 1);
        const review = projectSnapshotForReview(snapshotOf(drawn));
        if (!review.ok) throw new Error(review.error);
        expect(review.folded).toContainEqual(expect.objectContaining({
            clauseId: "stranger-term",
            version: 1,
            carriedBy: ["order-0", "order-1"],
        }));
    });
});

// The canvas records only non-1 versions, so a v1 pick reaches the build with
// no version. A later v2 of the same id is anyone's registration: the review
// lists, and the bytes carry, the v1 the designer picked. Runs LAST: it adds
// a v2 spec to the module cache.
describe("a pick with no recorded version — v1, never the highest loaded", () => {
    let drawn: ReturnType<typeof drawCanvas>;
    const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");
    const schedule = JSON.parse(readFileSync(path.join(CLAUSES_DIR, "figaro-schedule.json"), "utf8")) as Record<string, unknown>;

    beforeAll(async () => {
        await primeClauseSpecs([...ORDER_CLAUSES, ...ASSEMBLY_CLAUSES, ...MANDATORY, "figaro-assembly-provenance"]);
        drawn = drawCanvas();
    });

    it("a v2 registered after the pick neither moves the bytes nor the version the review lists", async () => {
        const picked = snapshotOf(drawn, {
            clausesByOrderId: { [drawn.orders[0].orderHash]: { "figaro-schedule": {} } },
        });
        const before = projectSnapshotForReview(picked);
        if (!before.ok) throw new Error(before.error);

        const document = { ...schedule, version: 2, title: "figaro-schedule v2" };
        const uri = "stranger://figaro-schedule/2";
        setClauseSpecFetcher(async (u) => (u === uri ? document : JSON.parse(readFileSync(u, "utf8"))));
        await loadClauseSpec("figaro-schedule", 2, uri, canonicalContentHash(document));

        const after = projectSnapshotForReview(picked);
        if (!after.ok) throw new Error(after.error);
        expect(after.compositionHash).toBe(before.compositionHash);
        expect(after.template.agreements[0].clauseVersions).toBeUndefined();
        expect(after.composedClausesByOrderId[drawn.orders[0].orderHash])
            .toEqual([{ clauseId: "figaro-schedule", version: 1, title: expect.any(String) }]);

        // Stating 2 is the only way to compose v2, and the listing says so.
        const stated = projectSnapshotForReview({
            ...picked,
            clauseVersionsByOrderId: { [drawn.orders[0].orderHash]: { "figaro-schedule": 2 } },
        });
        if (!stated.ok) throw new Error(stated.error);
        expect(stated.compositionHash).not.toBe(before.compositionHash);
        expect(stated.composedClausesByOrderId[drawn.orders[0].orderHash])
            .toEqual([{ clauseId: "figaro-schedule", version: 2, title: "figaro-schedule v2" }]);
    });
});

// The assembly-terms gate and the toggle-on seed read the version map the
// template carries, which is sparse: an absent entry is v1, never the highest
// version of the id the registry read loaded. A stranger's v2 that drops the
// required fill (or changes its default) moves neither Confirm's gate nor the
// seed. Runs LAST: it adds v2 specs to the module cache.
describe("assembly terms with no recorded version — read at v1", () => {
    const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");
    const read = (id: string) => JSON.parse(readFileSync(path.join(CLAUSES_DIR, `${id}.json`), "utf8")) as {
        fields: Array<{ name: string; default?: unknown }>;
        block: { design: { fills: string[] } };
    };

    async function registerV2(clauseId: string, document: Record<string, unknown>): Promise<void> {
        const uri = `stranger://${clauseId}/2`;
        setClauseSpecFetcher(async (u) => (u === uri ? document : JSON.parse(readFileSync(u, "utf8"))));
        await loadClauseSpec(clauseId, 2, uri, canonicalContentHash(document));
    }

    beforeAll(async () => {
        await primeClauseSpecs(["figaro-utility-token", "figaro-arbitration-kleros"]);
        const token = read("figaro-utility-token");
        await registerV2("figaro-utility-token", {
            ...token, version: 2, block: { ...token.block, design: { ...token.block.design, fills: [] } },
        });
        const kleros = read("figaro-arbitration-kleros");
        await registerV2("figaro-arbitration-kleros", {
            ...kleros,
            version: 2,
            fields: kleros.fields.map((f) => (f.name === "klerosCourt" ? { ...f, default: "english-language" } : f)),
        });
    });

    it("an unfilled v1 term still gates Confirm when a v2 declares no fill", () => {
        expect(unfilledAssemblyTerms({ "figaro-utility-token": {} }, {}).map((m) => m.clauseId))
            .toEqual(["figaro-utility-token"]);
        expect(unfilledAssemblyTerms({ "figaro-utility-token": {} }, { "figaro-utility-token": 2 })).toEqual([]);
    });

    it("toggling a term on seeds v1's declared default, not v2's", () => {
        expect(assemblyClauseDefaults("figaro-arbitration-kleros").klerosCourt).toBe("general");
        expect(assemblyClauseDefaults("figaro-arbitration-kleros", 2).klerosCourt).toBe("english-language");
    });
});
