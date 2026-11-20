/**
 * The fill-where-composed clause writers (checkoutPlan) — the catalog
 * measures a spec declares, catalog-sourced class leaves, the priced lines
 * and the derived fields a spec marks. Clauses are found by what their specs
 * declare, through the SpecSource, never by clause id or field name. Migrated
 * from the frontend's assemblyCheckoutFold suite when the fills promoted to
 * the SDK.
 */
import { describe, expect, it } from "vitest";
import {
    derivePricedFields,
    fillCatalogueMeasures,
    fillCheckoutDerivations,
    fillClassClauses,
    fillDerivedClauses,
    fillPricedLines,
    fillProfileClauses,
    getRateQuantityResolver,
    mechanicallyFilledFieldNames,
    missingCatalogueMeasures,
    pricedLinesSum,
    readPricedLines,
    readUtilityTokenPin,
    registerCheckoutDerivation,
    resolveSubOrderPricing,
    type ProcessCheckoutLineItem,
} from "../src/checkoutPlan.js";
import { fillWalkProvenance } from "../src/reconstructOrders.js";
import type { Agreement } from "../src/agreement.js";
import { specDesignFills, specPricedLines, specProfileFills, withSpecDefaults } from "../src/projection.js";
import { keyOf, rawSpecOf, specSourceFromFixtures, specSourceOf, specSourceWithRegistrations, viewOf } from "./specFixtures.js";

type ClauseFields = Record<string, Record<string, unknown>>;

const line = (over: Partial<ProcessCheckoutLineItem>): ProcessCheckoutLineItem => ({
    itemId: "i", name: "Item", quantity: 1, unitPrice: "1", ...over,
});

/** A reference spec with `checkout` attributes added to its `block`. The
 *  clause key leaves `block` out, so the view keeps the reference key. */
function withCheckout(name: string, checkout: Record<string, unknown>) {
    const raw = rawSpecOf(name);
    const block = raw.block as Record<string, Record<string, unknown>>;
    return viewOf({ ...raw, block: { ...block, checkout: { ...block.checkout, ...checkout } } });
}

/** A reference spec with the named `checkout` attributes taken out of its
 *  `block`, whatever `clauses/` declares: the same key, no such mark. */
function withoutCheckout(name: string, attributes: readonly string[]) {
    const raw = rawSpecOf(name);
    const block = raw.block as Record<string, Record<string, unknown>>;
    const checkout = Object.fromEntries(Object.entries(block.checkout ?? {}).filter(([k]) => !attributes.includes(k)));
    return viewOf({ ...raw, block: { ...block, checkout } });
}

/** The marks `clauses/figaro-commerce.json` and `clauses/figaro-dimweight.json`
 *  declare in `block.checkout`. */
const COMMERCE_PRICED_LINES = { field: "lineItems", item: "itemId", name: "name", quantity: "quantity", unitPrice: "unitPrice" };
const DIMWEIGHT_DERIVES = {
    billedMassGrams: {
        rule: "dimensional-weight",
        inputs: {
            mass: { from: "massGrams", combine: "sum" },
            length: { from: "lengthMm", combine: "single-unit" },
            width: { from: "widthMm", combine: "single-unit" },
            height: { from: "heightMm", combine: "single-unit" },
            divisor: { field: "divisor" },
        },
    },
};

const CARGO = specSourceFromFixtures(["figaro-cargo"]);
const COMMERCE = specSourceOf([withCheckout("figaro-commerce", { pricedLines: COMMERCE_PRICED_LINES })]);
const FREIGHT = specSourceFromFixtures(["figaro-freight-class"]);
const CARGO_DIM = specSourceOf([viewOf(rawSpecOf("figaro-cargo")), withCheckout("figaro-dimweight", { derives: DIMWEIGHT_DERIVES })]);

/** A stranger's clause: its own field names for the lines and their roles,
 *  no item id and no name. */
const STRANGER_LINES = viewOf({
    clauseId: "a-strangers-bill",
    version: 1,
    title: "A stranger's bill",
    description: "Lines of a bill, under the stranger's own names.",
    fields: [{
        name: "rows",
        type: "array",
        required: true,
        minItems: 0,
        items: {
            name: "row",
            type: "object",
            required: true,
            fields: [
                { name: "count", type: "integer", required: true, min: 1 },
                { name: "each", type: "bigint", required: true, min: "0" },
            ],
        },
    }],
    stages: {},
    block: { design: { article: "billing" }, checkout: { pricedLines: { field: "rows", quantity: "count", unitPrice: "each" } } },
});

