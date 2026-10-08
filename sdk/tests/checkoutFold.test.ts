/**
 * The fill-where-composed section writers (checkoutPlan) — cargo measure,
 * catalog-sourced class leaves, derived dimensional weight. Sections are
 * found by declared field / spec hints through the SpecSource, never by
 * clause id. Migrated from the frontend's assemblyCheckoutFold suite when the
 * fills promoted to the SDK.
 */
import { describe, expect, it } from "vitest";
import {
    derivePricedFields,
    fillCargoSection,
    fillClassSections,
    fillCommerceSection,
    fillDerivedSections,
    fillDimweightSection,
    fillProfileSections,
    fillProvenanceSection,
    getRateQuantityResolver,
    mechanicallyFilledFieldNames,
    readUtilityTokenPin,
    resolveSubOrderPricing,
    writeTopologySection,
    type AssemblyCheckoutLineItem,
} from "../src/checkoutPlan.js";
import { fillWalkProvenance } from "../src/reconstructOrders.js";
import type { ProjectionSpecView } from "../src/projection.js";
import { specSourceFromFixtures, specSourceWithRegistrations } from "./specFixtures.js";

type ClauseFields = Record<string, Record<string, unknown>>;

const line = (over: Partial<AssemblyCheckoutLineItem>): AssemblyCheckoutLineItem => ({
    itemId: "i", name: "Item", quantity: 1, unitPrice: "1", ...over,
});

const CARGO = specSourceFromFixtures(["figaro-cargo"]);
const COMMERCE = specSourceFromFixtures(["figaro-commerce"]);
const FREIGHT = specSourceFromFixtures(["figaro-freight-class"]);
const CARGO_DIM = specSourceFromFixtures(["figaro-cargo", "figaro-dimweight"]);

describe("fillCargoSection — physical measure folded by declared field", () => {
    it("sums mass + volume across lines × quantity", () => {
        const out = fillCargoSection({ "figaro-cargo": {} }, [
            line({ massGrams: 500, volumeMl: 1000, quantity: 2 }),
            line({ massGrams: 100, volumeMl: 200, quantity: 1 }),
        ], CARGO);
        expect(out["figaro-cargo"]).toMatchObject({ massGrams: 1100, volumeMl: 2200 });
    });

    it("writes packaged dims only for a single parcel (1 line, qty 1)", () => {
        const single = fillCargoSection({ "figaro-cargo": {} }, [
            line({ massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 }),
        ], CARGO);
        expect(single["figaro-cargo"]).toMatchObject({ lengthMm: 300, widthMm: 200, heightMm: 150 });
    });

    it("omits dims when the order is multi-line (dims don't sum)", () => {
        const multi = fillCargoSection({ "figaro-cargo": {} }, [
            line({ massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 }),
            line({ massGrams: 100, lengthMm: 100, widthMm: 100, heightMm: 100 }),
        ], CARGO);
        expect(multi["figaro-cargo"].lengthMm).toBeUndefined();
        // ...but mass still sums.
        expect(multi["figaro-cargo"].massGrams).toBe(600);
    });

    it("no-ops when no cargo clause is composed (services → absence)", () => {
        const clauses: ClauseFields = { "figaro-commerce": {} };
        expect(fillCargoSection(clauses, [line({ massGrams: 500 })], COMMERCE)).toEqual(clauses);
    });
});

const TOKEN = "0x000000000000000000000000000000000000000a" as const;
const OTHER_TOKEN = "0x000000000000000000000000000000000000000b" as const;
const COMMERCE_AND_PIN = specSourceFromFixtures(["figaro-commerce", "figaro-utility-token"]);
const PIN_ONLY = specSourceFromFixtures(["figaro-utility-token"]);

