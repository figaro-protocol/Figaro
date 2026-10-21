/**
 * The fill-where-composed clause writers (checkoutPlan) — cargo measure,
 * catalog-sourced class leaves, derived dimensional weight. Clauses are
 * found by declared field / spec hints through the SpecSource, never by
 * clause id. Migrated from the frontend's assemblyCheckoutFold suite when the
 * fills promoted to the SDK.
 */
import { describe, expect, it } from "vitest";
import {
    derivePricedFields,
    fillCargoClause,
    fillClassClauses,
    fillCommerceClause,
    fillDerivedClauses,
    fillDimweightClause,
    fillProfileClauses,
    getRateQuantityResolver,
    mechanicallyFilledFieldNames,
    readUtilityTokenPin,
    resolveSubOrderPricing,
    writeTopologyClause,
    type AssemblyCheckoutLineItem,
} from "../src/checkoutPlan.js";
import { fillWalkProvenance } from "../src/reconstructOrders.js";
import type { Agreement } from "../src/agreement.js";
import { keyOf, rawSpecOf, specSourceFromFixtures, specSourceWithRegistrations, viewOf } from "./specFixtures.js";

type ClauseFields = Record<string, Record<string, unknown>>;

const line = (over: Partial<AssemblyCheckoutLineItem>): AssemblyCheckoutLineItem => ({
    itemId: "i", name: "Item", quantity: 1, unitPrice: "1", ...over,
});

const CARGO = specSourceFromFixtures(["figaro-cargo"]);
const COMMERCE = specSourceFromFixtures(["figaro-commerce"]);
const FREIGHT = specSourceFromFixtures(["figaro-freight-class"]);
const CARGO_DIM = specSourceFromFixtures(["figaro-cargo", "figaro-dimweight"]);

describe("fillCargoClause — physical measure folded by declared field", () => {
    it("sums mass + volume across lines × quantity", () => {
        const out = fillCargoClause({ [keyOf("figaro-cargo")]: {} }, [
            line({ massGrams: 500, volumeMl: 1000, quantity: 2 }),
            line({ massGrams: 100, volumeMl: 200, quantity: 1 }),
        ], CARGO);
        expect(out[keyOf("figaro-cargo")]).toMatchObject({ massGrams: 1100, volumeMl: 2200 });
    });

    it("writes packaged dims only for a single parcel (1 line, qty 1)", () => {
        const single = fillCargoClause({ [keyOf("figaro-cargo")]: {} }, [
            line({ massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 }),
        ], CARGO);
        expect(single[keyOf("figaro-cargo")]).toMatchObject({ lengthMm: 300, widthMm: 200, heightMm: 150 });
    });

    it("omits dims when the order is multi-line (dims don't sum)", () => {
        const multi = fillCargoClause({ [keyOf("figaro-cargo")]: {} }, [
            line({ massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 }),
            line({ massGrams: 100, lengthMm: 100, widthMm: 100, heightMm: 100 }),
        ], CARGO);
        expect(multi[keyOf("figaro-cargo")].lengthMm).toBeUndefined();
        // ...but mass still sums.
        expect(multi[keyOf("figaro-cargo")].massGrams).toBe(600);
    });

    it("no-ops when no cargo clause is composed (services → absence)", () => {
        const clauses: ClauseFields = { [keyOf("figaro-commerce")]: {} };
        expect(fillCargoClause(clauses, [line({ massGrams: 500 })], COMMERCE)).toEqual(clauses);
    });
});

const TOKEN = "0x000000000000000000000000000000000000000a" as const;
const OTHER_TOKEN = "0x000000000000000000000000000000000000000b" as const;
const COMMERCE_AND_PIN = specSourceFromFixtures(["figaro-commerce", "figaro-utility-token"]);
const PIN_ONLY = specSourceFromFixtures(["figaro-utility-token"]);

