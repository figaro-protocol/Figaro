import { afterEach, describe, expect, it } from "vitest";
import { projectBillOfLading, isCarriageLeg } from "@/lib/audit/billOfLadingProjection";
import { OrderState, type Order } from "@/lib/kernel/store";
import type { Agreement } from "@figaro/core";
import { _resetClauseSpecCache_TESTING_ONLY } from "@/lib/shared/clauseSpecSource";
import { primeClauseSpecs } from "./primeClauseSpecs";

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

const CARRIAGE_CLAUSES = [
    "figaro-topology", "figaro-courier-process", "figaro-geolocation",
    "figaro-cargo", "figaro-commerce", "figaro-handoff", "figaro-freight-class",
];

const mkOrder = (o: Partial<Order> & Pick<Order, "id">): Order => ({
    processId: "0xPROC", buyer: "0xBUYER", seller: "0xCOURIER", currency: "0xToKeN",
    cumulativeValue: 0n, payment: 0n, state: OrderState.Active,
    sellerBond: 0n, buyerBond: 0n, salt: 0n, deadline: 0n, ...o,
});

const agreement = (sections: { clause: string; data: Record<string, unknown> }[]): Agreement =>
    ({ sections: sections.map((s) => ({ ...s, version: 1 })) } as unknown as Agreement);

const carriageAgreement = () => agreement([
    { clause: "figaro-topology", data: { parentOrderHashes: ["0xPARENT"] } },
    { clause: "figaro-courier-process", data: {} },
    { clause: "figaro-geolocation", data: { originGeohash: "9q8yy", destinationGeohash: "9q8yyk8yu" } },
    { clause: "figaro-cargo", data: { massGrams: 500, volumeMl: 1000 } },
    { clause: "figaro-handoff", data: { handoff: "face-to-face" } },
    { clause: "figaro-freight-class", data: { nmfcClass: "100" } },
    { clause: "figaro-commerce", data: { payment: "40", currency: "0xtoken", lineItems: [{ name: "Delivery", quantity: 1 }] } },
]);

describe("isCarriageLeg — open-world discriminator (topology parents + process-log)", () => {
    it("true for a sub-order with parents that composes a process-log ladder", async () => {
        await primeClauseSpecs(CARRIAGE_CLAUSES);
        expect(isCarriageLeg(carriageAgreement())).toBe(true);
    });

    it("false without parents (a root goods-origination order)", async () => {
        await primeClauseSpecs(CARRIAGE_CLAUSES);
        expect(isCarriageLeg(agreement([
            { clause: "figaro-topology", data: { parentOrderHashes: [] } },
            { clause: "figaro-courier-process", data: {} },
        ]))).toBe(false);
    });

    it("false without a process-log clause (parents but no custody ladder)", async () => {
        await primeClauseSpecs(CARRIAGE_CLAUSES);
        expect(isCarriageLeg(agreement([
            { clause: "figaro-topology", data: { parentOrderHashes: ["0xP"] } },
            { clause: "figaro-commerce", data: { payment: "1", currency: "0xt", lineItems: [] } },
        ]))).toBe(false);
    });
});

describe("projectBillOfLading — non-negotiable, derived from committed leaves", () => {
    it("projects a carriage leg's BoL, always non-negotiable, by declared field", async () => {
        await primeClauseSpecs(CARRIAGE_CLAUSES);
        const bol = projectBillOfLading(mkOrder({ id: "0xB", buyer: "0xBUYER", seller: "0xCOURIER" }), carriageAgreement());
        expect(bol).not.toBeNull();
        expect(bol!.negotiable).toBe(false);
        expect(bol!).toMatchObject({
            bolNumber: "0xB",
            carrier: "0xCOURIER",
            shipper: "0xBUYER",
            consignee: "0xBUYER",
            origin: "9q8yy",
            destination: "9q8yyk8yu",
            cargo: { massGrams: 500, volumeMl: 1000 },
            freightClass: { nmfcClass: "100" },
            freight: { payment: "40", currency: "0xtoken" },
        });
    });

    it("returns null for a non-carriage order (no BoL genre emitted)", async () => {
        await primeClauseSpecs(CARRIAGE_CLAUSES);
        const notCarriage = agreement([
            { clause: "figaro-commerce", data: { payment: "1", currency: "0xt", lineItems: [] } },
        ]);
        expect(projectBillOfLading(mkOrder({ id: "0xA" }), notCarriage)).toBeNull();
    });

    it("omits leaves the carriage leg didn't compose (graceful, no throw)", async () => {
        await primeClauseSpecs(CARRIAGE_CLAUSES);
        const minimal = agreement([
            { clause: "figaro-topology", data: { parentOrderHashes: ["0xP"] } },
            { clause: "figaro-courier-process", data: {} },
        ]);
        const bol = projectBillOfLading(mkOrder({ id: "0xB" }), minimal);
        expect(bol).not.toBeNull();
        expect(bol!.cargo).toBeUndefined();
        expect(bol!.origin).toBeUndefined();
        expect(bol!.freight).toBeUndefined();
        expect(bol!.negotiable).toBe(false);
    });
});
