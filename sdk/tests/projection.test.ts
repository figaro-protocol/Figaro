/**
 * Agreement projection — the off-chain validation sign gate (`assertAgreementSignable`,
 * the ONE thrower every signature routes through) and the golden-vector
 * byte-exactness of `buildOrderAgreement` + `buildProcessDesign`.
 *
 * The SpecSource is built from the canonical off-chain specs (`clauses/*.json`)
 * via `parseClauseSpec` + `parseProjectionHints` — the same construction any
 * consumer performs on registry-fetched spec JSON. (The frontend's cache
 * adapter does exactly this against ClauseRegistry → IPFS.)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    agreementHashOf,
    processDesignHashOf,
    assertAgreementSignable,
    buildProcessDesign,
    composeOrderAgreement,
    deriveProcessDesignSlug,
    withholdClauseContent,
    buildOrderAgreement,
    canonicalize,
    computeCheckoutHash,
    publicForm,
    hashClauseData,
    parseProjectionHints,
    serializeProcessDesign,
    specHasPrivateField,
    validateCommitmentAgreement,
    warnProcessLogFillsTrap,
    withClauseBlinding,
    type Agreement,
    type HydratedProcessDesign,
    type ProjectionSpecView,
    type SpecSource,
    type Commitment,
} from "../src/index.js";
import * as sdk from "../src/index.js";
import { withSpecDefaults } from "../src/projection.js";
import { keyOf, rawSpecOf, specSourceFromFixtures, specSourceOf, specSourceWithRegistrations, viewOf } from "./specFixtures.js";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;
/** The commitment's token — the token the golden vectors' envelope signs. */
const CURRENCY = "0x0000000000000000000000000000000000000001" as const;
const OTHER_TOKEN = "0x0000000000000000000000000000000000000002" as const;
/** The commitment being signed: the gate reads its token, and the clauses
 *  carry no copy of its token or its payment. */
const COMMITMENT: Commitment = {
    processId: `0x${"00".repeat(32)}`,
    buyer: BUYER,
    seller: SELLER,
    token: CURRENCY,
    payment: 1n,
    runningTotal: 1n,
    checkoutHash: `0x${"00".repeat(32)}`,
    salt: 0n,
    commitDeadline: 0n,
};
const OTHER_COMMITMENT: Commitment = { ...COMMITMENT, token: OTHER_TOKEN };
/** A commitment joining an open process: its `processId` names the process. */
const JOINING_COMMITMENT: Commitment = { ...COMMITMENT, processId: `0x${"9a".repeat(32)}` };

const SPECS = specSourceFromFixtures([
    "figaro-commerce",
    "figaro-applicable-law",
    "figaro-geolocation",
    "figaro-merchant-process",
    "figaro-utility-token",
]);

/** The commerce clause as a designer composes it on an order: selected,
 *  with no design fill. */
const COMMERCE = { [keyOf("figaro-commerce")]: {} };

function commerceData() {
    return {
        lineItems: [{ itemId: "item-1", name: "Test item", quantity: 1, unitPrice: "1" }],
    };
}

describe("assertAgreementSignable — the shared sign gate", () => {
    it("passes a conforming agreement whose hash matches its merkle root", () => {
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY", forum: "us-federal-court" },
        }, SPECS);
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, COMMITMENT, null)).not.toThrow();
    });

    it("signs the provenance leaf under the root and refuses a provenance that is not two 32-byte keys", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, { [keyOf("figaro-commerce")]: commerceData() }, SPECS);
        const registered = { clauses: { [keyOf("figaro-commerce")]: {} } };
        const agreementHash = agreementHashOf(registered);
        const design: HydratedProcessDesign = {
            assembly: { agreements: [{ id: "agreement-0", agreementHash, clauses: {} }] },
            agreements: { [agreementHash.toLowerCase() as `0x${string}`]: registered },
        };
        const named = { ...agreement, follows: [], provenance: { agreementHash, processDesignHash: processDesignHashOf(design.assembly) } };
        expect(() => assertAgreementSignable(named, computeCheckoutHash(named), SPECS, COMMITMENT, design)).not.toThrow();
        // The root without the provenance leaf is not this agreement's.
        expect(() => assertAgreementSignable(named, computeCheckoutHash(agreement), SPECS, COMMITMENT, design)).toThrow(/merkle/);
        // An agreement naming a design no one read is refused.
        expect(() => assertAgreementSignable(named, computeCheckoutHash(named), SPECS, COMMITMENT, null)).toThrow(/was not read/);
        const malformed = { ...agreement, follows: [], provenance: { agreementHash: `0x${"6f".repeat(32)}`, processDesignHash: "0x5e" } as const };
        expect(() => assertAgreementSignable(malformed, computeCheckoutHash(agreement), SPECS, COMMITMENT, null))
            .toThrow(/32-byte/);
    });

    it("throws on a clause violating its clause spec, naming clause + path", () => {
        // Prose fails applicable-law's jurisdiction-token pattern — the exact
        // shape a counter-signer must refuse even when the hash matches.
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: { applicableLaw: "State of New York, USA" },
        }, SPECS);
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, COMMITMENT, null))
            .toThrow(/figaro-applicable-law \$\.applicableLaw/);
    });

    it("throws when the hash being signed is not the agreement's merkle root", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
        }, SPECS);
        const wrongHash = `0x${"ab".repeat(32)}` as `0x${string}`;
        expect(() => assertAgreementSignable(agreement, wrongHash, SPECS, COMMITMENT, null))
            .toThrow(/\(merkle\) checkoutHash/);
    });

    it("reports every issue through validateCommitmentAgreement, not just the first", () => {
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: {
                applicableLaw: "State of New York, USA",
                language: "not-a-language-code!",
            },
        }, SPECS);
        const check = validateCommitmentAgreement(agreement, checkoutHash, SPECS, COMMITMENT, null);
        expect(check.ok).toBe(false);
        const paths = check.issues.map((i) => `${i.clause} ${i.path}`);
        expect(paths.some((p) => p.includes("applicableLaw"))).toBe(true);
        expect(paths.some((p) => p.includes("language"))).toBe(true);
    });

    it("refuses a clause carrying BOTH data and dataHash — the what-you-see-is-what-you-sign invariant", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY", forum: "us-federal-court" },
        }, SPECS);
        // The attack: keep the benign `data` a review renders, and ALSO attach a
        // `dataHash` fingerprint of hidden content, which the merkle leaf would
        // sign verbatim — sign one thing, show another.
        const clauseEntries = agreement.clauses.map((s) =>
            s.clause === keyOf("figaro-applicable-law")
                ? { ...s, dataHash: `0x${"ee".repeat(32)}` as `0x${string}` }
                : s,
        );
        const evil = { ...agreement, clauses: clauseEntries };
        const dual = clauseEntries.find((s) => s.clause === keyOf("figaro-applicable-law"));
        // Refused at the hashing locus …
        expect(() => hashClauseData(dual!)).toThrow(/both plaintext data and a dataHash/);
        // … and at the sign gate, structurally, regardless of the hash presented.
        const anyHash = `0x${"00".repeat(32)}` as `0x${string}`;
        const check = validateCommitmentAgreement(evil, anyHash, SPECS, COMMITMENT, null);
        expect(check.ok).toBe(false);
        expect(check.issues.some((i) => i.path === "dataHash" && /both/.test(i.message))).toBe(true);
        expect(() => assertAgreementSignable(evil, anyHash, SPECS, COMMITMENT, null))
            .toThrow(/both plaintext data and a dataHash/);
    });
});

