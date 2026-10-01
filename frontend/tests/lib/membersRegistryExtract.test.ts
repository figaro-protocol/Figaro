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
            { member: SELLER, metadataURI: "ipfs://profile", blockNumber: 10, withdrawn: false },
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
                member: SELLER,
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
            { member: SELLER, metadataURI: "ipfs://old", blockNumber: 10, withdrawn: true },
            { member: SELLER, metadataURI: "ipfs://new", blockNumber: 20, withdrawn: false },
        ];
        const doc = extractMembersRegistry(order, events);
        expect(doc.registered).toBe(true);
        expect(doc.metadataURI).toBe("ipfs://new");
    });

    it("is case-insensitive on the seller address and ignores other sellers' events", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER });
        const events: MemberRegisteredEvent[] = [
            { member: SELLER.toLowerCase(), metadataURI: "ipfs://profile", blockNumber: 5, withdrawn: false },
            { member: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", metadataURI: "ipfs://other", blockNumber: 99, withdrawn: true },
        ];
        const doc = extractMembersRegistry(order, events);
        expect(doc.registered).toBe(true);
        expect(doc.metadataURI).toBe("ipfs://profile");
    });
});

const BUYER = "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

describe("extractMembersRegistry — both parties of the order are read", () => {
    it("reads the buyer's registration when asked for the buyer", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER, buyer: BUYER });
        const events: MemberRegisteredEvent[] = [
            { member: SELLER, metadataURI: "ipfs://seller-profile", blockNumber: 10, withdrawn: false },
            { member: BUYER, metadataURI: "ipfs://buyer-profile", blockNumber: 12, withdrawn: false },
        ];
        const doc = extractMembersRegistry(order, events, "buyer");
        expect(doc.party).toBe("buyer");
        expect(doc.member).toBe(BUYER);
        expect(doc.registered).toBe(true);
        expect(doc.metadataURI).toBe("ipfs://buyer-profile");
        expect(doc.auditSignificant).toBe(false);
    });

    it("the seller's record names the seller and never carries the buyer's profile", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER, buyer: BUYER });
        const events: MemberRegisteredEvent[] = [
            { member: BUYER, metadataURI: "ipfs://buyer-profile", blockNumber: 12, withdrawn: false },
        ];
        const doc = extractMembersRegistry(order, events, "seller");
        expect(doc.party).toBe("seller");
        expect(doc.member).toBe(SELLER);
        expect(doc.registered).toBe(false);
        expect(doc.auditSignificant).toBe(true);
    });

    it("an unregistered buyer is stated as a fact, not flagged: a wallet may buy without registering", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER, buyer: BUYER });
        const doc = extractMembersRegistry(order, [], "buyer");
        expect(doc.registered).toBe(false);
        expect(doc.auditSignificant).toBe(false);
        expect(doc.notice).toContain("buyer is not registered");
    });

    it("a buyer that registered and then withdrew is flagged, like a seller", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER, buyer: BUYER });
        const events: MemberRegisteredEvent[] = [
            { member: BUYER, metadataURI: "ipfs://buyer-profile", blockNumber: 12, withdrawn: true },
        ];
        const doc = extractMembersRegistry(order, events, "buyer");
        expect(doc.registered).toBe(false);
        expect(doc.auditSignificant).toBe(true);
        expect(doc.notice).toContain("WITHDRAWN");
    });

    it("defaults to the seller, so a caller that names no party reads what it always read", () => {
        const order = mkOrder({ orderHash: "0xA", seller: SELLER, buyer: BUYER });
        expect(extractMembersRegistry(order, []).party).toBe("seller");
    });
});