describe("fillCommerceSection — the order's resolution terms, written by declared field", () => {
    it("writes the resolved currency beside the payment — both are TERMS, both are leaves", () => {
        const out = fillCommerceSection({ "figaro-commerce": {} }, 1000n, TOKEN, COMMERCE);
        expect(out["figaro-commerce"]).toMatchObject({ currency: TOKEN, payment: "1000" });
    });

    it("writes line items when supplied, stripped to the section's closed shape", () => {
        const out = fillCommerceSection({ "figaro-commerce": {} }, 1000n, TOKEN, COMMERCE, [
            line({ itemId: "burger-001", name: "Cheeseburger", quantity: 2, unitPrice: "500", massGrams: 400 }),
        ]);
        expect(out["figaro-commerce"].lineItems).toEqual([
            { itemId: "burger-001", name: "Cheeseburger", quantity: 2, unitPrice: "500" },
        ]);
    });

    it("no-ops when no commerce clause is composed", () => {
        const clauses: ClauseFields = { "figaro-cargo": {} };
        expect(fillCommerceSection(clauses, 1000n, TOKEN, CARGO)).toEqual(clauses);
    });
});

describe("readUtilityTokenPin — routed on the DESIGN FILL, never on first match", () => {
    it("finds the pin by its design.fills declaration", () => {
        expect(readUtilityTokenPin({ "figaro-utility-token": { currency: TOKEN } }, PIN_ONLY)).toBe(TOKEN);
    });

    it("never mistakes the commerce leaf for a pin, whichever clause is composed first", () => {
        // The disambiguation the restored commerce `currency` demands: BOTH
        // clauses declare a currency field, so a first-match lookup would
        // return the order's own resolution term as if the designer had
        // pinned it. Asserted in both key orders — a first-match bug passes
        // one and fails the other.
        expect(readUtilityTokenPin({
            "figaro-commerce": { currency: OTHER_TOKEN, payment: "1", lineItems: [] },
            "figaro-utility-token": { currency: TOKEN },
        }, COMMERCE_AND_PIN)).toBe(TOKEN);
        expect(readUtilityTokenPin({
            "figaro-utility-token": { currency: TOKEN },
            "figaro-commerce": { currency: OTHER_TOKEN, payment: "1", lineItems: [] },
        }, COMMERCE_AND_PIN)).toBe(TOKEN);
    });

    it("is undefined for an unpinned assembly composing only commerce", () => {
        expect(readUtilityTokenPin({
            "figaro-commerce": { currency: OTHER_TOKEN, payment: "1", lineItems: [] },
        }, COMMERCE_AND_PIN)).toBeUndefined();
    });

    it("is undefined while the spec cache is cold, and for a malformed pin value", () => {
        const cold = { get: () => undefined, list: () => [] };
        expect(readUtilityTokenPin({ "figaro-utility-token": { currency: TOKEN } }, cold)).toBeUndefined();
        expect(readUtilityTokenPin({ "figaro-utility-token": { currency: "the MARIA token" } }, PIN_ONLY))
            .toBeUndefined();
    });
});

describe("fillClassSections — catalog-sourced values folded onto their leaves", () => {
    it("folds a line's authored freight-class value", () => {
        const out = fillClassSections({ "figaro-freight-class": {} }, [
            line({ clauseValues: { "figaro-freight-class": { nmfcClass: "100" } } }),
        ], FREIGHT);
        expect(out["figaro-freight-class"]).toMatchObject({ nmfcClass: "100" });
    });

    it("no-ops when the composed clause isn't catalog-sourced", () => {
        const clauses: ClauseFields = { "figaro-commerce": {} };
        expect(fillClassSections(clauses, [line({ clauseValues: { "figaro-commerce": { x: 1 } } })], COMMERCE)).toEqual(clauses);
    });

    it("template's committed value WINS over the catalog's (terms outrank master data)", () => {
        const out = fillClassSections({ "figaro-freight-class": { nmfcClass: "70" } }, [
            line({ clauseValues: { "figaro-freight-class": { nmfcClass: "100", nmfcItem: "156600" } } }),
        ], FREIGHT);
        // The pinned class survives; the un-pinned item number fills from the catalog.
        expect(out["figaro-freight-class"]).toMatchObject({ nmfcClass: "70", nmfcItem: "156600" });
    });

    it("folds ONLY the spec's declared catalogueFills — an undeclared key never reaches the leaf", () => {
        const out = fillClassSections({ "figaro-freight-class": {} }, [
            line({ clauseValues: { "figaro-freight-class": { nmfcClass: "100", rate: "0.01" } } }),
        ], FREIGHT);
        expect(out["figaro-freight-class"]).toMatchObject({ nmfcClass: "100" });
        expect(out["figaro-freight-class"]).not.toHaveProperty("rate");
    });

    it("an empty-string template entry is not a pin — the catalog value fills it", () => {
        const out = fillClassSections({ "figaro-freight-class": { nmfcClass: "" } }, [
            line({ clauseValues: { "figaro-freight-class": { nmfcClass: "100" } } }),
        ], FREIGHT);
        expect(out["figaro-freight-class"]).toMatchObject({ nmfcClass: "100" });
    });
});

