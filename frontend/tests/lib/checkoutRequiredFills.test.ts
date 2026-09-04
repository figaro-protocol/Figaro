/**
 * checkoutRequiredFills — the checkout's required-term gate, against the REAL
 * clause specs and the REAL reference assemblies.
 *
 * Three buyers walked the built site into the same wall: the checkout offered
 * no control for a term the sign gate then refused, and the button said "Place
 * order" the whole way. The gate here is the validator's own required-ness,
 * applied to the SAME field list the form renders (`buyerAuthoredFields`), so
 * the two can never disagree:
 *
 *   - a required field with no spec `default` is demanded of the buyer;
 *   - a required field WITH a default is never demanded (the agreement build
 *     applies it) — but it is still offered when a sibling reads its value as
 *     an input format (figaro-geolocation's `geocodeStandard`);
 *   - a designer-filled field (`block.design.fills`) and an optional field are
 *     never demanded.
 *
 * No clause is named as a rule — the clause ids below are the fixtures the
 * reference assemblies compose, read from `clauses/` and `assemblies/`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { primeClauseSpecs } from "./primeClauseSpecs";
import {
    buyerAuthoredFields,
    deriveAgreementGroups,
    isFilledValue,
    unfilledRequiredFills,
} from "@/lib/checkout/checkoutDerivations";
import { isSiblingFormatSource } from "@/components/runtime/fieldFormatInputs";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import type { AssemblyTemplate } from "@/lib/shared/assemblyTemplate";

const ASSEMBLIES_DIR = path.resolve(process.cwd(), "../assemblies");
const LEAD = "0x1111111111111111111111111111111111111111" as const;

const template = (file: string) =>
    JSON.parse(readFileSync(path.join(ASSEMBLIES_DIR, file), "utf8")) as AssemblyTemplate;

const groupsFor = (file: string) =>
    deriveAgreementGroups({
        pickedAssembly: { assemblyTemplate: template(file), counterpartyBindings: [] } as never,
        leadAddress: LEAD,
        sellerCatalogues: [] as never,
    });

/** `clauseId.fieldName` for every demanded fill, deduplicated across orders. */
const demanded = (
    file: string,
    fills: Record<string, Record<string, Record<string, unknown>>> = {},
): string[] => [
    ...new Set(unfilledRequiredFills(groupsFor(file), fills).map((m) => `${m.clauseId}.${m.fieldName}`)),
].sort();

describe("buyerAuthoredFields — the ONE list the form renders and the gate checks", () => {
    beforeAll(async () => { await primeClauseSpecs(); });

    it("offers the transaction particulars and withholds the designer's tailoring", () => {
        const names = buyerAuthoredFields("figaro-geolocation").map((f) => f.name);
        // origin/destination and the standard they are written in are the
        // buyer's; the geocoder is a `block.design.fills` term.
        expect(names).toEqual(["geocodeStandard", "origin", "destination"]);
    });

    it("a clause with no cached spec offers nothing (resolved-empty = absence)", () => {
        expect(buyerAuthoredFields("figaro-never-registered")).toEqual([]);
    });

    it("the required field a sibling reads its format from is offered despite its default", () => {
        const fields = buyerAuthoredFields("figaro-geolocation");
        const standard = fields.find((f) => f.name === "geocodeStandard")!;
        // Required, defaulted — and the sibling origin/destination declare
        // `formatFromField`, so the form must let the buyer set it. Without it
        // the only affordance for origin is the geohash device picker, which
        // software and anyone without device location cannot use.
        expect(standard.required).toBe(true);
        expect(standard.default).toBe("geohash");
        expect(isSiblingFormatSource(standard, fields)).toBe(true);
        expect(isSiblingFormatSource(fields.find((f) => f.name === "origin")!, fields)).toBe(false);
    });
});

