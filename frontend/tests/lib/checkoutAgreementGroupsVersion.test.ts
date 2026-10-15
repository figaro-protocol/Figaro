/**
 * deriveAgreementGroups reads each section's spec by the KEY the template
 * composed — never another spec of the same name. A stranger may register a
 * `figaro-consent` lookalike (version 99) marked mandatory; it is another key,
 * and the template's own consent section is still an ordinary, buyer-filled
 * section. Every section the agreement carries is listed: a section composed
 * under a mandatory key is listed too, marked `mandatory` and never fillable,
 * since the buyer signs it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buyerAuthoredFields, deriveAgreementGroups, unfilledRequiredFills } from "@/lib/checkout/checkoutDerivations";
import {
    _resetClauseSpecCache_TESTING_ONLY,
    clauseIsMandatory,
    getClauseSpec,
    loadClauseSpec,
    setClauseSpecFetcher,
} from "@/lib/shared/clauseSpecSource";
import { hydrateAuthored, pinSpec } from "./primeClauseSpecs";

const LEAD = "0x1111111111111111111111111111111111111111" as const;
const v1 = JSON.parse(readFileSync(path.resolve(process.cwd(), "../clauses/figaro-consent.json"), "utf8"));
const v99 = { ...v1, version: 99, block: { ...v1.block, design: { ...v1.block.design, article: "mandatory" } } };
const SPEC_V1 = pinSpec(v1);
const V99 = pinSpec(v99);
const DOCUMENTS = { documents: [] };
const UNLOADED = `0x${"ee".repeat(32)}`;

const groupsFor = (authored: Record<string, unknown>) =>
    deriveAgreementGroups({
        pickedAssembly: { hydratedAssembly: hydrateAuthored(authored, { fold: false }), counterpartyBindings: [] },
        leadAddress: LEAD,
        sellerCatalogs: [] as never,
    });
const reviewed = (groups: ReturnType<typeof groupsFor>, key: string) =>
    groups.find((g) => g.key === key)?.clauses.map((c) => c.clauseKey) ?? [];
const rowOf = (groups: ReturnType<typeof groupsFor>, key: string, clauseKey: string) =>
    groups.find((g) => g.key === key)?.clauses.find((c) => c.clauseKey === clauseKey);

/** Serve the pinned bytes of each spec at its own URI. */
async function load(...pins: { clauseKey: `0x${string}`; bytes: string }[]): Promise<void> {
    _resetClauseSpecCache_TESTING_ONLY();
    const byUri = new Map(pins.map((p) => [`mem://${p.clauseKey}`, p.bytes]));
    setClauseSpecFetcher(async (uri) => byUri.get(uri) ?? "");
    for (const p of pins) await loadClauseSpec(p.clauseKey, `mem://${p.clauseKey}`);
}