const CREDENTIAL = specSourceFromFixtures(["figaro-credential"]);
const REGISTER = "https://data.cityofnewyork.us/resource/xjfq-wh2d.json?license_number={id}";

describe("fillProfileSections — member profile master data folded onto their leaves", () => {
    it("folds the declared profile-authored subset onto a composed leaf", () => {
        const out = fillProfileSections(
            { "figaro-credential": { credentialRegisterUri: REGISTER } },
            { "figaro-credential": { credentialId: "500458" } },
            CREDENTIAL,
        );
        expect(out["figaro-credential"]).toMatchObject({
            credentialRegisterUri: REGISTER,
            credentialId: "500458",
        });
    });

    it("folds ONLY the spec's declared subset — stored values outside it never land", () => {
        const out = fillProfileSections(
            { "figaro-credential": { credentialRegisterUri: REGISTER } },
            // The register pin is the DESIGNER's field; a profile-stored copy is
            // outside `profileFills: ["credentialId"]` and must not fold.
            { "figaro-credential": { credentialId: "500458", credentialRegisterUri: "https://evil.example/{id}" } },
            CREDENTIAL,
        );
        expect(out["figaro-credential"].credentialRegisterUri).toBe(REGISTER);
    });

    it("no-ops for clauses that are not profile-sourced, absent stores, and undeclared fields", () => {
        const clauses: ClauseFields = { "figaro-commerce": {} };
        expect(fillProfileSections(clauses, { "figaro-commerce": { x: 1 } }, COMMERCE)).toEqual(clauses);
        const credential: ClauseFields = { "figaro-credential": { credentialRegisterUri: REGISTER } };
        expect(fillProfileSections(credential, undefined, CREDENTIAL)).toEqual(credential);
        expect(fillProfileSections(credential, {}, CREDENTIAL)).toEqual(credential);
    });
});

describe("the profile fill and the mechanical field set read each section at its composed version", () => {
    // Every (clauseId, version) slot is open to anyone; the registry read with
    // no version returns the highest. A stranger's v2 must not widen what an
    // order composed at v1 takes from a profile, or what it marks mechanical.
    const credentialV1 = CREDENTIAL.get("figaro-credential", 1)!;
    const credentialV2: ProjectionSpecView = {
        ...credentialV1,
        version: 2,
        hints: { ...credentialV1.hints, profileFills: ["credentialId", "credentialRegisterUri"] },
    };
    const credentials = specSourceWithRegistrations(CREDENTIAL, [credentialV2]);
    const stored = { "figaro-credential": { credentialId: "500458", credentialRegisterUri: "https://evil.example/{id}" } };

    it("an unstated version folds v1's declared subset, never v2's", () => {
        const out = fillProfileSections({ "figaro-credential": {} }, stored, credentials);
        expect(out["figaro-credential"]).toEqual({ credentialId: "500458" });
    });

    it("a stated version folds that version's declared subset", () => {
        const out = fillProfileSections({ "figaro-credential": {} }, stored, credentials, { "figaro-credential": 2 });
        expect(out["figaro-credential"]).toMatchObject({ credentialRegisterUri: "https://evil.example/{id}" });
    });

    it("fillDerivedSections forwards the composed versions to the profile fold", () => {
        expect(fillDerivedSections({ "figaro-credential": {} }, [], credentials, stored)["figaro-credential"])
            .toEqual({ credentialId: "500458" });
        expect(fillDerivedSections({ "figaro-credential": {} }, [], credentials, stored, { "figaro-credential": 2 })["figaro-credential"])
            .toMatchObject({ credentialRegisterUri: "https://evil.example/{id}" });
    });

    it("mechanicallyFilledFieldNames reads v1 for an unstated version, the stated one otherwise", () => {
        const geoV1 = specSourceFromFixtures(["figaro-geolocation"]).get("figaro-geolocation", 1)!;
        const geoV2: ProjectionSpecView = {
            ...geoV1,
            version: 2,
            fields: [...geoV1.fields, { ...geoV1.fields[0], name: "compositionHash" }],
        };
        const specs = specSourceWithRegistrations(specSourceFromFixtures(["figaro-geolocation"]), [geoV2]);
        const clauses = { "figaro-geolocation": {} };
        expect(mechanicallyFilledFieldNames(clauses, specs).has("compositionHash")).toBe(false);
        expect(mechanicallyFilledFieldNames(clauses, specs, { "figaro-geolocation": 2 }).has("compositionHash")).toBe(true);
    });
});