describe("fillCatalogueMeasures — the measures a spec declares, read from each line's catalog item", () => {
    const CARGO_KEY = keyOf("figaro-cargo");

    it("sums each declared item field × quantity onto its declared clause field", () => {
        const out = fillCatalogueMeasures({ [CARGO_KEY]: {} }, [
            line({ quantity: 2, catalogItem: { massGrams: 500, volumeMl: 1000 } }),
            line({ quantity: 1, catalogItem: { massGrams: 100, volumeMl: 200 } }),
        ], CARGO);
        expect(out[CARGO_KEY]).toMatchObject({ massGrams: 1100, volumeMl: 2200 });
    });

    it("a missing measure stays missing: one line without it leaves the sum unwritten, and no default fills it", () => {
        const out = fillCatalogueMeasures({ [CARGO_KEY]: {} }, [
            line({ catalogItem: { massGrams: 500, volumeMl: 1000 } }),
            line({ catalogItem: { volumeMl: 200 } }),
        ], CARGO);
        expect(out[CARGO_KEY]).not.toHaveProperty("massGrams");
        expect(out[CARGO_KEY].volumeMl).toBe(1200);
        // The spec carries no default for the measure: the agreement build
        // invents no number for it.
        expect(withSpecDefaults(CARGO, CARGO_KEY, out[CARGO_KEY])).not.toHaveProperty("massGrams");
        expect(missingCatalogueMeasures(out, CARGO)).toEqual([
            { clauseKey: CARGO_KEY, field: "massGrams", from: "massGrams" },
        ]);
    });

    it("an order with no line writes nothing", () => {
        expect(fillCatalogueMeasures({ [CARGO_KEY]: {} }, [], CARGO)).toEqual({ [CARGO_KEY]: {} });
    });

    it("copies a single-unit measure only when the order is one unit (one line, quantity 1)", () => {
        const dims = { massGrams: 500, volumeMl: 1, lengthMm: 300, widthMm: 200, heightMm: 150 };
        const single = fillCatalogueMeasures({ [CARGO_KEY]: {} }, [line({ catalogItem: dims })], CARGO);
        expect(single[CARGO_KEY]).toMatchObject({ lengthMm: 300, widthMm: 200, heightMm: 150 });
        const two = fillCatalogueMeasures({ [CARGO_KEY]: {} }, [line({ quantity: 2, catalogItem: dims })], CARGO);
        expect(two[CARGO_KEY]).not.toHaveProperty("lengthMm");
        expect(two[CARGO_KEY].massGrams).toBe(1000);
        const multi = fillCatalogueMeasures({ [CARGO_KEY]: {} }, [line({ catalogItem: dims }), line({ catalogItem: dims })], CARGO);
        expect(multi[CARGO_KEY]).not.toHaveProperty("lengthMm");
    });

    it("no-ops for a composed clause that declares no catalog measure", () => {
        const clauses: ClauseFields = { [keyOf("figaro-commerce")]: {} };
        expect(fillCatalogueMeasures(clauses, [line({ catalogItem: { massGrams: 500 } })], COMMERCE)).toEqual(clauses);
        expect(missingCatalogueMeasures(clauses, COMMERCE)).toEqual([]);
    });

    it("routes on the declaration, never on a field name: any clause declaring a sum takes it", () => {
        const raw = rawSpecOf("figaro-geolocation");
        const fields = raw.fields as Record<string, unknown>[];
        const rawBlock = raw.block as Record<string, Record<string, unknown>>;
        // A stranger's clause naming its field otherwise, summed from the
        // item's mass — and a clause that only declares a field named
        // `massGrams`, with no declaration, which nothing fills.
        const summing = viewOf({
            ...raw,
            title: "a stranger's shipment weight",
            fields: [...fields, { name: "shipmentWeight", type: "integer", required: true, min: 1 }],
            block: { ...rawBlock, checkout: { ...rawBlock.checkout, catalogueMeasures: { shipmentWeight: { from: "massGrams", combine: "sum" } } } },
        });
        const undeclared = viewOf({
            ...raw,
            title: "a stranger's mass, undeclared",
            fields: [...fields, { name: "massGrams", type: "integer", required: true, min: 1 }],
        });
        const specs = specSourceWithRegistrations(specSourceFromFixtures([]), [summing, undeclared]);
        const lines = [line({ quantity: 3, catalogItem: { massGrams: 250 } })];
        expect(fillCatalogueMeasures({ [summing.clauseKey]: {} }, lines, specs)[summing.clauseKey]).toEqual({ shipmentWeight: 750 });
        expect(fillCatalogueMeasures({ [undeclared.clauseKey]: {} }, lines, specs)[undeclared.clauseKey]).toEqual({});
    });
});

const TOKEN = "0x000000000000000000000000000000000000000a" as const;
const COMMERCE_AND_PIN = specSourceFromFixtures(["figaro-commerce", "figaro-utility-token"]);
const PIN_ONLY = specSourceFromFixtures(["figaro-utility-token"]);

