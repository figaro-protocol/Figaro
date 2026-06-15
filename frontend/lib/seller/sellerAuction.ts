/**
 * seller-auction glue — the deferred seller edge of a local-commerce-dutch
 * process is filled by a Dutch auction. The buyer opens the auction at
 * checkout; the delivery order joins the process only when a seller claims
 * it. This is incremental process assembly: a process is opened by the root
 * commit and extended over time as each edge's parties and price resolve.
 *
 * `sellerAuctionId` derives the auction id deterministically from the
 * processId, so checkout (which opens the auction) and the order page
 * (which reads it and lets a seller claim) agree without passing state.
 *
 * `stashSellerDraft` / `loadSellerDraft` carry the delivery order's build
 * parameters — everything known at checkout EXCEPT the seller address and
 * the cleared price — from checkout to the post-claim commit. The stash is
 * device-local for now (the project runs on-device); cross-device transport
 * (IPFS pin + XMTP CID) is the documented follow-on for a production relay.
 */
import { keccak256, encodePacked, type Hex } from "viem";
import type { BuildOrderAgreementParams } from "@/lib/core/orderAgreement";
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

/**
 * The auction id for a process's seller edge. Derived from the processId
 * so it is reconstructible by anyone who knows the process — no state passed
 * between checkout and the order page.
 */
export function sellerAuctionId(processId: Hex): Hex {
    return keccak256(encodePacked(["bytes32", "string"], [processId, "seller-auction-v1"]));
}

/**
 * The delivery order's build parameters, captured at checkout. The seller
 * address (the auction's claimer) and the payment (the cleared price) are
 * NOT here — they are known only post-claim and supplied then.
 */
export interface SellerAuctionDraft {
    buyer: Hex;
    currency: Hex;
    processId: Hex;
    parentOrderHashes: Hex[];
    clauseFields: BuildOrderAgreementParams["clauseFields"];
    /** Human-readable street address, sent to the seller over the
     *  coordination channel after the delivery order commits. */
    deliveryAddress?: string;
}

const draftKey = (processId: string) => `figaro:seller-draft:${processId}`;

/** @public — pending consumer: the rewritten checkout's dutch deferred-edge
 *  stash (scenario-local-commerce-dutch migration); `loadSellerDraft`'s producer. */
export function stashSellerDraft(processId: string, draft: SellerAuctionDraft): void {
    writeJsonStorage(draftKey(processId), draft);
}

export function loadSellerDraft(processId: string): SellerAuctionDraft | null {
    return readJsonStorage<SellerAuctionDraft | null>(draftKey(processId), null);
}
