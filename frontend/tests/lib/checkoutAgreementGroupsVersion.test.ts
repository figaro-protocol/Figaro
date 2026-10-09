/**
 * deriveAgreementGroups reads each section's spec at the version the template
 * composed — never the highest version of the clause id the registry read
 * loaded. A stranger may register `figaro-consent` v99 marked mandatory; the
 * template's consent v1 section is still an ordinary, buyer-filled section.
 * Every section the agreement carries is listed: a section composed at a
 * mandatory version is listed too, marked `mandatory` and never fillable,
 * since the buyer signs it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalContentHash } from "@figaro-protocol/sdk";
import { buyerAuthoredFields, deriveAgreementGroups, unfilledRequiredFills } from "@/lib/checkout/checkoutDerivations";
import {
    _resetClauseSpecCache_TESTING_ONLY,
    clauseIsMandatory,
    getClauseSpec,
    loadClauseSpec,
    setClauseSpecFetcher,
} from "@/lib/shared/clauseSpecSource";

const LEAD = "0x1111111111111111111111111111111111111111" as const;
const CONSENT = "figaro-consent";
const v1 = JSON.parse(readFileSync(path.resolve(process.cwd(), `../clauses/${CONSENT}.json`), "utf8"));
const v99 = { ...v1, version: 99, block: { ...v1.block, design: { ...v1.block.design, article: "mandatory" } } };
const DOCUMENTS = { documents: [] };

const groupsFor = (assemblyTemplate: Record<string, unknown>) =>
    deriveAgreementGroups({
        pickedAssembly: { assemblyTemplate, counterpartyBindings: [] } as never,
        leadAddress: LEAD,
        sellerCatalogs: [] as never,
    });
const reviewed = (groups: ReturnType<typeof groupsFor>, key: string) =>
    groups.find((g) => g.key === key)?.clauses.map((c) => c.clauseId) ?? [];
const rowOf = (groups: ReturnType<typeof groupsFor>, key: string, clauseId: string) =>
    groups.find((g) => g.key === key)?.clauses.find((c) => c.clauseId === clauseId);

describe("deriveAgreementGroups — exact-version spec reads", () => {
    beforeAll(async () => {
        _resetClauseSpecCache_TESTING_ONLY();
        const docs: Record<string, unknown> = { "v1.json": v1, "v99.json": v99 };
        setClauseSpecFetcher(async (uri) => docs[uri]);
        await loadClauseSpec(CONSENT, 1, "v1.json", canonicalContentHash(v1));
        await loadClauseSpec(CONSENT, 99, "v99.json", canonicalContentHash(v99));
    });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    it("two versions are loaded: v99 declares mandatory, v1 does not", () => {
        expect(clauseIsMandatory(CONSENT, 1)).toBe(false);
        expect(clauseIsMandatory(CONSENT, 99)).toBe(true);
    });

    it("keeps an agreement's consent v1 section in the review (absent clauseVersions = v1)", () => {
        const groups = groupsFor({ agreements: [{ id: "order-0", clauses: { [CONSENT]: DOCUMENTS } }] });
        expect(reviewed(groups, "order-0")).toEqual([CONSENT]);
        expect(rowOf(groups, "order-0", CONSENT)?.mandatory).toBe(false);
    });

    it("lists the section composed at the mandatory v99, marked mandatory and not fillable", () => {
        const groups = groupsFor({
            agreements: [{ id: "order-0", clauses: { [CONSENT]: DOCUMENTS }, clauseVersions: { [CONSENT]: 99 } }],
        });
        expect(reviewed(groups, "order-0")).toEqual([CONSENT]);
        expect(rowOf(groups, "order-0", CONSENT)).toMatchObject({ version: 99, mandatory: true, fillable: false, data: DOCUMENTS });
        expect(unfilledRequiredFills(groups, {})).toEqual([]);
    });

    it("keeps an assembly-scoped consent v1 section in the assembly terms", () => {
        const groups = groupsFor({ assemblyClauses: { [CONSENT]: DOCUMENTS }, agreements: [{ id: "order-0", clauses: {} }] });
        expect(reviewed(groups, "assembly")).toEqual([CONSENT]);
        expect(rowOf(groups, "assembly", CONSENT)?.mandatory).toBe(false);
    });

    it("lists an assembly-scoped section composed at the mandatory v99, marked mandatory and not fillable", () => {
        const groups = groupsFor({
            assemblyClauses: { [CONSENT]: DOCUMENTS },
            assemblyClauseVersions: { [CONSENT]: 99 },
            agreements: [{ id: "order-0", clauses: {} }],
        });
        expect(reviewed(groups, "assembly")).toEqual([CONSENT]);
        expect(rowOf(groups, "assembly", CONSENT)).toMatchObject({ version: 99, mandatory: true, fillable: false });
    });

    it("lists every section the agreement carries, in the template's order", () => {
        const groups = groupsFor({
            agreements: [{
                id: "order-0",
                clauses: { [CONSENT]: DOCUMENTS, "unloaded-term": {} },
                clauseVersions: { [CONSENT]: 99 },
            }],
        });
        // An unloaded spec is not mandatory: listed, read as an ordinary section.
        expect(reviewed(groups, "order-0")).toEqual([CONSENT, "unloaded-term"]);
        expect(groups[0].clauses.map((c) => c.mandatory)).toEqual([true, false]);
    });
});

/**
 * The buyer's form reads the same exact version. A later registration of the
 * same id that drops the designer's fill and adds a required term (v50 here)
 * changes neither the fields the checkout offers for the template's v1 section
 * nor the terms the place-order gate demands of it.
 */