describe("fillPricedLines — the order's lines, written where the spec marks them", () => {
    it("writes no payment and no token: both are the commitment's", () => {
        const out = fillPricedLines({ [keyOf("figaro-commerce")]: {} }, COMMERCE);
        expect(out[keyOf("figaro-commerce")]).toEqual({});
    });

    it("writes the lines in the item shape the mark names, and no other key", () => {
        const out = fillPricedLines({ [keyOf("figaro-commerce")]: {} }, COMMERCE, [
            line({ itemId: "burger-001", name: "Cheeseburger", quantity: 2, unitPrice: "500", catalogItem: { massGrams: 400 } }),
        ]);
        expect(out[keyOf("figaro-commerce")].lineItems).toEqual([
            { itemId: "burger-001", name: "Cheeseburger", quantity: 2, unitPrice: "500" },
        ]);
    });

    it("a stranger's clause under other field names takes the lines in its own shape", () => {
        const specs = specSourceOf([STRANGER_LINES]);
        const out = fillPricedLines({ [STRANGER_LINES.clauseKey]: {} }, specs, [
            line({ itemId: "x", name: "X", quantity: 3, unitPrice: "70" }),
        ]);
        expect(out[STRANGER_LINES.clauseKey]).toEqual({ rows: [{ count: 3, each: "70" }] });
        expect(derivePricedFields([{ clause: STRANGER_LINES.clauseKey, data: out[STRANGER_LINES.clauseKey] }], specs))
            .toEqual([{ clause: STRANGER_LINES.clauseKey, path: "rows.0.each" }]);
        const [read] = readPricedLines([{ clause: STRANGER_LINES.clauseKey, data: out[STRANGER_LINES.clauseKey] }], specs);
        expect(read.lines).toEqual([{ itemId: undefined, name: undefined, quantity: 3n, unitPrice: 70n }]);
        expect(pricedLinesSum(read.lines)).toBe(210n);
    });

    it("a clause declaring a field named lineItems with no mark takes nothing: the name carries no meaning", () => {
        const unmarked = specSourceOf([withoutCheckout("figaro-commerce", ["pricedLines"])]);
        const clauses: ClauseFields = { [keyOf("figaro-commerce")]: {} };
        expect(fillPricedLines(clauses, unmarked, [line({})])).toEqual(clauses);
        expect(derivePricedFields([{ clause: keyOf("figaro-commerce"), data: { lineItems: [{ unitPrice: "1" }] } }], unmarked)).toEqual([]);
        expect(readPricedLines([{ clause: keyOf("figaro-commerce"), data: { lineItems: [] } }], unmarked)).toEqual([]);
        expect(mechanicallyFilledFieldNames(unmarked.get(keyOf("figaro-commerce")))).toEqual(new Set());
    });

    it("a mark the spec's fields contradict marks nothing", () => {
        const wrongType = withCheckout("figaro-commerce", { pricedLines: { ...COMMERCE_PRICED_LINES, quantity: "name" } });
        const noSuchField = withCheckout("figaro-commerce", { pricedLines: { ...COMMERCE_PRICED_LINES, field: "rows" } });
        expect(specPricedLines(wrongType)).toBeUndefined();
        expect(specPricedLines(noSuchField)).toBeUndefined();
        expect(fillPricedLines({ [wrongType.clauseKey]: {} }, specSourceOf([wrongType]), [line({})])).toEqual({ [wrongType.clauseKey]: {} });
    });

    it("the lines' sum is read, never held equal to anything; an unreadable line gives no sum", () => {
        const [read] = readPricedLines([{ clause: keyOf("figaro-commerce"), data: { lineItems: [
            { itemId: "a", name: "A", quantity: 2, unitPrice: "500" },
            { itemId: "b", name: "B", quantity: 1, unitPrice: "250" },
        ] } }], COMMERCE);
        expect(pricedLinesSum(read.lines)).toBe(1250n);
        expect(pricedLinesSum([...read.lines, { quantity: 1n }])).toBeUndefined();
    });

    it("the mechanical fields of a clause are its mark's field and its derived fields", () => {
        expect(mechanicallyFilledFieldNames(COMMERCE.get(keyOf("figaro-commerce")))).toEqual(new Set(["lineItems"]));
        expect(mechanicallyFilledFieldNames(STRANGER_LINES)).toEqual(new Set(["rows"]));
        expect(mechanicallyFilledFieldNames(CARGO_DIM.get(keyOf("figaro-dimweight")))).toEqual(new Set(["billedMassGrams"]));
        expect(mechanicallyFilledFieldNames(undefined)).toEqual(new Set());
    });

    it("no-ops when no composed clause marks priced lines", () => {
        const clauses: ClauseFields = { [keyOf("figaro-cargo")]: {} };
        expect(fillPricedLines(clauses, CARGO, [line({})])).toEqual(clauses);
    });
});

