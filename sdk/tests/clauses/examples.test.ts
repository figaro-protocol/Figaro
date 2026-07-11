import { describe, expect, it } from "vitest";
import { parseClauseSpec } from "../../src/clauses/spec.js";
import modalitiesSpecRaw from "../../../clauses/figaro-modalities.json" with { type: "json" };
import { validateContent } from "../../src/clauses/validate.js";
import topologySpecRaw from "../../../clauses/figaro-topology.json" with { type: "json" };
import commerceSpecRaw from "../../../clauses/figaro-commerce.json" with { type: "json" };
import geolocationSpecRaw from "../../../clauses/figaro-geolocation.json" with { type: "json" };
import cargoSpecRaw from "../../../clauses/figaro-cargo.json" with { type: "json" };
import hazmatSpecRaw from "../../../clauses/figaro-hazmat.json" with { type: "json" };
import coldChainSpecRaw from "../../../clauses/figaro-cold-chain.json" with { type: "json" };
import freightClassSpecRaw from "../../../clauses/figaro-freight-class.json" with { type: "json" };
import arbitrationKlerosSpecRaw from "../../../clauses/figaro-arbitration-kleros.json" with { type: "json" };
import applicableLawSpecRaw from "../../../clauses/figaro-applicable-law.json" with { type: "json" };
import emissionsSpecRaw from "../../../clauses/figaro-emissions.json" with { type: "json" };
import proximityPolicySpecRaw from "../../../clauses/figaro-proximity-policy.json" with { type: "json" };
import merchantSpecRaw from "../../../clauses/figaro-merchant-process.json" with { type: "json" };
import courierSpecRaw from "../../../clauses/figaro-courier-process.json" with { type: "json" };
import dimweightSpecRaw from "../../../clauses/figaro-dimweight.json" with { type: "json" };
import handoffSpecRaw from "../../../clauses/figaro-handoff.json" with { type: "json" };

