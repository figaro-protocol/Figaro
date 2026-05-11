import { describe, expect, it } from "vitest";
import { parseSchemaSpec } from "../../src/schemas/spec.js";
import { validateContent } from "../../src/schemas/validate.js";
import topologySpecRaw from "../../src/schemas/examples/figaro-topology-v1.json" with { type: "json" };
import commerceSpecRaw from "../../src/schemas/examples/figaro-commerce-v1.json" with { type: "json" };
import geoSpecRaw from "../../src/schemas/examples/figaro-geo-v1.json" with { type: "json" };
import fulfilmentV2SpecRaw from "../../src/schemas/examples/figaro-fulfilment-v2.json" with { type: "json" };
import jurisdictionSpecRaw from "../../src/schemas/examples/figaro-jurisdiction-v1.json" with { type: "json" };
import ghgProtocolSpecRaw from "../../src/schemas/examples/figaro-ghg-protocol-v1.json" with { type: "json" };
import ghgIso14064SpecRaw from "../../src/schemas/examples/figaro-ghg-iso-14064-v1.json" with { type: "json" };
import ghgPas2050SpecRaw from "../../src/schemas/examples/figaro-ghg-pas-2050-v1.json" with { type: "json" };
import ghgEn16258SpecRaw from "../../src/schemas/examples/figaro-ghg-en-16258-v1.json" with { type: "json" };
import ghgCustomSpecRaw from "../../src/schemas/examples/figaro-ghg-custom-v1.json" with { type: "json" };
import ghgMeasurementSpecRaw from "../../src/schemas/examples/figaro-ghg-measurement-v1.json" with { type: "json" };
import lifecycleSpecRaw from "../../src/schemas/examples/figaro-delivery-lifecycle-v1.json" with { type: "json" };
import proximityPolicySpecRaw from "../../src/schemas/examples/figaro-proximity-policy-v1.json" with { type: "json" };
import proximityProofSpecRaw from "../../src/schemas/examples/figaro-proximity-proof-v1.json" with { type: "json" };
import offsetPolicySpecRaw from "../../src/schemas/examples/figaro-offset-policy-v1.json" with { type: "json" };
import merchantSpecRaw from "../../src/schemas/examples/figaro-merchant-process-v1.json" with { type: "json" };
import courierSpecRaw from "../../src/schemas/examples/figaro-courier-process-v1.json" with { type: "json" };