describe("readUtilityTokenPin — routed on the spec's denomination shape, never on first match", () => {
    it("a stranger's denomination clause pins under its own field name", () => {
        const raw = rawSpecOf("figaro-utility-token");
        const block = raw.block as Record<string, Record<string, unknown>>;
        const stranger = viewOf({
            ...raw,
            title: "a stranger's denomination",
            fields: [{ name: "settlementAsset", type: "string", format: "address-hex", required: true }],
            block: { ...block, design: { ...block.design, fills: ["settlementAsset"] } },
        });
        const specs = specSourceOf([stranger]);
        expect(readUtilityTokenPin({ [stranger.clauseKey]: { settlementAsset: TOKEN } }, specs)).toBe(TOKEN);
        // A designer-filled `currency` of another article, or at agreement scope, is no pin.
        const otherArticle = viewOf({ ...raw, title: "other article", block: { ...block, design: { ...block.design, article: "coordination" } } });
        const agreementScope = viewOf({ ...raw, title: "agreement scope", block: { ...block, design: { ...block.design, scope: "agreement" } } });
        const both = specSourceOf([otherArticle, agreementScope]);
        expect(readUtilityTokenPin({ [otherArticle.clauseKey]: { currency: TOKEN } }, both)).toBeUndefined();
        expect(readUtilityTokenPin({ [agreementScope.clauseKey]: { currency: TOKEN } }, both)).toBeUndefined();
    });

    it("finds the pin by its design.fills declaration", () => {
        expect(readUtilityTokenPin({ [keyOf("figaro-utility-token")]: { currency: TOKEN } }, PIN_ONLY)).toBe(TOKEN);
    });

    it("finds the pin whichever clause is composed first", () => {
        // Asserted in both key orders — a first-match bug passes one and
        // fails the other.
        expect(readUtilityTokenPin({
            [keyOf("figaro-commerce")]: { lineItems: [] },
            [keyOf("figaro-utility-token")]: { currency: TOKEN },
        }, COMMERCE_AND_PIN)).toBe(TOKEN);
        expect(readUtilityTokenPin({
            [keyOf("figaro-utility-token")]: { currency: TOKEN },
            [keyOf("figaro-commerce")]: { lineItems: [] },
        }, COMMERCE_AND_PIN)).toBe(TOKEN);
    });

    it("is undefined for an unpinned assembly composing only commerce", () => {
        expect(readUtilityTokenPin({
            [keyOf("figaro-commerce")]: { lineItems: [] },
        }, COMMERCE_AND_PIN)).toBeUndefined();
    });

    it("is undefined while the spec cache is cold, and for a malformed pin value", () => {
        const cold = { get: () => undefined, list: () => [] };
        expect(readUtilityTokenPin({ [keyOf("figaro-utility-token")]: { currency: TOKEN } }, cold)).toBeUndefined();
        expect(readUtilityTokenPin({ [keyOf("figaro-utility-token")]: { currency: "the MARIA token" } }, PIN_ONLY))
            .toBeUndefined();
    });
});

describe("fillClassClauses — catalog-sourced values folded onto their leaves", () => {
    it("folds a line's authored freight-class value", () => {
        const out = fillClassClauses({ [keyOf("figaro-freight-class")]: {} }, [
            line({ clauseValues: { [keyOf("figaro-freight-class")]: { nmfcClass: "100" } } }),
        ], FREIGHT);
        expect(out[keyOf("figaro-freight-class")]).toMatchObject({ nmfcClass: "100" });
    });

    it("no-ops when the composed clause isn't catalog-sourced", () => {
        const clauses: ClauseFields = { [keyOf("figaro-commerce")]: {} };
        expect(fillClassClauses(clauses, [line({ clauseValues: { [keyOf("figaro-commerce")]: { x: 1 } } })], COMMERCE)).toEqual(clauses);
    });

    it("assembly's committed value WINS over the catalog's (terms outrank master data)", () => {
        const out = fillClassClauses({ [keyOf("figaro-freight-class")]: { nmfcClass: "70" } }, [
            line({ clauseValues: { [keyOf("figaro-freight-class")]: { nmfcClass: "100", nmfcItem: "156600" } } }),
        ], FREIGHT);
        // The pinned class survives; the un-pinned item number fills from the catalog.
        expect(out[keyOf("figaro-freight-class")]).toMatchObject({ nmfcClass: "70", nmfcItem: "156600" });
    });

    it("folds ONLY the spec's declared catalogueFills — an undeclared key never reaches the leaf", () => {
        const out = fillClassClauses({ [keyOf("figaro-freight-class")]: {} }, [
            line({ clauseValues: { [keyOf("figaro-freight-class")]: { nmfcClass: "100", rate: "0.01" } } }),
        ], FREIGHT);
        expect(out[keyOf("figaro-freight-class")]).toMatchObject({ nmfcClass: "100" });
        expect(out[keyOf("figaro-freight-class")]).not.toHaveProperty("rate");
    });

    it("an empty-string assembly entry is not a pin — the catalog value fills it", () => {
        const out = fillClassClauses({ [keyOf("figaro-freight-class")]: { nmfcClass: "" } }, [
            line({ clauseValues: { [keyOf("figaro-freight-class")]: { nmfcClass: "100" } } }),
        ], FREIGHT);
        expect(out[keyOf("figaro-freight-class")]).toMatchObject({ nmfcClass: "100" });
    });
});

const CREDENTIAL = specSourceFromFixtures(["figaro-credential"]);
const REGISTER = "https://data.cityofnewyork.us/resource/xjfq-wh2d.json?license_number={id}";
// The holder's declaration: the register of the institution that issued its
// credential, the credential's name and its identifier there. No agreement
// names the institution; each seller names its own.
const DECLARED = {
    credentialRegisterUri: REGISTER,
    credentialTitle: "NYC TLC For-Hire Vehicle Driver License",
    credentialId: "500458",
};

describe("figaro-credential — the seller declares the register, the title and the identifier", () => {
    const spec = CREDENTIAL.get(keyOf("figaro-credential"))!;

    it("all three fields are profile fills", () => {
        expect([...specProfileFills(spec)].sort()).toEqual(["credentialId", "credentialRegisterUri", "credentialTitle"]);
    });

    it("no field is a design fill, so no agreement names the institution", () => {
        expect(specDesignFills(spec)).toEqual([]);
    });
});

