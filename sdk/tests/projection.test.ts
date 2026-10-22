/**
 * Agreement projection — the off-chain validation sign gate (`assertAgreementSignable`,
 * the ONE thrower every signature routes through) and the golden-vector
 * byte-exactness of `buildOrderAgreement` + `buildAssembly`.
 *
 * The SpecSource is built from the canonical off-chain specs (`clauses/*.json`)
 * via `parseClauseSpec` + `parseProjectionHints` — the same construction any
 * consumer performs on registry-fetched spec JSON. (The frontend's cache
 * adapter does exactly this against ClauseRegistry → IPFS.)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    agreementHashOf,
    assemblyHashOf,
    assertAgreementSignable,
    buildAssembly,
    composeOrderAgreement,
    mandatoryClauses,
    deriveAssemblySlug,
    withholdClauseContent,
    buildOrderAgreement,
    canonicalize,
    computeCheckoutHash,
    publicForm,
    clauseByField,
    hashClauseData,
    serializeAssembly,
    specHasPrivateField,
    validateCommitmentAgreement,
    warnProcessLogFillsTrap,
    type HydratedAssembly,
    type ProjectionSpecView,
    type SpecSource,
} from "../src/index.js";
import { keyOf, rawSpecOf, specSourceFromFixtures, specSourceOf, specSourceWithRegistrations, viewOf } from "./specFixtures.js";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;
/** The DAO's wallet, the registrant of the mandatory clauses. */
const DAO = "0xFa648187d49B04fb093266DB0d49e57B3B2403A3" as const;
const STRANGER = "0x1111111111111111111111111111111111111111" as const;
/** The commitment currency the golden vectors' commerce leaf mirrors — the
 *  same token the frozen CommitmentPayload envelope signs. */
const CURRENCY = "0x0000000000000000000000000000000000000001" as const;
const OTHER_TOKEN = "0x0000000000000000000000000000000000000002" as const;
/** The commitment's mirrored pair (currency + payment) the gate asserts the
 *  leaves against — matching the fixtures' commerce leaf below. */
const STRUCT = { currency: CURRENCY, payment: 1n };
const OTHER_STRUCT = { currency: OTHER_TOKEN, payment: 1n };

const SPECS = specSourceFromFixtures([
    "figaro-commerce",
    "figaro-topology",
    "figaro-applicable-law",
    "figaro-geolocation",
    "figaro-merchant-process",
    "figaro-utility-token",
]);

/** The mandatory clauses the canvas writes into every agreement: the DAO's
 *  live commerce and topology (`mandatoryClauses`), clauseKey → `{}`. */
const MANDATORY = { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {} };

function commerceData() {
    return {
        currency: CURRENCY,
        payment: "1",
        lineItems: [{ itemId: "item-1", name: "Test item", quantity: 1, unitPrice: "1" }],
    };
}

describe("assertAgreementSignable — the shared sign gate", () => {
    it("passes a conforming agreement whose hash matches its merkle root", () => {
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY", forum: "us-federal-court" },
        }, SPECS);
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, STRUCT, null)).not.toThrow();
    });

    it("signs the provenance leaf under the root and refuses a provenance that is not two 32-byte keys", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, { [keyOf("figaro-commerce")]: commerceData() }, SPECS);
        const registered = { clauses: { [keyOf("figaro-commerce")]: {} } };
        const agreementHash = agreementHashOf(registered);
        const design: HydratedAssembly = {
            assembly: { agreements: [{ id: "order-0", agreementHash, clauses: {} }] },
            agreements: { [agreementHash.toLowerCase() as `0x${string}`]: registered },
        };
        const named = { ...agreement, provenance: { agreementHash, assemblyHash: assemblyHashOf(design.assembly) } };
        expect(() => assertAgreementSignable(named, computeCheckoutHash(named), SPECS, STRUCT, design)).not.toThrow();
        // The root without the provenance leaf is not this agreement's.
        expect(() => assertAgreementSignable(named, computeCheckoutHash(agreement), SPECS, STRUCT, design)).toThrow(/merkle/);
        // An agreement naming a design no one read is refused.
        expect(() => assertAgreementSignable(named, computeCheckoutHash(named), SPECS, STRUCT, null)).toThrow(/was not read/);
        const malformed = { ...agreement, provenance: { agreementHash: `0x${"6f".repeat(32)}`, assemblyHash: "0x5e" } as const };
        expect(() => assertAgreementSignable(malformed, computeCheckoutHash(agreement), SPECS, STRUCT, null))
            .toThrow(/32-byte/);
    });

    it("throws on a clause violating its clause spec, naming clause + path", () => {
        // Prose fails applicable-law's jurisdiction-token pattern — the exact
        // shape a counter-signer must refuse even when the hash matches.
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: { applicableLaw: "State of New York, USA" },
        }, SPECS);
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, STRUCT, null))
            .toThrow(/figaro-applicable-law \$\.applicableLaw/);
    });

    it("throws when the hash being signed is not the agreement's merkle root", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
        }, SPECS);
        const wrongHash = `0x${"ab".repeat(32)}` as `0x${string}`;
        expect(() => assertAgreementSignable(agreement, wrongHash, SPECS, STRUCT, null))
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
        const check = validateCommitmentAgreement(agreement, checkoutHash, SPECS, STRUCT, null);
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
        const check = validateCommitmentAgreement(evil, anyHash, SPECS, STRUCT, null);
        expect(check.ok).toBe(false);
        expect(check.issues.some((i) => i.path === "dataHash" && /both/.test(i.message))).toBe(true);
        expect(() => assertAgreementSignable(evil, anyHash, SPECS, STRUCT, null))
            .toThrow(/both plaintext data and a dataHash/);
    });
});