describe("example schema specs — parse + validate sample content", () => {
    it("figaro-topology-v1 spec parses cleanly", () => {
        const result = parseSchemaSpec(topologySpecRaw);
        expect(result.ok).toBe(true);
    });

    it("figaro-topology-v1 accepts a root-order content", () => {
        const parsed = parseSchemaSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const root = { topologyMode: "root", parentOrderHashes: [] };
        expect(validateContent(root, parsed.spec).ok).toBe(true);
    });

    it("figaro-topology-v1 accepts an explicit child-order content", () => {
        const parsed = parseSchemaSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const child = {
            topologyMode: "explicit",
            parentOrderHashes: ["0x" + "ab".repeat(32), "0x" + "cd".repeat(32)],
        };
        expect(validateContent(child, parsed.spec).ok).toBe(true);
    });

    it("figaro-topology-v1 rejects unknown topologyMode", () => {
        const parsed = parseSchemaSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const bogus = { topologyMode: "fork", parentOrderHashes: [] };
        expect(validateContent(bogus, parsed.spec).ok).toBe(false);
    });

    it("figaro-topology-v1 rejects malformed parent hashes", () => {
        const parsed = parseSchemaSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const bogus = { topologyMode: "explicit", parentOrderHashes: ["not-hex"] };
        expect(validateContent(bogus, parsed.spec).ok).toBe(false);
    });

    // ── figaro-commerce-v1 ──

    it("figaro-commerce-v1 spec parses cleanly", () => {
        expect(parseSchemaSpec(commerceSpecRaw).ok).toBe(true);
    });

    it("figaro-commerce-v1 accepts an order with line items", () => {
        const parsed = parseSchemaSpec(commerceSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const ok = validateContent({
            currency: "0x" + "ab".repeat(20),
            payment: "1000000000000000000",
            lineItems: [{ itemId: "burger-001", name: "Cheeseburger", quantity: 2, unitPrice: "500000000000000000" }],
        }, parsed.spec);
        expect(ok.ok).toBe(true);
    });

    it("figaro-commerce-v1 rejects zero payment", () => {
        const parsed = parseSchemaSpec(commerceSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const result = validateContent({
            currency: "0x" + "ab".repeat(20),
            payment: "0",
            lineItems: [],
        }, parsed.spec);
        expect(result.ok).toBe(false);
    });

    // ── figaro-geo-v1 ──

    it("figaro-geo-v1 accepts valid geohashes", () => {
        const parsed = parseSchemaSpec(geoSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ originGeohash: "u4pruydqqv", destinationGeohash: "9q8yyk8yvr" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-geo-v1 rejects geohash with disallowed characters", () => {
        const parsed = parseSchemaSpec(geoSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        // 'a' is not in the geohash base32 alphabet
        expect(validateContent({ originGeohash: "abc", destinationGeohash: "abc" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-fulfilment-v2 ──

    it("figaro-fulfilment-v2 spec parses cleanly", () => {
        const result = parseSchemaSpec(fulfilmentV2SpecRaw);
        expect(result.ok).toBe(true);
    });

    it("figaro-fulfilment-v2 accepts each single-modality content", () => {
        const parsed = parseSchemaSpec(fulfilmentV2SpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const modality of ["consume-onsite", "pickup", "delivery", "virtual"]) {
            expect(validateContent({ modalities: [modality] }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-fulfilment-v2 accepts multi-modality offers", () => {
        const parsed = parseSchemaSpec(fulfilmentV2SpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ modalities: ["pickup", "delivery"], coordinations: ["seller-assigned"] }, parsed.spec).ok).toBe(true);
    });

    it("figaro-fulfilment-v2 accepts each delivery coordination", () => {
        const parsed = parseSchemaSpec(fulfilmentV2SpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const coordination of ["buyer-assigned", "seller-assigned", "dutch-auction"]) {
            expect(validateContent({ modalities: ["delivery"], coordinations: [coordination] }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-fulfilment-v2 accepts multiple coordinations + handoff points", () => {
        const parsed = parseSchemaSpec(fulfilmentV2SpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            modalities: ["delivery"],
            coordinations: ["buyer-assigned", "dutch-auction"],
            handoffPoints: ["face-to-face", "locker"],
        }, parsed.spec).ok).toBe(true);
    });

    it("figaro-fulfilment-v2 rejects an unknown modality", () => {
        const parsed = parseSchemaSpec(fulfilmentV2SpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ modalities: ["teleport"] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-fulfilment-v2 rejects empty modalities array", () => {
        const parsed = parseSchemaSpec(fulfilmentV2SpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ modalities: [] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-fulfilment-v2 rejects missing modalities", () => {
        const parsed = parseSchemaSpec(fulfilmentV2SpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ coordinations: ["buyer-assigned"] }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-jurisdiction-v1 ──

    it("figaro-jurisdiction-v1 accepts state-law + named forum", () => {
        const parsed = parseSchemaSpec(jurisdictionSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "US-CA", forum: "JAMS-arbitration", language: "en" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-jurisdiction-v1 accepts non-state legal order (Kleros)", () => {
        const parsed = parseSchemaSpec(jurisdictionSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "Kleros", forum: "kleros", language: "en" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-jurisdiction-v1 accepts minimal applicableLaw only (forum + language optional)", () => {
        const parsed = parseSchemaSpec(jurisdictionSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "EU" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-jurisdiction-v1 rejects missing applicableLaw (required)", () => {
        const parsed = parseSchemaSpec(jurisdictionSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ forum: "JAMS-arbitration" }, parsed.spec).ok).toBe(false);
    });

    it("figaro-jurisdiction-v1 rejects applicableLaw shorter than 2 chars", () => {
        const parsed = parseSchemaSpec(jurisdictionSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "U" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-ghg-<standard>-v1 sister schemas ──

    const ghgSisterSpecs: Array<[string, unknown]> = [
        ["figaro-ghg-protocol-v1", ghgProtocolSpecRaw],
        ["figaro-ghg-iso-14064-v1", ghgIso14064SpecRaw],
        ["figaro-ghg-pas-2050-v1", ghgPas2050SpecRaw],
        ["figaro-ghg-en-16258-v1", ghgEn16258SpecRaw],
        ["figaro-ghg-custom-v1", ghgCustomSpecRaw],
    ];

    for (const [name, specRaw] of ghgSisterSpecs) {
        it(`${name} accepts each scope (1, 2, 3)`, () => {
            const parsed = parseSchemaSpec(specRaw);
            if (!parsed.ok) throw new Error("spec failed to parse");
            for (const scope of [1, 2, 3]) {
                expect(validateContent({ scope }, parsed.spec).ok).toBe(true);
            }
        });

        it(`${name} rejects scope 4`, () => {
            const parsed = parseSchemaSpec(specRaw);
            if (!parsed.ok) throw new Error("spec failed to parse");
            expect(validateContent({ scope: 4 }, parsed.spec).ok).toBe(false);
        });

        it(`${name} rejects unknown fields (closed schema)`, () => {
            const parsed = parseSchemaSpec(specRaw);
            if (!parsed.ok) throw new Error("spec failed to parse");
            expect(validateContent({ scope: 1, standard: "GHG-Protocol" }, parsed.spec).ok).toBe(false);
        });
    }

    // ── figaro-ghg-measurement-v1 ──

    it("figaro-ghg-measurement-v1 spec parses cleanly", () => {
        expect(parseSchemaSpec(ghgMeasurementSpecRaw).ok).toBe(true);
    });

    it("figaro-ghg-measurement-v1 accepts each stage with a grams value", () => {
        const parsed = parseSchemaSpec(ghgMeasurementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (let s = 0; s <= 3; s++) {
            expect(validateContent({ grams: "1250" }, parsed.spec, { stage: s }).ok).toBe(true);
        }
    });

    it("figaro-ghg-measurement-v1 rejects missing grams", () => {
        const parsed = parseSchemaSpec(ghgMeasurementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({}, parsed.spec, { stage: 1 }).ok).toBe(false);
    });

    // ── figaro-delivery-lifecycle-v1 ──

    it("figaro-delivery-lifecycle-v1 spec parses cleanly", () => {
        expect(parseSchemaSpec(lifecycleSpecRaw).ok).toBe(true);
    });

    it("figaro-delivery-lifecycle-v1 accepts each stage with optional evidence", () => {
        const parsed = parseSchemaSpec(lifecycleSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (let s = 0; s <= 4; s++) {
            expect(validateContent({}, parsed.spec, { stage: s }).ok).toBe(true);
            expect(validateContent({ evidenceUri: "ipfs://cid" }, parsed.spec, { stage: s }).ok).toBe(true);
        }
    });

    // ── figaro-proximity-policy-v1 ──

    it("figaro-proximity-policy-v1 accepts each declared band as a single-element list", () => {
        const parsed = parseSchemaSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const band of ["zone-wifi", "nearby-ble", "contact-nfc"]) {
            expect(validateContent({ bands: [band] }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-proximity-policy-v1 accepts multi-band offers", () => {
        const parsed = parseSchemaSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ bands: ["nearby-ble", "contact-nfc"] }, parsed.spec).ok).toBe(true);
    });

    it("figaro-proximity-policy-v1 rejects empty bands array", () => {
        const parsed = parseSchemaSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ bands: [] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-proximity-policy-v1 rejects an unknown band", () => {
        const parsed = parseSchemaSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ bands: ["psychic"] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-proximity-policy-v1 rejects unknown fields (closed schema — proof fields land in sister schema)", () => {
        const parsed = parseSchemaSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            bands: ["contact-nfc"],
            nonce: "0x" + "ab".repeat(32),
        }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-proximity-proof-v1 ──

    it("figaro-proximity-proof-v1 accepts a contact-nfc proof", () => {
        const parsed = parseSchemaSpec(proximityProofSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            band: "contact-nfc",
            nonce: "0x" + "ab".repeat(32),
            deviceSig: "0x" + "cd".repeat(65),
        }, parsed.spec).ok).toBe(true);
    });

    it("figaro-proximity-proof-v1 rejects an unknown band", () => {
        const parsed = parseSchemaSpec(proximityProofSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            band: "psychic",
            nonce: "0x" + "ab".repeat(32),
            deviceSig: "0x" + "cd".repeat(65),
        }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-offset-policy-v1 ──

    it("figaro-offset-policy-v1 accepts each declared provider", () => {
        const parsed = parseSchemaSpec(offsetPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const provider of ["klima", "toucan", "moss", "custom"]) {
            expect(validateContent({ providers: [provider] }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-offset-policy-v1 accepts multi-provider offers", () => {
        const parsed = parseSchemaSpec(offsetPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ providers: ["klima", "toucan"] }, parsed.spec).ok).toBe(true);
    });

    it("figaro-offset-policy-v1 rejects empty providers array", () => {
        const parsed = parseSchemaSpec(offsetPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ providers: [] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-offset-policy-v1 rejects an unknown provider", () => {
        const parsed = parseSchemaSpec(offsetPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ providers: ["unicorn-tears"] }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-merchant-process-v1 ──

    it("figaro-merchant-process-v1 accepts each known eventType", () => {
        const parsed = parseSchemaSpec(merchantSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const e of ["order-received", "accepted", "prep-started", "ready-for-pickup", "handed-off", "cancelled"]) {
            expect(validateContent({ eventType: e }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-merchant-process-v1 rejects unknown eventType", () => {
        const parsed = parseSchemaSpec(merchantSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ eventType: "burned-the-meal" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-courier-process-v1 ──

    it("figaro-courier-process-v1 accepts each known eventType", () => {
        const parsed = parseSchemaSpec(courierSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const e of ["available", "accepted", "en-route-pickup", "arrived-pickup", "in-transit", "arrived-dropoff", "completed", "cancelled"]) {
            expect(validateContent({ eventType: e }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-courier-process-v1 rejects unknown eventType", () => {
        const parsed = parseSchemaSpec(courierSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ eventType: "teleported" }, parsed.spec).ok).toBe(false);
    });
});