describe("the sign gate reads the token and the payment from the commitment, never from a clause", () => {
    // The commitment carries the token and the payment; no clause restates
    // them (`clauses/figaro-commerce.json` declares only `lineItems`).
    const build = (clauses: Record<string, Record<string, unknown>>) =>
        buildOrderAgreement(BUYER, SELLER, clauses, SPECS);

    it("refuses a commerce clause that restates the payment — the spec declares no such field", () => {
        const { agreement, checkoutHash } = build({ [keyOf("figaro-commerce")]: { ...commerceData(), payment: "1" } });
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, COMMITMENT, null))
            .toThrow(/figaro-commerce \$\.payment: unknown field "payment"/);
    });

    it("refuses a commerce clause that restates the token — the spec declares no such field", () => {
        const { agreement, checkoutHash } = build({ [keyOf("figaro-commerce")]: { ...commerceData(), currency: CURRENCY } });
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, COMMITMENT, null))
            .toThrow(/figaro-commerce \$\.currency: unknown field "currency"/);
    });

    it("signs the same line items under any token and any payment the commitment names", () => {
        const { agreement, checkoutHash } = build({ [keyOf("figaro-commerce")]: commerceData() });
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, COMMITMENT, null)).not.toThrow();
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, { ...OTHER_COMMITMENT, payment: 1000n }, null))
            .not.toThrow();
    });

    it("refuses a public geohash finer than the grain cap at the sign gate, and signs one at the cap", () => {
        const geo = (origin: string) => build({
            [keyOf("figaro-geolocation")]: { geocodeStandard: "geohash", origin, destination: "9q8yyk" },
        });
        const fine = geo("u4pruydqq");
        expect(() => assertAgreementSignable(fine.agreement, fine.checkoutHash, SPECS, COMMITMENT, null))
            .toThrow(/figaro-geolocation \$\.origin: .*geohash/);
        const coarse = geo("u4pruy");
        expect(() => assertAgreementSignable(coarse.agreement, coarse.checkoutHash, SPECS, COMMITMENT, null)).not.toThrow();
    });

    it("signs an agreement that composes no line items: the commitment alone carries the payment", () => {
        const { agreement, checkoutHash } = build({ [keyOf("figaro-merchant-process")]: {} });
        expect(validateCommitmentAgreement(agreement, checkoutHash, SPECS, COMMITMENT, null).issues).toEqual([]);
    });

    it("passes a pinned assembly whose pin equals the commitment's token", () => {
        const { agreement, checkoutHash } = build({
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-utility-token")]: { currency: CURRENCY },
        });
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, COMMITMENT, null)).not.toThrow();
    });

    it("compares the pin case-insensitively — an address is not a string", () => {
        const { agreement, checkoutHash } = build({
            [keyOf("figaro-utility-token")]: { currency: "0x000000000000000000000000000000000000000A" },
        });
        expect(() => assertAgreementSignable(
            agreement, checkoutHash, SPECS, { ...COMMITMENT, token: "0x000000000000000000000000000000000000000a" }, null,
        )).not.toThrow();
    });

    it("throws when the pin contradicts the commitment's token", () => {
        const { agreement, checkoutHash } = build({
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-utility-token")]: { currency: OTHER_TOKEN },
        });
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, COMMITMENT, null))
            .toThrow(/figaro-utility-token currency: this assembly is denominated by design .* the commitment currency .* contradicts the pinned term/);
    });
});

describe("projection — golden-vector byte-exactness", () => {
    const FIXTURE = path.resolve(__dirname, "fixtures/promotion-golden-vectors.json");
    // The one harvest path, as the sibling vector suites have: a clause spec
    // edit moves its key and every frozen agreement that carries it, so the
    // three cases below are rewritten from the builders on
    // `HARVEST_PROJECTION_VECTORS=1`; the ecdh and commitmentPayload sections
    // carry no clause key and are kept as they are.
    if (process.env.HARVEST_PROJECTION_VECTORS === "1") {
        it("regenerates fixtures/promotion-golden-vectors.json", () => {
            const current = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
            const defaults = buildOrderAgreement(BUYER, SELLER, {
                [keyOf("figaro-commerce")]: commerceData(),
                [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY", forum: "us-federal-court" },
            }, SPECS);
            const processLog = buildOrderAgreement(BUYER, SELLER, {
                [keyOf("figaro-commerce")]: commerceData(),
                [keyOf("figaro-merchant-process")]: {},
            }, SPECS);
            const built = buildProcessDesign({
                name: "Golden Vector Chain",
                orders: [
                    { orderHash: "synthetic-root", follows: [] },
                    { orderHash: "synthetic-child", follows: ["synthetic-root"] },
                ],
                clausesByOrderId: { "synthetic-root": COMMERCE, "synthetic-child": COMMERCE },
                assemblyClauses: { [keyOf("figaro-applicable-law")]: {} },
                specs: SPECS,
            });
            const assembly = serializeProcessDesign(built.assembly);
            current.agreementProjection = {
                defaults: { canonicalAgreement: canonicalize(defaults.agreement), checkoutHash: defaults.checkoutHash },
                processLog: { canonicalAgreement: canonicalize(processLog.agreement), checkoutHash: processLog.checkoutHash },
            };
            current.assembly = {
                canonicalJson: assembly.json,
                processDesignHash: assembly.processDesignHash,
                agreements: Object.fromEntries(Object.entries(built.agreements).map(([k, v]) => [k, canonicalize(v)])),
            };
            writeFileSync(FIXTURE, JSON.stringify(current, null, 2) + "\n");
        });
    }
    const vectors = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
        agreementProjection: {
            defaults: { canonicalAgreement: string; checkoutHash: string };
            processLog: { canonicalAgreement: string; checkoutHash: string };
        };
        assembly: { canonicalJson: string; processDesignHash: string; agreements: Record<string, string> };
    };

    it("spec-default injection reproduces the frozen agreement + hash", () => {
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY", forum: "us-federal-court" },
        }, SPECS);
        expect(canonicalize(agreement)).toBe(vectors.agreementProjection.defaults.canonicalAgreement);
        expect(checkoutHash).toBe(vectors.agreementProjection.defaults.checkoutHash);
    });

    it("the process-log empty anchor reproduces the frozen agreement + hash", () => {
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-merchant-process")]: {},
        }, SPECS);
        expect(canonicalize(agreement)).toBe(
            vectors.agreementProjection.processLog.canonicalAgreement,
        );
        expect(checkoutHash).toBe(vectors.agreementProjection.processLog.checkoutHash);
    });

    it("the composed clauses + relabeling + assembly terms reproduce the frozen assembly + processDesignHash", () => {
        // figaro-applicable-law is ASSEMBLY-SCOPED (design.scope: "assembly")
        // with no design fill: the designer composes it with no values and the
        // buyer fills it at checkout, so the assembly carries the clause under
        // its key with an empty value, and that is what the frozen output holds.
        const built = buildProcessDesign({
            name: "Golden Vector Chain",
            orders: [
                { orderHash: "synthetic-root", follows: [] },
                { orderHash: "synthetic-child", follows: ["synthetic-root"] },
            ],
            clausesByOrderId: { "synthetic-root": COMMERCE, "synthetic-child": COMMERCE },
            assemblyClauses: { [keyOf("figaro-applicable-law")]: {} },
            specs: SPECS,
        });
        const assembly = serializeProcessDesign(built.assembly);
        expect(assembly.json).toBe(vectors.assembly.canonicalJson);
        expect(assembly.processDesignHash).toBe(vectors.assembly.processDesignHash);
        expect(Object.fromEntries(Object.entries(built.agreements).map(([k, v]) => [k, canonicalize(v)])))
            .toEqual(vectors.assembly.agreements);
    });

    it("refuses wrong-level composition (scope verification)", () => {
        // An assembly-scoped clause on an order is a BUILD error, never a
        // silent no-op…
        expect(() => buildProcessDesign({
            orders: [{ orderHash: "synthetic-root", follows: [] }],
            clausesByOrderId: { "synthetic-root": { [keyOf("figaro-applicable-law")]: {} } },
            specs: SPECS,
        })).toThrow(/design\.scope "assembly"/);
        // …and an agreement-scoped clause at the assembly level likewise.
        expect(() => buildProcessDesign({
            orders: [{ orderHash: "synthetic-root", follows: [] }],
            clausesByOrderId: { "synthetic-root": COMMERCE },
            assemblyClauses: { [keyOf("figaro-geolocation")]: {} },
            specs: SPECS,
        })).toThrow(/does not declare design\.scope "assembly"/);
    });
});