describe("fillProfileClauses — member profile master data folded onto their leaves", () => {
    it("folds the seller's register, title and identifier onto a leaf no agreement pinned", () => {
        const out = fillProfileClauses(
            { [keyOf("figaro-credential")]: {} },
            { [keyOf("figaro-credential")]: DECLARED },
            CREDENTIAL,
        );
        expect(out[keyOf("figaro-credential")]).toEqual(DECLARED);
    });

    it("folds ONLY the spec's declared subset — stored values outside it never land", () => {
        const out = fillProfileClauses(
            { [keyOf("figaro-credential")]: {} },
            { [keyOf("figaro-credential")]: { ...DECLARED, verified: "yes" } },
            CREDENTIAL,
        );
        expect(out[keyOf("figaro-credential")]).toEqual(DECLARED);
    });

    it("no-ops for clauses that are not profile-sourced, absent stores, and undeclared fields", () => {
        const clauses: ClauseFields = { [keyOf("figaro-commerce")]: {} };
        expect(fillProfileClauses(clauses, { [keyOf("figaro-commerce")]: { x: 1 } }, COMMERCE)).toEqual(clauses);
        const credential: ClauseFields = { [keyOf("figaro-credential")]: {} };
        expect(fillProfileClauses(credential, undefined, CREDENTIAL)).toEqual(credential);
        expect(fillProfileClauses(credential, {}, CREDENTIAL)).toEqual(credential);
    });
});

describe("the profile fill and the mechanical field set read the spec each key names", () => {
    // A lookalike registration (same clauseId and version, other bytes) is
    // another clause with its own key: it never changes what an order that
    // composed the real key takes from a profile, or what it marks mechanical.
    const rawCredential = rawSpecOf("figaro-credential");
    const fakeCredential = viewOf({
        ...rawCredential,
        title: "a stranger's registration",
        block: { ...(rawCredential.block as object), checkout: { profileFills: ["credentialId"] } },
    });
    const credentials = specSourceWithRegistrations(CREDENTIAL, [fakeCredential]);
    const stored = { [keyOf("figaro-credential")]: DECLARED, [fakeCredential.clauseKey]: DECLARED };

    it("the real key folds the real spec's declared subset, whatever else is loaded", () => {
        const out = fillProfileClauses({ [keyOf("figaro-credential")]: {} }, stored, credentials);
        expect(out[keyOf("figaro-credential")]).toEqual(DECLARED);
    });

    it("the lookalike's key folds the lookalike's declared subset", () => {
        const out = fillProfileClauses({ [fakeCredential.clauseKey]: {} }, stored, credentials);
        expect(out[fakeCredential.clauseKey]).toEqual({ credentialId: "500458" });
    });

    it("fillDerivedClauses reads each clause by its key", () => {
        expect(fillDerivedClauses({ [keyOf("figaro-credential")]: {} }, [], credentials, stored)[keyOf("figaro-credential")])
            .toEqual(DECLARED);
    });

    it("mechanicallyFilledFieldNames reads the spec's declarations, never a field name", () => {
        const rawGeo = rawSpecOf("figaro-geolocation");
        const fakeGeo = viewOf({
            ...rawGeo,
            title: "a stranger's registration",
            fields: [...(rawGeo.fields as object[]), { ...(rawGeo.fields as object[])[0], name: "billedMassGrams" }, { ...(rawGeo.fields as object[])[0], name: "processDesignHash" }],
        });
        // A field named billedMassGrams that the spec does not derive is the buyer's.
        expect(mechanicallyFilledFieldNames(fakeGeo).has("billedMassGrams")).toBe(false);
        // processDesignHash is no mechanical fill: the provenance leaf is the
        // agreement format's, never a clause field.
        expect(mechanicallyFilledFieldNames(fakeGeo).has("processDesignHash")).toBe(false);
    });
});