describe("the sign gate's denomination chain — pin == leaf == struct", () => {
    // Every term is a merkle leaf; the FigaroCore struct is the EXECUTION mirror
    // of the currency term, so the gate asserts the copy across the two layers
    // (docs/CLAUSES.md § "Every clause is a merkle leaf").
    const build = (clauses: Record<string, Record<string, unknown>>) =>
        buildOrderAgreement(BUYER, SELLER, clauses, SPECS);

    it("passes when the commerce leaf equals the commitment's currency", () => {
        const { agreement, checkoutHash } = build({ [keyOf("figaro-commerce")]: commerceData() });
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, STRUCT, null)).not.toThrow();
    });

    it("throws when the leaf and the struct name different tokens", () => {
        const { agreement, checkoutHash } = build({ [keyOf("figaro-commerce")]: commerceData() });
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, OTHER_STRUCT, null))
            .toThrow(/figaro-commerce currency: the signed term names .* contradicts it/);
    });

    it("compares the leaf case-insensitively — an address is not a string", () => {
        const { agreement, checkoutHash } = build({
            [keyOf("figaro-commerce")]: { ...commerceData(), currency: "0x000000000000000000000000000000000000000A" },
        });
        expect(() => assertAgreementSignable(
            agreement, checkoutHash, SPECS, { currency: "0x000000000000000000000000000000000000000a", payment: 1n }, null,
        )).not.toThrow();
    });

    it("passes an unpinned assembly: the commerce leaf alone carries the term", () => {
        const { agreement, checkoutHash } = build({
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-topology")]: { parentOrderHashes: [] },
        });
        const check = validateCommitmentAgreement(agreement, checkoutHash, SPECS, STRUCT, null);
        expect(check.ok).toBe(true);
    });

    it("passes a pinned assembly whose pin, leaf and struct all match", () => {
        const { agreement, checkoutHash } = build({
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-utility-token")]: { currency: CURRENCY },
        });
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, STRUCT, null)).not.toThrow();
    });

    it("throws when the pin contradicts the commerce leaf", () => {
        const { agreement, checkoutHash } = build({
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-utility-token")]: { currency: OTHER_TOKEN },
        });
        expect(() => assertAgreementSignable(agreement, checkoutHash, SPECS, STRUCT, null))
            .toThrow(/figaro-utility-token currency: this assembly is denominated by design/);
    });

    it("throws when the payment leaf and the struct disagree — payment mirrors like currency", () => {
        const { agreement, checkoutHash } = build({ [keyOf("figaro-commerce")]: commerceData() });
        expect(() => assertAgreementSignable(
            agreement, checkoutHash, SPECS, { currency: CURRENCY, payment: 1000n }, null,
        )).toThrow(/figaro-commerce payment: the signed term names 1 as the payment; the commitment payment 1000 contradicts it/);
    });

    it("reports a malformed payment leaf as its own spec failure, never a mismatch", () => {
        const { agreement, checkoutHash } = build({
            [keyOf("figaro-commerce")]: { ...commerceData(), payment: "not-a-number" },
        });
        const check = validateCommitmentAgreement(agreement, checkoutHash, SPECS, STRUCT, null);
        expect(check.ok).toBe(false);
        expect(check.issues.some((i) => i.message.includes("commitment payment"))).toBe(false);
    });

    it("reports a missing leaf as the ordinary required-field failure, not a mismatch", () => {
        const { agreement, checkoutHash } = build({
            [keyOf("figaro-commerce")]: { payment: "1", lineItems: [] },
        });
        const check = validateCommitmentAgreement(agreement, checkoutHash, SPECS, STRUCT, null);
        expect(check.ok).toBe(false);
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].message).toMatch(/required/i);
    });
});