describe("publicForm — the public/private disposition seam", () => {
    // A minimal SpecSource: one all-public clause, one clause with a private field.
    const KEYS: Record<string, `0x${string}`> = {
        "pub-clause": `0x${"a1".repeat(32)}`,
        "priv-clause": `0x${"a2".repeat(32)}`,
        "unknown-clause": `0x${"a3".repeat(32)}`,
        x: `0x${"a4".repeat(32)}`,
    };
    const specView = (clauseId: string, dispositions: (string | undefined)[]): ProjectionSpecView => ({
        clauseId,
        clauseKey: KEYS[clauseId],
        version: 1,
        fields: dispositions.map((d, i) => ({
            name: `f${i}`,
            required: false,
            type: "string" as const,
            ...(d !== undefined && { disposition: d as "public" | "private" }),
        })),
    });
    const specs: SpecSource = specSourceOf([
        specView("pub-clause", ["public", undefined]),
        specView("priv-clause", ["private"]),
    ]);
    const agreement = {
        version: "a1" as const,
        buyer: BUYER,
        seller: SELLER,
        clauses: [
            { clause: KEYS["pub-clause"], data: { f0: "open", f1: "map" } },
            { clause: KEYS["priv-clause"], data: { f0: "secret-coordinate" } },
        ],
    };

    it("withholds a private clauseEntry, keeps a public one plaintext", () => {
        const withheld = publicForm(agreement, specs);
        const pub = withheld.clauses.find((s) => s.clause === KEYS["pub-clause"])!;
        const priv = withheld.clauses.find((s) => s.clause === KEYS["priv-clause"])!;
        expect(pub.data).toBeDefined(); // public coordination commons stays open
        expect(priv.data).toBeUndefined(); // paid-edge plaintext removed
        expect(priv.dataHash).toBe(hashClauseData({ clause: KEYS["priv-clause"], data: { f0: "secret-coordinate" } }));
    });

    it("leaves the checkoutHash unchanged — the withheld leaf is identical", () => {
        expect(computeCheckoutHash(publicForm(agreement, specs))).toBe(computeCheckoutHash(agreement));
    });

    it("withholds a clause whose clause spec is not loaded (fail-closed)", () => {
        const unknown = {
            ...agreement,
            clauses: [{ clause: KEYS["unknown-clause"], data: { f0: "could-be-private" } }],
        };
        // Unknown spec → WITHHELD: a permissionlessly-registered clause could be a
        // PRIVATE one, and keeping it plaintext would leak on any cold-cache pin
        // (notably the receiver re-pin, which never loaded the clause). The pin
        // caller warms the specs first (`warmAgreementSpecs`), so a known public
        // clause is not over-redacted; an unknown one fails closed here.
        const projected = publicForm(unknown, specs).clauses[0];
        expect(projected.data).toBeUndefined();
        expect(projected.dataHash).toBe(
            hashClauseData({ clause: KEYS["unknown-clause"], data: { f0: "could-be-private" } }),
        );
    });

    it("specHasPrivateField flags a private clause only", () => {
        expect(specHasPrivateField(specView("x", ["public", undefined]))).toBe(false);
        expect(specHasPrivateField(specView("x", ["public", "private"]))).toBe(true);
    });

    it("withholds a clause whose private field is nested in an object or an array", () => {
        const secret = { name: "s", required: true, type: "string" as const, disposition: "private" as const };
        const nestedKey = `0x${"a5".repeat(32)}` as const;
        const itemKey = `0x${"a6".repeat(32)}` as const;
        const nested: ProjectionSpecView = {
            clauseId: "nested", clauseKey: nestedKey, version: 1,
            fields: [{ name: "o", required: true, type: "object", fields: [{ name: "p", required: true, type: "object", fields: [secret] }] }],
        };
        const item: ProjectionSpecView = {
            clauseId: "item", clauseKey: itemKey, version: 1,
            fields: [{ name: "a", required: true, type: "array", items: { ...secret, name: "item" } }],
        };
        expect(specHasPrivateField(nested)).toBe(true);
        expect(specHasPrivateField(item)).toBe(true);
        const nestedAgreement = {
            ...agreement,
            clauses: [
                { clause: nestedKey, data: { o: { p: { s: "nested-secret" } } } },
                { clause: itemKey, data: { a: ["item-secret"] } },
            ],
        };
        const pinned = publicForm(nestedAgreement, specSourceOf([nested, item]));
        expect(pinned.clauses.every((c) => c.data === undefined)).toBe(true);
        expect(JSON.stringify(pinned)).not.toMatch(/nested-secret|item-secret/);
        expect(computeCheckoutHash(pinned)).toBe(computeCheckoutHash(nestedAgreement));
    });
});

describe("warnProcessLogFillsTrap — a clause that signs the empty anchor and declares fills", () => {
    // A synthetic field + hints view, mirroring the specView() helper above but
    // parameterized on `emptyAnchor` and the collection `hints` under test.
    const specView = (
        clauseId: string,
        emptyAnchor: boolean,
        hints: ProjectionSpecView["hints"],
    ): ProjectionSpecView => ({
        clauseId,
        version: 1,
        fields: [{ name: "eventType", required: true, type: "string" as const }],
        ...(emptyAnchor && { emptyAnchor: true as const }),
        ...(hints !== undefined && { hints }),
    });

    it("warns nothing for a clause that signs the empty anchor with no fills — the shipped shape", () => {
        // figaro-merchant-process / figaro-courier-process: emptyAnchor,
        // design.fills / checkout.*Fills all empty.
        const spec = specView("figaro-merchant-process", true, { article: "attestations" });
        expect(warnProcessLogFillsTrap(spec)).toEqual([]);
    });

    it("warns nothing for a clause that signs content and declares design.fills — the normal pattern", () => {
        // figaro-utility-token: article "denomination", design.fills: ["currency"].
        const spec = specView("figaro-utility-token", false, { article: "denomination", designFills: ["currency"] });
        expect(warnProcessLogFillsTrap(spec)).toEqual([]);
    });

    it("warns nothing for the attestations article with fills when the spec signs content: the article is presentation", () => {
        const spec = specView("signed-ladder", false, { article: "attestations", designFills: ["eventType"] });
        expect(warnProcessLogFillsTrap(spec)).toEqual([]);
    });

    it("warns when the spec signs the empty anchor AND design.fills is declared, whatever its article", () => {
        const spec = specView("trap-clause", true, { article: "harbor-log", designFills: ["eventType"] });
        const warnings = warnProcessLogFillsTrap(spec);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("trap-clause");
        expect(warnings[0]).toContain("emptyAnchor");
        expect(warnings[0]).toContain("design.fills");
        expect(warnings[0]).toContain("empty anchor");
    });

    it("warns when the spec signs the empty anchor AND checkout.catalogueFills is declared", () => {
        const spec = specView("trap-clause-2", true, { catalogueFills: ["eventType"] });
        const warnings = warnProcessLogFillsTrap(spec);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("catalogueFills");
    });

    it("warns when the spec signs the empty anchor AND checkout.profileFills is declared", () => {
        const spec = specView("trap-clause-3", true, { profileFills: ["eventType"] });
        expect(warnProcessLogFillsTrap(spec)).toHaveLength(1);
    });

    it("warns when the spec signs the empty anchor AND checkout.catalogueMeasures is declared", () => {
        const spec = specView("trap-clause-5", true, {
            catalogueMeasures: { eventType: { from: "massGrams", combine: "sum" } },
        });
        const warnings = warnProcessLogFillsTrap(spec);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("catalogueMeasures");
    });

    it("returns both warnings when design.fills AND checkout fills are both declared", () => {
        const spec = specView("trap-clause-4", true, {
            designFills: ["eventType"],
            catalogueFills: ["eventType"],
        });
        expect(warnProcessLogFillsTrap(spec)).toHaveLength(2);
    });

    it("matches the real shipped process-log fixtures exactly (via parseProjectionHints)", () => {
        const merchant = specSourceFromFixtures(["figaro-merchant-process"]).get(keyOf("figaro-merchant-process"))!;
        expect(merchant.emptyAnchor).toBe(true);
        expect(warnProcessLogFillsTrap(merchant)).toEqual([]);
    });
});

