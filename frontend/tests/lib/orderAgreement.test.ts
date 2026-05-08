import { describe, expect, it } from "vitest";
import { getSection } from "@/lib/core/agreementManifest";
import {
    buildOrderAgreement,
    getTopologyMode,
    getTopologyParentOrderHashes,
    summarizeAgreement,
} from "@/lib/core/orderAgreement";
import { ANVIL_ACCOUNTS } from "../anvilAccounts";

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
                // Legacy UI values — normalized to SDK encoder enums by
                // buildOrderAgreement so getSectionDataBytes can encode.
                fulfilmentMethod: "deliver",
                auctionType: "dutch-auction",
                handoffMode: "face-to-face",
                ghgStandard: "iso-14064-1",
                ghgScope: "1",
            },
        });

        const summary = summarizeAgreement(agreement);
        // Legacy `deliver` + `dutch-auction` combines to the canonical single-enum value.
        expect(summary?.fulfilment).toEqual({ method: "deliver:dutch-auction" });
        expect(summary?.handoff).toEqual({ mode: "face-to-face" });
        expect(summary?.ghg).toEqual({ standard: "ISO-14064", scope: 1 });
    });

    it("normalizes legacy UI handoff aliases to encoder enums", () => {
        for (const [legacy, canonical] of [
            ["meet-at-door", "face-to-face"],
            ["meet-at-car", "parking-area"],
        ] as const) {
            const agreement = buildOrderAgreement({
                buyer: BUYER,
                seller: SELLER,
                currency: CURRENCY,
                payment: 10n,
                manifestFields: { origin: "dr5reg", handoffMode: legacy },
            });
            expect(summarizeAgreement(agreement)?.handoff).toEqual({ mode: canonical });
        }
    });

    it("normalizes legacy GHG methodology ids to encoder standards", () => {
        for (const [legacy, canonical] of [
            ["iso-14064-1", "ISO-14064"],
            ["iso-14064-3", "ISO-14064"],
            ["ghg-protocol-corporate", "GHG-Protocol"],
            ["pas-2050", "PAS-2050"],
            ["custom", "Custom"],
        ] as const) {
            const agreement = buildOrderAgreement({
                buyer: BUYER,
                seller: SELLER,
                currency: CURRENCY,
                payment: 10n,
                manifestFields: { origin: "dr5reg", ghgStandard: legacy },
            });
            expect((summarizeAgreement(agreement)?.ghg as Record<string, unknown>).standard).toBe(canonical);
        }
    });

    it("passes through unknown enum values verbatim (encoder throws as correct failure mode)", () => {
        const agreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
            manifestFields: { origin: "dr5reg", handoffMode: "teleport" },
        });
        expect(summarizeAgreement(agreement)?.handoff).toEqual({ mode: "teleport" });
    });
});
