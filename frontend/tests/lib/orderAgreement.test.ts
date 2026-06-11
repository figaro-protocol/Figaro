import { beforeAll, describe, expect, it } from "vitest";
import { getSection } from "@/lib/core/agreement";
import {
    buildOrderAgreement,
    getTopologyMode,
    getTopologyParentOrderHashes,
    summarizeAgreement,
} from "@/lib/core/orderAgreement";
import { ANVIL_ACCOUNTS } from "../anvilAccounts";
import { cf } from "./__fixtures__/clauseFields";
import { primeClauseSpecs } from "./primeClauseSpecs";

const BUYER = ANVIL_ACCOUNTS[0];
const SELLER = ANVIL_ACCOUNTS[1];
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;

// The agreement build reads clause specs (structural clauses, sister anchors,
// enum vocabularies) from the chain-fed cache — prime it with the canonical
// Layer-A specs.
beforeAll(async () => {
    await primeClauseSpecs();
});

describe("buildOrderAgreement", () => {
    it("builds canonical sections for a root order", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            lineItems: [{ itemId: "meal-1", name: "Lunch", quantity: 2, unitPrice: "5" }],
            clauseFields: cf({
                originGeohash: "dr5reg",
                destinationGeohash: "dr5reh",
                massGrams: 1000,
                volumeMl: 5000,
                classOfService: "E",
            }),
        });

        expect(getSection(agreement, "figaro-commerce-v1")).toBeDefined();
        expect(getSection(agreement, "figaro-geo-v2")).toBeDefined();
        expect(getSection(agreement, "figaro-topology-v1")).toBeDefined();
        expect(getSection(agreement, "figaro-commerce-v1")?.data.lineItems).toEqual([
            { itemId: "meal-1", name: "Lunch", quantity: 2, unitPrice: "5" },
        ]);
        expect(getTopologyMode(agreement)).toBe("root");
        expect(getTopologyParentOrderHashes(agreement)).toEqual([]);
    });

    it("preserves explicit parent hashes for declared DAG edges", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            parentOrderHashes: [
                "0x1111111111111111111111111111111111111111111111111111111111111111",
                "0x2222222222222222222222222222222222222222222222222222222222222222",
            ],
        });

        expect(getTopologyMode(agreement)).toBe("explicit");
        expect(getTopologyParentOrderHashes(agreement)).toEqual([
            "0x1111111111111111111111111111111111111111111111111111111111111111",
            "0x2222222222222222222222222222222222222222222222222222222222222222",
        ]);
    });

    it("adds a fulfilment-v2 section and a ghg disclosure from the clause set", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            clauseFields: cf({
                originGeohash: "dr5reg",
                destinationGeohash: "dr5reh",
                fulfilmentModalities: ["delivery"],
                fulfilmentCoordinations: ["dutch-auction"],
                fulfilmentHandoffPoints: ["face-to-face"],
                ghgStandards: ["figaro-ghg-iso-14064-v1"],
            }),
        });

        const summary = summarizeAgreement(agreement);
        expect(summary?.fulfilment?.modalities).toEqual(["delivery"]);
        expect(summary?.fulfilment?.coordinations).toEqual(["dutch-auction"]);
        expect(summary?.handoff?.points).toEqual(["face-to-face"]);
        expect(summary?.fulfilment?.method).toBe("deliver:dutch-auction");
        expect(summary?.ghg).toEqual({
            clauseKeys: ["figaro-ghg-iso-14064-v1"],
            // The spec's registered title — the network-defined SSoT label
            // (the hardcoded ISO-14064 ↔ clauseId map is gone).
            standard: "ISO 14064",
            scope: 1,
        });
    });

    it("fills seller-assigned coordination from the spec default when delivery carries none", () => {
        // The spec's delivery.coordination `default` fills an EMPTY selection;
        // the old encoder's magic materialize-delivery-from-nothing is gone —
        // an order offering delivery composes the delivery object, and a
        // template that doesn't is rejected loudly by Layer-A validation at
        // the sign gates (coordination is required IFF delivery is requested).
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            clauseFields: cf({
                originGeohash: "dr5reg",
                fulfilmentModalities: ["delivery"],
                fulfilmentCoordinations: [],
            }),
        });
        expect(summarizeAgreement(agreement)?.fulfilment?.coordinations).toEqual(["seller-assigned"]);
    });

    it("supports multi-valued modalities and coordinations", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            clauseFields: cf({
                originGeohash: "dr5reg",
                fulfilmentModalities: ["pickup", "delivery"],
                fulfilmentCoordinations: ["buyer-assigned", "dutch-auction"],
                fulfilmentHandoffPoints: ["face-to-face", "locker"],
            }),
        });
        const summary = summarizeAgreement(agreement);
        expect(summary?.fulfilment?.modalities).toEqual(["pickup", "delivery"]);
        expect(summary?.fulfilment?.coordinations).toEqual(["buyer-assigned", "dutch-auction"]);
        expect(summary?.handoff?.points).toEqual(["face-to-face", "locker"]);
    });

    it("drops the handoff clause when all values are unknown (the enum is closed)", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            clauseFields: cf({
                originGeohash: "dr5reg",
                fulfilmentModalities: ["pickup"],
                fulfilmentHandoffPoints: ["teleport"],
            }),
        });
        expect(summarizeAgreement(agreement)?.handoff).toBeUndefined();
    });
});