describe("parseProjectionHints — block.checkout.catalogueMeasures", () => {
    const hintsOf = (catalogueMeasures: unknown) =>
        parseProjectionHints({ block: { checkout: { catalogueMeasures } } }).catalogueMeasures;

    it("lifts each well-formed entry: the clause field, its catalog-item field and its combinator", () => {
        expect(hintsOf({
            weight: { from: "massGrams", combine: "sum" },
            length: { from: "lengthMm", combine: "single-unit" },
        })).toEqual({
            weight: { from: "massGrams", combine: "sum" },
            length: { from: "lengthMm", combine: "single-unit" },
        });
    });

    it("skips an entry with no source field or an unknown combinator, as an absent attribute", () => {
        expect(hintsOf({
            weight: { from: "massGrams", combine: "average" },
            other: { combine: "sum" },
            kept: { from: "volumeMl", combine: "sum" },
        })).toEqual({ kept: { from: "volumeMl", combine: "sum" } });
        expect(hintsOf({})).toBeUndefined();
        expect(hintsOf(["massGrams"])).toBeUndefined();
    });
});

describe("buildProcessDesign — an agreement carries exactly the clauses its designer composed", () => {
    // No clause is written in: commerce is a clause like any other, and an
    // article word confers no standing. The commitment carries the payment
    // and the token, and the format carries the topology (each entry's
    // `follows`, each order's topology leaf).
    const ORDERS = [
        { orderHash: "synthetic-root", follows: [] },
        { orderHash: "synthetic-child", follows: ["synthetic-root"] },
    ];
    const base = specSourceFromFixtures(["figaro-commerce", "figaro-geolocation", "figaro-applicable-law"]);
    /** A stranger's registration: the named spec's bytes with a changed title
     *  (and any further edits) — same clauseId and version, a different key. */
    const lookalike = (name: string, edit: (raw: Record<string, unknown>) => Record<string, unknown> = (r) => r): ProjectionSpecView =>
        viewOf(edit({ ...rawSpecOf(name), title: `${name} (a stranger's registration)` }));

    it("the SDK exports no rule that writes a clause into an agreement", () => {
        expect(Object.keys(sdk).filter((name) => name.toLowerCase().includes("mandatory"))).toEqual([]);
    });

    it("composes an agreement without the commerce clause, and nothing writes it in", () => {
        const { assembly, agreements } = buildProcessDesign({
            orders: ORDERS,
            clausesByOrderId: { "synthetic-root": { [keyOf("figaro-geolocation")]: {} }, "synthetic-child": { [keyOf("figaro-geolocation")]: { origin: "u4pru" } } },
            specs: base,
        });
        for (const entry of assembly.agreements) {
            expect(agreements[entry.agreementHash].clauses).toEqual({ [keyOf("figaro-geolocation")]: {} });
        }
    });

    it("composes the commerce clause as it composes any clause", () => {
        const { assembly, agreements } = buildProcessDesign({
            orders: ORDERS,
            clausesByOrderId: { "synthetic-root": COMMERCE, "synthetic-child": { ...COMMERCE, [keyOf("figaro-geolocation")]: { origin: "u4pru" } } },
            specs: base,
        });
        const [root, child] = assembly.agreements;
        expect(agreements[root.agreementHash].clauses).toEqual(COMMERCE);
        expect(agreements[child.agreementHash].clauses).toEqual({ ...COMMERCE, [keyOf("figaro-geolocation")]: {} });
    });

    it("composes a stranger's clause whose article is `mandatory` only where the designer composes it", () => {
        const theirs = lookalike("figaro-commerce", (r) => ({
            ...r,
            clauseId: "stranger-line-items",
            block: { ...(r.block as Record<string, unknown>), design: { ...((r.block as { design?: object }).design ?? {}), article: "mandatory" } },
        }));
        const specs = specSourceWithRegistrations(base, [theirs]);
        const without = buildProcessDesign({ orders: [ORDERS[0]], clausesByOrderId: { "synthetic-root": { [keyOf("figaro-geolocation")]: {} } }, specs });
        expect(without.agreements[without.assembly.agreements[0].agreementHash].clauses).toEqual({ [keyOf("figaro-geolocation")]: {} });
        const withIt = buildProcessDesign({ orders: [ORDERS[0]], clausesByOrderId: { "synthetic-root": { [theirs.clauseKey]: {} } }, specs });
        expect(withIt.agreements[withIt.assembly.agreements[0].agreementHash].clauses).toEqual({ [theirs.clauseKey]: {} });
    });

    it("refuses an agreement composing no clause, naming the agreement", () => {
        expect(() => buildProcessDesign({ orders: ORDERS, clausesByOrderId: {}, specs: base }))
            .toThrow(/the agreement: composes no clause/);
    });

    it("composes the key the design names, whatever else shares its name", () => {
        const fake = lookalike("figaro-geolocation");
        const specs = specSourceWithRegistrations(base, [fake]);
        const { assembly, agreements } = buildProcessDesign({
            orders: [ORDERS[0]],
            clausesByOrderId: { "synthetic-root": { [keyOf("figaro-geolocation")]: {} } },
            specs,
        });
        const composed = agreements[assembly.agreements[0].agreementHash].clauses;
        expect(composed).toHaveProperty(keyOf("figaro-geolocation"));
        expect(composed).not.toHaveProperty(fake.clauseKey);
    });

    it("a composed key whose spec is not loaded is a build error", () => {
        const unloaded = `0x${"77".repeat(32)}` as const;
        expect(() => buildProcessDesign({
            orders: [ORDERS[0]],
            clausesByOrderId: { "synthetic-root": { [unloaded]: {} } },
            specs: base,
        })).toThrow(new RegExp(`clause ${unloaded} is composed on an order but its spec is not loaded`));
        expect(() => buildProcessDesign({
            orders: [ORDERS[0]],
            clausesByOrderId: { "synthetic-root": COMMERCE },
            assemblyClauses: { [unloaded]: {} },
            specs: base,
        })).toThrow(new RegExp(`clause ${unloaded} is composed at the assembly level but its spec is not loaded`));
    });

    it("puts the topology's parents on each entry, and no topology in the registered agreement", () => {
        const { assembly, agreements } = buildProcessDesign({ orders: ORDERS, clausesByOrderId: { "synthetic-root": COMMERCE, "synthetic-child": COMMERCE }, specs: base });
        // Both agreements compose the same clauses, so they bind one agreement.
        expect(Object.keys(agreements)).toHaveLength(1);
        const [root, child] = assembly.agreements;
        expect(root.agreementHash).toBe(child.agreementHash);
        expect(agreements[root.agreementHash].clauses).toEqual(COMMERCE);
        expect(root).toMatchObject({ clauses: {}, follows: [] });
        expect(child).toMatchObject({ clauses: {}, follows: ["agreement-0"] });
        expect(agreementHashOf(agreements[root.agreementHash])).toBe(root.agreementHash);
        expect(root.agreementHash).toBe(agreementHashOf({ clauses: COMMERCE }));
    });

    it("binds a registered agreement as is, whatever it composes", () => {
        const registered = { name: "Registered", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-geolocation")]: {} } };
        const { assembly, agreements } = buildProcessDesign({
            orders: ORDERS,
            clausesByOrderId: { "synthetic-root": COMMERCE },
            registeredByOrderId: { "synthetic-child": registered },
            specs: base,
        });
        expect(assembly.agreements[1].agreementHash).toBe(agreementHashOf(registered));
        expect(assembly.agreements[1]).toMatchObject({ clauses: {}, follows: ["agreement-0"] });
        // Only the newly composed agreement is returned to register.
        expect(Object.keys(agreements)).toEqual([assembly.agreements[0].agreementHash]);
        // One order binding a registered agreement and composing clauses too is refused.
        expect(() => buildProcessDesign({
            orders: ORDERS,
            clausesByOrderId: { "synthetic-root": COMMERCE, "synthetic-child": { [keyOf("figaro-geolocation")]: {} } },
            registeredByOrderId: { "synthetic-child": registered },
            specs: base,
        })).toThrow(/choose one/);
    });
});

describe("buildOrderAgreement — every clause reads the spec its key names", () => {
    // A lookalike shares a name and version with the real clause and declares
    // another default; the real key's clause never takes it.
    const fake = viewOf({
        ...rawSpecOf("figaro-applicable-law"),
        title: "a stranger's registration",
        fields: (rawSpecOf("figaro-applicable-law").fields as { name: string }[]).map((f) =>
            (f.name === "language" ? { ...f, default: "xx" } : f)),
    });
    const real = specSourceFromFixtures(["figaro-applicable-law"]);
    const specs = specSourceWithRegistrations(real, [fake]);

    it("the real key signs the real spec's defaults, whatever else is loaded", () => {
        const clauses = { [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY" } };
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, clauses, specs);
        const clauseEntry = agreement.clauses.find((s) => s.clause === keyOf("figaro-applicable-law"))!;
        expect(clauseEntry.data?.language).not.toBe("xx");
        expect(checkoutHash).toBe(buildOrderAgreement(BUYER, SELLER, clauses, real).checkoutHash);
    });

    it("the lookalike's key signs the lookalike's defaults", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, { [fake.clauseKey]: { applicableLaw: "US-NY" } }, specs);
        expect(agreement.clauses[0].clause).toBe(fake.clauseKey);
        expect(agreement.clauses[0].data?.language).toBe("xx");
    });
});