describe("fillDimweightSection — derived billed weight (divisor from the profile-folded leaf)", () => {
    it("computes billed = max(gross, volumetric) with per-dimension round-up", () => {
        // 305×200×150 mm → round each up to the next cm → 310×200×150 = 9,300,000 mm³
        // ÷ 5000 = 1860 g volumetric > 1000 g gross → billed 1860.
        const out = fillDimweightSection(
            { "figaro-cargo": { massGrams: 1000, lengthMm: 305, widthMm: 200, heightMm: 150 }, "figaro-dimweight": { divisor: 5000 } },
            CARGO_DIM,
        );
        expect(out["figaro-dimweight"]).toMatchObject({ billedMassGrams: 1860, divisor: 5000 });
    });

    it("uses gross mass when it exceeds the volumetric weight", () => {
        const out = fillDimweightSection(
            { "figaro-cargo": { massGrams: 9000, lengthMm: 300, widthMm: 200, heightMm: 150 }, "figaro-dimweight": { divisor: 5000 } },
            CARGO_DIM,
        );
        expect(out["figaro-dimweight"].billedMassGrams).toBe(9000); // gross > 1800 volumetric
    });

    it("no-ops without a divisor on the leaf, without dims, or without the dimweight clause", () => {
        const withDims = { "figaro-cargo": { massGrams: 1000, lengthMm: 300, widthMm: 200, heightMm: 150 }, "figaro-dimweight": {} };
        expect(fillDimweightSection(withDims, CARGO_DIM)).toEqual(withDims); // no divisor folded
        const noDims = { "figaro-cargo": { massGrams: 1000 }, "figaro-dimweight": { divisor: 5000 } };
        expect(fillDimweightSection(noDims, CARGO_DIM)).toEqual(noDims); // no dims
        const noClause = { "figaro-cargo": { massGrams: 1000, lengthMm: 300, widthMm: 200, heightMm: 150 } };
        expect(fillDimweightSection(noClause, CARGO_DIM)).toEqual(noClause); // no dimweight clause
    });

    it("derives end to end through fillDerivedSections: profile divisor → folded leaf → billed", () => {
        const out = fillDerivedSections(
            { "figaro-cargo": {}, "figaro-dimweight": {} },
            [line({ massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 })],
            CARGO_DIM,
            { "figaro-dimweight": { divisor: 5000 } },
        );
        // volumetric = 300×200×150 ÷ 5000 = 1800 > 500 gross → billed 1800.
        expect(out["figaro-dimweight"]).toMatchObject({ billedMassGrams: 1800, divisor: 5000 });
    });
});