describe("buyerAuthoredFields — the offered fields are the composed version's", () => {
    const v50 = {
        ...v1,
        version: 50,
        fields: [...v1.fields, { name: "witnessName", type: "string", required: true }],
        block: { ...v1.block, design: { ...v1.block.design, fills: [] } },
    };
    beforeAll(async () => {
        _resetClauseSpecCache_TESTING_ONLY();
        const docs: Record<string, unknown> = { "v1.json": v1, "v50.json": v50 };
        setClauseSpecFetcher(async (uri) => docs[uri]);
        await loadClauseSpec(CONSENT, 1, "v1.json", canonicalContentHash(v1));
        await loadClauseSpec(CONSENT, 50, "v50.json", canonicalContentHash(v50));
    });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    it("both versions are loaded; the exact reads stay apart", () => {
        expect(getClauseSpec(CONSENT, 50)?.version).toBe(50);
        expect(getClauseSpec(CONSENT, 1)?.version).toBe(1);
        expect(buyerAuthoredFields(CONSENT, 1)).toEqual([]);
        expect(buyerAuthoredFields(CONSENT, 50).map((f) => f.name)).toEqual(["documents", "witnessName"]);
    });

    it("a v1 section offers no field and demands no term (absent clauseVersions = v1)", () => {
        const groups = groupsFor({ agreements: [{ id: "order-0", clauses: { [CONSENT]: DOCUMENTS } }] });
        const row = groups.find((g) => g.key === "order-0")?.clauses[0];
        expect(row?.version).toBe(1);
        expect(row?.fillable).toBe(false);
        expect(unfilledRequiredFills(groups, {})).toEqual([]);
    });

    it("a section composed at v50 offers and demands v50's own terms (its empty documents included)", () => {
        const groups = groupsFor({
            agreements: [{ id: "order-0", clauses: { [CONSENT]: DOCUMENTS }, clauseVersions: { [CONSENT]: 50 } }],
        });
        const row = groups.find((g) => g.key === "order-0")?.clauses[0];
        expect(row?.version).toBe(50);
        expect(row?.fillable).toBe(true);
        expect(unfilledRequiredFills(groups, {}).map((m) => `${m.version}:${m.fieldName}`)).toEqual(["50:documents", "50:witnessName"]);
    });
});
