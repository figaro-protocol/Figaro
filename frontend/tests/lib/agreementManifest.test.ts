import { describe, it, expect } from "vitest";
import {
    canonicalizeAgreement,
    computeAgreementHash,
    computeSectionLeaf,
    buildSectionInclusionProof,
    verifyInclusionProof,
    buildAgreement,
    getSection,
    hasSection,
    manifestFieldsToGeoSection,
    redactSections,
    computeRedactableAgreementHash,
    verifyRevealedSection,
    isRedactedSection,
    type Agreement,
    type AgreementSection,
    type AgreementLineItem,
} from "@/lib/core/agreementManifest";
import { ANVIL_ACCOUNTS } from "../anvilAccounts";

const SELLER = ANVIL_ACCOUNTS[1];
const BUYER = ANVIL_ACCOUNTS[0];
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;

// Category-2 schemas (commerce, geo, fulfilment, ghg, handoff) use ABI-encoded
// sectionData, so clause values must be encoder-valid enum strings / integers.
// Using the canonical SDK encoder types here.
const LINE_ITEMS: AgreementLineItem[] = [
    { itemId: "pizza1", name: "Margherita Pizza", quantity: 2, unitPrice: "10000000000000000" },   // 0.01e18 wei
    { itemId: "drink1", name: "Soft Drink",       quantity: 1, unitPrice: "2000000000000000" },    // 0.002e18 wei
];

// ── Schema sections as standardized terms of sale ────────────────────────────

const COMMERCE_SECTION: AgreementSection = {
    schema: "figaro-commerce-v1",
    data: { currency: CURRENCY, payment: "22000000000000000", lineItems: LINE_ITEMS },
};

const GEO_SECTION: AgreementSection = {
    schema: "figaro-geo-v1",
    data: { originGeohash: "dr5reg", destinationGeohash: "dr5reh" },
};

const FULFILMENT_SECTION: AgreementSection = {
    schema: "figaro-fulfilment-v1",
    data: { method: "deliver:dutch-auction" },
};

const HANDOFF_SECTION: AgreementSection = {
    schema: "figaro-handoff-v1",
    data: { mode: "face-to-face" },
};

const GHG_SECTION: AgreementSection = {
    schema: "figaro-ghg-iso-14064-v1",
    data: { scope: 1 },
};

const ALLERGEN_SECTION: AgreementSection = {
    schema: "figaro-allergen-v1",
    data: { itemAttestations: { pizza1: { allergenFree: ["gluten"], contains: ["dairy"] } } },
};

function makeAgreement(overrides?: { sections?: AgreementSection[] }): Agreement {
    return buildAgreement({
        buyer: BUYER,
        seller: SELLER,
        sections: overrides?.sections ?? [COMMERCE_SECTION, GEO_SECTION],
    });
}

// ── canonicalizeAgreement ────────────────────────────────────────────────────

describe("canonicalizeAgreement", () => {
    it("produces deterministic JSON regardless of key order", () => {
        const a1 = makeAgreement();
        // Same content, different property insertion order
        const a2: Agreement = {
            sections: a1.sections,
            version: "a1",
            seller: SELLER,
            buyer: BUYER,
        };
        expect(canonicalizeAgreement(a1)).toBe(canonicalizeAgreement(a2));
    });

    it("sorts nested object keys within section data", () => {
        const agreement = makeAgreement({
            sections: [{ schema: "test-v1", data: { z_field: 2, a_field: 1 } }],
        });
        const json = canonicalizeAgreement(agreement);
        const aIdx = json.indexOf('"a_field"');
        const zIdx = json.indexOf('"z_field"');
        expect(aIdx).toBeLessThan(zIdx);
    });
});

// ── computeAgreementHash ─────────────────────────────────────────────────────