describe("unfilledRequiredFills — the six-party import chain, nothing filled", () => {
    beforeAll(async () => { await primeClauseSpecs(); });

    it("demands every required buyer term the validator will check", () => {
        expect(demanded("tradelens.json")).toEqual([
            "figaro-acceptance-criteria.acceptanceBasis",
            "figaro-chain-of-custody.custodyScheme",
            "figaro-emissions.standard",
            "figaro-geolocation.destination",
            "figaro-geolocation.origin",
            "figaro-handoff.handoff",
            "figaro-incoterms.incotermsNamedPlace",
            "figaro-incoterms.incotermsRule",
            "figaro-modalities.modality",
            "figaro-proximity-policy.bands",
        ]);
    });

    it("demands the term on EVERY order composing it, named per order", () => {
        const missing = unfilledRequiredFills(groupsFor("tradelens.json"), {});
        const acceptance = missing.filter((m) => m.fieldName === "acceptanceBasis");
        const origin = missing.filter((m) => m.fieldName === "origin");
        // acceptance-criteria rides two orders, geolocation four — the
        // sub-orders' fills are the ones the built site left control-less.
        expect(acceptance.map((m) => m.groupKey)).toEqual(["order-0", "order-1"]);
        expect(origin.map((m) => m.groupKey)).toEqual(["order-0", "order-2", "order-3", "order-5"]);
        // Named the way the buyer reads them, from the spec's own labels.
        expect(acceptance[0].clauseTitle).toBe(getClauseSpec("figaro-acceptance-criteria")!.title);
        expect(origin[0].fieldLabel).toBe("Origin");
    });

    it("never demands a defaulted, optional, designer-filled, or seller-sourced field", () => {
        const all = demanded("tradelens.json");
        // Defaulted: the agreement build applies the spec default.
        expect(all).not.toContain("figaro-geolocation.geocodeStandard");
        expect(all).not.toContain("figaro-cargo.massGrams");
        expect(all).not.toContain("figaro-cargo.volumeMl");
        // Optional: absence is a valid committed state.
        expect(all).not.toContain("figaro-acceptance-criteria.criteriaUri");
        expect(all).not.toContain("figaro-chain-of-custody.unitIdentifier");
        // Designer-filled (`block.design.fills`), valued on the template.
        expect(all).not.toContain("figaro-consent.documents");
        expect(all).not.toContain("figaro-applicable-law.applicableLaw");
        expect(all).not.toContain("figaro-geolocation.geocoder");
        // Seller-sourced: the carrier's catalogue fills the cold chain.
        expect(all).not.toContain("figaro-cold-chain.tempClass");
        expect(all).not.toContain("figaro-freight-class.nmfcClass");
    });

    it("a fill clears exactly its own order's demand", () => {
        const one = { "order-0": { "figaro-acceptance-criteria": { acceptanceBasis: "AQL 2.5 per ISO 2859-1" } } };
        const still = unfilledRequiredFills(groupsFor("tradelens.json"), one)
            .filter((m) => m.fieldName === "acceptanceBasis");
        expect(still.map((m) => m.groupKey)).toEqual(["order-1"]);
    });

    it("filling every demanded term empties the gate", () => {
        const fills: Record<string, Record<string, Record<string, unknown>>> = {};
        for (const m of unfilledRequiredFills(groupsFor("tradelens.json"), {})) {
            const field = buyerAuthoredFields(m.clauseId).find((f) => f.name === m.fieldName)!;
            const value = field.type === "array"
                ? ["face-to-face"]
                : field.type === "enum"
                    ? field.values[0]
                    : "stated";
            fills[m.groupKey] = {
                ...fills[m.groupKey],
                [m.clauseId]: { ...fills[m.groupKey]?.[m.clauseId], [m.fieldName]: value },
            };
        }
        expect(unfilledRequiredFills(groupsFor("tradelens.json"), fills)).toEqual([]);
    });

    it("a fill for an order or clause the assembly does not compose changes nothing", () => {
        const stray = {
            "order-99": { "figaro-acceptance-criteria": { acceptanceBasis: "x" } },
            "order-0": { "figaro-never-registered": { whatever: "x" } },
        };
        expect(demanded("tradelens.json", stray)).toEqual(demanded("tradelens.json"));
    });

    it("an empty string, empty array or empty object is not a fill", () => {
        const empties = {
            "order-0": {
                "figaro-acceptance-criteria": { acceptanceBasis: "" },
                "figaro-incoterms": { incotermsNamedPlace: {} },
            },
            "order-3": { "figaro-proximity-policy": { bands: [] } },
        };
        const missing = unfilledRequiredFills(groupsFor("tradelens.json"), empties)
            .map((m) => `${m.groupKey}.${m.fieldName}`);
        expect(missing).toContain("order-0.acceptanceBasis");
        expect(missing).toContain("order-0.incotermsNamedPlace");
        expect(missing).toContain("order-3.bands");
        expect(isFilledValue(0)).toBe(true);
        expect(isFilledValue(false)).toBe(true);
        expect(isFilledValue(undefined)).toBe(false);
    });
});

describe("unfilledRequiredFills — a value already composed on the template counts as filled", () => {
    beforeAll(async () => { await primeClauseSpecs(); });

    it("every reference assembly demands only terms the checkout offers a control for", () => {
        for (const file of ["tradelens.json", "local-commerce.json", "freelancer-value-chain.json"]) {
            for (const m of unfilledRequiredFills(groupsFor(file), {})) {
                const field = buyerAuthoredFields(m.clauseId).find((f) => f.name === m.fieldName)!;
                expect(field, `${file}: ${m.clauseId}.${m.fieldName} is on the offered list`).toBeDefined();
                expect(field.required).toBe(true);
                expect(field.default).toBeUndefined();
                // `bigint` defers to its producing surface at design time — the
                // gate must never demand a term with no control.
                expect(field.type).not.toBe("bigint");
            }
        }
    });

    it("a term the designer valued on the template is not asked of the buyer again", () => {
        const composed = template("tradelens.json");
        const order0 = composed.agreements[0] as { clauses: Record<string, Record<string, unknown>> };
        order0.clauses["figaro-acceptance-criteria"] = { acceptanceBasis: "AQL 2.5 per ISO 2859-1" };
        const groups = deriveAgreementGroups({
            pickedAssembly: { assemblyTemplate: composed, counterpartyBindings: [] } as never,
            leadAddress: LEAD,
            sellerCatalogues: [] as never,
        });
        const acceptance = unfilledRequiredFills(groups, {}).filter((m) => m.fieldName === "acceptanceBasis");
        expect(acceptance.map((m) => m.groupKey)).toEqual(["order-1"]);
    });
});
