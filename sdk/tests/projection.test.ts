/**
 * Agreement projection — the Layer-A sign gate (`assertAgreementSignable`,
 * the ONE thrower every signature routes through) and the golden-vector
 * byte-exactness of `buildOrderAgreement` + `buildAssemblyTemplate`.
 *
 * The SpecSource is built from the canonical Layer-A specs (`clauses/*.json`)
 * via `parseClauseSpec` + `parseProjectionHints` — the same construction any
 * consumer performs on registry-fetched spec JSON. (The frontend's cache
 * adapter does exactly this against ClauseRegistry → IPFS.)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
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
import { specSourceFromFixtures } from "./specFixtures.js";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;

const SPECS = specSourceFromFixtures([
    "figaro-commerce",
    "figaro-topology",
    "figaro-applicable-law",
    "figaro-assembly-provenance",
    "figaro-geolocation",
    "figaro-merchant-process",
]);

function commerceData() {
    return {
        payment: "1",
        lineItems: [{ itemId: "item-1", name: "Test item", quantity: 1, unitPrice: "1" }],
    };
}

describe("assertAgreementSignable — the shared sign gate", () => {
    it("passes a conforming agreement whose hash matches its merkle root", () => {
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-applicable-law": { applicableLaw: "US-NY" },
        }, SPECS);
        expect(() => assertAgreementSignable(agreement, agreementHash, SPECS)).not.toThrow();
    });

    it("throws on a section violating its clause spec, naming clause + path", () => {
        // Prose fails applicable-law's jurisdiction-token pattern — the exact
        // shape a counter-signer must refuse even when the hash matches.
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-applicable-law": { applicableLaw: "State of New York, USA" },
        }, SPECS);
        expect(() => assertAgreementSignable(agreement, agreementHash, SPECS))
            .toThrow(/figaro-applicable-law \$\.applicableLaw/);
    });

    it("throws when the hash being signed is not the agreement's merkle root", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
        }, SPECS);
        const wrongHash = `0x${"ab".repeat(32)}` as `0x${string}`;
        expect(() => assertAgreementSignable(agreement, wrongHash, SPECS))
            .toThrow(/\(merkle\) agreementHash/);
    });

    it("reports every issue through validateCommitmentAgreement, not just the first", () => {
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-applicable-law": {
                applicableLaw: "State of New York, USA",
                language: "not-a-language-code!",
            },
        }, SPECS);
        const check = validateCommitmentAgreement(agreement, agreementHash, SPECS);
        expect(check.ok).toBe(false);
        const paths = check.issues.map((i) => `${i.clause} ${i.path}`);
        expect(paths.some((p) => p.includes("applicableLaw"))).toBe(true);
        expect(paths.some((p) => p.includes("language"))).toBe(true);
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
        assemblyTemplate: { canonicalJson: string; compositionHash: string };
    };

    it("spec-default injection reproduces the frozen agreement + hash", () => {
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-topology": { parentOrderHashes: [] },
            "figaro-applicable-law": { applicableLaw: "US-NY" },
        }, SPECS);
        expect(canonicalize(agreement)).toBe(vectors.agreementProjection.defaults.canonicalAgreement);
        expect(agreementHash).toBe(vectors.agreementProjection.defaults.agreementHash);
    });

    it("the process-log empty anchor reproduces the frozen agreement + hash", () => {
        const { agreement, agreementHash } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-topology": { parentOrderHashes: [] },
            "figaro-merchant-process": {},
        }, SPECS);
        expect(canonicalize(agreement)).toBe(
            vectors.agreementProjection.processLog.canonicalAgreement,
        );
        expect(agreementHash).toBe(vectors.agreementProjection.processLog.agreementHash);
    });

    it("mandatory fold + relabeling + assembly-scope fold reproduce the frozen template + compositionHash", () => {
        // figaro-applicable-law is ASSEMBLY-SCOPED (design.scope: "assembly")
        // and DESIGNER-AUTHORED (design.fills — ruled 2026-07-28: recourse
        // terms are part of the assembly's identity, never buyer-authored),
        // so its typed value SURVIVES into the frozen output.
        const template = serializeAssemblyTemplate(
            buildAssemblyTemplate({
                name: "Golden Vector Chain",
                orders: [
                    { orderHash: "synthetic-root", parentOrderHashes: [] },
                    { orderHash: "synthetic-child", parentOrderHashes: ["synthetic-root"] },
                ],
                clausesByOrderId: {},
                assemblyClauses: { "figaro-applicable-law": { applicableLaw: "US-NY" } },
                specs: SPECS,
            }),
        );
        expect(template.json).toBe(vectors.assemblyTemplate.canonicalJson);
        expect(template.compositionHash).toBe(vectors.assemblyTemplate.compositionHash);
    });

    it("refuses wrong-level composition (scope verification, ruled 2026-07-28)", () => {
        // An assembly-scoped clause on an order is a BUILD error, never a
        // silent no-op…
        expect(() => buildAssemblyTemplate({
            orders: [{ orderHash: "synthetic-root", parentOrderHashes: [] }],
            clausesByOrderId: { "synthetic-root": { "figaro-applicable-law": {} } },
            specs: SPECS,
        })).toThrow(/design\.scope "assembly"/);
        // …and an agreement-scoped clause at the assembly level likewise.
        expect(() => buildAssemblyTemplate({
            orders: [{ orderHash: "synthetic-root", parentOrderHashes: [] }],
            clausesByOrderId: {},
            assemblyClauses: { "figaro-geolocation": {} },
            specs: SPECS,
        })).toThrow(/does not declare design\.scope "assembly"/);
    });

    it("sectionByField reads by declared field, with data-key fallback while unloaded", () => {
        const { agreement } = buildOrderAgreement(BUYER, SELLER, {
            "figaro-commerce": commerceData(),
            "figaro-topology": { parentOrderHashes: ["0xabc"] },
        }, SPECS);
        expect(sectionByField(agreement, "parentOrderHashes", SPECS)?.clause).toBe(
            "figaro-topology",
        );
        // The uncached path: an empty SpecSource falls back to data-key presence.
        const empty: SpecSource = { get: () => undefined, list: () => [] };
        expect(sectionByField(agreement, "parentOrderHashes", empty)?.clause).toBe(
            "figaro-topology",
        );
    });
});

describe("publicForm — the public/private disposition seam", () => {
    // A minimal SpecSource: one all-public clause, one clause with a private field.
    const specView = (clauseId: string, dispositions: (string | undefined)[]): ProjectionSpecView => ({
        clauseId,
        version: 1,
        fields: dispositions.map((d, i) => ({
            name: `f${i}`,
            required: false,
            type: "string" as const,
            ...(d !== undefined && { disposition: d as "public" | "private" }),
        })),
    });
    const specs: SpecSource = {
        get: (clauseId) =>
            clauseId === "pub-clause"
                ? specView("pub-clause", ["public", undefined])
                : clauseId === "priv-clause"
                  ? specView("priv-clause", ["private"])
                  : undefined,
        list: () => [],
    };
    const agreement = {
        version: "a1" as const,
        buyer: BUYER,
        seller: SELLER,
        sections: [
            { clause: "pub-clause", version: 1, data: { f0: "open", f1: "map" } },
            { clause: "priv-clause", version: 1, data: { f0: "secret-coordinate" } },
        ],
    };

    it("withholds a private section, keeps a public one plaintext", () => {
        const withheld = publicForm(agreement, specs);
        const pub = withheld.sections.find((s) => s.clause === "pub-clause")!;
        const priv = withheld.sections.find((s) => s.clause === "priv-clause")!;
        expect(pub.data).toBeDefined(); // public coordination commons stays open
        expect(priv.data).toBeUndefined(); // paid-edge plaintext removed
        expect(priv.dataHash).toBe(sectionDataHash({ clause: "priv-clause", version: 1, data: { f0: "secret-coordinate" } }));
    });

    it("leaves the agreementHash unchanged — the withheld leaf is identical", () => {
        expect(computeAgreementHash(publicForm(agreement, specs))).toBe(computeAgreementHash(agreement));
    });

    it("withholds a section whose clause spec is not loaded (fail-closed)", () => {
        const unknown = {
            ...agreement,
            sections: [{ clause: "unknown-clause", version: 1, data: { f0: "could-be-private" } }],
        };
        // Unknown spec → WITHHELD: a permissionlessly-registered clause could be a
        // PRIVATE one, and keeping it plaintext would leak on any cold-cache pin
        // (notably the receiver re-pin, which never loaded the clause). The pin
        // caller warms the specs first (`warmAgreementSpecs`), so a known public
        // clause is not over-redacted; an unknown one fails closed here.
        const projected = publicForm(unknown, specs).sections[0];
        expect(projected.data).toBeUndefined();
        expect(projected.dataHash).toBe(
            sectionDataHash({ clause: "unknown-clause", version: 1, data: { f0: "could-be-private" } }),
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
        // figaro-denomination: article "settlement", design.fills: ["currency"].
        const spec = specView("figaro-denomination", { article: "settlement", designFills: ["currency"] });
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
        const merchant = specSourceFromFixtures(["figaro-merchant-process"]).get("figaro-merchant-process")!;
        expect(warnProcessLogFillsTrap(merchant)).toEqual([]);
    });
});