describe("projection — golden-vector byte-exactness", () => {
    const vectors = JSON.parse(
        readFileSync(path.resolve(__dirname, "fixtures/promotion-golden-vectors.json"), "utf8"),
    ) as {
        agreementProjection: {
            defaults: { canonicalAgreement: string; checkoutHash: string };
            processLog: { canonicalAgreement: string; checkoutHash: string };
        };
        assembly: { canonicalJson: string; assemblyHash: string; agreements: Record<string, string> };
    };

    it("spec-default injection reproduces the frozen agreement + hash", () => {
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-topology")]: { parentOrderHashes: [] },
            [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY", forum: "us-federal-court" },
        }, SPECS);
        expect(canonicalize(agreement)).toBe(vectors.agreementProjection.defaults.canonicalAgreement);
        expect(checkoutHash).toBe(vectors.agreementProjection.defaults.checkoutHash);
    });

    it("the process-log empty anchor reproduces the frozen agreement + hash", () => {
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-topology")]: { parentOrderHashes: [] },
            [keyOf("figaro-merchant-process")]: {},
        }, SPECS);
        expect(canonicalize(agreement)).toBe(
            vectors.agreementProjection.processLog.canonicalAgreement,
        );
        expect(checkoutHash).toBe(vectors.agreementProjection.processLog.checkoutHash);
    });

    it("the mandatory clauses + relabeling + assembly terms reproduce the frozen assembly + assemblyHash", () => {
        // figaro-applicable-law is ASSEMBLY-SCOPED (design.scope: "assembly")
        // with no design fill: the designer composes it with no values and the
        // buyer fills it at checkout, so the assembly carries the clause under
        // its key with an empty value, and that is what the frozen output holds.
        const built = buildAssembly({
            name: "Golden Vector Chain",
            orders: [
                { orderHash: "synthetic-root", parentOrderHashes: [] },
                { orderHash: "synthetic-child", parentOrderHashes: ["synthetic-root"] },
            ],
            clausesByOrderId: {},
            assemblyClauses: { [keyOf("figaro-applicable-law")]: {} },
            mandatory: MANDATORY,
            specs: SPECS,
        });
        const assembly = serializeAssembly(built.assembly);
        expect(assembly.json).toBe(vectors.assembly.canonicalJson);
        expect(assembly.assemblyHash).toBe(vectors.assembly.assemblyHash);
        expect(Object.fromEntries(Object.entries(built.agreements).map(([k, v]) => [k, canonicalize(v)])))
            .toEqual(vectors.assembly.agreements);
    });

    it("refuses wrong-level composition (scope verification)", () => {
        // An assembly-scoped clause on an order is a BUILD error, never a
        // silent no-op…
        expect(() => buildAssembly({
            orders: [{ orderHash: "synthetic-root", parentOrderHashes: [] }],
            clausesByOrderId: { "synthetic-root": { [keyOf("figaro-applicable-law")]: {} } },
            mandatory: MANDATORY,
            specs: SPECS,
        })).toThrow(/design\.scope "assembly"/);
        // …and an agreement-scoped clause at the assembly level likewise.
        expect(() => buildAssembly({
            orders: [{ orderHash: "synthetic-root", parentOrderHashes: [] }],
            clausesByOrderId: {},
            assemblyClauses: { [keyOf("figaro-geolocation")]: {} },
            mandatory: MANDATORY,
            specs: SPECS,
        })).toThrow(/does not declare design\.scope "assembly"/);
    });

    it("clauseByField reads by declared field, with data-key fallback while unloaded", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-topology")]: { parentOrderHashes: ["0xabc"] },
        }, SPECS);
        expect(clauseByField(agreement, "parentOrderHashes", SPECS)?.clause).toBe(keyOf("figaro-topology"));
        // The uncached path: an empty SpecSource falls back to data-key presence.
        const empty: SpecSource = { get: () => undefined, list: () => [] };
        expect(clauseByField(agreement, "parentOrderHashes", empty)?.clause).toBe(keyOf("figaro-topology"));
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
});