describe("companion (sister) runtime anchors", () => {
    const build = (clauseFields: ReturnType<typeof cf>) =>
        buildOrderAgreement({ buyer: BUYER, seller: SELLER, currency: CURRENCY, payment: 10n, clauseFields });

    it("emits the proximity-proof anchor (empty) from proximity-policy's sisterClauseId", () => {
        const agreement = build(cf({ proximityBands: ["nearby-ble"] }));
        // Policy keeps its composed bands; proof is an EMPTY runtime anchor —
        // its band/nonce/deviceSig are attested at runtime, never composed.
        expect(getSection(agreement, "figaro-proximity-policy-v1")?.data.bands).toEqual(["nearby-ble"]);
        expect(getSection(agreement, "figaro-proximity-proof-v1")?.data).toEqual({});
    });

    it("emits the ghg-measurement anchor (empty) from a disclosure's sisterClauseId", () => {
        const agreement = build(cf({ ghgStandards: ["figaro-ghg-iso-14064-v1"] }));
        expect(getSection(agreement, "figaro-ghg-measurement-v1")?.data).toEqual({});
    });

    it("emits the shared ghg-measurement anchor exactly once across N disclosures (dedup)", () => {
        const agreement = build(cf({ ghgStandards: ["figaro-ghg-iso-14064-v1", "figaro-ghg-en-16258-v1"] }));
        expect(agreement.sections.filter((s) => s.clause === "figaro-ghg-measurement-v1")).toHaveLength(1);
    });

    it("emits no companion when the parent clause is absent", () => {
        const agreement = build(cf({ originGeohash: "dr5reg" }));
        expect(getSection(agreement, "figaro-proximity-proof-v1")).toBeUndefined();
        expect(getSection(agreement, "figaro-ghg-measurement-v1")).toBeUndefined();
    });
});

describe("generic spec-driven encode (defaults, sentinel, drop semantics)", () => {
    const build = (clauseFields: ReturnType<typeof cf>) =>
        buildOrderAgreement({ buyer: BUYER, seller: SELLER, currency: CURRENCY, payment: 10n, clauseFields });

    it("fills absent geo fields from the spec's `default`s (minimum-valid 5-tuple)", () => {
        const agreement = build(cf({ originGeohash: "dr5reg", destinationGeohash: "dr5reh" }));
        expect(getSection(agreement, "figaro-geo-v2")?.data).toEqual({
            originGeohash: "dr5reg",
            destinationGeohash: "dr5reh",
            massGrams: 1,
            volumeMl: 1,
            classOfService: "S",
        });
    });

    it("drops a section whose required field is unsatisfiable (no default)", () => {
        // applicableLaw is required and carries no default — a section arriving
        // with only the optional forum cannot be satisfied and is dropped.
        // (geo no longer works as this fixture: every geo field now carries a
        // spec default, the designer's default-on placeholder fill.)
        const agreement = build({ "figaro-applicable-law-v1": { forum: "ny-southern-district" } });
        expect(getSection(agreement, "figaro-applicable-law-v1")).toBeUndefined();
    });

    it("fills kleros minJurors from the spec default and coerces string input", () => {
        const withDefault = build(cf({ klerosCourt: "general" }));
        expect(getSection(withDefault, "figaro-arbitration-kleros-v1")?.data).toEqual({
            klerosCourt: "general",
            klerosMinJurors: 3,
        });
        const coerced = build(cf({ klerosCourt: "general", klerosMinJurors: "5" }));
        expect(getSection(coerced, "figaro-arbitration-kleros-v1")?.data.klerosMinJurors).toBe(5);
    });

    it("rejects the spec's enum sentinel as input and fills from the default (klerosCourt \"none\" → \"general\")", () => {
        // The sentinel is never a valid selection; with the spec now declaring
        // a default court, the walk discards the sentinel and default-fills
        // rather than dropping the section.
        const agreement = build(cf({ klerosCourt: "none" }));
        expect(getSection(agreement, "figaro-arbitration-kleros-v1")?.data).toEqual({
            klerosCourt: "general",
            klerosMinJurors: 3,
        });
    });

    it("fills a ghg disclosure's scope from its spec default", () => {
        const agreement = build(cf({ ghgStandards: ["figaro-ghg-iso-14064-v1"] }));
        expect(getSection(agreement, "figaro-ghg-iso-14064-v1")?.data).toEqual({ scope: 1 });
    });
});