describe("fillCheckoutDerivations — a derived field, by the rule and inputs its spec declares", () => {
    const one = (dims: Record<string, number>) => [line({ catalogItem: dims })];

    it("computes billed = max(gross, volumetric) with per-dimension round-up", () => {
        // 305×200×150 mm → round each up to the next cm → 310×200×150 = 9,300,000 mm³
        // ÷ 5000 = 1860 g volumetric > 1000 g gross → billed 1860.
        const out = fillCheckoutDerivations(
            { [keyOf("figaro-dimweight")]: { divisor: 5000 } },
            one({ massGrams: 1000, lengthMm: 305, widthMm: 200, heightMm: 150 }),
            CARGO_DIM,
        );
        expect(out[keyOf("figaro-dimweight")]).toEqual({ billedMassGrams: 1860, divisor: 5000 });
    });

    it("uses gross mass when it exceeds the volumetric weight", () => {
        const out = fillCheckoutDerivations(
            { [keyOf("figaro-dimweight")]: { divisor: 5000 } },
            one({ massGrams: 9000, lengthMm: 300, widthMm: 200, heightMm: 150 }),
            CARGO_DIM,
        );
        expect(out[keyOf("figaro-dimweight")].billedMassGrams).toBe(9000); // gross > 1800 volumetric
    });

    it("no-ops without a divisor, without dims, without a gross mass, or without a declaring clause", () => {
        const dims = { massGrams: 1000, lengthMm: 300, widthMm: 200, heightMm: 150 };
        const noDivisor = { [keyOf("figaro-dimweight")]: {} };
        expect(fillCheckoutDerivations(noDivisor, one(dims), CARGO_DIM)).toEqual(noDivisor);
        const withDivisor = { [keyOf("figaro-dimweight")]: { divisor: 5000 } };
        expect(fillCheckoutDerivations(withDivisor, one({ massGrams: 1000 }), CARGO_DIM)).toEqual(withDivisor);
        expect(fillCheckoutDerivations(withDivisor, one({ lengthMm: 300, widthMm: 200, heightMm: 150 }), CARGO_DIM)).toEqual(withDivisor);
        // The reference dimweight spec with no `derives` mark derives nothing.
        expect(fillCheckoutDerivations(withDivisor, one(dims), specSourceOf([withoutCheckout("figaro-dimweight", ["derives"])]))).toEqual(withDivisor);
    });

    it("a stranger's clause deriving under other names derives the same weight", () => {
        const stranger = viewOf({
            clauseId: "a-strangers-parcel-rate",
            version: 1,
            title: "A stranger's parcel rate",
            description: "Chargeable weight under the stranger's own names.",
            fields: [
                { name: "chargeable", type: "integer", required: true, min: 1 },
                { name: "factor", type: "integer", required: true, min: 1 },
            ],
            stages: {},
            block: {
                design: { article: "logistics" },
                checkout: {
                    profileFills: ["factor"],
                    derives: {
                        chargeable: {
                            rule: "dimensional-weight",
                            inputs: {
                                mass: { from: "grossGrams", combine: "sum" },
                                length: { from: "l", combine: "single-unit" },
                                width: { from: "w", combine: "single-unit" },
                                height: { from: "h", combine: "single-unit" },
                                divisor: { field: "factor" },
                            },
                        },
                    },
                },
            },
        });
        const specs = specSourceOf([stranger]);
        const out = fillDerivedClauses(
            { [stranger.clauseKey]: {} },
            [line({ catalogItem: { grossGrams: 500, l: 300, w: 200, h: 150 } as never })],
            specs,
            { [stranger.clauseKey]: { factor: 5000 } },
        );
        expect(out[stranger.clauseKey]).toEqual({ chargeable: 1800, factor: 5000 });
        expect(mechanicallyFilledFieldNames(stranger)).toEqual(new Set(["chargeable"]));
    });

    it("a rule the registry holds by another name is read through the registry; an unknown rule derives nothing", () => {
        const counted = viewOf({
            clauseId: "a-strangers-count",
            version: 1,
            title: "A stranger's count",
            description: "Units, derived.",
            fields: [{ name: "units", type: "integer", required: false }],
            stages: {},
            block: { design: { article: "logistics" }, checkout: { derives: { units: { rule: "a-strangers-units", inputs: { n: { from: "packs", combine: "sum" } } } } } },
        });
        const specs = specSourceOf([counted]);
        const lines = [line({ quantity: 2, catalogItem: { packs: 3 } as never })];
        expect(fillCheckoutDerivations({ [counted.clauseKey]: {} }, lines, specs)).toEqual({ [counted.clauseKey]: {} });
        registerCheckoutDerivation("a-strangers-units", ({ n }) => n);
        expect(fillCheckoutDerivations({ [counted.clauseKey]: {} }, lines, specs)[counted.clauseKey]).toEqual({ units: 6 });
    });

    it("derives end to end through fillDerivedClauses: profile divisor → folded leaf → billed", () => {
        const out = fillDerivedClauses(
            { [keyOf("figaro-cargo")]: {}, [keyOf("figaro-dimweight")]: {} },
            [line({ catalogItem: { massGrams: 500, volumeMl: 9000, lengthMm: 300, widthMm: 200, heightMm: 150 } })],
            CARGO_DIM,
            { [keyOf("figaro-dimweight")]: { divisor: 5000 } },
        );
        // volumetric = 300×200×150 ÷ 5000 = 1800 > 500 gross → billed 1800.
        expect(out[keyOf("figaro-dimweight")]).toMatchObject({ billedMassGrams: 1800, divisor: 5000 });
    });
});