describe("warnProcessLogFillsTrap — the reserved 'attestations' article trap", () => {
    // A synthetic field + hints view, mirroring the specView() helper above but
    // parameterized on the hash-load-bearing `hints` under test.
    const specView = (
        clauseId: string,
        hints: ProjectionSpecView["hints"],
    ): ProjectionSpecView => ({
        clauseId,
        version: 1,
        fields: [{ name: "eventType", required: true, type: "string" as const }],
        ...(hints !== undefined && { hints }),
    });

    it("warns nothing for a real process-log clause with no fills — the shipped shape", () => {
        // figaro-merchant-process / figaro-courier-process: article "attestations",
        // design.fills / checkout.*Fills all empty.
        const spec = specView("figaro-merchant-process", { article: "attestations" });
        expect(warnProcessLogFillsTrap(spec)).toEqual([]);
    });

    it("warns nothing for a non-process-log clause that declares design.fills — the normal pattern", () => {
        // figaro-utility-token: article "denomination", design.fills: ["currency"].
        const spec = specView("figaro-utility-token", { article: "denomination", designFills: ["currency"] });
        expect(warnProcessLogFillsTrap(spec)).toEqual([]);
    });

    it("warns nothing for a clause with no article at all", () => {
        const spec = specView("untagged-clause", undefined);
        expect(warnProcessLogFillsTrap(spec)).toEqual([]);
    });

    it("warns when article is 'attestations' AND design.fills is declared — the trap", () => {
        const spec = specView("trap-clause", { article: "attestations", designFills: ["eventType"] });
        const warnings = warnProcessLogFillsTrap(spec);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("trap-clause");
        expect(warnings[0]).toContain("attestations");
        expect(warnings[0]).toContain("design.fills");
        expect(warnings[0]).toContain("never be validated");
    });

    it("warns when article is 'attestations' AND checkout.catalogueFills is declared", () => {
        const spec = specView("trap-clause-2", { article: "attestations", catalogueFills: ["eventType"] });
        const warnings = warnProcessLogFillsTrap(spec);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("catalogueFills");
    });

    it("warns when article is 'attestations' AND checkout.profileFills is declared", () => {
        const spec = specView("trap-clause-3", { article: "attestations", profileFills: ["eventType"] });
        const warnings = warnProcessLogFillsTrap(spec);
        expect(warnings).toHaveLength(1);
    });

    it("returns both warnings when design.fills AND checkout fills are both declared", () => {
        const spec = specView("trap-clause-4", {
            article: "attestations",
            designFills: ["eventType"],
            catalogueFills: ["eventType"],
        });
        expect(warnProcessLogFillsTrap(spec)).toHaveLength(2);
    });

    it("matches the real shipped process-log fixtures exactly (via parseProjectionHints)", () => {
        const merchant = specSourceFromFixtures(["figaro-merchant-process"]).get(keyOf("figaro-merchant-process"))!;
        expect(warnProcessLogFillsTrap(merchant)).toEqual([]);
    });
});

