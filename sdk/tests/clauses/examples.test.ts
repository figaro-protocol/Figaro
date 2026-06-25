import { describe, expect, it } from "vitest";
import { parseClauseSpec } from "../../src/clauses/spec.js";
import modalitiesSpecRaw from "../../../clauses/figaro-modalities.json" with { type: "json" };
import coordinationSpecRaw from "../../../clauses/figaro-coordination.json" with { type: "json" };
import { validateContent } from "../../src/clauses/validate.js";
import topologySpecRaw from "../../../clauses/figaro-topology.json" with { type: "json" };
import commerceSpecRaw from "../../../clauses/figaro-commerce.json" with { type: "json" };
import geoSpecRaw from "../../../clauses/figaro-geo.json" with { type: "json" };
import classOfServiceSpecRaw from "../../../clauses/figaro-class-of-service.json" with { type: "json" };
import arbitrationKlerosSpecRaw from "../../../clauses/figaro-arbitration-kleros.json" with { type: "json" };
import applicableLawSpecRaw from "../../../clauses/figaro-applicable-law.json" with { type: "json" };
import ghgSpecRaw from "../../../clauses/figaro-ghg.json" with { type: "json" };
import ghgMeasurementSpecRaw from "../../../clauses/figaro-ghg-measurement.json" with { type: "json" };
import proximityPolicySpecRaw from "../../../clauses/figaro-proximity-policy.json" with { type: "json" };
import proximityProofSpecRaw from "../../../clauses/figaro-proximity-proof.json" with { type: "json" };
import offsetPolicySpecRaw from "../../../clauses/figaro-offset-policy.json" with { type: "json" };
import merchantSpecRaw from "../../../clauses/figaro-merchant-process.json" with { type: "json" };
import courierSpecRaw from "../../../clauses/figaro-courier-process.json" with { type: "json" };

