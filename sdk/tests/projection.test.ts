/**
 * Agreement projection — the off-chain validation sign gate (`assertAgreementSignable`,
 * the ONE thrower every signature routes through) and the golden-vector
 * byte-exactness of `buildOrderAgreement` + `buildAssemblyTemplate`.
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
    agreementKeyOf,
    assertAgreementSignable,
    buildAssemblyTemplate,
    buildOrderAgreement,
    canonicalize,
    computeAgreementHash,
    publicForm,
    sectionByField,
    sectionDataHash,
    serializeAssemblyTemplate,
    specHasPrivateField,
    validateCommitmentAgreement,
    warnProcessLogFillsTrap,
    type ProjectionSpecView,
    type SpecSource,
} from "../src/index.js";
import { keyOf, rawSpecOf, specSourceFromFixtures, specSourceOf, specSourceWithRegistrations, viewOf } from "./specFixtures.js";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;
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

function commerceData() {
    return {
        currency: CURRENCY,
        payment: "1",
        lineItems: [{ itemId: "item-1", name: "Test item", quantity: 1, unitPrice: "1" }],
    };
}

describe("assertAgreementSignable — the shared sign gate", () => {
    it("passes a conforming agreement whose hash matches its merkle root", () => {
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY" },
        }, SPECS);
        expect(() => assertAgreementSignable(agreement, agreementHash, SPECS, STRUCT)).not.toThrow();
    });

    it("signs the provenance leaf under the root and refuses a provenance that is not two 32-byte keys", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, { [keyOf("figaro-commerce")]: commerceData() }, SPECS);
        const named = { ...agreement, provenance: { agreementKey: `0x${"6f".repeat(32)}`, compositionHash: `0x${"5e".repeat(32)}` } as const };
        expect(() => assertAgreementSignable(named, computeAgreementHash(named), SPECS, STRUCT)).not.toThrow();
        // The root without the provenance leaf is not this agreement's.
        expect(() => assertAgreementSignable(named, computeAgreementHash(agreement), SPECS, STRUCT)).toThrow(/merkle/);
        const malformed = { ...agreement, provenance: { agreementKey: `0x${"6f".repeat(32)}`, compositionHash: "0x5e" } as const };
        expect(() => assertAgreementSignable(malformed, computeAgreementHash(agreement), SPECS, STRUCT))
            .toThrow(/32-byte/);
    });

    it("throws on a section violating its clause spec, naming clause + path", () => {
        // Prose fails applicable-law's jurisdiction-token pattern — the exact
        // shape a counter-signer must refuse even when the hash matches.
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: { applicableLaw: "State of New York, USA" },
        }, SPECS);
        expect(() => assertAgreementSignable(agreement, agreementHash, SPECS, STRUCT))
            .toThrow(/figaro-applicable-law \$\.applicableLaw/);
    });

    it("throws when the hash being signed is not the agreement's merkle root", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
        }, SPECS);
        const wrongHash = `0x${"ab".repeat(32)}` as `0x${string}`;
        expect(() => assertAgreementSignable(agreement, wrongHash, SPECS, STRUCT))
            .toThrow(/\(merkle\) agreementHash/);
    });

    it("reports every issue through validateCommitmentAgreement, not just the first", () => {
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: {
                applicableLaw: "State of New York, USA",
                language: "not-a-language-code!",
            },
        }, SPECS);
        const check = validateCommitmentAgreement(agreement, agreementHash, SPECS, STRUCT);
        expect(check.ok).toBe(false);
        const paths = check.issues.map((i) => `${i.clause} ${i.path}`);
        expect(paths.some((p) => p.includes("applicableLaw"))).toBe(true);
        expect(paths.some((p) => p.includes("language"))).toBe(true);
    });

    it("refuses a section carrying BOTH data and dataHash — the what-you-see-is-what-you-sign invariant", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY" },
        }, SPECS);
        // The attack: keep the benign `data` a review renders, and ALSO attach a
        // `dataHash` fingerprint of hidden content, which the merkle leaf would
        // sign verbatim — sign one thing, show another.
        const sections = agreement.sections.map((s) =>
            s.clause === keyOf("figaro-applicable-law")
                ? { ...s, dataHash: `0x${"ee".repeat(32)}` as `0x${string}` }
                : s,
        );
        const evil = { ...agreement, sections };
        const dual = sections.find((s) => s.clause === keyOf("figaro-applicable-law"));
        // Refused at the hashing locus …
        expect(() => sectionDataHash(dual!)).toThrow(/both plaintext data and a dataHash/);
        // … and at the sign gate, structurally, regardless of the hash presented.
        const anyHash = `0x${"00".repeat(32)}` as `0x${string}`;
        const check = validateCommitmentAgreement(evil, anyHash, SPECS, STRUCT);
        expect(check.ok).toBe(false);
        expect(check.issues.some((i) => i.path === "dataHash" && /both/.test(i.message))).toBe(true);
        expect(() => assertAgreementSignable(evil, anyHash, SPECS, STRUCT))
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
        const { agreement, agreementHash } = build({ [keyOf("figaro-commerce")]: commerceData() });
        expect(() => assertAgreementSignable(agreement, agreementHash, SPECS, STRUCT)).not.toThrow();
    });

    it("throws when the leaf and the struct name different tokens", () => {
        const { agreement, agreementHash } = build({ [keyOf("figaro-commerce")]: commerceData() });
        expect(() => assertAgreementSignable(agreement, agreementHash, SPECS, OTHER_STRUCT))
            .toThrow(/figaro-commerce currency: the signed term names .* contradicts it/);
    });

    it("compares the leaf case-insensitively — an address is not a string", () => {
        const { agreement, agreementHash } = build({
            [keyOf("figaro-commerce")]: { ...commerceData(), currency: "0x000000000000000000000000000000000000000A" },
        });
        expect(() => assertAgreementSignable(
            agreement, agreementHash, SPECS, { currency: "0x000000000000000000000000000000000000000a", payment: 1n },
        )).not.toThrow();
    });

    it("passes an unpinned assembly: the commerce leaf alone carries the term", () => {
        const { agreement, agreementHash } = build({
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-topology")]: { parentOrderHashes: [] },
        });
        const check = validateCommitmentAgreement(agreement, agreementHash, SPECS, STRUCT);
        expect(check.ok).toBe(true);
    });

    it("passes a pinned assembly whose pin, leaf and struct all match", () => {
        const { agreement, agreementHash } = build({
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-utility-token")]: { currency: CURRENCY },
        });
        expect(() => assertAgreementSignable(agreement, agreementHash, SPECS, STRUCT)).not.toThrow();
    });

    it("throws when the pin contradicts the commerce leaf", () => {
        const { agreement, agreementHash } = build({
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-utility-token")]: { currency: OTHER_TOKEN },
        });
        expect(() => assertAgreementSignable(agreement, agreementHash, SPECS, STRUCT))
            .toThrow(/figaro-utility-token currency: this assembly is denominated by design/);
    });

    it("throws when the payment leaf and the struct disagree — payment mirrors like currency", () => {
        const { agreement, agreementHash } = build({ [keyOf("figaro-commerce")]: commerceData() });
        expect(() => assertAgreementSignable(
            agreement, agreementHash, SPECS, { currency: CURRENCY, payment: 1000n },
        )).toThrow(/figaro-commerce payment: the signed term names 1 as the payment; the commitment payment 1000 contradicts it/);
    });

    it("reports a malformed payment leaf as its own spec failure, never a mismatch", () => {
        const { agreement, agreementHash } = build({
            [keyOf("figaro-commerce")]: { ...commerceData(), payment: "not-a-number" },
        });
        const check = validateCommitmentAgreement(agreement, agreementHash, SPECS, STRUCT);
        expect(check.ok).toBe(false);
        expect(check.issues.some((i) => i.message.includes("commitment payment"))).toBe(false);
    });

    it("reports a missing leaf as the ordinary required-field failure, not a mismatch", () => {
        const { agreement, agreementHash } = build({
            [keyOf("figaro-commerce")]: { payment: "1", lineItems: [] },
        });
        const check = validateCommitmentAgreement(agreement, agreementHash, SPECS, STRUCT);
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
            defaults: { canonicalAgreement: string; agreementHash: string };
            processLog: { canonicalAgreement: string; agreementHash: string };
        };
        assemblyTemplate: { canonicalJson: string; compositionHash: string; agreements: Record<string, string> };
    };

    it("spec-default injection reproduces the frozen agreement + hash", () => {
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-topology")]: { parentOrderHashes: [] },
            [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY" },
        }, SPECS);
        expect(canonicalize(agreement)).toBe(vectors.agreementProjection.defaults.canonicalAgreement);
        expect(agreementHash).toBe(vectors.agreementProjection.defaults.agreementHash);
    });

    it("the process-log empty anchor reproduces the frozen agreement + hash", () => {
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-topology")]: { parentOrderHashes: [] },
            [keyOf("figaro-merchant-process")]: {},
        }, SPECS);
        expect(canonicalize(agreement)).toBe(
            vectors.agreementProjection.processLog.canonicalAgreement,
        );
        expect(agreementHash).toBe(vectors.agreementProjection.processLog.agreementHash);
    });

    it("mandatory fold + relabeling + assembly-scope fold reproduce the frozen template + compositionHash", () => {
        // figaro-applicable-law is ASSEMBLY-SCOPED (design.scope: "assembly")
        // and DESIGNER-AUTHORED (design.fills — recourse
        // terms are part of the assembly's identity, never buyer-authored),
        // so its typed value SURVIVES into the frozen output.
        const built = buildAssemblyTemplate({
            name: "Golden Vector Chain",
            orders: [
                { orderHash: "synthetic-root", parentOrderHashes: [] },
                { orderHash: "synthetic-child", parentOrderHashes: ["synthetic-root"] },
            ],
            clausesByOrderId: {},
            assemblyClauses: { [keyOf("figaro-applicable-law")]: { applicableLaw: "US-NY" } },
            specs: SPECS,
        });
        const template = serializeAssemblyTemplate(built.template);
        expect(template.json).toBe(vectors.assemblyTemplate.canonicalJson);
        expect(template.compositionHash).toBe(vectors.assemblyTemplate.compositionHash);
        expect(Object.fromEntries(Object.entries(built.agreements).map(([k, v]) => [k, canonicalize(v)])))
            .toEqual(vectors.assemblyTemplate.agreements);
    });

    it("refuses wrong-level composition (scope verification)", () => {
        // An assembly-scoped clause on an order is a BUILD error, never a
        // silent no-op…
        expect(() => buildAssemblyTemplate({
            orders: [{ orderHash: "synthetic-root", parentOrderHashes: [] }],
            clausesByOrderId: { "synthetic-root": { [keyOf("figaro-applicable-law")]: {} } },
            specs: SPECS,
        })).toThrow(/design\.scope "assembly"/);
        // …and an agreement-scoped clause at the assembly level likewise.
        expect(() => buildAssemblyTemplate({
            orders: [{ orderHash: "synthetic-root", parentOrderHashes: [] }],
            clausesByOrderId: {},
            assemblyClauses: { [keyOf("figaro-geolocation")]: {} },
            specs: SPECS,
        })).toThrow(/does not declare design\.scope "assembly"/);
    });

    it("sectionByField reads by declared field, with data-key fallback while unloaded", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            [keyOf("figaro-commerce")]: commerceData(),
            [keyOf("figaro-topology")]: { parentOrderHashes: ["0xabc"] },
        }, SPECS);
        expect(sectionByField(agreement, "parentOrderHashes", SPECS)?.clause).toBe(keyOf("figaro-topology"));
        // The uncached path: an empty SpecSource falls back to data-key presence.
        const empty: SpecSource = { get: () => undefined, list: () => [] };
        expect(sectionByField(agreement, "parentOrderHashes", empty)?.clause).toBe(keyOf("figaro-topology"));
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
        sections: [
            { clause: KEYS["pub-clause"], data: { f0: "open", f1: "map" } },
            { clause: KEYS["priv-clause"], data: { f0: "secret-coordinate" } },
        ],
    };

    it("withholds a private section, keeps a public one plaintext", () => {
        const withheld = publicForm(agreement, specs);
        const pub = withheld.sections.find((s) => s.clause === KEYS["pub-clause"])!;
        const priv = withheld.sections.find((s) => s.clause === KEYS["priv-clause"])!;
        expect(pub.data).toBeDefined(); // public coordination commons stays open
        expect(priv.data).toBeUndefined(); // paid-edge plaintext removed
        expect(priv.dataHash).toBe(sectionDataHash({ clause: KEYS["priv-clause"], data: { f0: "secret-coordinate" } }));
    });

    it("leaves the agreementHash unchanged — the withheld leaf is identical", () => {
        expect(computeAgreementHash(publicForm(agreement, specs))).toBe(computeAgreementHash(agreement));
    });

    it("withholds a section whose clause spec is not loaded (fail-closed)", () => {
        const unknown = {
            ...agreement,
            sections: [{ clause: KEYS["unknown-clause"], data: { f0: "could-be-private" } }],
        };
        // Unknown spec → WITHHELD: a permissionlessly-registered clause could be a
        // PRIVATE one, and keeping it plaintext would leak on any cold-cache pin
        // (notably the receiver re-pin, which never loaded the clause). The pin
        // caller warms the specs first (`warmAgreementSpecs`), so a known public
        // clause is not over-redacted; an unknown one fails closed here.
        const projected = publicForm(unknown, specs).sections[0];
        expect(projected.data).toBeUndefined();
        expect(projected.dataHash).toBe(
            sectionDataHash({ clause: KEYS["unknown-clause"], data: { f0: "could-be-private" } }),
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

describe("buildAssemblyTemplate — a clause is its spec: the fold folds every mandatory registration", () => {
    // A clause's key is the hash of its pinned bytes, so a registration that
    // reuses a name and version with other bytes is ANOTHER clause: it never
    // displaces the clause a design composed, and nothing selects among
    // registrations — every live registration marking itself mandatory folds.
    const ORDERS = [
        { orderHash: "synthetic-root", parentOrderHashes: [] },
        { orderHash: "synthetic-child", parentOrderHashes: ["synthetic-root"] },
    ];
    const base = specSourceFromFixtures(["figaro-commerce", "figaro-topology", "figaro-geolocation", "figaro-applicable-law"]);
    /** A stranger's registration: the named spec's bytes with a changed title
     *  (and any further edits) — same clauseId and version, a different key. */
    const lookalike = (name: string, edit: (raw: Record<string, unknown>) => Record<string, unknown> = (r) => r): ProjectionSpecView =>
        viewOf(edit({ ...rawSpecOf(name), title: `${name} (a stranger's registration)` }));

    it("a lookalike of a mandatory clause is another clause: both fold, the real key unchanged", () => {
        const fake = lookalike("figaro-commerce");
        expect(fake.clauseKey).not.toBe(keyOf("figaro-commerce"));
        expect(fake.clauseId).toBe("figaro-commerce");
        const { template, agreements } = buildAssemblyTemplate({ orders: ORDERS, clausesByOrderId: {}, specs: specSourceWithRegistrations(base, [fake]) });
        for (const slot of template.agreements) {
            const composed = agreements[slot.agreementKey].clauses;
            expect(composed).toHaveProperty(keyOf("figaro-commerce"));
            expect(composed).toHaveProperty(fake.clauseKey);
            expect(composed).toHaveProperty(keyOf("figaro-topology"));
        }
    });

    it("with no registration added the template is the same — the fold reads only what the source surfaces", () => {
        const once = serializeAssemblyTemplate(buildAssemblyTemplate({ orders: ORDERS, clausesByOrderId: {}, specs: base }).template);
        const twice = serializeAssemblyTemplate(buildAssemblyTemplate({ orders: ORDERS, clausesByOrderId: {}, specs: base }).template);
        expect(twice.compositionHash).toBe(once.compositionHash);
    });

    it("an assembly-scoped registration marking itself mandatory folds into the assembly's terms", () => {
        const floor = lookalike("figaro-applicable-law", (r) => ({
            ...r,
            clauseId: "stranger-assembly-floor",
            block: { ...(r.block as Record<string, unknown>), design: { ...((r.block as { design?: object }).design ?? {}), article: "mandatory", scope: "assembly" } },
        }));
        const { template, agreements } = buildAssemblyTemplate({ orders: [ORDERS[0]], clausesByOrderId: {}, specs: specSourceWithRegistrations(base, [floor]) });
        expect(template.assemblyClauses).toEqual({ [floor.clauseKey]: {} });
        expect(agreements[template.agreements[0].agreementKey].clauses).not.toHaveProperty(floor.clauseKey);
    });

    it("composes the key the design names, whatever else shares its name", () => {
        const fake = lookalike("figaro-geolocation");
        const specs = specSourceWithRegistrations(base, [fake]);
        const { template, agreements } = buildAssemblyTemplate({
            orders: [ORDERS[0]],
            clausesByOrderId: { "synthetic-root": { [keyOf("figaro-geolocation")]: {} } },
            specs,
        });
        const composed = agreements[template.agreements[0].agreementKey].clauses;
        expect(composed).toHaveProperty(keyOf("figaro-geolocation"));
        expect(composed).not.toHaveProperty(fake.clauseKey);
    });

    it("a composed key whose spec is not loaded is a build error, on an order and at the assembly level", () => {
        const unloaded = `0x${"77".repeat(32)}` as const;
        expect(() => buildAssemblyTemplate({
            orders: [ORDERS[0]],
            clausesByOrderId: { "synthetic-root": { [unloaded]: {} } },
            specs: base,
        })).toThrow(new RegExp(`clause ${unloaded} is composed on an order but its spec is not loaded`));
        expect(() => buildAssemblyTemplate({
            orders: [ORDERS[0]],
            clausesByOrderId: {},
            assemblyClauses: { [unloaded]: {} },
            specs: base,
        })).toThrow(new RegExp(`clause ${unloaded} is composed at the assembly level but its spec is not loaded`));
    });

    it("puts the topology's parents in the order slot and composes the topology clause with {}", () => {
        const { template, agreements } = buildAssemblyTemplate({ orders: ORDERS, clausesByOrderId: {}, specs: base });
        // Both order slots compose the same clauses, so they bind one agreement.
        expect(Object.keys(agreements)).toHaveLength(1);
        const [root, child] = template.agreements;
        expect(root.agreementKey).toBe(child.agreementKey);
        expect(agreements[root.agreementKey].clauses[keyOf("figaro-topology")]).toEqual({});
        expect(root.clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: [] } });
        expect(child.clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: ["order-0"] } });
        expect(agreementKeyOf(agreements[root.agreementKey])).toBe(root.agreementKey);
    });

    it("binds a registered agreement as is, and refuses one lacking a live mandatory spec", () => {
        const registered = { name: "Registered", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {}, [keyOf("figaro-geolocation")]: {} } };
        const { template, agreements } = buildAssemblyTemplate({
            orders: ORDERS,
            clausesByOrderId: {},
            registeredByOrderId: { "synthetic-child": registered },
            specs: base,
        });
        expect(template.agreements[1].agreementKey).toBe(agreementKeyOf(registered));
        expect(template.agreements[1].clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: ["order-0"] } });
        // Only the newly composed agreement is returned to register.
        expect(Object.keys(agreements)).toEqual([template.agreements[0].agreementKey]);
        // A registered agreement missing a live mandatory clause is refused…
        const lacking = { clauses: { [keyOf("figaro-commerce")]: {} } };
        expect(() => buildAssemblyTemplate({
            orders: ORDERS, clausesByOrderId: {}, registeredByOrderId: { "synthetic-child": lacking }, specs: base,
        })).toThrow(/lacks the live mandatory/);
        // …as is one order binding a registered agreement and composing clauses too.
        expect(() => buildAssemblyTemplate({
            orders: ORDERS,
            clausesByOrderId: { "synthetic-child": { [keyOf("figaro-geolocation")]: {} } },
            registeredByOrderId: { "synthetic-child": registered },
            specs: base,
        })).toThrow(/choose one/);
    });

    it("refuses a template build with no mandatory clause loaded", () => {
        expect(() => buildAssemblyTemplate({
            orders: [ORDERS[0]],
            clausesByOrderId: {},
            specs: specSourceFromFixtures(["figaro-geolocation"]),
        })).toThrow(/no mandatory clauses/);
    });
});

describe("buildOrderAgreement — every section reads the spec its key names", () => {
    // A lookalike shares a name and version with the real clause and declares
    // another default; the real key's section never takes it.
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
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, clauses, specs);
        const section = agreement.sections.find((s) => s.clause === keyOf("figaro-applicable-law"))!;
        expect(section.data?.language).not.toBe("xx");
        expect(agreementHash).toBe(buildOrderAgreement(BUYER, SELLER, clauses, real).agreementHash);
    });

    it("the lookalike's key signs the lookalike's defaults", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, { [fake.clauseKey]: { applicableLaw: "US-NY" } }, specs);
        expect(agreement.sections[0].clause).toBe(fake.clauseKey);
        expect(agreement.sections[0].data?.language).toBe("xx");
    });
});