describe("every spec-routed fill reads each section at its composed version", () => {
    // Every (clauseId, version) slot is open to anyone, and a registry read
    // with no version returns the highest loaded. Each case loads a
    // stranger's v2 that declares the field a fill routes on, beside the v1
    // the composition states (absent = 1): the v1 composition stays untouched,
    // and only a composition that states v2 is routed through v2.
    const v2Of = (
        base: ReturnType<typeof specSourceFromFixtures>,
        clauseId: string,
        fieldNames: readonly string[],
        hints: ProjectionSpecView["hints"] = {},
    ) => {
        const v1 = base.get(clauseId, 1)!;
        const v2: ProjectionSpecView = {
            ...v1,
            version: 2,
            fields: [...v1.fields, ...fieldNames.map((name) => ({ ...v1.fields[0], name }))],
            hints: { ...v1.hints, ...hints },
        };
        return specSourceWithRegistrations(base, [v2]);
    };
    const GEO = "figaro-geolocation";
    const AT_V2 = { [GEO]: 2 };
    const HASH = `0x${"ab".repeat(32)}` as const;

    it("fillCommerceSection", () => {
        const specs = v2Of(specSourceFromFixtures([GEO]), GEO, ["lineItems", "payment"]);
        const clauses = { [GEO]: {} };
        expect(fillCommerceSection(clauses, 1000n, TOKEN, specs)).toEqual(clauses);
        expect(fillCommerceSection(clauses, 1000n, TOKEN, specs, undefined, AT_V2)[GEO])
            .toMatchObject({ payment: "1000" });
    });

    it("fillCommerceSection writes currency only where the composed version declares it as content", () => {
        const base = specSourceFromFixtures(["figaro-commerce"]);
        const v1 = base.get("figaro-commerce", 1)!;
        const v2: ProjectionSpecView = { ...v1, version: 2, hints: { ...v1.hints, designFills: ["currency"] } };
        const specs = specSourceWithRegistrations(base, [v2]);
        expect(fillCommerceSection({ "figaro-commerce": {} }, 1000n, TOKEN, specs)["figaro-commerce"])
            .toMatchObject({ currency: TOKEN, payment: "1000" });
        expect(fillCommerceSection({ "figaro-commerce": {} }, 1000n, TOKEN, specs, undefined, { "figaro-commerce": 2 })["figaro-commerce"])
            .not.toHaveProperty("currency");
    });

    it("derivePricedFields reads each section at the version it states", () => {
        const specs = v2Of(specSourceFromFixtures([GEO]), GEO, ["lineItems"]);
        const data = { lineItems: [{ itemId: "i" }] };
        expect(derivePricedFields([{ clause: GEO, data }], specs)).toEqual([]);
        expect(derivePricedFields([{ clause: GEO, version: 1, data }], specs)).toEqual([]);
        expect(derivePricedFields([{ clause: GEO, version: 2, data }], specs)).toEqual([
            { clause: GEO, path: "payment" },
            { clause: GEO, path: "lineItems.0.unitPrice" },
        ]);
    });

    it("readUtilityTokenPin", () => {
        const specs = v2Of(specSourceFromFixtures([GEO]), GEO, ["currency"], { designFills: ["geocoder", "currency"] });
        const clauses = { [GEO]: { currency: TOKEN } };
        expect(readUtilityTokenPin(clauses, specs)).toBeUndefined();
        expect(readUtilityTokenPin(clauses, specs, AT_V2)).toBe(TOKEN);
    });

    it("fillProvenanceSection and the walk's guarded fillWalkProvenance", () => {
        const specs = v2Of(specSourceFromFixtures([GEO]), GEO, ["compositionHash"]);
        const clauses = { [GEO]: {} };
        expect(fillProvenanceSection(clauses, HASH, specs)).toEqual(clauses);
        expect(fillProvenanceSection(clauses, HASH, specs, AT_V2)[GEO]).toEqual({ compositionHash: HASH });
        expect(fillWalkProvenance(clauses, HASH, specs, "n")).toEqual(clauses);
        expect(fillWalkProvenance(clauses, HASH, specs, "n", AT_V2)[GEO]).toEqual({ compositionHash: HASH });
    });

    it("writeTopologySection", () => {
        const specs = v2Of(specSourceFromFixtures([GEO]), GEO, ["parentOrderHashes"]);
        const clauses = { [GEO]: {} };
        expect(writeTopologySection(clauses, [HASH], specs)).toEqual(clauses);
        expect(writeTopologySection(clauses, [HASH], specs, AT_V2)[GEO]).toEqual({ parentOrderHashes: [HASH] });
    });

    it("fillCargoSection", () => {
        const specs = v2Of(specSourceFromFixtures([GEO]), GEO, ["massGrams"]);
        const clauses = { [GEO]: {} };
        expect(fillCargoSection(clauses, [line({ massGrams: 500 })], specs)).toEqual(clauses);
        expect(fillCargoSection(clauses, [line({ massGrams: 500 })], specs, AT_V2)[GEO]).toEqual({ massGrams: 500 });
    });

    it("fillClassSections", () => {
        const specs = v2Of(specSourceFromFixtures([GEO]), GEO, ["hazmatClass"], { catalogueFills: ["hazmatClass"] });
        const clauses = { [GEO]: {} };
        const lines = [line({ clauseValues: { [GEO]: { hazmatClass: "3" } } })];
        expect(fillClassSections(clauses, lines, specs)).toEqual(clauses);
        expect(fillClassSections(clauses, lines, specs, AT_V2)[GEO]).toEqual({ hazmatClass: "3" });
    });

    it("fillDimweightSection, and fillDerivedSections forwarding to every fill", () => {
        const specs = v2Of(specSourceFromFixtures(["figaro-cargo", GEO]), GEO, ["billedMassGrams", "divisor"]);
        const clauses = {
            "figaro-cargo": { massGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 },
            [GEO]: { divisor: 5000 },
        };
        expect(fillDimweightSection(clauses, specs)).toEqual(clauses);
        expect(fillDimweightSection(clauses, specs, AT_V2)[GEO]).toMatchObject({ billedMassGrams: 1800 });
        const cargoV2 = v2Of(specSourceFromFixtures([GEO]), GEO, ["massGrams"]);
        expect(fillDerivedSections({ [GEO]: {} }, [line({ massGrams: 500 })], cargoV2)).toEqual({ [GEO]: {} });
        expect(fillDerivedSections({ [GEO]: {} }, [line({ massGrams: 500 })], cargoV2, undefined, AT_V2)[GEO])
            .toEqual({ massGrams: 500 });
    });

    it("the rate-quantity resolvers (order-geodistance, booking-window)", () => {
        const CARGO_ID = "figaro-cargo";
        const geo = v2Of(specSourceFromFixtures([CARGO_ID]), CARGO_ID, ["geocodeStandard", "origin", "destination"]);
        const geoClauses = { [CARGO_ID]: { geocodeStandard: "geohash", origin: "u4pruydqqvj", destination: "u4pruydqqvm" } };
        const geodistance = getRateQuantityResolver("order-geodistance")!;
        expect(geodistance({ clauses: geoClauses, specs: geo })).toBeNull();
        expect(geodistance({ clauses: geoClauses, specs: geo, clauseVersions: { [CARGO_ID]: 2 } })).not.toBeNull();

        const window = v2Of(specSourceFromFixtures([CARGO_ID]), CARGO_ID, ["windowStart", "windowEnd"]);
        const windowClauses = { [CARGO_ID]: { windowStart: "2026-01-01T09:00:00Z", windowEnd: "2026-01-01T12:00:00Z" } };
        const bookingWindow = getRateQuantityResolver("booking-window")!;
        expect(bookingWindow({ clauses: windowClauses, specs: window })).toBeNull();
        expect(bookingWindow({ clauses: windowClauses, specs: window, clauseVersions: { [CARGO_ID]: 2 } })).toBe(3);

        // resolveSubOrderPricing hands the resolver the node's own composed versions.
        const SELLER = "0x00000000000000000000000000000000000000a1" as const;
        const catalogs = [{
            address: SELLER,
            items: [{
                id: "hour", name: "Hour", price: "1", available: true,
                pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "booking-window",
            }],
        }] as unknown as Parameters<typeof resolveSubOrderPricing>[0]["sellerCatalogs"];
        const priced = (clauseVersions?: Record<string, number>) => resolveSubOrderPricing({
            node: { id: "n", clauses: windowClauses, clauseVersions },
            seller: SELLER, sellerCatalogs: catalogs, tokenDecimals: 0, specs: window,
        });
        expect(priced().issue).toBe("unresolvable-quantity");
        expect(priced({ [CARGO_ID]: 2 }).payment).toBe(3n);
    });
});
