import { describe, expect, it } from "vitest";
import { extractMembersRegistry, type MemberRegisteredEvent } from "@/lib/audit/membersRegistryExtract";
import { OrderState, type Order } from "@/lib/kernel/store";

const SELLER = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const mkOrder = (o: Partial<Order> & Pick<Order, "orderHash" | "seller">): Order => ({
    processId: "0xPROC", buyer: "0xBUYER", currency: "0xTOKEN",
    cumulativeValue: 0n, payment: 0n, state: OrderState.Active,
    sellerBond: 0n, buyerBond: 0n, salt: 0n, deadline: 0n, ...o,
});

describe("extractMembersRegistry — withdrawal-aware fold", () => {
    it("registered:false, no notice mentioning withdrawal, when the seller never registered", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER });
        const doc = extractMembersRegistry(order, []);
        expect(doc.registered).toBe(false);
        expect(doc.notice).toContain("NOT registered");
    });

    it("registered:true when the seller's latest event is an active registration", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER });
        const events: MemberRegisteredEvent[] = [
            { seller: SELLER, metadataURI: "ipfs://profile", blockNumber: 10, withdrawn: false },
        ];
        const doc = extractMembersRegistry(order, events);
        expect(doc.registered).toBe(true);
        expect(doc.metadataURI).toBe("ipfs://profile");
        expect(doc.notice).toBe("");
    });

    it("MemberRegistered followed by a later MemberWithdrawalRequested yields registered:false with a withdrawn-specific notice", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER });
        // The caller (auditBundlePdf.ts) folds MemberRegistered +
        // MemberWithdrawalRequested via `getActiveMembers` before this point —
        // a seller who registered and has since withdrawn arrives here with
        // `withdrawn: true` on their row, not as an absent row.
        const events: MemberRegisteredEvent[] = [
            {
                seller: SELLER,
                metadataURI: "ipfs://profile",
                blockNumber: 10,
                transactionHash: "0xregistertx",
                withdrawn: true,
            },
        ];
        const doc = extractMembersRegistry(order, events);
        expect(doc.registered).toBe(false);
        expect(doc.notice).toContain("WITHDRAWN");
        // The registration record itself is still surfaced for the audit trail
        // even though the seller is no longer current.
        expect(doc.metadataURI).toBe("ipfs://profile");
        expect(doc.registeredAtBlock).toBe(10);
    });

    it("most recent row wins when a seller re-registered after withdrawing", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER });
        const events: MemberRegisteredEvent[] = [
            { seller: SELLER, metadataURI: "ipfs://old", blockNumber: 10, withdrawn: true },
            { seller: SELLER, metadataURI: "ipfs://new", blockNumber: 20, withdrawn: false },
        ];
        const doc = extractMembersRegistry(order, events);
        expect(doc.registered).toBe(true);
        expect(doc.metadataURI).toBe("ipfs://new");
    });

    it("is case-insensitive on the seller address and ignores other sellers' events", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER });
        const events: MemberRegisteredEvent[] = [
            { seller: SELLER.toLowerCase(), metadataURI: "ipfs://profile", blockNumber: 5, withdrawn: false },
            { seller: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", metadataURI: "ipfs://other", blockNumber: 99, withdrawn: true },
        ];
        const doc = extractMembersRegistry(order, events);
        expect(doc.registered).toBe(true);
        expect(doc.metadataURI).toBe("ipfs://profile");
    });
});