describe("computeAgreementHash", () => {
    it("returns a 0x-prefixed 66-char hex string", () => {
        const hash = computeAgreementHash(makeAgreement());
        expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("same agreement produces same hash", () => {
        const a = makeAgreement();
        expect(computeAgreementHash(a)).toBe(computeAgreementHash(a));
    });

    it("different sections produce different hashes", () => {
        const h1 = computeAgreementHash(makeAgreement({ sections: [COMMERCE_SECTION] }));
        const h2 = computeAgreementHash(makeAgreement({ sections: [COMMERCE_SECTION, GHG_SECTION] }));
        expect(h1).not.toBe(h2);
    });

    it("different section data produces different hashes", () => {
        const h1 = computeAgreementHash(makeAgreement({ sections: [GEO_SECTION] }));
        const h2 = computeAgreementHash(makeAgreement({
            sections: [{ schema: "figaro-geo-v1", data: { ...GEO_SECTION.data, originGeohash: "u33dc0" } }],
        }));
        expect(h1).not.toBe(h2);
    });

    it("adding allergen term changes the hash", () => {
        const h1 = computeAgreementHash(makeAgreement({ sections: [COMMERCE_SECTION] }));
        const h2 = computeAgreementHash(makeAgreement({ sections: [COMMERCE_SECTION, ALLERGEN_SECTION] }));
        expect(h1).not.toBe(h2);
    });
});

// ── buildAgreement ───────────────────────────────────────────────────────────

describe("buildAgreement", () => {
    it("sorts sections by schema key", () => {
        // Pass in reverse order: geo before commerce alphabetically, but fulfilment/ghg/handoff too
        const a = buildAgreement({
            buyer: BUYER,
            seller: SELLER,
            sections: [HANDOFF_SECTION, GHG_SECTION, COMMERCE_SECTION, GEO_SECTION, FULFILMENT_SECTION],
        });
        const keys = a.sections.map((s) => s.schema);
        expect(keys).toEqual([...keys].sort());
    });

    it("sets version to a1", () => {
        const a = buildAgreement({ buyer: BUYER, seller: SELLER, sections: [] });
        expect(a.version).toBe("a1");
    });

    it("rejects duplicate schema keys", () => {
        expect(() =>
            buildAgreement({
                buyer: BUYER,
                seller: SELLER,
                sections: [COMMERCE_SECTION, COMMERCE_SECTION],
            }),
        ).toThrow(/Duplicate schema keys/);
    });

    it("section order in input does not affect hash", () => {
        const h1 = computeAgreementHash(
            buildAgreement({ buyer: BUYER, seller: SELLER, sections: [COMMERCE_SECTION, GEO_SECTION, GHG_SECTION] }),
        );
        const h2 = computeAgreementHash(
            buildAgreement({ buyer: BUYER, seller: SELLER, sections: [GHG_SECTION, COMMERCE_SECTION, GEO_SECTION] }),
        );
        expect(h1).toBe(h2);
    });

    it("composes a full terms-of-sale agreement", () => {
        const a = buildAgreement({
            buyer: BUYER,
            seller: SELLER,
            sections: [COMMERCE_SECTION, GEO_SECTION, FULFILMENT_SECTION, HANDOFF_SECTION, GHG_SECTION],
        });
        expect(a.sections).toHaveLength(5);
        expect(hasSection(a, "figaro-commerce-v1")).toBe(true);
        expect(hasSection(a, "figaro-fulfilment-v1")).toBe(true);
        expect(hasSection(a, "figaro-handoff-v1")).toBe(true);
        expect(hasSection(a, "figaro-ghg-iso-14064-v1")).toBe(true);
        expect(hasSection(a, "figaro-geo-v1")).toBe(true);
    });
});

// ── Merkle leaf + inclusion proof ────────────────────────────────────────────

describe("computeSectionLeaf", () => {
    it("returns a 0x-prefixed 66-char hex string", () => {
        expect(computeSectionLeaf(COMMERCE_SECTION)).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("is deterministic for the same section", () => {
        expect(computeSectionLeaf(COMMERCE_SECTION)).toBe(computeSectionLeaf(COMMERCE_SECTION));
    });

    it("changes when section data changes", () => {
        const leafA = computeSectionLeaf(COMMERCE_SECTION);
        const leafB = computeSectionLeaf({
            schema: "figaro-commerce-v1",
            data: { ...COMMERCE_SECTION.data, payment: "33000000000000000" },
        });
        expect(leafA).not.toBe(leafB);
    });

    it("changes when schema key changes, even with identical data", () => {
        const leafA = computeSectionLeaf({ schema: "figaro-handoff-v1", data: { mode: "face-to-face" } });
        const leafB = computeSectionLeaf({ schema: "figaro-proximity-proof-v1", data: { mode: "face-to-face" } });
        expect(leafA).not.toBe(leafB);
    });
});

describe("buildSectionInclusionProof + verifyInclusionProof", () => {
    it("single-section agreement: empty proof verifies", () => {
        const a = makeAgreement({ sections: [COMMERCE_SECTION] });
        const root = computeAgreementHash(a);
        const { leaf, proof } = buildSectionInclusionProof(a, "figaro-commerce-v1");
        expect(proof).toHaveLength(0);
        expect(leaf).toBe(computeSectionLeaf(COMMERCE_SECTION));
        expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
    });

    it("two-section agreement: proof of length 1 verifies for each section", () => {
        const a = makeAgreement({ sections: [COMMERCE_SECTION, GHG_SECTION] });
        const root = computeAgreementHash(a);

        const commerce = buildSectionInclusionProof(a, "figaro-commerce-v1");
        expect(commerce.proof).toHaveLength(1);
        expect(verifyInclusionProof(root, commerce.leaf, commerce.proof)).toBe(true);

        const ghg = buildSectionInclusionProof(a, "figaro-ghg-iso-14064-v1");
        expect(ghg.proof).toHaveLength(1);
        expect(verifyInclusionProof(root, ghg.leaf, ghg.proof)).toBe(true);
    });

    it("many-section agreement: each section proves inclusion", () => {
        const a = makeAgreement({
            sections: [COMMERCE_SECTION, GEO_SECTION, FULFILMENT_SECTION, HANDOFF_SECTION, GHG_SECTION],
        });
        const root = computeAgreementHash(a);
        for (const section of a.sections) {
            const { leaf, proof } = buildSectionInclusionProof(a, section.schema);
            expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
        }
    });

    it("rejects a tampered leaf", () => {
        const a = makeAgreement({ sections: [COMMERCE_SECTION, GHG_SECTION] });
        const root = computeAgreementHash(a);
        const { proof } = buildSectionInclusionProof(a, "figaro-commerce-v1");
        const tampered = ("0x" + "f".repeat(64)) as `0x${string}`;
        expect(verifyInclusionProof(root, tampered, proof)).toBe(false);
    });

    it("rejects a proof against a different root", () => {
        const a1 = makeAgreement({ sections: [COMMERCE_SECTION, GHG_SECTION] });
        const a2 = makeAgreement({ sections: [COMMERCE_SECTION, HANDOFF_SECTION] });
        const { leaf, proof } = buildSectionInclusionProof(a1, "figaro-commerce-v1");
        expect(verifyInclusionProof(computeAgreementHash(a2), leaf, proof)).toBe(false);
    });

    it("throws when the requested section is not in the agreement", () => {
        const a = makeAgreement({ sections: [COMMERCE_SECTION] });
        expect(() => buildSectionInclusionProof(a, "figaro-ghg-iso-14064-v1"))
            .toThrow(/Section not found/);
    });
});

// ── getSection / hasSection ──────────────────────────────────────────────────

describe("section accessors", () => {
    it("getSection returns the matching section", () => {
        const a = makeAgreement({ sections: [COMMERCE_SECTION, GEO_SECTION, GHG_SECTION] });
        const ghg = getSection(a, "figaro-ghg-iso-14064-v1");
        expect(ghg).toBeDefined();
        expect(ghg!.schema).toBe("figaro-ghg-iso-14064-v1");
        expect(ghg!.data.scope).toBe(1);
    });

    it("getSection returns undefined for missing schema", () => {
        const a = makeAgreement({ sections: [COMMERCE_SECTION] });
        expect(getSection(a, "figaro-ghg-iso-14064-v1")).toBeUndefined();
    });

    it("hasSection returns correct boolean", () => {
        const a = makeAgreement({ sections: [COMMERCE_SECTION, GEO_SECTION] });
        expect(hasSection(a, "figaro-commerce-v1")).toBe(true);
        expect(hasSection(a, "figaro-ghg-iso-14064-v1")).toBe(false);
    });
});

// ── manifestFieldsToGeoSection ───────────────────────────────────────────────

describe("manifestFieldsToGeoSection", () => {
    it("returns a figaro-geo-v1 AgreementSection", () => {
        const section = manifestFieldsToGeoSection({
            origin: "dr5reg",
            destination: "dr5reh",
            mass: "1 kg",
            volume: "5 L",
            class_: "Express",
        });
        expect(section.schema).toBe("figaro-geo-v1");
        expect(section.data.originGeohash).toBe("dr5reg");
        expect(section.data.massGrams).toBe(1000);
        expect(section.data.volumeMl).toBe(5000);
        expect(section.data.classOfService).toBe("Express");
    });
});

// ── sellerCatalogueMetadata utilities (cross-module) ─────────────────────────
// Schema-support / schema-config helpers were removed when supportedSchemas
// moved off the catalogue (capability declarations live in per-assembly
// bindings now). The only catalogue-level assertion that still applies is
// that example items round-trip schemaAttestations.

describe("sellerCatalogueMetadata example", () => {
    it("example item carries schemaAttestations", async () => {
        const { SELLER_CATALOGUE_METADATA_EXAMPLE } = await import(
            "@/lib/shared/sellerCatalogueMetadata"
        );
        const pizza = SELLER_CATALOGUE_METADATA_EXAMPLE.menu.find((i) => i.id === "pizza1");
        expect(pizza?.schemaAttestations).toBeDefined();
        expect(pizza?.schemaAttestations?.["figaro-allergen-v1"]).toBeDefined();
    });
});

// ── Redaction (Step 2 — Option B selective disclosure) ───────────────────────

describe("redactSections / computeRedactableAgreementHash / verifyRevealedSection", () => {
    it("redacted agreement hashes to the same root as the cleartext", () => {
        const cleartext = makeAgreement({
            sections: [COMMERCE_SECTION, GEO_SECTION, HANDOFF_SECTION],
        });
        const original = computeAgreementHash(cleartext);
        const redacted = redactSections(cleartext, ["figaro-commerce-v1"]);
        const redactedRoot = computeRedactableAgreementHash(redacted);
        expect(redactedRoot).toBe(original);
    });

    it("redacted section carries the same leaf the cleartext computes to", () => {
        const cleartext = makeAgreement({ sections: [COMMERCE_SECTION, GEO_SECTION] });
        const expected = computeSectionLeaf(COMMERCE_SECTION);
        const redacted = redactSections(cleartext, ["figaro-commerce-v1"]);
        const commerceEntry = redacted.sections.find((s) => s.schema === "figaro-commerce-v1")!;
        expect(isRedactedSection(commerceEntry)).toBe(true);
        if (isRedactedSection(commerceEntry)) {
            expect(commerceEntry.leaf).toBe(expected);
        }
    });

    it("non-targeted sections are passed through unchanged", () => {
        const cleartext = makeAgreement({ sections: [COMMERCE_SECTION, GEO_SECTION] });
        const redacted = redactSections(cleartext, ["figaro-commerce-v1"]);
        const geoEntry = redacted.sections.find((s) => s.schema === "figaro-geo-v1")!;
        expect(isRedactedSection(geoEntry)).toBe(false);
        // Cleartext section: same data field as before redaction.
        expect((geoEntry as AgreementSection).data).toEqual(GEO_SECTION.data);
    });

    it("redacting multiple sections is supported", () => {
        const cleartext = makeAgreement({
            sections: [COMMERCE_SECTION, GEO_SECTION, HANDOFF_SECTION],
        });
        const redacted = redactSections(cleartext, ["figaro-commerce-v1", "figaro-handoff-v1"]);
        const sealed = redacted.sections.filter(isRedactedSection);
        expect(sealed).toHaveLength(2);
        expect(computeRedactableAgreementHash(redacted)).toBe(computeAgreementHash(cleartext));
    });

    it("redacting an absent schema key is a no-op (no error)", () => {
        const cleartext = makeAgreement({ sections: [COMMERCE_SECTION, GEO_SECTION] });
        const redacted = redactSections(cleartext, ["figaro-nonexistent-v1"]);
        const sealed = redacted.sections.filter(isRedactedSection);
        expect(sealed).toHaveLength(0);
        expect(computeRedactableAgreementHash(redacted)).toBe(computeAgreementHash(cleartext));
    });

    it("verifyRevealedSection accepts the cleartext that was originally redacted", () => {
        const cleartext = makeAgreement({ sections: [COMMERCE_SECTION, GEO_SECTION] });
        const redacted = redactSections(cleartext, ["figaro-commerce-v1"]);
        expect(verifyRevealedSection(redacted, COMMERCE_SECTION)).toBe(true);
    });

    it("verifyRevealedSection rejects a tampered cleartext", () => {
        const cleartext = makeAgreement({ sections: [COMMERCE_SECTION, GEO_SECTION] });
        const redacted = redactSections(cleartext, ["figaro-commerce-v1"]);
        const tampered: AgreementSection = {
            schema: "figaro-commerce-v1",
            data: {
                ...COMMERCE_SECTION.data,
                lineItems: [
                    { itemId: "evil", name: "Evil pizza", quantity: 99, unitPrice: "1" },
                ],
            },
        };
        expect(verifyRevealedSection(redacted, tampered)).toBe(false);
    });

    it("verifyRevealedSection returns false when the schema isn't redacted", () => {
        const cleartext = makeAgreement({ sections: [COMMERCE_SECTION, GEO_SECTION] });
        // No redaction at all
        const passthrough = redactSections(cleartext, []);
        expect(verifyRevealedSection(passthrough, COMMERCE_SECTION)).toBe(false);
    });

    it("verifyRevealedSection returns false when the schema isn't in the agreement", () => {
        const cleartext = makeAgreement({ sections: [COMMERCE_SECTION, GEO_SECTION] });
        const redacted = redactSections(cleartext, ["figaro-commerce-v1"]);
        const orphan: AgreementSection = {
            schema: "figaro-not-in-agreement-v1",
            data: { whatever: 1 },
        };
        expect(verifyRevealedSection(redacted, orphan)).toBe(false);
    });

    it("buyer + seller fields are preserved across redaction", () => {
        const cleartext = makeAgreement({ sections: [COMMERCE_SECTION] });
        const redacted = redactSections(cleartext, ["figaro-commerce-v1"]);
        expect(redacted.buyer).toBe(cleartext.buyer);
        expect(redacted.seller).toBe(cleartext.seller);
        expect(redacted.version).toBe("a1");
    });
});