describe("composeOrderAgreement — one agreement's registered agreement, on its own", () => {
    it("keys exactly what buildProcessDesign keys for the same composed clauses", () => {
        const clauses = { ...COMMERCE, [keyOf("figaro-geolocation")]: { ignored: "transaction particular" } };
        const alone = composeOrderAgreement({ clauses, specs: SPECS });
        const built = buildProcessDesign({
            orders: [{ orderHash: "synthetic-root", follows: [] }],
            clausesByOrderId: { "synthetic-root": clauses },
            specs: SPECS,
        });
        expect(built.assembly.agreements[0].agreementHash).toBe(alone.agreementHash);
        expect(built.agreements[alone.agreementHash]).toEqual(alone.composed);
    });

    it("keeps the composition value-free", () => {
        const { composed } = composeOrderAgreement({ clauses: { ...COMMERCE, [keyOf("figaro-geolocation")]: { origin: "u4pru" } }, specs: SPECS });
        expect(Object.keys(composed.clauses).sort()).toEqual([keyOf("figaro-commerce"), keyOf("figaro-geolocation")].sort());
        expect(composed.clauses[keyOf("figaro-geolocation")]).toEqual({});
    });

    it("refuses a composition of no clause, and composes one without commerce", () => {
        const bare = { [keyOf("figaro-geolocation")]: {} };
        expect(composeOrderAgreement({ clauses: bare, specs: SPECS }).composed.clauses).toEqual(bare);
        expect(composeOrderAgreement({ clauses: COMMERCE, specs: SPECS }).agreementHash).toBe(agreementHashOf({ clauses: COMMERCE }));
        // An empty composition's key is bytes32(0), which the registry refuses.
        expect(agreementHashOf({ clauses: {} })).toBe(`0x${"00".repeat(32)}`);
        expect(() => composeOrderAgreement({ clauses: {}, specs: SPECS })).toThrow(/composes no clause/);
    });

    it("refuses an assembly-scoped clause and a clause whose spec is not loaded", () => {
        expect(() => composeOrderAgreement({ clauses: { [keyOf("figaro-applicable-law")]: {} }, specs: SPECS }))
            .toThrow(/design\.scope "assembly"/);
        expect(() => composeOrderAgreement({ clauses: { [`0x${"ab".repeat(32)}`]: {} }, specs: SPECS }))
            .toThrow(/spec is not loaded/);
    });
});