describe("deriveAgreementGroups — spec reads by key", () => {
    beforeAll(async () => { await load(SPEC_V1, V99); });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    it("two specs of one name are loaded as two keys: the lookalike declares mandatory, the original does not", () => {
        expect(SPEC_V1.clauseKey).not.toBe(V99.clauseKey);
        expect(clauseIsMandatory(SPEC_V1.clauseKey)).toBe(false);
        expect(clauseIsMandatory(V99.clauseKey)).toBe(true);
    });

    it("keeps an agreement's consent section in the review, ordinary", () => {
        const groups = groupsFor({ agreements: [{ id: "order-0", clauses: { [SPEC_V1.clauseKey]: DOCUMENTS } }] });
        expect(reviewed(groups, "order-0")).toEqual([SPEC_V1.clauseKey]);
        expect(rowOf(groups, "order-0", SPEC_V1.clauseKey)?.mandatory).toBe(false);
    });

    it("lists the section composed under the mandatory lookalike's key, marked mandatory and not fillable", () => {
        const groups = groupsFor({ agreements: [{ id: "order-0", clauses: { [V99.clauseKey]: DOCUMENTS } }] });
        expect(reviewed(groups, "order-0")).toEqual([V99.clauseKey]);
        expect(rowOf(groups, "order-0", V99.clauseKey)).toMatchObject({ mandatory: true, fillable: false, data: DOCUMENTS });
        expect(unfilledRequiredFills(groups, {})).toEqual([]);
    });

    it("keeps an assembly-scoped consent section in the assembly terms", () => {
        const groups = groupsFor({ assemblyClauses: { [SPEC_V1.clauseKey]: DOCUMENTS }, agreements: [{ id: "order-0", clauses: {} }] });
        expect(reviewed(groups, "assembly")).toEqual([SPEC_V1.clauseKey]);
        expect(rowOf(groups, "assembly", SPEC_V1.clauseKey)?.mandatory).toBe(false);
    });

    it("lists an assembly-scoped section under the mandatory key, marked mandatory and not fillable", () => {
        const groups = groupsFor({
            assemblyClauses: { [V99.clauseKey]: DOCUMENTS },
            agreements: [{ id: "order-0", clauses: {} }],
        });
        expect(reviewed(groups, "assembly")).toEqual([V99.clauseKey]);
        expect(rowOf(groups, "assembly", V99.clauseKey)).toMatchObject({ mandatory: true, fillable: false });
    });

    it("lists every section the agreement carries, in the template's order", () => {
        const groups = groupsFor({
            agreements: [{ id: "order-0", clauses: { [V99.clauseKey]: DOCUMENTS, [UNLOADED]: {} } }],
        });
        // An unloaded spec is not mandatory: listed, read as an ordinary section.
        expect(reviewed(groups, "order-0")).toEqual([V99.clauseKey, UNLOADED]);
        expect(groups[0].clauses.map((c) => c.mandatory)).toEqual([true, false]);
    });
});

/**
 * The buyer's form reads the same key. A lookalike of the same name that drops
 * the designer's fill and adds a required term (v50 here) changes neither the
 * fields the checkout offers for the template's section nor the terms the
 * place-order gate demands of it.
 */
describe("buyerAuthoredFields — the offered fields are the composed key's", () => {
    const v50 = {
        ...v1,
        version: 50,
        fields: [...v1.fields, { name: "witnessName", type: "string", required: true }],
        block: { ...v1.block, design: { ...v1.block.design, fills: [] } },
    };
    const SPEC_V50 = pinSpec(v50);
    beforeAll(async () => { await load(SPEC_V1, SPEC_V50); });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    it("both specs are loaded; the reads by key stay apart", () => {
        expect(getClauseSpec(SPEC_V50.clauseKey)?.version).toBe(50);
        expect(getClauseSpec(SPEC_V1.clauseKey)?.version).toBe(1);
        expect(buyerAuthoredFields(SPEC_V1.clauseKey)).toEqual([]);
        expect(buyerAuthoredFields(SPEC_V50.clauseKey).map((f) => f.name)).toEqual(["documents", "witnessName"]);
    });

    it("the original's section offers no field and demands no term", () => {
        const groups = groupsFor({ agreements: [{ id: "order-0", clauses: { [SPEC_V1.clauseKey]: DOCUMENTS } }] });
        const row = groups.find((g) => g.key === "order-0")?.clauses[0];
        expect(row?.clauseKey).toBe(SPEC_V1.clauseKey);
        expect(row?.fillable).toBe(false);
        expect(unfilledRequiredFills(groups, {})).toEqual([]);
    });

    it("a section composed under the lookalike's key offers and demands its own terms (its empty documents included)", () => {
        const groups = groupsFor({ agreements: [{ id: "order-0", clauses: { [SPEC_V50.clauseKey]: DOCUMENTS } }] });
        const row = groups.find((g) => g.key === "order-0")?.clauses[0];
        expect(row?.clauseKey).toBe(SPEC_V50.clauseKey);
        expect(row?.fillable).toBe(true);
        expect(unfilledRequiredFills(groups, {}).map((m) => `${m.clauseKey === SPEC_V50.clauseKey}:${m.fieldName}`))
            .toEqual(["true:documents", "true:witnessName"]);
    });
});