describe("every spec-routed fill reads the spec each composed key names", () => {
    // A lookalike registration (same clauseId and version, other bytes) is
    // another clause with its own key. Each case loads a lookalike that
    // declares the field a fill routes on, beside the real spec: a
    // composition of the real key stays untouched, and only a composition of
    // the lookalike's key is routed through it.
    const lookalike = (
        names: readonly string[],
        name: string,
        fieldNames: readonly string[],
        block: { design?: Record<string, unknown>; checkout?: Record<string, unknown> } = {},
    ) => {
        const raw = rawSpecOf(name);
        const rawBlock = (raw.block ?? {}) as Record<string, Record<string, unknown>>;
        const fields = raw.fields as Record<string, unknown>[];
        const fake = viewOf({
            ...raw,
            title: `${name} (a stranger's registration)`,
            fields: [...fields, ...fieldNames.map((n) => ({ ...fields[0], name: n }))],
            block: {
                ...rawBlock,
                ...(block.design && { design: { ...(rawBlock.design ?? {}), ...block.design } }),
                ...(block.checkout && { checkout: { ...(rawBlock.checkout ?? {}), ...block.checkout } }),
            },
        });
        return { specs: specSourceWithRegistrations(specSourceFromFixtures(names), [fake]), fake: fake.clauseKey };
    };
    const GEO = "figaro-geolocation";
    const REAL = keyOf(GEO);
    const HASH = `0x${"ab".repeat(32)}` as const;

    /** The lookalike with the commerce clause's line-items field and the
     *  priced-lines mark over it. */
    const pricedLookalike = () => {
        const raw = rawSpecOf(GEO);
        const rawBlock = raw.block as Record<string, Record<string, unknown>>;
        const lineItems = (rawSpecOf("figaro-commerce").fields as Record<string, unknown>[])[0];
        const fake = viewOf({
            ...raw,
            title: `${GEO} (a stranger's registration)`,
            fields: [...(raw.fields as Record<string, unknown>[]), lineItems],
            block: { ...rawBlock, checkout: { ...rawBlock.checkout, pricedLines: COMMERCE_PRICED_LINES } },
        });
        return { specs: specSourceWithRegistrations(specSourceFromFixtures([GEO]), [fake]), fake: fake.clauseKey };
    };

    it("fillPricedLines", () => {
        const { specs, fake } = pricedLookalike();
        const lines = [line({ itemId: "i", name: "Item", quantity: 1, unitPrice: "1000" })];
        expect(fillPricedLines({ [REAL]: {} }, specs, lines)).toEqual({ [REAL]: {} });
        expect(fillPricedLines({ [fake]: {} }, specs, lines)[fake]).toEqual({
            lineItems: [{ itemId: "i", name: "Item", quantity: 1, unitPrice: "1000" }],
        });
    });

    it("derivePricedFields reads each clause by its key", () => {
        const { specs, fake } = pricedLookalike();
        const data = { lineItems: [{ itemId: "i" }] };
        expect(derivePricedFields([{ clause: REAL, data }], specs)).toEqual([]);
        expect(derivePricedFields([{ clause: fake, data }], specs)).toEqual([
            { clause: fake, path: "lineItems.0.unitPrice" },
        ]);
    });

    it("readUtilityTokenPin", () => {
        const { specs, fake } = lookalike([GEO], GEO, [], { design: { article: "denomination", scope: "assembly", fills: ["currency"] } });
        // The lookalike declares no address-hex field yet: no pin.
        expect(readUtilityTokenPin({ [fake]: { currency: TOKEN } }, specs)).toBeUndefined();
        const raw = rawSpecOf(GEO);
        const rawBlock = raw.block as Record<string, Record<string, unknown>>;
        const pin = viewOf({
            ...raw,
            title: `${GEO} (a stranger's denomination)`,
            fields: [...(raw.fields as Record<string, unknown>[]), { name: "currency", type: "string", format: "address-hex", required: true }],
            block: { ...rawBlock, design: { ...rawBlock.design, article: "denomination", scope: "assembly", fills: ["currency"] } },
        });
        const withPin = specSourceWithRegistrations(specSourceFromFixtures([GEO]), [pin]);
        expect(readUtilityTokenPin({ [REAL]: { currency: TOKEN } }, withPin)).toBeUndefined();
        expect(readUtilityTokenPin({ [pin.clauseKey]: { currency: TOKEN } }, withPin)).toBe(TOKEN);
    });

    it("the walk's guarded fillWalkProvenance writes agreement.provenance, never a clause", () => {
        const agreement: Agreement = { version: "a1", buyer: "0x01", seller: "0x02", clauses: [{ clause: REAL, data: {} }] };
        const KEY = `0x${"ef".repeat(32)}` as `0x${string}`;
        const P = { agreementHash: KEY, processDesignHash: HASH };
        const filled = fillWalkProvenance(agreement, P, "n");
        expect(filled.provenance).toEqual(P);
        expect(filled.clauses).toEqual(agreement.clauses);
        // An identical claim passes (case-insensitive); a different key or hash is a forgery.
        const upper = HASH.toUpperCase().replace("0X", "0x") as `0x${string}`;
        expect(fillWalkProvenance({ ...agreement, provenance: { agreementHash: KEY, processDesignHash: upper } }, P, "n").provenance).toEqual(P);
        expect(() => fillWalkProvenance({ ...agreement, provenance: { agreementHash: KEY, processDesignHash: `0x${"cd".repeat(32)}` } }, P, "n"))
            .toThrow(/refusing to claim a different provenance/);
        expect(() => fillWalkProvenance({ ...agreement, provenance: { agreementHash: `0x${"cd".repeat(32)}`, processDesignHash: HASH } }, P, "n"))
            .toThrow(/refusing to claim a different provenance/);
    });

    it("fillCatalogueMeasures", () => {
        const { specs, fake } = lookalike([GEO], GEO, ["massGrams"], { checkout: { catalogueMeasures: { massGrams: { from: "massGrams", combine: "sum" } } } });
        const lines = [line({ catalogItem: { massGrams: 500 } })];
        expect(fillCatalogueMeasures({ [REAL]: {} }, lines, specs)).toEqual({ [REAL]: {} });
        expect(fillCatalogueMeasures({ [fake]: {} }, lines, specs)[fake]).toEqual({ massGrams: 500 });
    });

    it("fillClassClauses", () => {
        const { specs, fake } = lookalike([GEO], GEO, ["hazmatClass"], { checkout: { catalogueFills: ["hazmatClass"] } });
        const lines = [line({ clauseValues: { [REAL]: { hazmatClass: "3" }, [fake]: { hazmatClass: "3" } } })];
        expect(fillClassClauses({ [REAL]: {} }, lines, specs)).toEqual({ [REAL]: {} });
        expect(fillClassClauses({ [fake]: {} }, lines, specs)[fake]).toEqual({ hazmatClass: "3" });
    });

    it("fillCheckoutDerivations, and fillDerivedClauses reaching every fill", () => {
        const { specs, fake } = lookalike([GEO], GEO, ["billedMassGrams", "divisor"], { checkout: { derives: DIMWEIGHT_DERIVES } });
        const dims = [line({ catalogItem: { massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 } })];
        const real = { [REAL]: { divisor: 5000 } };
        expect(fillCheckoutDerivations(real, dims, specs)).toEqual(real);
        expect(fillCheckoutDerivations({ [fake]: { divisor: 5000 } }, dims, specs)[fake])
            .toMatchObject({ billedMassGrams: 1800 });
        const massLookalike = lookalike([GEO], GEO, ["massGrams"], { checkout: { catalogueMeasures: { massGrams: { from: "massGrams", combine: "sum" } } } });
        const lines = [line({ catalogItem: { massGrams: 500 } })];
        expect(fillDerivedClauses({ [REAL]: {} }, lines, massLookalike.specs)).toEqual({ [REAL]: {} });
        expect(fillDerivedClauses({ [massLookalike.fake]: {} }, lines, massLookalike.specs)[massLookalike.fake])
            .toEqual({ massGrams: 500 });
    });

    it("the rate-quantity resolvers (order-geodistance, booking-window)", () => {
        const CARGO_ID = "figaro-cargo";
        const CARGO_KEY = keyOf(CARGO_ID);
        // order-geodistance reads the endpoints a spec marks
        // (`block.checkout.endpoints`): the lookalike carries the geolocation
        // spec's standard and endpoint fields and its mark, under its own key.
        const cargoRaw = rawSpecOf(CARGO_ID);
        const cargoBlock = cargoRaw.block as Record<string, Record<string, unknown>>;
        const markedAs = (checkout: Record<string, unknown>) => ({ ...cargoBlock, checkout: { ...cargoBlock.checkout, ...checkout } });
        const geoFields = (rawSpecOf(GEO).fields as Record<string, unknown>[])
            .filter((f) => f.name === "geocodeStandard" || typeof f.formatFromField === "string");
        const geoFake = viewOf({
            ...cargoRaw,
            title: `${CARGO_ID} (a stranger's registration)`,
            fields: [...(cargoRaw.fields as Record<string, unknown>[]), ...geoFields],
            block: markedAs({ endpoints: { from: "origin", to: "destination" } }),
        });
        const geoSpecs = specSourceWithRegistrations(specSourceFromFixtures([CARGO_ID]), [geoFake]);
        const endpoints = { geocodeStandard: "geohash", origin: "u4pruydqqvj", destination: "u4pruydqqvm" };
        const geodistance = getRateQuantityResolver("order-geodistance")!;
        expect(geodistance({ clauses: { [CARGO_KEY]: endpoints }, specs: geoSpecs })).toBeNull();
        expect(geodistance({ clauses: { [geoFake.clauseKey]: endpoints }, specs: geoSpecs })).not.toBeNull();

        // booking-window reads the window a spec marks
        // (`block.checkout.timeWindow`): the lookalike carries the schedule
        // spec's fields and its mark, under its own key.
        const windowFake = viewOf({
            ...cargoRaw,
            title: `${CARGO_ID} (a stranger's registration)`,
            fields: [...(cargoRaw.fields as Record<string, unknown>[]), ...(rawSpecOf("figaro-schedule").fields as Record<string, unknown>[])],
            block: markedAs({ timeWindow: { start: "windowStart", end: "windowEnd" } }),
        });
        const window = {
            specs: specSourceWithRegistrations(specSourceFromFixtures([CARGO_ID]), [windowFake]),
            fake: windowFake.clauseKey,
        };
        const span = { windowStart: "2026-01-01T09:00:00Z", windowEnd: "2026-01-01T12:00:00Z" };
        const bookingWindow = getRateQuantityResolver("booking-window")!;
        expect(bookingWindow({ clauses: { [CARGO_KEY]: span }, specs: window.specs })).toBeNull();
        expect(bookingWindow({ clauses: { [window.fake]: span }, specs: window.specs })).toBe(3);

        // resolveSubOrderPricing hands the resolver the node's own clauses.
        const SELLER = "0x00000000000000000000000000000000000000a1" as const;
        const catalogs = [{
            address: SELLER,
            items: [{
                id: "hour", name: "Hour", price: "1", available: true,
                pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "booking-window",
            }],
        }] as unknown as Parameters<typeof resolveSubOrderPricing>[0]["sellerCatalogs"];
        const priced = (clauses: Record<string, Record<string, unknown>>) => resolveSubOrderPricing({
            node: { clauses },
            seller: SELLER, sellerCatalogs: catalogs, tokenDecimals: 0, specs: window.specs,
        });
        expect(priced({ [CARGO_KEY]: span }).issue).toBe("unresolvable-quantity");
        expect(priced({ [window.fake]: span }).payment).toBe(3n);
    });
});
