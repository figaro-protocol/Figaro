import { beforeAll, describe, expect, it } from "vitest";
import { getSection } from "@/lib/core/agreement";
import {
    buildOrderAgreement,
    getTopologyMode,
    getTopologyParentOrderHashes,
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
            }),
        });

        expect(getSection(agreement, "figaro-commerce")).toBeDefined();
        expect(getSection(agreement, "figaro-geolocation")).toBeDefined();
        expect(getSection(agreement, "figaro-cargo")).toBeDefined();
        expect(getSection(agreement, "figaro-topology")).toBeDefined();
        expect(getSection(agreement, "figaro-commerce")?.data.lineItems).toEqual([
            { itemId: "meal-1", name: "Lunch", quantity: 2, unitPrice: "5" },
        ]);
        expect(getTopologyMode(agreement)).toBe("root");
        expect(getTopologyParentOrderHashes(agreement)).toEqual([]);
    });

    it("preserves explicit parent hashes for declared topology edges", () => {
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

    it("adds the modality + coordination + hand-off sections from the clause set", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            clauseFields: cf({
                originGeohash: "dr5reg",
                destinationGeohash: "dr5reh",
                modality: "delivery",
                coordination: "dutch-auction",
                handoffPoints: ["face-to-face"],
            }),
        });

        // The composed sections are read BY FIELD, the way every surface reads
        // them; modality / coordination / hand-off are each their own clause.
        expect(getSection(agreement, "figaro-modalities")?.data.modality).toBe("delivery");
        expect(getSection(agreement, "figaro-coordination")?.data.coordination).toBe("dutch-auction");
        expect(getSection(agreement, "figaro-handoff")?.data.handoff).toEqual(["face-to-face"]);
    });

    it("fills seller-assigned coordination from the spec default when composed empty", () => {
        // The coordination clause is its own single-select clause; composing
        // it with no selection default-fills the spec's "seller-assigned".
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            clauseFields: {
                ...cf({ originGeohash: "dr5reg", modality: "delivery" }),
                "figaro-coordination": {},
            },
        });
        expect(getSection(agreement, "figaro-coordination")?.data.coordination).toBe("seller-assigned");
    });

    it("supports multiple hand-off points alongside a single-select modality", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            clauseFields: cf({
                originGeohash: "dr5reg",
                modality: "pickup",
                handoffPoints: ["face-to-face", "locker"],
            }),
        });
        expect(getSection(agreement, "figaro-modalities")?.data.modality).toBe("pickup");
        expect(getSection(agreement, "figaro-handoff")?.data.handoff).toEqual(["face-to-face", "locker"]);
    });

    it("drops the handoff clause when all values are unknown (the enum is closed)", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            clauseFields: cf({
                originGeohash: "dr5reg",
                modality: "pickup",
                handoffPoints: ["teleport"],
            }),
        });
        expect(getSection(agreement, "figaro-handoff")).toBeUndefined();
    });
});

describe("companion (sister) runtime anchors", () => {
    const build = (clauseFields: ReturnType<typeof cf>) =>
        buildOrderAgreement({ buyer: BUYER, seller: SELLER, currency: CURRENCY, payment: 10n, clauseFields });

    it("emits the proximity-proof anchor (empty) from proximity-policy's sisterClauseId", () => {
        const agreement = build(cf({ proximityBands: ["nearby-ble"] }));
        // Policy keeps its composed bands; proof is an EMPTY runtime anchor —
        // its band/nonce/deviceSig are attested at runtime, never composed.
        expect(getSection(agreement, "figaro-proximity-policy")?.data.bands).toEqual(["nearby-ble"]);
        expect(getSection(agreement, "figaro-proximity-proof")?.data).toEqual({});
    });

    it("emits the ghg-measurement anchor (empty) from the disclosure's sisterClauseId", () => {
        const agreement = build(cf({ ghgStandard: "ISO 14064" }));
        expect(getSection(agreement, "figaro-ghg-measurement")?.data).toEqual({});
    });

    it("emits no companion when the parent clause is absent", () => {
        const agreement = build(cf({ originGeohash: "dr5reg" }));
        expect(getSection(agreement, "figaro-proximity-proof")).toBeUndefined();
        expect(getSection(agreement, "figaro-ghg-measurement")).toBeUndefined();
    });
});

describe("generic spec-driven encode (defaults, sentinel, drop semantics)", () => {
    const build = (clauseFields: ReturnType<typeof cf>) =>
        buildOrderAgreement({ buyer: BUYER, seller: SELLER, currency: CURRENCY, payment: 10n, clauseFields });

    it("fills absent geolocation fields from the spec's `default`s", () => {
        const agreement = build(cf({ originGeohash: "dr5reg" }));
        expect(getSection(agreement, "figaro-geolocation")?.data).toEqual({
            originGeohash: "dr5reg",
            destinationGeohash: "0",
        });
    });

    it("fills absent cargo fields from the spec's `default`s", () => {
        const agreement = build(cf({ massGrams: 500 }));
        expect(getSection(agreement, "figaro-cargo")?.data).toEqual({
            massGrams: 500,
            volumeMl: 1,
        });
    });

    it("drops a section whose required field is unsatisfiable (no default)", () => {
        // applicableLaw is required and carries no default — a section arriving
        // with only the optional forum cannot be satisfied and is dropped.
        // (geolocation no longer works as this fixture: every geolocation field
        // now carries a spec default, the designer's default-on placeholder fill.)
        const agreement = build({ "figaro-applicable-law": { forum: "ny-southern-district" } });
        expect(getSection(agreement, "figaro-applicable-law")).toBeUndefined();
    });

    it("fills kleros minJurors from the spec default and coerces string input", () => {
        const withDefault = build(cf({ klerosCourt: "general" }));
        expect(getSection(withDefault, "figaro-arbitration-kleros")?.data).toEqual({
            klerosCourt: "general",
            klerosMinJurors: 3,
        });
        const coerced = build(cf({ klerosCourt: "general", klerosMinJurors: "5" }));
        expect(getSection(coerced, "figaro-arbitration-kleros")?.data.klerosMinJurors).toBe(5);
    });

    it("discards an invalid enum value and fills from the default (klerosCourt \"none\" → \"general\")", () => {
        // "none" is no longer a member of the enum (the sentinel was removed),
        // so the walk discards it as an invalid selection and default-fills the
        // required field rather than dropping the section.
        const agreement = build(cf({ klerosCourt: "none" }));
        expect(getSection(agreement, "figaro-arbitration-kleros")?.data).toEqual({
            klerosCourt: "general",
            klerosMinJurors: 3,
        });
    });

    it("fills a ghg disclosure's scope from its spec default", () => {
        const agreement = build(cf({ ghgStandard: "ISO 14064" }));
        expect(getSection(agreement, "figaro-ghg")?.data).toEqual({ standard: "ISO 14064", scope: 1 });
    });
});
