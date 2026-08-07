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
 *
 * The second suite covers the OTHER direction the canvas depends on: a design
 * fill's round-trip out of the draft and into the composition's identity
 * (`draftToAssemblyTemplate` — the one walk publish uses).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { serializeAssemblyTemplate } from "@figaro/sdk";
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
import {
    snapshotCompositionIdentity,
    snapshotToAssemblyTemplate,
} from "@/lib/designer/draftToAssemblyTemplate";
import { clauseDesignFills, getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { primeClauseSpecs } from "./primeClauseSpecs";

describe("syntheticDesignStore round-trip", () => {
    beforeEach(async () => {
        window.localStorage.clear();
        await primeClauseSpecs();
    });

    it("a draft built by the real canvas builders survives save -> load", () => {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const sub = createSyntheticSubOrder(session, root.order);

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
        expect(loaded!.orders[1].payment).toBe(sub.order.payment);
        expect(loaded!.orders[1].parentOrderHashes).toEqual([root.order.orderHash]);
        // Drafts are value-free: the value fields hydrate as zeros, whatever
        // an older stored draft carried.
        expect(loaded!.orders[0].cumulativeValue).toBe(0n);
        expect(loaded!.orders[0].sellerBond).toBe(0n);
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

/**
 * The design-fill → template → identity round-trip, driven through the
 * disclosure regime (`figaro-data-terms`, `block.design.fills: ["disclosure"]`)
 * because it is the case the ruling turns on: the regime is composed at design
 * time, what the canvas control writes is the clause's design fill, and the
 * fill is part of the compositionHash — so regime variants are SIBLING
 * assemblies, not a setting on one assembly (the shipped `aerial-survey` /
 * `aerial-survey-open-data` pair is exactly this difference).
 *
 * Every enum value comes from the clause's own spec; nothing here hardcodes a
 * regime token, so a spec that grows a fourth regime is covered automatically.
 */
describe("design fills are the composition's identity — the disclosure regime", () => {
    const CLAUSE = "figaro-data-terms";
    const FIELD = "disclosure";

    beforeEach(async () => {
        window.localStorage.clear();
        await primeClauseSpecs();
    });

    /** A one-order draft composing the clause with the given field values. */
    function draft(values: Record<string, unknown>, prose = "Regime draft"): DesignSnapshot {
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        return {
            slug: "asm-draft-regime",
            name: prose,
            summary: prose,
            description: prose,
            processId: session.processId,
            nextOrderIndex: session.nextOrderIndex,
            nextSellerIndex: session.nextSellerIndex,
            orders: [root.order],
            clausesByOrderId: { [root.order.orderHash]: { [CLAUSE]: values } },
            createdAt: 1,
            updatedAt: 1,
        };
    }

    /** The regime tokens the SPEC admits — the enum the canvas control renders. */
    function regimeValues(): readonly string[] {
        const field = getClauseSpec(CLAUSE)?.fields.find((f) => f.name === FIELD);
        expect(field?.type, `${CLAUSE}.${FIELD} is an enum`).toBe("enum");
        return field?.type === "enum" ? field.values : [];
    }

    it("the clause declares the regime as a DESIGN fill, with labels for every value", () => {
        expect(clauseDesignFills(CLAUSE), `${CLAUSE} names ${FIELD} in block.design.fills`)
            .toContain(FIELD);
        const field = getClauseSpec(CLAUSE)?.fields.find((f) => f.name === FIELD);
        expect(field?.type).toBe("enum");
        if (field?.type !== "enum") return;
        expect(field.values.length, "the regime offers a choice").toBeGreaterThan(1);
        // The control renders `valueLabels`; an unlabelled value would surface
        // to the designer as a raw token.
        for (const value of field.values) {
            expect(field.valueLabels?.[value], `${value} carries a display label`).toBeTruthy();
        }
    });

    it("the composed regime survives into the template JSON — a design fill is NOT stripped", () => {
        for (const regime of regimeValues()) {
            const template = snapshotToAssemblyTemplate(draft({ [FIELD]: regime }));
            const composed = template.agreements[0].clauses[CLAUSE] as Record<string, unknown>;
            expect(composed, `${regime} is composed onto the agreement`).toEqual({ [FIELD]: regime });
            // And it is in the CANONICAL bytes, not just the in-memory object.
            const { json } = serializeAssemblyTemplate(template);
            expect(JSON.parse(json).agreements[0].clauses[CLAUSE]).toEqual({ [FIELD]: regime });
        }
    });

    it("each regime is a DISTINCT composition — regime variants are sibling assemblies", () => {
        const identities = regimeValues().map((regime) => ({
            regime,
            ...snapshotCompositionIdentity(draft({ [FIELD]: regime })),
        }));
        for (const i of identities) {
            expect(i.error, `${i.regime} derives an identity`).toBeNull();
            expect(i.compositionHash).toMatch(/^0x[0-9a-f]{64}$/u);
        }
        const hashes = identities.map((i) => i.compositionHash);
        expect(new Set(hashes).size, "one composition hash per regime").toBe(hashes.length);
        // The slug is a pure function of the hash, so siblings never collide
        // on the published route either.
        expect(new Set(identities.map((i) => i.slug)).size).toBe(identities.length);
    });

    it("composing the clause with NO regime filled is its own distinct composition", () => {
        // Optional-field handling: an unfilled design fill is a valid committed
        // state (absence, not a default) — and a different composition from any
        // filled one, so it can never be confused for one.
        const unfilled = snapshotCompositionIdentity(draft({}));
        expect(unfilled.error).toBeNull();
        const filled = regimeValues().map((r) => snapshotCompositionIdentity(draft({ [FIELD]: r })).compositionHash);
        expect(filled).not.toContain(unfilled.compositionHash);
    });

    it("editorial prose is excluded — renaming leaves the identity unmoved", () => {
        const regime = regimeValues()[0];
        const a = snapshotCompositionIdentity(draft({ [FIELD]: regime }, "One name"));
        const b = snapshotCompositionIdentity(draft({ [FIELD]: regime }, "A completely different name"));
        expect(b.compositionHash).toBe(a.compositionHash);
    });

    it("the identity survives the draft's save → load round-trip unchanged", () => {
        const regime = regimeValues()[regimeValues().length - 1];
        const snapshot = draft({ [FIELD]: regime });
        const before = snapshotCompositionIdentity(snapshot);
        saveNamedDraft(snapshot);
        const loaded = loadNamedDraft(snapshot.slug);
        expect(loaded).not.toBeNull();
        // A design fill dropped by the persistence layer would show up here as
        // a MOVED hash — the composition the designer reopens would publish as
        // a different assembly than the one they saved.
        expect(snapshotCompositionIdentity(loaded!).compositionHash).toBe(before.compositionHash);
    });

    it("a clause with NO design fills contributes no values — its identity is fill-blind", () => {
        // The complement of the rule: values on a clause that declares no
        // design fills are stripped by the build, so they cannot move identity.
        // figaro-geolocation left this fixture role when it gained its
        // designer-filled geocoder; figaro-dimweight declares no fills.
        const fillless = getClauseSpec("figaro-dimweight");
        expect(fillless, "the fixture clause is loaded").toBeTruthy();
        expect(clauseDesignFills("figaro-dimweight")).toHaveLength(0);
        const session = startSyntheticSession();
        const root = createSyntheticRootOrder(session);
        const base: DesignSnapshot = {
            slug: "asm-draft-fillless",
            name: "n", summary: "s", description: "d",
            processId: session.processId,
            nextOrderIndex: session.nextOrderIndex,
            nextSellerIndex: session.nextSellerIndex,
            orders: [root.order],
            clausesByOrderId: { [root.order.orderHash]: { "figaro-dimweight": {} } },
            createdAt: 1, updatedAt: 1,
        };
        const withStrayValues: DesignSnapshot = {
            ...base,
            clausesByOrderId: { [root.order.orderHash]: { "figaro-dimweight": { unit: "cm-kg" } } },
        };
        expect(snapshotCompositionIdentity(withStrayValues).compositionHash)
            .toBe(snapshotCompositionIdentity(base).compositionHash);
    });
});