describe("buildAssembly — the mandatory clauses: the DAO's live commerce and topology, written into every agreement", () => {
    // Nothing is picked: the canvas writes the mandatory clauses (the DAO's
    // live commerce and topology, read from the registry) into every
    // agreement before the designer composes anything. An agreement is not an
    // agreement without one clause of commerce's shape and one of topology's.
    const ORDERS = [
        { orderHash: "synthetic-root", parentOrderHashes: [] },
        { orderHash: "synthetic-child", parentOrderHashes: ["synthetic-root"] },
    ];
    const base = specSourceFromFixtures(["figaro-commerce", "figaro-topology", "figaro-geolocation", "figaro-applicable-law"]);
    /** A stranger's registration: the named spec's bytes with a changed title
     *  (and any further edits) — same clauseId and version, a different key. */
    const lookalike = (name: string, edit: (raw: Record<string, unknown>) => Record<string, unknown> = (r) => r): ProjectionSpecView =>
        viewOf(edit({ ...rawSpecOf(name), title: `${name} (a stranger's registration)` }));

    it("writes the mandatory clauses into each agreement composed", () => {
        const { assembly, agreements } = buildAssembly({
            orders: ORDERS,
            clausesByOrderId: { "synthetic-child": { [keyOf("figaro-geolocation")]: { origin: "u4pru" } } },
            mandatory: MANDATORY,
            specs: base,
        });
        const [root, child] = assembly.agreements;
        expect(Object.keys(agreements[root.agreementHash].clauses).sort()).toEqual(Object.keys(MANDATORY).sort());
        expect(agreements[child.agreementHash].clauses).toEqual({ ...MANDATORY, [keyOf("figaro-geolocation")]: {} });
    });

    it("refuses an agreement without a clause of commerce's or topology's shape, naming the agreement", () => {
        expect(() => buildAssembly({ orders: ORDERS, clausesByOrderId: {}, specs: base }))
            .toThrow(/the agreement: no clause of commerce's shape/);
        expect(() => buildAssembly({ orders: ORDERS, clausesByOrderId: {}, mandatory: { [keyOf("figaro-commerce")]: {} }, specs: base }))
            .toThrow(/no clause of topology's shape/);
    });

    it("refuses two clauses of one shape: a stranger's commerce composed beside the DAO's", () => {
        const fake = lookalike("figaro-commerce");
        expect(fake.clauseKey).not.toBe(keyOf("figaro-commerce"));
        const specs = specSourceWithRegistrations(base, [fake]);
        expect(() => buildAssembly({
            orders: ORDERS, clausesByOrderId: { "synthetic-root": { [fake.clauseKey]: {} } }, mandatory: MANDATORY, specs,
        })).toThrow(/two clauses of commerce's shape/);
        // Without the DAO's commerce, the stranger's is commerce to every reader: a shape, never a name.
        const { agreements, assembly } = buildAssembly({
            orders: ORDERS, clausesByOrderId: {}, mandatory: { [fake.clauseKey]: {}, [keyOf("figaro-topology")]: {} }, specs,
        });
        expect(agreements[assembly.agreements[0].agreementHash].clauses).toHaveProperty(fake.clauseKey);
    });

    it("a bound registered agreement carries both shapes itself, whatever their keys, or is refused", () => {
        const fake = lookalike("figaro-commerce");
        const specs = specSourceWithRegistrations(base, [fake]);
        const theirs = { clauses: { [fake.clauseKey]: {}, [keyOf("figaro-topology")]: {} } };
        const built = buildAssembly({
            orders: [ORDERS[0]], clausesByOrderId: {}, registeredByOrderId: { "synthetic-root": theirs }, mandatory: MANDATORY, specs,
        });
        expect(built.assembly.agreements[0].agreementHash).toBe(agreementHashOf(theirs));
        const short = { clauses: { [keyOf("figaro-topology")]: {} } };
        expect(() => buildAssembly({
            orders: [ORDERS[0]], clausesByOrderId: {}, registeredByOrderId: { "synthetic-root": short }, mandatory: MANDATORY, specs,
        })).toThrow(/order-0: registered agreement 0x[0-9a-f]+: no clause of commerce's shape/);
    });

    it("an assembly-scoped registration marking itself mandatory joins no composition", () => {
        const floor = lookalike("figaro-applicable-law", (r) => ({
            ...r,
            clauseId: "stranger-assembly-floor",
            block: { ...(r.block as Record<string, unknown>), design: { ...((r.block as { design?: object }).design ?? {}), article: "mandatory", scope: "assembly" } },
        }));
        const rows = [
            { clauseKey: floor.clauseKey, registeredBy: DAO, blockNumber: 2n, stakeWithdrawn: false },
            { clauseKey: keyOf("figaro-commerce"), registeredBy: DAO, blockNumber: 1n, stakeWithdrawn: false },
            { clauseKey: keyOf("figaro-topology"), registeredBy: DAO, blockNumber: 1n, stakeWithdrawn: false },
        ];
        const specs = specSourceWithRegistrations(base, [floor]);
        expect(Object.keys(mandatoryClauses(rows, specs, DAO)).sort()).toEqual(Object.keys(MANDATORY).sort());
        const { assembly } = buildAssembly({ orders: [ORDERS[0]], clausesByOrderId: {}, mandatory: mandatoryClauses(rows, specs, DAO), specs });
        expect(assembly.assemblyClauses).toBeUndefined();
    });

    it("composes the key the design names, whatever else shares its name", () => {
        const fake = lookalike("figaro-geolocation");
        const specs = specSourceWithRegistrations(base, [fake]);
        const { assembly, agreements } = buildAssembly({
            orders: [ORDERS[0]],
            clausesByOrderId: { "synthetic-root": { [keyOf("figaro-geolocation")]: {} } },
            mandatory: MANDATORY,
            specs,
        });
        const composed = agreements[assembly.agreements[0].agreementHash].clauses;
        expect(composed).toHaveProperty(keyOf("figaro-geolocation"));
        expect(composed).not.toHaveProperty(fake.clauseKey);
    });

    it("a composed or picked key whose spec is not loaded is a build error", () => {
        const unloaded = `0x${"77".repeat(32)}` as const;
        expect(() => buildAssembly({
            orders: [ORDERS[0]],
            clausesByOrderId: { "synthetic-root": { [unloaded]: {} } },
            mandatory: MANDATORY,
            specs: base,
        })).toThrow(new RegExp(`clause ${unloaded} is composed on an order but its spec is not loaded`));
        expect(() => buildAssembly({
            orders: [ORDERS[0]],
            clausesByOrderId: {},
            assemblyClauses: { [unloaded]: {} },
            mandatory: MANDATORY,
            specs: base,
        })).toThrow(new RegExp(`clause ${unloaded} is composed at the assembly level but its spec is not loaded`));
        expect(() => buildAssembly({
            orders: [ORDERS[0]], clausesByOrderId: {}, mandatory: { [unloaded]: {} }, specs: base,
        })).toThrow(new RegExp(`mandatory clause ${unloaded} is not loaded`));
    });

    it("puts the topology's parents in the agreement and composes the topology clause with {}", () => {
        const { assembly, agreements } = buildAssembly({ orders: ORDERS, clausesByOrderId: {}, mandatory: MANDATORY, specs: base });
        // Both agreements compose the same clauses, so they bind one agreement.
        expect(Object.keys(agreements)).toHaveLength(1);
        const [root, child] = assembly.agreements;
        expect(root.agreementHash).toBe(child.agreementHash);
        expect(agreements[root.agreementHash].clauses[keyOf("figaro-topology")]).toEqual({});
        expect(root.clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: [] } });
        expect(child.clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: ["order-0"] } });
        expect(agreementHashOf(agreements[root.agreementHash])).toBe(root.agreementHash);
        // The mandatory clauses alone are a complete agreement: same key.
        expect(root.agreementHash).toBe(agreementHashOf({ clauses: MANDATORY }));
    });

    it("binds a registered agreement as is, and refuses one lacking a clause of topology's shape", () => {
        const registered = { name: "Registered", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {}, [keyOf("figaro-geolocation")]: {} } };
        const { assembly, agreements } = buildAssembly({
            orders: ORDERS,
            clausesByOrderId: {},
            registeredByOrderId: { "synthetic-child": registered },
            mandatory: MANDATORY,
            specs: base,
        });
        expect(assembly.agreements[1].agreementHash).toBe(agreementHashOf(registered));
        expect(assembly.agreements[1].clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: ["order-0"] } });
        // Only the newly composed agreement is returned to register.
        expect(Object.keys(agreements)).toEqual([assembly.agreements[0].agreementHash]);
        // A registered agreement missing a clause of topology's shape is refused…
        const lacking = { clauses: { [keyOf("figaro-commerce")]: {} } };
        expect(() => buildAssembly({
            orders: ORDERS, clausesByOrderId: {}, registeredByOrderId: { "synthetic-child": lacking }, mandatory: MANDATORY, specs: base,
        })).toThrow(/order-1: registered agreement 0x[0-9a-f]{64}: no clause of topology's shape/);
        // …as is one order binding a registered agreement and composing clauses too.
        expect(() => buildAssembly({
            orders: ORDERS,
            clausesByOrderId: { "synthetic-child": { [keyOf("figaro-geolocation")]: {} } },
            registeredByOrderId: { "synthetic-child": registered },
            mandatory: MANDATORY,
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
    it("keys exactly what buildAssembly keys for the same composed clauses and pick", () => {
        const clauses = { [keyOf("figaro-geolocation")]: { ignored: "transaction particular" } };
        const alone = composeOrderAgreement({ clauses, mandatory: MANDATORY, specs: SPECS });
        const built = buildAssembly({
            orders: [{ orderHash: "synthetic-root", parentOrderHashes: [] }],
            clausesByOrderId: { "synthetic-root": clauses },
            mandatory: MANDATORY,
            specs: SPECS,
        });
        expect(built.assembly.agreements[0].agreementHash).toBe(alone.agreementHash);
        expect(built.agreements[alone.agreementHash]).toEqual(alone.composed);
    });

    it("writes the mandatory clauses in and keeps the composition value-free", () => {
        const { composed } = composeOrderAgreement({ clauses: { [keyOf("figaro-geolocation")]: { origin: "u4pru" } }, mandatory: MANDATORY, specs: SPECS });
        expect(Object.keys(composed.clauses)).toContain(keyOf("figaro-commerce"));
        expect(Object.keys(composed.clauses)).toContain(keyOf("figaro-topology"));
        expect(composed.clauses[keyOf("figaro-geolocation")]).toEqual({});
    });

    it("refuses a composition without a clause of commerce's shape and one of topology's", () => {
        expect(() => composeOrderAgreement({ clauses: { [keyOf("figaro-geolocation")]: {} }, specs: SPECS }))
            .toThrow(/no clause of commerce's shape/);
        // An authored agreement names the two clauses itself and passes no `mandatory`.
        expect(composeOrderAgreement({ clauses: MANDATORY, specs: SPECS }).agreementHash).toBe(agreementHashOf({ clauses: MANDATORY }));
        expect(() => composeOrderAgreement({ clauses: {}, specs: SPECS })).toThrow(/no clause of commerce's shape/);
        expect(() => composeOrderAgreement({ clauses: { [keyOf("figaro-commerce")]: {} }, specs: SPECS })).toThrow(/no clause of topology's shape/);
    });

    it("mandatoryClauses: the registrant's live mandatory-article clauses at agreement scope, one per shape, the later registration winning", () => {
        const newer = viewOf({ ...rawSpecOf("figaro-commerce"), title: "Commerce, the DAO's next" });
        const specs = specSourceWithRegistrations(SPECS, [newer]);
        const rows = [
            { clauseKey: keyOf("figaro-commerce"), registeredBy: DAO, blockNumber: 10n, stakeWithdrawn: false },
            { clauseKey: keyOf("figaro-topology"), registeredBy: DAO, blockNumber: 10n, stakeWithdrawn: false },
            // a stranger's commerce, live: an ordinary clause, never mandatory by this route
            { clauseKey: viewOf({ ...rawSpecOf("figaro-commerce"), title: "a stranger's" }).clauseKey, registeredBy: STRANGER, blockNumber: 11n, stakeWithdrawn: false },
            // the DAO's own next commerce, registered later: two live of one shape, the later wins
            { clauseKey: newer.clauseKey, registeredBy: DAO, blockNumber: 12n, stakeWithdrawn: false },
            // a withdrawn stake leaves view
            { clauseKey: keyOf("figaro-geolocation"), registeredBy: DAO, blockNumber: 13n, stakeWithdrawn: true },
        ];
        expect(mandatoryClauses(rows, specs, DAO)).toEqual({ [newer.clauseKey]: {}, [keyOf("figaro-topology")]: {} });
        // Case of the address is no difference; a registrant with nothing live yields nothing, and the canvas publishes nothing.
        expect(mandatoryClauses(rows, specs, DAO.toLowerCase() as `0x${string}`)).toEqual({ [newer.clauseKey]: {}, [keyOf("figaro-topology")]: {} });
        expect(mandatoryClauses(rows, specs, STRANGER)).toEqual({});
        expect(() => buildAssembly({ orders: [{ orderHash: "r", parentOrderHashes: [] }], clausesByOrderId: {}, mandatory: mandatoryClauses(rows, specs, STRANGER), specs }))
            .toThrow(/no clause of commerce's shape/);
    });

    it("refuses an assembly-scoped clause and a clause whose spec is not loaded", () => {
        expect(() => composeOrderAgreement({ clauses: { [keyOf("figaro-applicable-law")]: {} }, mandatory: MANDATORY, specs: SPECS }))
            .toThrow(/design\.scope "assembly"/);
        expect(() => composeOrderAgreement({ clauses: { [`0x${"ab".repeat(32)}`]: {} }, mandatory: MANDATORY, specs: SPECS }))
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
    const design: HydratedAssembly = {
        assembly: {
            assemblyClauses: { [keyOf("figaro-property-transfer")]: { anticipatedEvents: EVENTS } },
            agreements: [{ id: "order-0", agreementHash, clauses: {} }],
        },
        agreements: { [agreementHash.toLowerCase() as `0x${string}`]: registered },
    };
    const assemblyHash = assemblyHashOf(design.assembly);
    const instantiate = (consent: Record<string, unknown>, transfer: Record<string, unknown>, provenance = { agreementHash, assemblyHash }) => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-consent")]: consent,
            [keyOf("figaro-property-transfer")]: transfer,
        }, DESIGN_SPECS);
        const named = { ...agreement, provenance };
        return { agreement: named, checkoutHash: computeCheckoutHash(named) };
    };

    it("passes an agreement carrying the design's values", () => {
        const { agreement, checkoutHash } = instantiate({ documents: DOCS }, { anticipatedEvents: EVENTS });
        expect(validateCommitmentAgreement(agreement, checkoutHash, DESIGN_SPECS, STRUCT, design).ok).toBe(true);
    });

    it("refuses a designer value a party changed, agreement-scoped and assembly-scoped alike", () => {
        const forged = [{ ...DOCS[0], documentHash: `0x${"ee".repeat(32)}` }];
        const a = instantiate({ documents: forged }, { anticipatedEvents: EVENTS });
        expect(() => assertAgreementSignable(a.agreement, a.checkoutHash, DESIGN_SPECS, STRUCT, design))
            .toThrow(/figaro-consent documents: .*designer/);
        const b = instantiate({ documents: DOCS }, { anticipatedEvents: ["Another event"] });
        expect(() => assertAgreementSignable(b.agreement, b.checkoutHash, DESIGN_SPECS, STRUCT, design))
            .toThrow(/figaro-property-transfer anticipatedEvents: .*designer/);
    });

    it("refuses an order missing a clause of the registered agreement it names, agreement-scoped and assembly-scoped alike, by slug and full hash", () => {
        const { agreement: full } = instantiate({ documents: DOCS }, { anticipatedEvents: EVENTS });
        for (const dropped of ["figaro-consent", "figaro-property-transfer"]) {
            const short = { ...full, clauses: full.clauses.filter((s) => s.clause !== keyOf(dropped)) };
            const check = validateCommitmentAgreement(short, computeCheckoutHash(short), DESIGN_SPECS, STRUCT, design);
            expect(check.ok).toBe(false);
            expect(check.issues).toHaveLength(1);
            expect(() => assertAgreementSignable(short, computeCheckoutHash(short), DESIGN_SPECS, STRUCT, design))
                .toThrow(new RegExp(`${dropped} clause: the order does not carry this clause, which assembly ${deriveAssemblySlug(assemblyHash)} \\(${assemblyHash}\\) composes`));
        }
    });

    it("passes a process-log clause carried as an empty anchor, and refuses the order that drops it", () => {
        const LOG_SPECS = specSourceFromFixtures(["figaro-commerce", "figaro-merchant-process"]);
        const withLog = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-merchant-process")]: {} } };
        const logKey = agreementHashOf(withLog);
        const logDesign: HydratedAssembly = {
            assembly: { agreements: [{ id: "order-0", agreementHash: logKey, clauses: {} }] },
            agreements: { [logKey.toLowerCase() as `0x${string}`]: withLog },
        };
        const provenance = { agreementHash: logKey, assemblyHash: assemblyHashOf(logDesign.assembly) };
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-merchant-process")]: {},
        }, LOG_SPECS);
        const anchored = { ...agreement, provenance };
        expect(validateCommitmentAgreement(anchored, computeCheckoutHash(anchored), LOG_SPECS, STRUCT, logDesign).issues).toEqual([]);
        // Carried is a check on keys: a withheld clause and a clause whose
        // spec is not loaded each count as carried.
        const withheld = { ...anchored, clauses: anchored.clauses.map((s) => s.clause === keyOf("figaro-merchant-process") ? withholdClauseContent(s) : s) };
        expect(validateCommitmentAgreement(withheld, computeCheckoutHash(withheld), LOG_SPECS, STRUCT, logDesign).issues).toEqual([]);
        const commerceOnly = specSourceFromFixtures(["figaro-commerce"]);
        expect(validateCommitmentAgreement(anchored, computeCheckoutHash(anchored), commerceOnly, STRUCT, logDesign).issues).toEqual([]);
        const dropped = { ...anchored, clauses: anchored.clauses.filter((s) => s.clause !== keyOf("figaro-merchant-process")) };
        expect(() => assertAgreementSignable(dropped, computeCheckoutHash(dropped), LOG_SPECS, STRUCT, logDesign))
            .toThrow(/figaro-merchant-process clause: the order does not carry this clause/);
    });

    it("refuses an order missing a mandatory clause the canvas wrote into its agreement", () => {
        // The mandatory clauses are the registered agreement's own, so the
        // design names them: an order dropping one is refused like any clause
        // the designer composed.
        const built = buildAssembly({
            orders: [{ orderHash: "synthetic-root", parentOrderHashes: [] }],
            clausesByOrderId: { "synthetic-root": { [keyOf("figaro-merchant-process")]: {} } },
            mandatory: MANDATORY,
            specs: SPECS,
        });
        const [entry] = built.assembly.agreements;
        const picked: HydratedAssembly = {
            assembly: built.assembly,
            agreements: { [entry.agreementHash.toLowerCase() as `0x${string}`]: built.agreements[entry.agreementHash] },
        };
        const provenance = { agreementHash: entry.agreementHash, assemblyHash: assemblyHashOf(built.assembly) };
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-topology")]: { parentOrderHashes: [] },
            [keyOf("figaro-merchant-process")]: {},
        }, SPECS);
        const full = { ...agreement, provenance };
        expect(validateCommitmentAgreement(full, computeCheckoutHash(full), SPECS, STRUCT, picked).issues).toEqual([]);
        const dropped = { ...full, clauses: full.clauses.filter((s) => s.clause !== keyOf("figaro-topology")) };
        expect(() => assertAgreementSignable(dropped, computeCheckoutHash(dropped), SPECS, STRUCT, picked))
            .toThrow(/figaro-topology clause: the order does not carry this clause/);
    });

    it("refuses a design that is not the one the agreement's provenance names", () => {
        const { agreement, checkoutHash } = instantiate({ documents: DOCS }, { applicableLaw: "England-Wales" },
            { agreementHash, assemblyHash: `0x${"5e".repeat(32)}` });
        expect(() => assertAgreementSignable(agreement, checkoutHash, DESIGN_SPECS, STRUCT, design))
            .toThrow(/provenance/);
    });

    it("refuses an agreement naming no design when a design is supplied", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, { [keyOf("figaro-commerce")]: commerceData() }, DESIGN_SPECS);
        expect(() => assertAgreementSignable(agreement, computeCheckoutHash(agreement), DESIGN_SPECS, STRUCT, design))
            .toThrow(/provenance/);
    });
});