describe("the sign gate's design check — the designer's values against the design the agreement names", () => {
    const DESIGN_SPECS = specSourceFromFixtures(["figaro-commerce", "figaro-consent", "figaro-property-transfer"]);
    const DOCS = [{ documentHash: `0x${"d0".repeat(32)}`, documentVersion: "1.0.0", documentTitle: "Terms of Service" }];
    // The designer's value of an ASSEMBLY-SCOPED clause with a design fill.
    const EVENTS = ["Sale of the consignment agreed mid-voyage, ownership passing at resolution"];
    const registered = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-consent")]: { documents: DOCS } } };
    const agreementHash = agreementHashOf(registered);
    const design: HydratedProcessDesign = {
        assembly: {
            assemblyClauses: { [keyOf("figaro-property-transfer")]: { anticipatedEvents: EVENTS } },
            agreements: [{ id: "agreement-0", agreementHash, clauses: {} }],
        },
        agreements: { [agreementHash.toLowerCase() as `0x${string}`]: registered },
    };
    const processDesignHash = processDesignHashOf(design.assembly);
    const instantiate = (consent: Record<string, unknown>, transfer: Record<string, unknown>, provenance = { agreementHash, processDesignHash }) => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-consent")]: consent,
            [keyOf("figaro-property-transfer")]: transfer,
        }, DESIGN_SPECS);
        const named = { ...agreement, provenance, follows: [] };
        return { agreement: named, checkoutHash: computeCheckoutHash(named) };
    };

    it("passes an agreement carrying the design's values", () => {
        const { agreement, checkoutHash } = instantiate({ documents: DOCS }, { anticipatedEvents: EVENTS });
        expect(validateCommitmentAgreement(agreement, checkoutHash, DESIGN_SPECS, COMMITMENT, design).ok).toBe(true);
    });

    it("refuses a designer value a party changed, agreement-scoped and assembly-scoped alike", () => {
        const forged = [{ ...DOCS[0], documentHash: `0x${"ee".repeat(32)}` }];
        const a = instantiate({ documents: forged }, { anticipatedEvents: EVENTS });
        expect(() => assertAgreementSignable(a.agreement, a.checkoutHash, DESIGN_SPECS, COMMITMENT, design))
            .toThrow(/figaro-consent documents: .*designer/);
        const b = instantiate({ documents: DOCS }, { anticipatedEvents: ["Another event"] });
        expect(() => assertAgreementSignable(b.agreement, b.checkoutHash, DESIGN_SPECS, COMMITMENT, design))
            .toThrow(/figaro-property-transfer anticipatedEvents: .*designer/);
    });

    it("refuses an order missing a clause of the registered agreement it names, agreement-scoped and assembly-scoped alike, by slug and full hash", () => {
        const { agreement: full } = instantiate({ documents: DOCS }, { anticipatedEvents: EVENTS });
        for (const dropped of ["figaro-consent", "figaro-property-transfer"]) {
            const short = { ...full, clauses: full.clauses.filter((s) => s.clause !== keyOf(dropped)) };
            const check = validateCommitmentAgreement(short, computeCheckoutHash(short), DESIGN_SPECS, COMMITMENT, design);
            expect(check.ok).toBe(false);
            expect(check.issues).toHaveLength(1);
            expect(() => assertAgreementSignable(short, computeCheckoutHash(short), DESIGN_SPECS, COMMITMENT, design))
                .toThrow(new RegExp(`${dropped} clause: the order does not carry this clause, which assembly ${deriveProcessDesignSlug(processDesignHash)} \\(${processDesignHash}\\) composes`));
        }
    });

    it("passes a process-log clause carried as an empty anchor, and refuses the order that drops it", () => {
        const LOG_SPECS = specSourceFromFixtures(["figaro-commerce", "figaro-merchant-process"]);
        const withLog = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-merchant-process")]: {} } };
        const logKey = agreementHashOf(withLog);
        const logDesign: HydratedProcessDesign = {
            assembly: { agreements: [{ id: "agreement-0", agreementHash: logKey, clauses: {} }] },
            agreements: { [logKey.toLowerCase() as `0x${string}`]: withLog },
        };
        const provenance = { agreementHash: logKey, processDesignHash: processDesignHashOf(logDesign.assembly) };
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-merchant-process")]: {},
        }, LOG_SPECS);
        const anchored = { ...agreement, provenance, follows: [] };
        expect(validateCommitmentAgreement(anchored, computeCheckoutHash(anchored), LOG_SPECS, COMMITMENT, logDesign).issues).toEqual([]);
        // Carried is a check on keys: a withheld clause and a clause whose
        // spec is not loaded each count as carried for the DESIGN check — and
        // each is refused by the content check, since the sign gate refuses
        // what it cannot read (the ruling): the design issue list stays empty
        // and the one issue names the clause's own fault.
        const withheld = { ...anchored, clauses: anchored.clauses.map((s) => s.clause === keyOf("figaro-merchant-process") ? withholdClauseContent(s) : s) };
        const withheldCheck = validateCommitmentAgreement(withheld, computeCheckoutHash(withheld), LOG_SPECS, COMMITMENT, logDesign);
        expect(withheldCheck.issues.map((i) => `${i.clause}:${i.path}`)).toEqual([`${keyOf("figaro-merchant-process")}:dataHash`]);
        expect(() => assertAgreementSignable(withheld, computeCheckoutHash(withheld), LOG_SPECS, COMMITMENT, logDesign)).toThrow(/content is withheld/);
        const commerceOnly = specSourceFromFixtures(["figaro-commerce"]);
        const unloadedCheck = validateCommitmentAgreement(anchored, computeCheckoutHash(anchored), commerceOnly, COMMITMENT, logDesign);
        expect(unloadedCheck.issues.map((i) => `${i.clause}:${i.path}`)).toEqual([`${keyOf("figaro-merchant-process")}:clause`]);
        expect(() => assertAgreementSignable(anchored, computeCheckoutHash(anchored), commerceOnly, COMMITMENT, logDesign)).toThrow(/spec is not loaded/);
        const dropped = { ...anchored, clauses: anchored.clauses.filter((s) => s.clause !== keyOf("figaro-merchant-process")) };
        expect(() => assertAgreementSignable(dropped, computeCheckoutHash(dropped), LOG_SPECS, COMMITMENT, logDesign))
            .toThrow(/figaro-merchant-process clause: the order does not carry this clause/);
    });

    it("refuses an order missing the commerce clause its agreement composes, as for any composed clause", () => {
        const built = buildProcessDesign({
            orders: [{ orderHash: "synthetic-root", follows: [] }],
            clausesByOrderId: { "synthetic-root": { ...COMMERCE, [keyOf("figaro-merchant-process")]: {} } },
            specs: SPECS,
        });
        const [entry] = built.assembly.agreements;
        const picked: HydratedProcessDesign = {
            assembly: built.assembly,
            agreements: { [entry.agreementHash.toLowerCase() as `0x${string}`]: built.agreements[entry.agreementHash] },
        };
        const provenance = { agreementHash: entry.agreementHash, processDesignHash: processDesignHashOf(built.assembly) };
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-merchant-process")]: {},
        }, SPECS);
        const full = { ...agreement, provenance, follows: [] };
        expect(validateCommitmentAgreement(full, computeCheckoutHash(full), SPECS, COMMITMENT, picked).issues).toEqual([]);
        const dropped = { ...full, clauses: full.clauses.filter((s) => s.clause !== keyOf("figaro-commerce")) };
        expect(() => assertAgreementSignable(dropped, computeCheckoutHash(dropped), SPECS, COMMITMENT, picked))
            .toThrow(/figaro-commerce clause: the order does not carry this clause/);
    });

    it("refuses, at each party's signature, a design-built agreement whose topology leaf is absent or not well formed", () => {
        const built = buildProcessDesign({
            orders: [{ orderHash: "synthetic-root", follows: [] }],
            clausesByOrderId: { "synthetic-root": COMMERCE },
            specs: SPECS,
        });
        const [entry] = built.assembly.agreements;
        const picked: HydratedProcessDesign = {
            assembly: built.assembly,
            agreements: { [entry.agreementHash.toLowerCase() as `0x${string}`]: built.agreements[entry.agreementHash] },
        };
        const provenance = { agreementHash: entry.agreementHash, processDesignHash: processDesignHashOf(built.assembly) };
        const { agreement } = buildOrderAgreement(BUYER, SELLER, { [keyOf("figaro-commerce")]: commerceData() }, SPECS);
        const issuesOf = (follows: unknown) => {
            const a = { ...agreement, provenance, ...(follows === undefined ? {} : { follows }) } as Agreement;
            let root: `0x${string}`;
            try { root = computeCheckoutHash(a); } catch { root = `0x${"00".repeat(32)}`; }
            return validateCommitmentAgreement(a, root, SPECS, COMMITMENT, picked).issues;
        };
        expect(issuesOf([])).toEqual([]);
        const absent = issuesOf(undefined);
        expect(absent.map((i) => `${i.clause}:${i.path}`)).toEqual(["(topology):follows"]);
        expect(absent[0].message).toMatch(/carries no topology leaf/);
        expect(issuesOf(["0x1234"]).map((i) => i.message).join(" ")).toMatch(/not a 32-byte order hash/);
        expect(issuesOf([`0x${"a1".repeat(32)}`, `0x${"A1".repeat(32)}`]).map((i) => i.message).join(" ")).toMatch(/twice/);
        expect(issuesOf("0xab").map((i) => i.message).join(" ")).toMatch(/not a list/);
        expect(() => assertAgreementSignable({ ...agreement, provenance } as Agreement, computeCheckoutHash({ ...agreement, provenance }), SPECS, COMMITMENT, picked))
            .toThrow(/carries no topology leaf/);
        // An agreement built without a design may omit the leaf, as it omits provenance.
        expect(validateCommitmentAgreement(agreement, computeCheckoutHash(agreement), SPECS, COMMITMENT, null).issues).toEqual([]);
    });

    it("refuses, at each party's signature, an order whose signed edges depart in number from every design entry of its registered agreement", () => {
        // root → child → grandchild, the grandchild also following the root.
        // The root and the grandchild bind one registered agreement (commerce
        // alone), with zero and two edges; the child binds another, with one.
        const LOG = keyOf("figaro-merchant-process");
        const built = buildProcessDesign({
            orders: [
                { orderHash: "root", follows: [] },
                { orderHash: "child", follows: ["root"] },
                { orderHash: "grandchild", follows: ["root", "child"] },
            ],
            clausesByOrderId: {
                root: COMMERCE,
                child: { ...COMMERCE, [LOG]: {} },
                grandchild: COMMERCE,
            },
            specs: SPECS,
        });
        const [rootEntry, childEntry, grandchildEntry] = built.assembly.agreements;
        expect(rootEntry.agreementHash).toBe(grandchildEntry.agreementHash);
        const picked: HydratedProcessDesign = { assembly: built.assembly, agreements: built.agreements };
        const processDesignHash = processDesignHashOf(built.assembly);
        const edge = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(32)}` as `0x${string}`;
        const orderFor = (agreementHash: `0x${string}`, clauses: Record<string, Record<string, unknown>>, follows: `0x${string}`[]) => {
            const { agreement } = buildOrderAgreement(BUYER, SELLER, clauses, SPECS);
            const signed: Agreement = { ...agreement, provenance: { agreementHash, processDesignHash }, follows };
            return { signed, root: computeCheckoutHash(signed) };
        };
        const commerceOnly = { [keyOf("figaro-commerce")]: commerceData() };
        const withLog = { ...commerceOnly, [LOG]: {} };
        // An order that follows another joins its process; one that follows
        // none is signed here as the opening order.
        const commitmentOf = (o: { signed: Agreement }) => (o.signed.follows?.length ? JOINING_COMMITMENT : COMMITMENT);
        const issuesOf = (o: { signed: Agreement; root: `0x${string}` }) =>
            validateCommitmentAgreement(o.signed, o.root, SPECS, commitmentOf(o), picked).issues;

        // The design's edge count for each entry passes: commerce alone is the
        // root with none or the grandchild with two; the child has one.
        expect(issuesOf(orderFor(rootEntry.agreementHash, commerceOnly, []))).toEqual([]);
        expect(issuesOf(orderFor(rootEntry.agreementHash, commerceOnly, [edge(1), edge(2)]))).toEqual([]);
        expect(issuesOf(orderFor(childEntry.agreementHash, withLog, [edge(1)]))).toEqual([]);

        // Any other count matches no entry of that registered agreement.
        for (const [agreementHash, clauses, follows] of [
            [rootEntry.agreementHash, commerceOnly, [edge(1)]],
            [rootEntry.agreementHash, commerceOnly, [edge(1), edge(2), edge(3)]],
            [childEntry.agreementHash, withLog, []],
            [childEntry.agreementHash, withLog, [edge(1), edge(2)]],
        ] as const) {
            const o = orderFor(agreementHash, clauses, [...follows]);
            const issues = issuesOf(o);
            expect(issues.map((i) => `${i.clause}:${i.path}`)).toEqual(["(topology):follows"]);
            expect(issues[0].message).toMatch(new RegExp(`follows ${follows.length} order`));
            expect(() => assertAgreementSignable(o.signed, o.root, SPECS, commitmentOf(o), picked))
                .toThrow(/\(topology\) follows: .*the design gives/);
        }
    });

    it("refuses a commitment that opens a process (processId zero) and names any order it follows", () => {
        const built = buildProcessDesign({
            orders: [
                { orderHash: "root", follows: [] },
                { orderHash: "child", follows: ["root"] },
            ],
            clausesByOrderId: { root: COMMERCE, child: COMMERCE },
            specs: SPECS,
        });
        const [, childEntry] = built.assembly.agreements;
        const picked: HydratedProcessDesign = { assembly: built.assembly, agreements: built.agreements };
        const { agreement } = buildOrderAgreement(BUYER, SELLER, { [keyOf("figaro-commerce")]: commerceData() }, SPECS);
        const signed: Agreement = {
            ...agreement,
            provenance: { agreementHash: childEntry.agreementHash, processDesignHash: processDesignHashOf(built.assembly) },
            follows: [`0x${"a1".repeat(32)}`],
        };
        const root = computeCheckoutHash(signed);
        // Joining the process, the edge matches the child's entry.
        expect(validateCommitmentAgreement(signed, root, SPECS, JOINING_COMMITMENT, picked).issues).toEqual([]);
        // Opening one, any edge is refused, with no design in hand as with one.
        const opening = validateCommitmentAgreement(signed, root, SPECS, COMMITMENT, picked).issues;
        expect(opening.map((i) => `${i.clause}:${i.path}`)).toEqual(["(topology):follows"]);
        expect(opening[0].message).toMatch(/opens a process \(processId zero\).*names 1/);
        expect(() => assertAgreementSignable(signed, root, SPECS, COMMITMENT, picked)).toThrow(/opens a process/);
        const bare: Agreement = { ...agreement, follows: [`0x${"a1".repeat(32)}`] };
        expect(validateCommitmentAgreement(bare, computeCheckoutHash(bare), SPECS, COMMITMENT, null).issues.map((i) => i.message).join(" "))
            .toMatch(/opens a process/);
        expect(validateCommitmentAgreement(bare, computeCheckoutHash(bare), SPECS, JOINING_COMMITMENT, null).issues).toEqual([]);
    });

    describe("followedOrderIssues — the counter-signer's own read of the orders an agreement follows", () => {
        // root → child → grandchild, the grandchild following both. The root
        // and the grandchild bind commerce alone; the child binds commerce
        // with a process log.
        const LOG = keyOf("figaro-merchant-process");
        const built = buildProcessDesign({
            orders: [
                { orderHash: "root", follows: [] },
                { orderHash: "child", follows: ["root"] },
                { orderHash: "grandchild", follows: ["root", "child"] },
            ],
            clausesByOrderId: { root: COMMERCE, child: { ...COMMERCE, [LOG]: {} }, grandchild: COMMERCE },
            specs: SPECS,
        });
        const [rootEntry, childEntry, grandchildEntry] = built.assembly.agreements;
        const design: HydratedProcessDesign = { assembly: built.assembly, agreements: built.agreements };
        const processDesignHash = processDesignHashOf(built.assembly);
        const PROCESS = JOINING_COMMITMENT.processId;
        const ROOT_ORDER = `0x${"01".repeat(32)}` as const;
        const CHILD_ORDER = `0x${"02".repeat(32)}` as const;
        const STRAY_ORDER = `0x${"03".repeat(32)}` as const;
        const instantiating = (agreementHash: `0x${string}`, follows: `0x${string}`[] = [], hash = processDesignHash): Agreement => ({
            version: "a1", buyer: BUYER, seller: SELLER, clauses: [],
            provenance: { agreementHash, processDesignHash: hash }, follows,
        });
        const reads = [
            { orderHash: ROOT_ORDER, processId: PROCESS, agreement: instantiating(rootEntry.agreementHash) },
            { orderHash: CHILD_ORDER, processId: PROCESS, agreement: instantiating(childEntry.agreementHash, [ROOT_ORDER]) },
        ];
        const grandchild = (follows: `0x${string}`[]) => instantiating(grandchildEntry.agreementHash, follows);

        it("passes edges that name the design entry's parents, in its order, in the process the order joins", () => {
            expect(sdk.followedOrderIssues(grandchild([ROOT_ORDER, CHILD_ORDER]), JOINING_COMMITMENT, design, reads)).toEqual([]);
            expect(sdk.followedOrderIssues(instantiating(childEntry.agreementHash, [ROOT_ORDER]), JOINING_COMMITMENT, design, reads)).toEqual([]);
        });

        it("refuses an order whose edges differ from its design entry's", () => {
            const swapped = sdk.followedOrderIssues(grandchild([CHILD_ORDER, ROOT_ORDER]), JOINING_COMMITMENT, design, reads);
            expect(swapped.map((i) => i.path)).toEqual(["follows.0", "follows.1"]);
            expect(swapped[0].message).toMatch(/the design's entry follows agreement-0 at this place/);
            // A child naming the grandchild's sibling place: the child follows the child.
            const self = sdk.followedOrderIssues(instantiating(childEntry.agreementHash, [CHILD_ORDER]), JOINING_COMMITMENT, design, reads);
            expect(self.map((i) => i.path)).toEqual(["follows.0"]);
        });

        it("refuses an edge the chain records as no order, an order of another process, and one whose agreement was not read", () => {
            const unknown = sdk.followedOrderIssues(grandchild([ROOT_ORDER, STRAY_ORDER]), JOINING_COMMITMENT, design, reads);
            expect(unknown.map((i) => i.message).join(" ")).toMatch(/records as no committed order/);
            const elsewhere = [...reads, { orderHash: STRAY_ORDER, processId: `0x${"ee".repeat(32)}` as `0x${string}`, agreement: reads[1].agreement }];
            expect(sdk.followedOrderIssues(grandchild([ROOT_ORDER, STRAY_ORDER]), JOINING_COMMITMENT, design, elsewhere).map((i) => i.message).join(" "))
                .toMatch(/committed in process 0xee.*joins process/);
            const unread = [reads[0], { ...reads[1], agreement: null }];
            expect(sdk.followedOrderIssues(grandchild([ROOT_ORDER, CHILD_ORDER]), JOINING_COMMITMENT, design, unread).map((i) => i.message).join(" "))
                .toMatch(/agreement was not read/);
        });

        it("refuses an edge naming an order of another assembly", () => {
            const foreign = [reads[0], { ...reads[1], agreement: instantiating(childEntry.agreementHash, [ROOT_ORDER], `0x${"cd".repeat(32)}`) }];
            expect(sdk.followedOrderIssues(grandchild([ROOT_ORDER, CHILD_ORDER]), JOINING_COMMITMENT, design, foreign).map((i) => i.message).join(" "))
                .toMatch(/instantiates assembly 0xcdcd/);
        });

        it("leaves to the sign gate what it holds: no design, no provenance, a count no entry has", () => {
            expect(sdk.followedOrderIssues(grandchild([STRAY_ORDER, STRAY_ORDER]), JOINING_COMMITMENT, null, [])).toEqual([]);
            expect(sdk.followedOrderIssues({ ...grandchild([STRAY_ORDER]), provenance: undefined }, JOINING_COMMITMENT, design, [])).toEqual([]);
            expect(sdk.followedOrderIssues(grandchild([STRAY_ORDER, STRAY_ORDER, STRAY_ORDER]), JOINING_COMMITMENT, design, [])).toEqual([]);
        });
    });

    it("refuses an order carrying a clause the design does not compose — a registered one with content, and an unregistered one withheld", () => {
        const { agreement } = instantiate({ documents: DOCS }, { anticipatedEvents: EVENTS });
        // A clause of a REGISTERED spec the design never composed, well-formed
        // (a process log's empty anchor), so the one issue is the design's.
        const withLog = specSourceOf([...DESIGN_SPECS.list(), viewOf(rawSpecOf("figaro-merchant-process"))]);
        const extra = {
            ...agreement,
            clauses: [...agreement.clauses, { clause: keyOf("figaro-merchant-process"), data: {} }],
        };
        const extraCheck = validateCommitmentAgreement(extra, computeCheckoutHash(extra), withLog, COMMITMENT, design);
        expect(extraCheck.ok).toBe(false);
        expect(extraCheck.issues.map((i) => `${i.clause}:${i.path}`)).toEqual([`${keyOf("figaro-merchant-process")}:clause`]);
        expect(() => assertAgreementSignable(extra, computeCheckoutHash(extra), withLog, COMMITMENT, design))
            .toThrow(/the order carries this clause, which assembly .* does not compose/);
        // A content-withheld leaf under a key no registry knows: nothing to
        // validate, nothing to show, and not the design's — refused by the
        // same rule, before any spec is asked for.
        const stray = { ...agreement, clauses: [...agreement.clauses, { clause: `0x${"ab".repeat(32)}` as const, dataHash: `0x${"cd".repeat(32)}` as const }] };
        const strayCheck = validateCommitmentAgreement(stray, computeCheckoutHash(stray), DESIGN_SPECS, COMMITMENT, design);
        expect(strayCheck.ok).toBe(false);
        // Two faults, each named: the leaf is withheld (unreadable at sign), and the design does not compose it.
        expect(strayCheck.issues.map((i) => i.path)).toEqual(["dataHash", "clause"]);
        expect(() => assertAgreementSignable(stray, computeCheckoutHash(stray), DESIGN_SPECS, COMMITMENT, design))
            .toThrow(/does not compose/);
    });

    it("refuses a design that is not the one the agreement's provenance names", () => {
        const { agreement, checkoutHash } = instantiate({ documents: DOCS }, { applicableLaw: "England-Wales" },
            { agreementHash, processDesignHash: `0x${"5e".repeat(32)}` });
        expect(() => assertAgreementSignable(agreement, checkoutHash, DESIGN_SPECS, COMMITMENT, design))
            .toThrow(/provenance/);
    });

    it("refuses an agreement naming no design when a design is supplied", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, { [keyOf("figaro-commerce")]: commerceData() }, DESIGN_SPECS);
        expect(() => assertAgreementSignable(agreement, computeCheckoutHash(agreement), DESIGN_SPECS, COMMITMENT, design))
            .toThrow(/provenance/);
    });
});

describe("the sign gate and the blinding value of a private clause", () => {
    const BLINDING = { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true };
    /** A private clause no one has seen; `block` carries the fill lists under test. */
    const privateRaw = (clauseId: string, block?: Record<string, unknown>) => ({
        clauseId, version: 1, title: "Private", description: "A private value of few possibilities.",
        fields: [{ name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" }, BLINDING],
        ...(block !== undefined && { block }),
    });
    const ONE = viewOf(privateRaw("test-private-one"));
    const TWO = viewOf(privateRaw("test-private-two"));
    const value = (byte: string) => `0x${byte.repeat(32)}`;
    const gate = (specs: SpecSource, clauses: Record<`0x${string}`, Record<string, unknown>>) => {
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, clauses, specs);
        return validateCommitmentAgreement(agreement, checkoutHash, specs, COMMITMENT, null);
    };

    it("passes a private clause whose blinding value is fresh", () => {
        const check = gate(specSourceOf([ONE]), { [ONE.clauseKey]: { grade: "b", blinding: value("3c") } });
        expect(check.issues).toEqual([]);
    });

    it("checks the content of a clause whose block says article attestations and whose spec does not declare emptyAnchor: block is presentation", () => {
        const LOG = viewOf(privateRaw("test-private-log", { design: { article: "attestations" } }));
        const specs = specSourceOf([LOG]);
        // Content with no blinding value is refused, and so is a zero one.
        const missing = gate(specs, { [LOG.clauseKey]: { grade: "b" } });
        expect(missing.ok).toBe(false);
        expect(missing.issues).toEqual([expect.objectContaining({ clause: LOG.clauseKey, path: "$.blinding" })]);
        const zero = gate(specs, { [LOG.clauseKey]: { grade: "b", blinding: value("00") } });
        expect(zero.issues).toEqual([expect.objectContaining({ clause: LOG.clauseKey, path: "blinding", message: expect.stringMatching(/zero/) })]);
        // The article admits no empty anchor: `{}` is validated over the
        // fields like any content, and its required fields are missing.
        const empty = gate(specs, { [LOG.clauseKey]: {} });
        expect(empty.ok).toBe(false);
        expect(empty.issues.map((i) => i.path).sort()).toEqual(["$.blinding", "$.grade"]);
    });

    it("accepts the empty anchor for a stranger's clause that declares emptyAnchor under another article, and refuses any content for it", () => {
        const PORT = viewOf({
            clauseId: "harbor-port-calls", version: 3, title: "Port calls", description: "A vessel's port calls, attested as they happen.",
            fields: [{ name: "call", type: "enum", values: ["arrived", "berthed", "sailed"], required: true }],
            stages: { "1": [{ name: "berth", type: "string", required: true }] },
            emptyAnchor: true,
            block: { design: { article: "harbor-log" } },
        });
        expect(PORT.emptyAnchor).toBe(true);
        const specs = specSourceOf([PORT]);
        expect(gate(specs, { [PORT.clauseKey]: {} }).issues).toEqual([]);
        const content = gate(specs, { [PORT.clauseKey]: { call: "arrived" } });
        expect(content.ok).toBe(false);
        expect(content.issues).toEqual([expect.objectContaining({ clause: PORT.clauseKey, path: "$", message: expect.stringMatching(/emptyAnchor/) })]);
        // The tooling leaves the empty anchor as it is: no default, no blinding.
        expect(withSpecDefaults(specs, PORT.clauseKey, {})).toEqual({});
        expect(withClauseBlinding(specs, PORT.clauseKey, {})).toEqual({});
    });

    it.each([
        ["block.design.fills", { design: { article: "terms", fills: ["blinding"] } }],
        ["block.checkout.catalogueFills", { design: { article: "terms" }, checkout: { catalogueFills: ["blinding"] } }],
        ["block.checkout.profileFills", { design: { article: "terms" }, checkout: { profileFills: ["blinding"] } }],
        ["block.checkout.catalogueMeasures", { design: { article: "terms" }, checkout: { catalogueMeasures: { blinding: { from: "massGrams", combine: "sum" } } } }],
    ])("refuses a blinding field named in %s: its value would be public and the same in every order", (list, block) => {
        const named = viewOf(privateRaw("test-private-named", block));
        const check = gate(specSourceOf([named]), { [named.clauseKey]: { grade: "b", blinding: value("3c") } });
        expect(check.ok).toBe(false);
        const issue = check.issues.find((i) => i.path === "blinding");
        expect(issue?.clause).toBe(named.clauseKey);
        expect(issue?.message).toContain(list);
        expect(issue?.message).toMatch(/party that fills/);
    });

    it("refuses a zero blinding value", () => {
        const check = gate(specSourceOf([ONE]), { [ONE.clauseKey]: { grade: "b", blinding: value("00") } });
        expect(check.ok).toBe(false);
        expect(check.issues).toEqual([expect.objectContaining({ clause: ONE.clauseKey, path: "blinding", message: expect.stringMatching(/zero.*draw a fresh/) })]);
    });

    it("refuses two clauses of one agreement that share a blinding value", () => {
        const shared = value("3c");
        const check = gate(specSourceOf([ONE, TWO]), {
            [ONE.clauseKey]: { grade: "b", blinding: shared },
            [TWO.clauseKey]: { grade: "a", blinding: shared.toUpperCase().replace("0X", "0x") },
        });
        expect(check.ok).toBe(false);
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0]).toEqual(expect.objectContaining({ path: "blinding", message: expect.stringMatching(/same blinding value.*draw a fresh/) }));
    });

    it("the public form keeps the checkoutHash, withholds the blinding value with the clause, and its dataHash covers the value", () => {
        const specs = specSourceOf([ONE]);
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, { [ONE.clauseKey]: { grade: "b", blinding: value("3c") } }, specs);
        const pinned = publicForm(agreement, specs);
        expect(computeCheckoutHash(pinned)).toBe(checkoutHash);
        expect(pinned.clauses[0].data).toBeUndefined();
        expect(JSON.stringify(pinned)).not.toContain("3c3c");
        expect(pinned.clauses[0].dataHash).toBe(hashClauseData(agreement.clauses[0]));
        const other = buildOrderAgreement(BUYER, SELLER, { [ONE.clauseKey]: { grade: "b", blinding: value("4d") } }, specs);
        expect(hashClauseData(other.agreement.clauses[0])).not.toBe(pinned.clauses[0].dataHash);
    });
});