describe("example clause specs — parse + validate sample content", () => {
    it("figaro-topology spec parses cleanly", () => {
        const result = parseClauseSpec(topologySpecRaw);
        expect(result.ok).toBe(true);
    });

    it("figaro-topology accepts a root-order content", () => {
        const parsed = parseClauseSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        // The clause stores only the edges; mode (root/explicit/linear) is
        // DERIVED from them, never stored.
        const root = { parentOrderHashes: [] };
        expect(validateContent(root, parsed.spec).ok).toBe(true);
    });

    it("figaro-topology accepts an explicit child-order content", () => {
        const parsed = parseClauseSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const child = {
            parentOrderHashes: ["0x" + "ab".repeat(32), "0x" + "cd".repeat(32)],
        };
        expect(validateContent(child, parsed.spec).ok).toBe(true);
    });

    it("figaro-topology rejects malformed parent hashes", () => {
        const parsed = parseClauseSpec(topologySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const bogus = { parentOrderHashes: ["not-hex"] };
        expect(validateContent(bogus, parsed.spec).ok).toBe(false);
    });

    // ── figaro-commerce ──

    it("figaro-commerce spec parses cleanly", () => {
        expect(parseClauseSpec(commerceSpecRaw).ok).toBe(true);
    });

    it("figaro-commerce accepts an order with line items", () => {
        const parsed = parseClauseSpec(commerceSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const ok = validateContent({
            currency: "0x" + "ab".repeat(20),
            payment: "1000000000000000000",
            lineItems: [{ itemId: "burger-001", name: "Cheeseburger", quantity: 2, unitPrice: "500000000000000000" }],
        }, parsed.spec);
        expect(ok.ok).toBe(true);
    });

    it("figaro-commerce rejects zero payment", () => {
        const parsed = parseClauseSpec(commerceSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const result = validateContent({
            currency: "0x" + "ab".repeat(20),
            payment: "0",
            lineItems: [],
        }, parsed.spec);
        expect(result.ok).toBe(false);
    });

    // ── figaro-geolocation ──

    it("figaro-geolocation accepts a valid origin/destination pair", () => {
        const parsed = parseClauseSpec(geolocationSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            originGeohash: "u4pruydqqv",
            destinationGeohash: "9q8yyk8yvr",
        }, parsed.spec).ok).toBe(true);
    });

    it("figaro-geolocation rejects geohash with disallowed characters", () => {
        const parsed = parseClauseSpec(geolocationSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        // 'a' is not in the geohash base32 alphabet
        expect(validateContent({
            originGeohash: "abc",
            destinationGeohash: "abc",
        }, parsed.spec).ok).toBe(false);
    });

    it("figaro-geolocation rejects missing required fields", () => {
        const parsed = parseClauseSpec(geolocationSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            originGeohash: "u",
        }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-cargo ──

    it("figaro-cargo accepts a valid mass/volume pair", () => {
        const parsed = parseClauseSpec(cargoSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ massGrams: 500, volumeMl: 1000 }, parsed.spec).ok).toBe(true);
    });

    it("figaro-cargo rejects zero mass", () => {
        const parsed = parseClauseSpec(cargoSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ massGrams: 0, volumeMl: 1 }, parsed.spec).ok).toBe(false);
    });

    it("figaro-cargo rejects zero volume", () => {
        const parsed = parseClauseSpec(cargoSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ massGrams: 1, volumeMl: 0 }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-hazmat (UN dangerous goods) ──

    it("figaro-hazmat accepts a valid dangerous-goods declaration", () => {
        const parsed = parseClauseSpec(hazmatSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            unNumber: "UN1203",
            properShippingName: "Petrol",
            hazardClass: "3",
            packingGroup: "II",
        }, parsed.spec).ok).toBe(true);
    });

    it("figaro-hazmat accepts an omitted (optional) packing group", () => {
        const parsed = parseClauseSpec(hazmatSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            unNumber: "UN1971",
            properShippingName: "Methane, compressed",
            hazardClass: "2",
        }, parsed.spec).ok).toBe(true);
    });

    it("figaro-hazmat rejects a malformed UN number", () => {
        const parsed = parseClauseSpec(hazmatSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            unNumber: "1203",
            properShippingName: "Petrol",
            hazardClass: "3",
        }, parsed.spec).ok).toBe(false);
    });

    it("figaro-hazmat rejects an unknown hazard class", () => {
        const parsed = parseClauseSpec(hazmatSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            unNumber: "UN1203",
            properShippingName: "Petrol",
            hazardClass: "10",
        }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-cold-chain (GDP cold-chain) ──

    it("figaro-cold-chain accepts a valid temperature window + recording interval", () => {
        const parsed = parseClauseSpec(coldChainSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            tempClass: "refrigerated",
            tempMinC: 2,
            tempMaxC: 8,
            recordingIntervalSeconds: 900,
        }, parsed.spec).ok).toBe(true);
    });

    it("figaro-cold-chain accepts a free-form monitoring standard (no closed list)", () => {
        const parsed = parseClauseSpec(coldChainSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            tempClass: "frozen",
            tempMinC: -25,
            tempMaxC: -18,
            recordingIntervalSeconds: 300,
            monitoringStandard: "EN 12830",
        }, parsed.spec).ok).toBe(true);
    });

    it("figaro-cold-chain rejects an unknown temperature class", () => {
        const parsed = parseClauseSpec(coldChainSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            tempClass: "warm",
            tempMinC: 20,
            tempMaxC: 25,
            recordingIntervalSeconds: 900,
        }, parsed.spec).ok).toBe(false);
    });

    it("figaro-cold-chain rejects a missing recording interval (the periodicity is a committed term)", () => {
        const parsed = parseClauseSpec(coldChainSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            tempClass: "frozen",
            tempMinC: -25,
            tempMaxC: -18,
        }, parsed.spec).ok).toBe(false);
    });

    it("figaro-cold-chain rejects a missing temperature bound", () => {
        const parsed = parseClauseSpec(coldChainSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            tempClass: "frozen",
            tempMinC: -25,
            recordingIntervalSeconds: 900,
        }, parsed.spec).ok).toBe(false);
    });

    it("figaro-cold-chain stage-1 witness carries the period record (excursion derived, never stored)", () => {
        const parsed = parseClauseSpec(coldChainSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const record = {
            periodStart: "2026-07-10T08:00:00Z",
            periodEnd: "2026-07-10T12:00:00Z",
            observedMinC: 3,
            observedMaxC: 7,
        };
        expect(validateContent(record, parsed.spec, { stage: 1 }).ok).toBe(true);
        // The committed fields do NOT validate at the witness stage…
        expect(validateContent({
            tempClass: "refrigerated", tempMinC: 2, tempMaxC: 8, recordingIntervalSeconds: 900,
        }, parsed.spec, { stage: 1 }).ok).toBe(false);
        // …and the witness does not validate against the committed fields.
        expect(validateContent(record, parsed.spec).ok).toBe(false);
    });

    // ── figaro-freight-class (NMFC) ──

    it("figaro-freight-class accepts a valid NMFC class with item number", () => {
        const parsed = parseClauseSpec(freightClassSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            nmfcClass: "70",
            nmfcItem: "156600",
        }, parsed.spec).ok).toBe(true);
    });

    it("figaro-freight-class accepts a class without the optional item number", () => {
        const parsed = parseClauseSpec(freightClassSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ nmfcClass: "100" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-freight-class rejects an unknown class", () => {
        const parsed = parseClauseSpec(freightClassSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ nmfcClass: "73" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-modalities ──

    it("figaro-modalities spec parses cleanly", () => {
        const result = parseClauseSpec(modalitiesSpecRaw);
        expect(result.ok).toBe(true);
    });

    it("figaro-modalities accepts each single-select modality", () => {
        const parsed = parseClauseSpec(modalitiesSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const modality of ["consume-onsite", "pickup", "delivery", "virtual"]) {
            expect(validateContent({ modality }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-modalities rejects an unknown modality", () => {
        const parsed = parseClauseSpec(modalitiesSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ modality: "teleport" }, parsed.spec).ok).toBe(false);
    });

    it("figaro-modalities rejects a missing modality", () => {
        const parsed = parseClauseSpec(modalitiesSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({}, parsed.spec).ok).toBe(false);
    });

    // ── figaro-arbitration-kleros ──

    it("figaro-arbitration-kleros accepts a subcourt with default jurors", () => {
        const parsed = parseClauseSpec(arbitrationKlerosSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ klerosCourt: "general" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-arbitration-kleros accepts a subcourt with explicit juror count", () => {
        const parsed = parseClauseSpec(arbitrationKlerosSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ klerosCourt: "blockchain-nontechnical", klerosMinJurors: 5 }, parsed.spec).ok).toBe(true);
    });

    it("figaro-arbitration-kleros rejects unknown klerosCourt", () => {
        const parsed = parseClauseSpec(arbitrationKlerosSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ klerosCourt: "small-claims" }, parsed.spec).ok).toBe(false);
    });

    it("figaro-arbitration-kleros rejects missing klerosCourt", () => {
        const parsed = parseClauseSpec(arbitrationKlerosSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ klerosMinJurors: 3 }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-applicable-law ──

    it("figaro-applicable-law accepts state-law + named forum", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "US-CA", forum: "JAMS-arbitration", language: "en" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-applicable-law accepts non-state legal order (forum omitted, not blank)", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        // forum is OMITTED — absence expresses "courts of competent jurisdiction",
        // never a stored empty string (which the hardened minLength now rejects).
        expect(validateContent({ applicableLaw: "Sharia", language: "ar" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-applicable-law hardening rejects malformed shapes", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        // applicableLaw: must be a hyphen-joined alnum token starting with a letter.
        expect(validateContent({ applicableLaw: "US CA" }, parsed.spec).ok).toBe(false);
        expect(validateContent({ applicableLaw: "-US" }, parsed.spec).ok).toBe(false);
        // forum: empty string is no longer a valid value (omit instead).
        expect(validateContent({ applicableLaw: "US", forum: "" }, parsed.spec).ok).toBe(false);
        // language: ISO 639 / BCP 47 shape — a full word is not a code.
        expect(validateContent({ applicableLaw: "US", language: "english" }, parsed.spec).ok).toBe(false);
    });

    it("figaro-applicable-law accepts minimal applicableLaw only", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "EU" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-applicable-law rejects missing applicableLaw", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ forum: "JAMS-arbitration" }, parsed.spec).ok).toBe(false);
    });

    it("figaro-applicable-law rejects applicableLaw shorter than 2 chars", () => {
        const parsed = parseClauseSpec(applicableLawSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ applicableLaw: "U" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-emissions (disclosure: free-form standard; no stored scope —
    //    a reader derives scope from its position in the topology) ──

    it("figaro-emissions spec parses cleanly", () => {
        expect(parseClauseSpec(emissionsSpecRaw).ok).toBe(true);
    });

    it("figaro-emissions accepts a named standard", () => {
        const parsed = parseClauseSpec(emissionsSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ standard: "ISO 14064" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-emissions accepts ANY free-form standard (no closed taxonomy)", () => {
        const parsed = parseClauseSpec(emissionsSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ standard: "My bespoke methodology v9" }, parsed.spec).ok).toBe(true);
    });

    it("figaro-emissions declares no scope field (scope is reader-derived, never stored)", () => {
        const parsed = parseClauseSpec(emissionsSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(parsed.spec.fields.some((f) => f.name === "scope")).toBe(false);
    });

    it("figaro-emissions rejects an empty standard", () => {
        const parsed = parseClauseSpec(emissionsSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ standard: "" }, parsed.spec).ok).toBe(false);
    });

    it("figaro-emissions stage-1 witness carries measured grams (no sister measurement clause)", () => {
        const parsed = parseClauseSpec(emissionsSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ gramsCO2e: 1200 }, parsed.spec, { stage: 1 }).ok).toBe(true);
        expect(validateContent({ gramsCO2e: -1 }, parsed.spec, { stage: 1 }).ok).toBe(false);
        // The committed disclosure does not validate at the witness stage…
        expect(validateContent({ standard: "ISO 14064" }, parsed.spec, { stage: 1 }).ok).toBe(false);
        // …and grams do not validate as committed content.
        expect(validateContent({ gramsCO2e: 1200 }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-proximity-policy ──

    it("figaro-proximity-policy accepts each declared band as a single-element list", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const band of ["zone-wifi", "nearby-ble", "contact-nfc"]) {
            expect(validateContent({ bands: [band] }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-proximity-policy accepts multi-band offers", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ bands: ["nearby-ble", "contact-nfc"] }, parsed.spec).ok).toBe(true);
    });

    it("figaro-proximity-policy rejects empty bands array", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ bands: [] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-proximity-policy rejects an unknown band", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ bands: ["psychic"] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-proximity-policy rejects unknown fields (closed clause — the proof lives in the witness stage)", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({
            bands: ["contact-nfc"],
            nonce: "0x" + "ab".repeat(32),
        }, parsed.spec).ok).toBe(false);
    });

    it("figaro-proximity-policy stage-1 witness carries the detected band (sufficiency read-time-derived)", () => {
        const parsed = parseClauseSpec(proximityPolicySpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ band: "zone-wifi" }, parsed.spec, { stage: 1 }).ok).toBe(true);
        expect(validateContent(
            { band: "zone-wifi", evidenceUri: "ipfs://bafy.../bssid-artifact" },
            parsed.spec, { stage: 1 },
        ).ok).toBe(true);
        expect(validateContent({ band: "psychic" }, parsed.spec, { stage: 1 }).ok).toBe(false);
        // The committed policy shape does not validate at the witness stage.
        expect(validateContent({ bands: ["zone-wifi"] }, parsed.spec, { stage: 1 }).ok).toBe(false);
    });

    // ── figaro-merchant-process ──

    it("figaro-merchant-process accepts each known eventType", () => {
        const parsed = parseClauseSpec(merchantSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const e of ["prep-started", "ready-for-pickup", "handed-off"]) {
            expect(validateContent({ eventType: e }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-merchant-process rejects unknown eventType", () => {
        const parsed = parseClauseSpec(merchantSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ eventType: "burned-the-meal" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-courier-process ──

    it("figaro-courier-process accepts each known eventType", () => {
        const parsed = parseClauseSpec(courierSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const e of ["en-route-pickup", "arrived-pickup", "in-transit", "arrived-dropoff", "completed"]) {
            expect(validateContent({ eventType: e }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-courier-process rejects unknown eventType", () => {
        const parsed = parseClauseSpec(courierSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ eventType: "teleported" }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-dimweight (dimensional/volumetric billed weight) ──

    it("figaro-dimweight accepts a billed weight with its divisor", () => {
        const parsed = parseClauseSpec(dimweightSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ billedMassGrams: 5000, divisor: 5000 }, parsed.spec).ok).toBe(true);
    });

    it("figaro-dimweight rejects a zero billed weight", () => {
        const parsed = parseClauseSpec(dimweightSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ billedMassGrams: 0, divisor: 5000 }, parsed.spec).ok).toBe(false);
    });

    it("figaro-dimweight rejects a missing divisor (billed weight is not reproducible without it)", () => {
        const parsed = parseClauseSpec(dimweightSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ billedMassGrams: 5000 }, parsed.spec).ok).toBe(false);
    });

    // ── figaro-handoff (physical hand-off point) ──

    it("figaro-handoff accepts each declared hand-off kind as a single-element list", () => {
        const parsed = parseClauseSpec(handoffSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        for (const kind of ["face-to-face", "dead-drop", "parking-area", "locker"]) {
            expect(validateContent({ handoff: [kind] }, parsed.spec).ok).toBe(true);
        }
    });

    it("figaro-handoff accepts multiple hand-off kinds", () => {
        const parsed = parseClauseSpec(handoffSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ handoff: ["face-to-face", "locker"] }, parsed.spec).ok).toBe(true);
    });

    it("figaro-handoff rejects an empty hand-off list", () => {
        const parsed = parseClauseSpec(handoffSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ handoff: [] }, parsed.spec).ok).toBe(false);
    });

    it("figaro-handoff rejects an unknown hand-off kind", () => {
        const parsed = parseClauseSpec(handoffSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ handoff: ["teleport"] }, parsed.spec).ok).toBe(false);
    });

});