describe("fillCommerceClause — the order's resolution terms, written by declared field", () => {
    it("writes the resolved currency beside the payment — both are TERMS, both are leaves", () => {
        const out = fillCommerceClause({ [keyOf("figaro-commerce")]: {} }, 1000n, TOKEN, COMMERCE);
        expect(out[keyOf("figaro-commerce")]).toMatchObject({ currency: TOKEN, payment: "1000" });
    });

    it("writes line items when supplied, stripped to the clause's closed shape", () => {
        const out = fillCommerceClause({ [keyOf("figaro-commerce")]: {} }, 1000n, TOKEN, COMMERCE, [
            line({ itemId: "burger-001", name: "Cheeseburger", quantity: 2, unitPrice: "500", massGrams: 400 }),
        ]);
        expect(out[keyOf("figaro-commerce")].lineItems).toEqual([
            { itemId: "burger-001", name: "Cheeseburger", quantity: 2, unitPrice: "500" },
        ]);
    });

    it("no-ops when no commerce clause is composed", () => {
        const clauses: ClauseFields = { [keyOf("figaro-cargo")]: {} };
        expect(fillCommerceClause(clauses, 1000n, TOKEN, CARGO)).toEqual(clauses);
    });
});

describe("readUtilityTokenPin — routed on the DESIGN FILL, never on first match", () => {
    it("finds the pin by its design.fills declaration", () => {
        expect(readUtilityTokenPin({ [keyOf("figaro-utility-token")]: { currency: TOKEN } }, PIN_ONLY)).toBe(TOKEN);
    });

    it("never mistakes the commerce leaf for a pin, whichever clause is composed first", () => {
        // The disambiguation the restored commerce `currency` demands: BOTH
        // clauses declare a currency field, so a first-match lookup would
        // return the order's own resolution term as if the designer had
        // pinned it. Asserted in both key orders — a first-match bug passes
        // one and fails the other.
        expect(readUtilityTokenPin({
            [keyOf("figaro-commerce")]: { currency: OTHER_TOKEN, payment: "1", lineItems: [] },
            [keyOf("figaro-utility-token")]: { currency: TOKEN },
        }, COMMERCE_AND_PIN)).toBe(TOKEN);
        expect(readUtilityTokenPin({
            [keyOf("figaro-utility-token")]: { currency: TOKEN },
            [keyOf("figaro-commerce")]: { currency: OTHER_TOKEN, payment: "1", lineItems: [] },
        }, COMMERCE_AND_PIN)).toBe(TOKEN);
    });

    it("is undefined for an unpinned assembly composing only commerce", () => {
        expect(readUtilityTokenPin({
            [keyOf("figaro-commerce")]: { currency: OTHER_TOKEN, payment: "1", lineItems: [] },
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

describe("fillProfileClauses — member profile master data folded onto their leaves", () => {
    it("folds the declared profile-authored subset onto a composed leaf", () => {
        const out = fillProfileClauses(
            { [keyOf("figaro-credential")]: { credentialRegisterUri: REGISTER } },
            { [keyOf("figaro-credential")]: { credentialId: "500458" } },
            CREDENTIAL,
        );
        expect(out[keyOf("figaro-credential")]).toMatchObject({
            credentialRegisterUri: REGISTER,
            credentialId: "500458",
        });
    });

    it("folds ONLY the spec's declared subset — stored values outside it never land", () => {
        const out = fillProfileClauses(
            { [keyOf("figaro-credential")]: { credentialRegisterUri: REGISTER } },
            // The register pin is the DESIGNER's field; a profile-stored copy is
            // outside `profileFills: ["credentialId"]` and must not fold.
            { [keyOf("figaro-credential")]: { credentialId: "500458", credentialRegisterUri: "https://evil.example/{id}" } },
            CREDENTIAL,
        );
        expect(out[keyOf("figaro-credential")].credentialRegisterUri).toBe(REGISTER);
    });

    it("no-ops for clauses that are not profile-sourced, absent stores, and undeclared fields", () => {
        const clauses: ClauseFields = { [keyOf("figaro-commerce")]: {} };
        expect(fillProfileClauses(clauses, { [keyOf("figaro-commerce")]: { x: 1 } }, COMMERCE)).toEqual(clauses);
        const credential: ClauseFields = { [keyOf("figaro-credential")]: { credentialRegisterUri: REGISTER } };
        expect(fillProfileClauses(credential, undefined, CREDENTIAL)).toEqual(credential);
        expect(fillProfileClauses(credential, {}, CREDENTIAL)).toEqual(credential);
    });
});

describe("the profile fill and the mechanical field set read the spec each key names", () => {
    // A lookalike registration (same clauseId and version, other bytes) is
    // another clause with its own key: it never widens what an order that
    // composed the real key takes from a profile, or what it marks mechanical.
    const rawCredential = rawSpecOf("figaro-credential");
    const fakeCredential = viewOf({
        ...rawCredential,
        title: "a stranger's registration",
        block: { ...(rawCredential.block as object), checkout: { profileFills: ["credentialId", "credentialRegisterUri"] } },
    });
    const credentials = specSourceWithRegistrations(CREDENTIAL, [fakeCredential]);
    const values = { credentialId: "500458", credentialRegisterUri: "https://evil.example/{id}" };
    const stored = { [keyOf("figaro-credential")]: values, [fakeCredential.clauseKey]: values };

    it("the real key folds the real spec's declared subset, whatever else is loaded", () => {
        const out = fillProfileClauses({ [keyOf("figaro-credential")]: {} }, stored, credentials);
        expect(out[keyOf("figaro-credential")]).toEqual({ credentialId: "500458" });
    });

    it("the lookalike's key folds the lookalike's declared subset", () => {
        const out = fillProfileClauses({ [fakeCredential.clauseKey]: {} }, stored, credentials);
        expect(out[fakeCredential.clauseKey]).toMatchObject({ credentialRegisterUri: "https://evil.example/{id}" });
    });

    it("fillDerivedClauses reads each clause by its key", () => {
        expect(fillDerivedClauses({ [keyOf("figaro-credential")]: {} }, [], credentials, stored)[keyOf("figaro-credential")])
            .toEqual({ credentialId: "500458" });
    });

    it("mechanicallyFilledFieldNames reads the composed key's spec only", () => {
        const rawGeo = rawSpecOf("figaro-geolocation");
        const fakeGeo = viewOf({
            ...rawGeo,
            title: "a stranger's registration",
            fields: [...(rawGeo.fields as object[]), { ...(rawGeo.fields as object[])[0], name: "billedMassGrams" }, { ...(rawGeo.fields as object[])[0], name: "compositionHash" }],
        });
        const specs = specSourceWithRegistrations(specSourceFromFixtures(["figaro-geolocation"]), [fakeGeo]);
        expect(mechanicallyFilledFieldNames({ [keyOf("figaro-geolocation")]: {} }, specs).has("billedMassGrams")).toBe(false);
        expect(mechanicallyFilledFieldNames({ [fakeGeo.clauseKey]: {} }, specs).has("billedMassGrams")).toBe(true);
        // compositionHash is no mechanical fill: the provenance leaf is the
        // agreement format's, never a clause field.
        expect(mechanicallyFilledFieldNames({ [fakeGeo.clauseKey]: {} }, specs).has("compositionHash")).toBe(false);
    });
});

describe("fillDimweightClause — derived billed weight (divisor from the profile-folded leaf)", () => {
    it("computes billed = max(gross, volumetric) with per-dimension round-up", () => {
        // 305×200×150 mm → round each up to the next cm → 310×200×150 = 9,300,000 mm³
        // ÷ 5000 = 1860 g volumetric > 1000 g gross → billed 1860.
        const out = fillDimweightClause(
            { [keyOf("figaro-cargo")]: { massGrams: 1000, lengthMm: 305, widthMm: 200, heightMm: 150 }, [keyOf("figaro-dimweight")]: { divisor: 5000 } },
            CARGO_DIM,
        );
        expect(out[keyOf("figaro-dimweight")]).toMatchObject({ billedMassGrams: 1860, divisor: 5000 });
    });

    it("uses gross mass when it exceeds the volumetric weight", () => {
        const out = fillDimweightClause(
            { [keyOf("figaro-cargo")]: { massGrams: 9000, lengthMm: 300, widthMm: 200, heightMm: 150 }, [keyOf("figaro-dimweight")]: { divisor: 5000 } },
            CARGO_DIM,
        );
        expect(out[keyOf("figaro-dimweight")].billedMassGrams).toBe(9000); // gross > 1800 volumetric
    });

    it("no-ops without a divisor on the leaf, without dims, or without the dimweight clause", () => {
        const withDims = { [keyOf("figaro-cargo")]: { massGrams: 1000, lengthMm: 300, widthMm: 200, heightMm: 150 }, [keyOf("figaro-dimweight")]: {} };
        expect(fillDimweightClause(withDims, CARGO_DIM)).toEqual(withDims); // no divisor folded
        const noDims = { [keyOf("figaro-cargo")]: { massGrams: 1000 }, [keyOf("figaro-dimweight")]: { divisor: 5000 } };
        expect(fillDimweightClause(noDims, CARGO_DIM)).toEqual(noDims); // no dims
        const noClause = { [keyOf("figaro-cargo")]: { massGrams: 1000, lengthMm: 300, widthMm: 200, heightMm: 150 } };
        expect(fillDimweightClause(noClause, CARGO_DIM)).toEqual(noClause); // no dimweight clause
    });

    it("derives end to end through fillDerivedClauses: profile divisor → folded leaf → billed", () => {
        const out = fillDerivedClauses(
            { [keyOf("figaro-cargo")]: {}, [keyOf("figaro-dimweight")]: {} },
            [line({ massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 })],
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

    it("fillCommerceClause", () => {
        const { specs, fake } = lookalike([GEO], GEO, ["lineItems", "payment"]);
        expect(fillCommerceClause({ [REAL]: {} }, 1000n, TOKEN, specs)).toEqual({ [REAL]: {} });
        expect(fillCommerceClause({ [fake]: {} }, 1000n, TOKEN, specs)[fake]).toMatchObject({ payment: "1000" });
    });

    it("fillCommerceClause writes currency only where the composed key's spec declares it as content", () => {
        const { specs, fake } = lookalike(["figaro-commerce"], "figaro-commerce", [], { design: { fills: ["currency"] } });
        expect(fillCommerceClause({ [keyOf("figaro-commerce")]: {} }, 1000n, TOKEN, specs)[keyOf("figaro-commerce")])
            .toMatchObject({ currency: TOKEN, payment: "1000" });
        expect(fillCommerceClause({ [fake]: {} }, 1000n, TOKEN, specs)[fake]).not.toHaveProperty("currency");
    });

    it("derivePricedFields reads each clause by its key", () => {
        const { specs, fake } = lookalike([GEO], GEO, ["lineItems"]);
        const data = { lineItems: [{ itemId: "i" }] };
        expect(derivePricedFields([{ clause: REAL, data }], specs)).toEqual([]);
        expect(derivePricedFields([{ clause: fake, data }], specs)).toEqual([
            { clause: fake, path: "payment" },
            { clause: fake, path: "lineItems.0.unitPrice" },
        ]);
    });

    it("readUtilityTokenPin", () => {
        const { specs, fake } = lookalike([GEO], GEO, ["currency"], { design: { fills: ["geocoder", "currency"] } });
        expect(readUtilityTokenPin({ [REAL]: { currency: TOKEN } }, specs)).toBeUndefined();
        expect(readUtilityTokenPin({ [fake]: { currency: TOKEN } }, specs)).toBe(TOKEN);
    });

    it("the walk's guarded fillWalkProvenance writes agreement.provenance, never a clause", () => {
        const agreement: Agreement = { version: "a1", buyer: "0x01", seller: "0x02", clauses: [{ clause: REAL, data: {} }] };
        const KEY = `0x${"ef".repeat(32)}` as `0x${string}`;
        const P = { agreementHash: KEY, compositionHash: HASH };
        const filled = fillWalkProvenance(agreement, P, "n");
        expect(filled.provenance).toEqual(P);
        expect(filled.clauses).toEqual(agreement.clauses);
        // An identical claim passes (case-insensitive); a different key or hash is a forgery.
        const upper = HASH.toUpperCase().replace("0X", "0x") as `0x${string}`;
        expect(fillWalkProvenance({ ...agreement, provenance: { agreementHash: KEY, compositionHash: upper } }, P, "n").provenance).toEqual(P);
        expect(() => fillWalkProvenance({ ...agreement, provenance: { agreementHash: KEY, compositionHash: `0x${"cd".repeat(32)}` } }, P, "n"))
            .toThrow(/refusing to claim a different provenance/);
        expect(() => fillWalkProvenance({ ...agreement, provenance: { agreementHash: `0x${"cd".repeat(32)}`, compositionHash: HASH } }, P, "n"))
            .toThrow(/refusing to claim a different provenance/);
    });

    it("writeTopologyClause", () => {
        const { specs, fake } = lookalike([GEO], GEO, ["parentOrderHashes"]);
        expect(writeTopologyClause({ [REAL]: {} }, [HASH], specs)).toEqual({ [REAL]: {} });
        expect(writeTopologyClause({ [fake]: {} }, [HASH], specs)[fake]).toEqual({ parentOrderHashes: [HASH] });
    });

    it("fillCargoClause", () => {
        const { specs, fake } = lookalike([GEO], GEO, ["massGrams"]);
        expect(fillCargoClause({ [REAL]: {} }, [line({ massGrams: 500 })], specs)).toEqual({ [REAL]: {} });
        expect(fillCargoClause({ [fake]: {} }, [line({ massGrams: 500 })], specs)[fake]).toEqual({ massGrams: 500 });
    });

    it("fillClassClauses", () => {
        const { specs, fake } = lookalike([GEO], GEO, ["hazmatClass"], { checkout: { catalogueFills: ["hazmatClass"] } });
        const lines = [line({ clauseValues: { [REAL]: { hazmatClass: "3" }, [fake]: { hazmatClass: "3" } } })];
        expect(fillClassClauses({ [REAL]: {} }, lines, specs)).toEqual({ [REAL]: {} });
        expect(fillClassClauses({ [fake]: {} }, lines, specs)[fake]).toEqual({ hazmatClass: "3" });
    });

    it("fillDimweightClause, and fillDerivedClauses reaching every fill", () => {
        const { specs, fake } = lookalike(["figaro-cargo", GEO], GEO, ["billedMassGrams", "divisor"]);
        const cargo = { massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 };
        const real = { [keyOf("figaro-cargo")]: cargo, [REAL]: { divisor: 5000 } };
        expect(fillDimweightClause(real, specs)).toEqual(real);
        expect(fillDimweightClause({ [keyOf("figaro-cargo")]: cargo, [fake]: { divisor: 5000 } }, specs)[fake])
            .toMatchObject({ billedMassGrams: 1800 });
        const massLookalike = lookalike([GEO], GEO, ["massGrams"]);
        expect(fillDerivedClauses({ [REAL]: {} }, [line({ massGrams: 500 })], massLookalike.specs)).toEqual({ [REAL]: {} });
        expect(fillDerivedClauses({ [massLookalike.fake]: {} }, [line({ massGrams: 500 })], massLookalike.specs)[massLookalike.fake])
            .toEqual({ massGrams: 500 });
    });

    it("the rate-quantity resolvers (order-geodistance, booking-window)", () => {
        const CARGO_ID = "figaro-cargo";
        const CARGO_KEY = keyOf(CARGO_ID);
        const geo = lookalike([CARGO_ID], CARGO_ID, ["geocodeStandard", "origin", "destination"]);
        const endpoints = { geocodeStandard: "geohash", origin: "u4pruydqqvj", destination: "u4pruydqqvm" };
        const geodistance = getRateQuantityResolver("order-geodistance")!;
        expect(geodistance({ clauses: { [CARGO_KEY]: endpoints }, specs: geo.specs })).toBeNull();
        expect(geodistance({ clauses: { [geo.fake]: endpoints }, specs: geo.specs })).not.toBeNull();

        const window = lookalike([CARGO_ID], CARGO_ID, ["windowStart", "windowEnd"]);
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
