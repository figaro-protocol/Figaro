import { describe, expect, it } from "vitest";
import { getSection } from "@/lib/core/agreement";
import {
    buildOrderAgreement,
    getTopologyMode,
    getTopologyParentOrderHashes,
    summarizeAgreement,
} from "@/lib/core/orderAgreement";
import { ANVIL_ACCOUNTS } from "../anvilAccounts";
import { cf } from "./__fixtures__/clauseFields";

const BUYER = ANVIL_ACCOUNTS[0];
const SELLER = ANVIL_ACCOUNTS[1];
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;

describe("buildOrderAgreement", () => {
    it("builds canonical sections for a root order", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            lineItems: [{ itemId: "meal-1", name: "Lunch", quantity: 2, unitPrice: "5" }],
            clauseFields: cf({
                origin: "dr5reg",
                destination: "dr5reh",
                mass: "1 kg",
                volume: "5 L",
                class_: "Express",
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
                origin: "dr5reg",
                destination: "dr5reh",
                fulfilmentModalities: ["delivery"],
                fulfilmentCoordinations: ["dutch-auction"],
                fulfilmentHandoffPoints: ["face-to-face"],
                ghgStandards: ["figaro-ghg-iso-14064-v1"],
            }),
        });

        const summary = summarizeAgreement(agreement);
        expect(summary?.fulfilment?.modalities).toEqual(["delivery"]);
        expect(summary?.fulfilment?.coordinations).toEqual(["dutch-auction"]);
        expect(summary?.fulfilment?.handoffPoints).toEqual(["face-to-face"]);
        expect(summary?.fulfilment?.method).toBe("deliver:dutch-auction");
        expect(summary?.ghg).toEqual({
            clauseKeys: ["figaro-ghg-iso-14064-v1"],
            standard: "ISO-14064",
            scope: 1,
        });
    });

    it("auto-fills seller-assigned coordination when delivery is offered without one", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            clauseFields: cf({ origin: "dr5reg", fulfilmentModalities: ["delivery"] }),
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
                origin: "dr5reg",
                fulfilmentModalities: ["pickup", "delivery"],
                fulfilmentCoordinations: ["buyer-assigned", "dutch-auction"],
                fulfilmentHandoffPoints: ["face-to-face", "locker"],
            }),
        });
        const fulfilment = summarizeAgreement(agreement)?.fulfilment;
        expect(fulfilment?.modalities).toEqual(["pickup", "delivery"]);
        expect(fulfilment?.coordinations).toEqual(["buyer-assigned", "dutch-auction"]);
        expect(fulfilment?.handoffPoints).toEqual(["face-to-face", "locker"]);
    });

    it("drops unknown handoffPoint values (the v2 enum is closed)", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            clauseFields: cf({
                origin: "dr5reg",
                fulfilmentModalities: ["pickup"],
                fulfilmentHandoffPoints: ["teleport"],
            }),
        });
        expect(summarizeAgreement(agreement)?.fulfilment?.handoffPoints).toEqual([]);
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
        const agreement = build(cf({ origin: "dr5reg" }));
        expect(getSection(agreement, "figaro-proximity-proof-v1")).toBeUndefined();
        expect(getSection(agreement, "figaro-ghg-measurement-v1")).toBeUndefined();
    });
});
