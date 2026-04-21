import { describe, expect, it } from "vitest";
import { getSection } from "@/lib/core/agreementManifest";
import {
    buildOrderAgreement,
    getTopologyMode,
    getTopologyParentOrderHashes,
    summarizeAgreement,
} from "@/lib/core/orderAgreement";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;
const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`;
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;

describe("buildOrderAgreement", () => {
    it("builds canonical sections for a root order", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            lineItems: [
                {
                    itemId: "meal-1",
                    name: "Lunch",
                    quantity: 2,
                    unitPrice: "5",
                },
            ],
            manifestFields: {
                origin: "dr5reg",
                destination: "dr5reh",
                mass: "1 kg",
                volume: "5 L",
                class_: "Express",
            },
        });

        expect(getSection(agreement, "figaro-commerce-v1")).toBeDefined();
        expect(getSection(agreement, "figaro-geo-v1")).toBeDefined();
        expect(getSection(agreement, "figaro-topology-v1")).toBeDefined();
        expect(getSection(agreement, "figaro-commerce-v1")?.data.lineItems).toEqual([
            {
                itemId: "meal-1",
                name: "Lunch",
                quantity: 2,
                unitPrice: "5",
            },
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

    it("adds fulfilment, handoff, and ghg sections from extended manifest fields", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            manifestFields: {
                origin: "dr5reg",
                destination: "dr5reh",
                fulfilmentMethod: "deliver",
                auctionType: "dutch-auction",
                handoffMode: "face-to-face",
                ghgStandard: "iso-14064-1",
                ghgScope: "1",
            },
        });

        const summary = summarizeAgreement(agreement);
        expect(summary?.fulfilment).toEqual({ method: "deliver", auction: "dutch-auction" });
        expect(summary?.handoff).toEqual({ mode: "face-to-face" });
        expect(summary?.ghg).toEqual({ standard: "iso-14064-1", scope: 1 });
    });
});
