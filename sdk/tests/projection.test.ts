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
    sectionByField,
    serializeAssemblyTemplate,
    validateCommitmentAgreement,
    type SpecSource,
} from "../src/index.js";
import { specSourceFromFixtures } from "./specFixtures.js";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;

const SPECS = specSourceFromFixtures([
    "figaro-commerce",
    "figaro-topology",
    "figaro-applicable-law",
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
        // figaro-applicable-law is ASSEMBLY-SCOPED (design.scope: "assembly",
        // ruled 2026-07-28): composed once at the assembly level. Its typed
        // value must STRIP to {} in the frozen output (no design.fills — the
        // value-free rule applies at the assembly level too).
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
