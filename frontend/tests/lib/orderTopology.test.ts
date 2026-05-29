import { beforeEach, describe, expect, it } from "vitest";
import { computeAgreementHash } from "@/lib/core/agreement";
import { saveAgreement } from "@/lib/core/agreementStore";
import { buildOrderAgreement } from "@/lib/core/orderAgreement";
import { buildAgreementsFromCache, deriveOrderDepths, deriveOrderTopology } from "@/lib/core/orderTopology";
import { OrderState, type Order } from "@/lib/core/store";
import { ZERO_BYTES32 } from "@/lib/shared/evm";
import { ANVIL_ACCOUNTS } from "../anvilAccounts";

const BUYER = ANVIL_ACCOUNTS[0];
const SELLER = ANVIL_ACCOUNTS[1];
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;
const PROCESS_ID = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeOrder(params: {
    id: string;
    payment: bigint;
    cumulativeValue: bigint;
    agreementHash?: string;
    blockNumber?: number;
}): Order {
    return {
        id: params.id,
        processId: PROCESS_ID,
        buyer: BUYER,
        seller: SELLER,
        currency: CURRENCY,
        agreementHash: params.agreementHash ?? ZERO_BYTES32,
        cumulativeValue: params.cumulativeValue,
        payment: params.payment,
        state: OrderState.Active,
        sellerBond: 0n,
        buyerBond: 0n,
        salt: 0n,
        deadline: 0n,
        blockNumber: params.blockNumber,
    };
}

beforeEach(() => {
    localStorage.clear();
});

describe("deriveOrderTopology", () => {
    it("falls back to a linear process chain when no explicit topology artifact exists", () => {
        const orders = [
            makeOrder({ id: "0x01", payment: 10n, cumulativeValue: 10n, blockNumber: 1 }),
            makeOrder({ id: "0x02", payment: 5n, cumulativeValue: 15n, blockNumber: 2 }),
            makeOrder({ id: "0x03", payment: 7n, cumulativeValue: 22n, blockNumber: 3 }),
        ];

        const topology = deriveOrderTopology(orders, buildAgreementsFromCache(orders));
        expect(topology.get("0x01")?.parentOrderIds).toEqual([]);
        expect(topology.get("0x02")?.parentOrderIds).toEqual(["0x01"]);
        expect(topology.get("0x03")?.parentOrderIds).toEqual(["0x02"]);
        expect(topology.get("0x03")?.topologyMode).toBe("linear-fallback");
    });

    it("prefers committed agreement topology over fallback inference", () => {
        const rootAgreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
        });
        const childAgreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 7n,
            parentOrderHashes: ["0x01", "0x02"],
        });

        saveAgreement(rootAgreement);
        saveAgreement(childAgreement);

        const orders = [
            makeOrder({ id: "0x01", payment: 10n, cumulativeValue: 10n, agreementHash: computeAgreementHash(rootAgreement), blockNumber: 1 }),
            makeOrder({ id: "0x02", payment: 5n, cumulativeValue: 15n, blockNumber: 2 }),
            makeOrder({ id: "0x03", payment: 7n, cumulativeValue: 22n, agreementHash: computeAgreementHash(childAgreement), blockNumber: 3 }),
        ];

        const topology = deriveOrderTopology(orders, buildAgreementsFromCache(orders));
        expect(topology.get("0x03")?.parentOrderIds).toEqual(["0x01", "0x02"]);
        expect(topology.get("0x03")?.topologyMode).toBe("explicit");
    });

    it("computes multi-level depths from declared parents", () => {
        const rootAgreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 10n,
        });
        const childAgreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 5n,
            parentOrderHashes: ["0x01"],
        });
        const grandchildAgreement = buildOrderAgreement({
            buyer: BUYER,
            seller: SELLER,
            currency: CURRENCY,
            payment: 3n,
            parentOrderHashes: ["0x02"],
        });

        saveAgreement(rootAgreement);
        saveAgreement(childAgreement);
        saveAgreement(grandchildAgreement);

        const orders = [
            makeOrder({ id: "0x01", payment: 10n, cumulativeValue: 10n, agreementHash: computeAgreementHash(rootAgreement), blockNumber: 1 }),
            makeOrder({ id: "0x02", payment: 5n, cumulativeValue: 15n, agreementHash: computeAgreementHash(childAgreement), blockNumber: 2 }),
            makeOrder({ id: "0x03", payment: 3n, cumulativeValue: 18n, agreementHash: computeAgreementHash(grandchildAgreement), blockNumber: 3 }),
        ];

        const topology = deriveOrderTopology(orders, buildAgreementsFromCache(orders));
        const depths = deriveOrderDepths(orders, topology);
        expect(depths.get("0x01")).toBe(0);
        expect(depths.get("0x02")).toBe(1);
        expect(depths.get("0x03")).toBe(2);
    });
});