describe("example clause specs — parse + validate sample content", () => {
    it("figaro-topology-v1 spec parses cleanly", () => {
        const result = parseClauseSpec(topologySpecRaw);
        expect(result.ok).toBe(true);
    });

    it("figaro-topology-v1 accepts a root-order content", () => {
        const parsed = parseClauseSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const root = { topologyMode: "root", parentOrderHashes: [] };
        expect(validateContent(root, parsed.spec).ok).toBe(true);
    });

    it("figaro-topology-v1 accepts an explicit child-order content", () => {
        const parsed = parseClauseSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const child = {
            topologyMode: "explicit",
            parentOrderHashes: ["0x" + "ab".repeat(32), "0x" + "cd".repeat(32)],
        };
        expect(validateContent(child, parsed.spec).ok).toBe(true);
    });

    it("figaro-topology-v1 rejects unknown topologyMode", () => {
        const parsed = parseClauseSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const bogus = { topologyMode: "fork", parentOrderHashes: [] };
        expect(validateContent(bogus, parsed.spec).ok).toBe(false);
    });

    it("figaro-topology-v1 rejects malformed parent hashes", () => {
        const parsed = parseClauseSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const bogus = { topologyMode: "explicit", parentOrderHashes: ["not-hex"] };
        expect(validateContent(bogus, parsed.spec).ok).toBe(false);
    });

    // ── figaro-commerce-v1 ──

    it("figaro-commerce-v1 spec parses cleanly", () => {
        expect(parseClauseSpec(commerceSpecRaw).ok).toBe(true);
    });

    it("figaro-commerce-v1 accepts an order with line items", () => {
        const parsed = parseClauseSpec(commerceSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const ok = validateContent({
            currency: "0x" + "ab".repeat(20),
            payment: "1000000000000000000",
            lineItems: [{ itemId: "burger-001", name: "Cheeseburger", quantity: 2, unitPrice: "500000000000000000" }],
        }, parsed.spec);
        expect(ok.ok).toBe(true);
    });

    it("figaro-commerce-v1 rejects zero payment", () => {
        const parsed = parseClauseSpec(commerceSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const result = validateContent({
            currency: "0x" + "ab".repeat(20),
            payment: "0",
            lineItems: [],
        }, parsed.spec);
        expect(result.ok).toBe(false);
    });

    // ── figaro-geo (class-of-service split out) ──

    it("figaro-geo accepts a valid 4-tuple", () => {
        const parsed = parseClauseSpec(geoSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            originGeohash: "u4pruydqqv",
            destinationGeohash: "9q8yyk8yvr",
            massGrams: 500,
            volumeMl: 1000,
        }, parsed.spec).ok).toBe(true);
    });

    it("figaro-geo rejects geohash with disallowed characters", () => {
        const parsed = parseClauseSpec(geoSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        // 'a' is not in the geohash base32 alphabet
        expect(validateContent({
            originGeohash: "abc",
            destinationGeohash: "abc",
            massGrams: 1,
            volumeMl: 1,
        }, parsed.spec).ok).toBe(false);
    });

    it("figaro-geo rejects zero mass", () => {
        const parsed = parseClauseSpec(geoSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            originGeohash: "u",
            destinationGeohash: "v",
            massGrams: 0,
            volumeMl: 1,
        }, parsed.spec).ok).toBe(false);
    });

    it("figaro-geo rejects zero volume", () => {
        const parsed = parseClauseSpec(geoSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            originGeohash: "u",
            destinationGeohash: "v",
            massGrams: 1,
            volumeMl: 0,
        }, parsed.spec).ok).toBe(false);
    });

    it("figaro-geo rejects missing required fields", () => {
        const parsed = parseClauseSpec(geoSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            originGeohash: "u",
        }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-class-of-service (split out of geo) ──

    it("figaro-class-of-service accepts every class value", () => {
        const parsed = parseClauseSpec(classOfServiceSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const cls of ["S", "E", "F", "C"]) {
            expect(validateContent({ classOfService: cls }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-class-of-service rejects an unknown class", () => {
        const parsed = parseClauseSpec(classOfServiceSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ classOfService: "X" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-modalities-v1 ──

    it("figaro-modalities-v1 spec parses cleanly", () => {
        const result = parseClauseSpec(modalitiesSpecRaw);
        expect(result.ok).toBe(true);
    });

    it("figaro-modalities-v1 accepts each single-select modality", () => {
        const parsed = parseClauseSpec(modalitiesSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const modality of ["consume-onsite", "pickup", "delivery", "virtual"]) {
            expect(validateContent({ modality }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-modalities-v1 rejects an unknown modality", () => {
        const parsed = parseClauseSpec(modalitiesSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ modality: "teleport" }, parsed.spec).ok).toBe(false);
    });

    it("figaro-modalities-v1 rejects a missing modality", () => {
        const parsed = parseClauseSpec(modalitiesSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({}, parsed.spec).ok).toBe(false);
    });

    // ── figaro-coordination-v1 ──

    it("figaro-coordination-v1 spec parses cleanly", () => {
        const result = parseClauseSpec(coordinationSpecRaw);
        expect(result.ok).toBe(true);
    });

    it("figaro-coordination-v1 accepts each single-select coordination", () => {
        const parsed = parseClauseSpec(coordinationSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const coordination of ["seller-assigned", "buyer-assigned", "dutch-auction"]) {
            expect(validateContent({ coordination }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-coordination-v1 rejects an unknown coordination", () => {
        const parsed = parseClauseSpec(coordinationSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ coordination: "telepathy" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-arbitration-kleros-v1 ──

    it("figaro-arbitration-kleros-v1 accepts a subcourt with default jurors", () => {
        const parsed = parseClauseSpec(arbitrationKlerosSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ klerosCourt: "general" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-arbitration-kleros-v1 accepts a subcourt with explicit juror count", () => {
        const parsed = parseClauseSpec(arbitrationKlerosSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ klerosCourt: "blockchain-nontechnical", klerosMinJurors: 5 }, parsed.spec).ok).toBe(true);
    });

    it("figaro-arbitration-kleros-v1 rejects unknown klerosCourt", () => {
        const parsed = parseClauseSpec(arbitrationKlerosSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ klerosCourt: "small-claims" }, parsed.spec).ok).toBe(false);
    });

    it("figaro-arbitration-kleros-v1 rejects missing klerosCourt", () => {
        const parsed = parseClauseSpec(arbitrationKlerosSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ klerosMinJurors: 3 }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-applicable-law-v1 ──

    it("figaro-applicable-law-v1 accepts state-law + named forum", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "US-CA", forum: "JAMS-arbitration", language: "en" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-applicable-law-v1 accepts non-state legal order", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "Sharia", forum: "", language: "ar" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-applicable-law-v1 accepts minimal applicableLaw only", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "EU" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-applicable-law-v1 rejects missing applicableLaw", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ forum: "JAMS-arbitration" }, parsed.spec).ok).toBe(false);
    });

    it("figaro-applicable-law-v1 rejects applicableLaw shorter than 2 chars", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "U" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-ghg (consolidated disclosure: free-form standard + scope) ──

    it("figaro-ghg spec parses cleanly", () => {
        expect(parseClauseSpec(ghgSpecRaw).ok).toBe(true);
    });

    it("figaro-ghg accepts each scope (1, 2, 3) under a named standard", () => {
        const parsed = parseClauseSpec(ghgSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const scope of [1, 2, 3]) {
            expect(validateContent({ standard: "ISO 14064", scope }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-ghg accepts ANY free-form standard (no closed taxonomy)", () => {
        const parsed = parseClauseSpec(ghgSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ standard: "My bespoke methodology v9", scope: 1 }, parsed.spec).ok).toBe(true);
    });

    it("figaro-ghg rejects scope 4", () => {
        const parsed = parseClauseSpec(ghgSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ standard: "ISO 14064", scope: 4 }, parsed.spec).ok).toBe(false);
    });

    it("figaro-ghg rejects an empty standard", () => {
        const parsed = parseClauseSpec(ghgSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ standard: "", scope: 1 }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-ghg-measurement-v1 ──

    it("figaro-ghg-measurement-v1 spec parses cleanly", () => {
        expect(parseClauseSpec(ghgMeasurementSpecRaw).ok).toBe(true);
    });

    it("figaro-ghg-measurement-v1 accepts each stage with a grams value", () => {
        const parsed = parseClauseSpec(ghgMeasurementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (let s = 0; s <= 3; s++) {
            expect(validateContent({ grams: "1250" }, parsed.spec, { stage: s }).ok).toBe(true);
        }
    });

    it("figaro-ghg-measurement-v1 rejects missing grams", () => {
        const parsed = parseClauseSpec(ghgMeasurementSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({}, parsed.spec, { stage: 1 }).ok).toBe(false);
    });

    // ── figaro-proximity-policy-v1 ──

    it("figaro-proximity-policy-v1 accepts each declared band as a single-element list", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const band of ["zone-wifi", "nearby-ble", "contact-nfc"]) {
            expect(validateContent({ bands: [band] }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-proximity-policy-v1 accepts multi-band offers", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ bands: ["nearby-ble", "contact-nfc"] }, parsed.spec).ok).toBe(true);
    });

    it("figaro-proximity-policy-v1 rejects empty bands array", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ bands: [] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-proximity-policy-v1 rejects an unknown band", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ bands: ["psychic"] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-proximity-policy-v1 rejects unknown fields (closed clause — proof fields land in sister clause)", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            bands: ["contact-nfc"],
            nonce: "0x" + "ab".repeat(32),
        }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-proximity-proof-v1 ──

    it("figaro-proximity-proof-v1 accepts a contact-nfc proof", () => {
        const parsed = parseClauseSpec(proximityProofSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            band: "contact-nfc",
            nonce: "0x" + "ab".repeat(32),
            deviceSig: "0x" + "cd".repeat(65),
        }, parsed.spec).ok).toBe(true);
    });

    it("figaro-proximity-proof-v1 rejects an unknown band", () => {
        const parsed = parseClauseSpec(proximityProofSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            band: "psychic",
            nonce: "0x" + "ab".repeat(32),
            deviceSig: "0x" + "cd".repeat(65),
        }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-offset-policy-v1 ──

    it("figaro-offset-policy-v1 accepts each declared provider", () => {
        const parsed = parseClauseSpec(offsetPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const provider of ["klima", "toucan", "moss", "custom"]) {
            expect(validateContent({ providers: [provider] }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-offset-policy-v1 accepts multi-provider offers", () => {
        const parsed = parseClauseSpec(offsetPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ providers: ["klima", "toucan"] }, parsed.spec).ok).toBe(true);
    });

    it("figaro-offset-policy-v1 rejects empty providers array", () => {
        const parsed = parseClauseSpec(offsetPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ providers: [] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-offset-policy-v1 rejects an unknown provider", () => {
        const parsed = parseClauseSpec(offsetPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ providers: ["unicorn-tears"] }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-merchant-process-v1 ──

    it("figaro-merchant-process-v1 accepts each known eventType", () => {
        const parsed = parseClauseSpec(merchantSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const e of ["prep-started", "ready-for-pickup", "handed-off"]) {
            expect(validateContent({ eventType: e }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-merchant-process-v1 rejects unknown eventType", () => {
        const parsed = parseClauseSpec(merchantSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ eventType: "burned-the-meal" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-courier-process-v1 ──

    it("figaro-courier-process-v1 accepts each known eventType", () => {
        const parsed = parseClauseSpec(courierSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const e of ["en-route-pickup", "arrived-pickup", "in-transit", "arrived-dropoff", "completed"]) {
            expect(validateContent({ eventType: e }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-courier-process-v1 rejects unknown eventType", () => {
        const parsed = parseClauseSpec(courierSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ eventType: "teleported" }, parsed.spec).ok).toBe(false);
    });
});
