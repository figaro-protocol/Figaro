/**
 * The buyer's field complement is FIELD-granular. The spec's rule
 * (`clauseBlockBinding`): the buyer owns every content field named in no
 * fills list — not the designer's tailoring (`block.design.fills`), not the
 * seller's catalog items (`block.checkout.catalogueFills`), not the seller's
 * standing declarations (`block.checkout.profileFills`), not a field the
 * checkout walk fills mechanically. A clause the seller's catalog fills in
 * PART still offers the buyer its own fields; a clause every field of which
 * is sourced offers nothing and is not fillable. One derivation
 * (`buyerAuthoredFields`) feeds the row's `fields`, its `fillable`, the form
 * and the place-order gate.
 *
 * The specs here are lookalikes pinned from the real ones with one buyer field
 * added, served by key: no clause is named as a rule.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buyerAuthoredFields, deriveAgreementGroups, unfilledRequiredFills } from "@/lib/checkout/checkoutDerivations";
import {
    _resetClauseSpecCache_TESTING_ONLY,
    loadClauseSpec,
    setClauseSpecFetcher,
} from "@/lib/shared/clauseSpecSource";
import { hydrateAuthored, pinSpec } from "./primeClauseSpecs";

const LEAD = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x6Bb43E3C52dd24CEeD652B9069A97cc9E21c99EB" as const;

const raw = (name: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), `../clauses/${name}.json`), "utf8"));
const withField = (spec: Record<string, unknown>, field: Record<string, unknown>) =>
    ({ ...spec, title: `${spec.title} (lookalike)`, fields: [...(spec.fields as unknown[]), field] });

/** A catalog-sourced clause (every real field in `catalogueFills`) plus one
 *  buyer field the catalog never fills. */
const CATALOG_PLUS = pinSpec(withField(raw("figaro-hazmat"), { name: "handlingNote", type: "string", required: true, description: "The buyer's handling note." }));
/** The same clause as written: every field catalog-sourced. */
const CATALOG_ONLY = pinSpec(raw("figaro-hazmat"));
/** A clause with a PROFILE-sourced field (`divisor`) and a MECHANICAL one
 *  (`billedMassGrams`, the walk's), plus one buyer field. */
const PROFILE_MECHANICAL_PLUS = pinSpec(withField(raw("figaro-dimweight"), { name: "packagingNote", type: "string", required: false, description: "The buyer's packaging note." }));
/** An ASSEMBLY-SCOPED clause whose one real field the designer fills, plus one
 *  buyer field. */
const DESIGN_PLUS = pinSpec(withField(raw("figaro-utility-token"), { name: "memo", type: "string", required: true, description: "The buyer's memo." }));

async function load(...pins: { clauseKey: `0x${string}`; bytes: string }[]): Promise<void> {
    _resetClauseSpecCache_TESTING_ONLY();
    const byUri = new Map(pins.map((p) => [`mem://${p.clauseKey}`, p.bytes]));
    setClauseSpecFetcher(async (uri) => byUri.get(uri) ?? "");
    for (const p of pins) await loadClauseSpec(p.clauseKey, `mem://${p.clauseKey}`);
}

const groupsFor = (authored: Record<string, unknown>) =>
    deriveAgreementGroups({
        pickedAssembly: { hydratedAssembly: hydrateAuthored(authored, { pick: false }), coSellerBindings: [] },
        leadAddress: LEAD,
        sellerCatalogs: [] as never,
    });
const rowOf = (groups: ReturnType<typeof groupsFor>, key: string, clauseKey: string) =>
    groups.find((g) => g.key === key)?.clauses.find((c) => c.clauseKey === clauseKey);
const names = (fields: readonly { name: string }[]) => fields.map((f) => f.name);

describe("buyerAuthoredFields — the complement of every fills list", () => {
    beforeAll(async () => { await load(CATALOG_PLUS, CATALOG_ONLY, PROFILE_MECHANICAL_PLUS, DESIGN_PLUS); });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    it("subtracts the catalog's fields and offers the buyer's", () => {
        expect(names(buyerAuthoredFields(CATALOG_PLUS.clauseKey))).toEqual(["handlingNote"]);
    });

    it("a clause every field of which the catalog fills offers nothing", () => {
        expect(buyerAuthoredFields(CATALOG_ONLY.clauseKey)).toEqual([]);
    });

    it("subtracts the profile's field, and the walk's mechanical fields when given", () => {
        expect(names(buyerAuthoredFields(PROFILE_MECHANICAL_PLUS.clauseKey))).toEqual(["billedMassGrams", "packagingNote"]);
        expect(names(buyerAuthoredFields(PROFILE_MECHANICAL_PLUS.clauseKey, new Set(["billedMassGrams"])))).toEqual(["packagingNote"]);
    });

    it("subtracts the designer's tailoring", () => {
        expect(names(buyerAuthoredFields(DESIGN_PLUS.clauseKey))).toEqual(["memo"]);
    });
});

describe("deriveAgreementGroups — a row's fields, its fillable flag and the gate, from the one complement", () => {
    beforeAll(async () => { await load(CATALOG_PLUS, CATALOG_ONLY, PROFILE_MECHANICAL_PLUS, DESIGN_PLUS); });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    const authored = {
        assemblyClauses: { [DESIGN_PLUS.clauseKey]: { currency: TOKEN } },
        agreements: [{
            id: "agreement-0",
            clauses: {
                [CATALOG_PLUS.clauseKey]: {},
                [CATALOG_ONLY.clauseKey]: {},
                [PROFILE_MECHANICAL_PLUS.clauseKey]: {},
            },
        }],
    };

    it("a clause the catalog fills in part is fillable, with the buyer's field alone", () => {
        const row = rowOf(groupsFor(authored), "agreement-0", CATALOG_PLUS.clauseKey)!;
        expect(row.fillable).toBe(true);
        expect(names(row.fields)).toEqual(["handlingNote"]);
    });

    it("a clause the catalog fills whole is not fillable and offers nothing", () => {
        const row = rowOf(groupsFor(authored), "agreement-0", CATALOG_ONLY.clauseKey)!;
        expect(row.fillable).toBe(false);
        expect(row.fields).toEqual([]);
    });

    it("a per-order row subtracts the walk's mechanical fields with the profile's", () => {
        const row = rowOf(groupsFor(authored), "agreement-0", PROFILE_MECHANICAL_PLUS.clauseKey)!;
        expect(row.fillable).toBe(true);
        expect(names(row.fields)).toEqual(["packagingNote"]);
    });

    it("an assembly term the designer valued in part offers the buyer its own field", () => {
        const row = rowOf(groupsFor(authored), "assembly", DESIGN_PLUS.clauseKey)!;
        expect(row.fillable).toBe(true);
        expect(names(row.fields)).toEqual(["memo"]);
        expect(row.data).toEqual({ currency: TOKEN });
    });

    it("the gate demands the buyer's required fields and never a sourced one, however required", () => {
        const demanded = unfilledRequiredFills(groupsFor(authored), {}).map((m) => `${m.groupKey}:${m.fieldName}`).sort();
        // hazmat's unNumber, properShippingName and hazardClass are required
        // and catalog-sourced; dimweight's billedMassGrams and divisor are
        // required and the walk's and the profile's; the pin's currency is
        // the designer's. None is the buyer's to fill.
        expect(demanded).toEqual(["agreement-0:handlingNote", "assembly:memo"]);
        const filled = unfilledRequiredFills(groupsFor(authored), {
            "agreement-0": { [CATALOG_PLUS.clauseKey]: { handlingNote: "fragile" } },
            assembly: { [DESIGN_PLUS.clauseKey]: { memo: "studio booking" } },
        });
        expect(filled).toEqual([]);
    });
});
