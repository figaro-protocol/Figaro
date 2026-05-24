/**
 * courier-auction glue — the deferred courier edge of a local-commerce
 * process is filled by a Dutch auction. The buyer opens the auction at
 * checkout; the courier order joins the process only when a courier claims
 * it. This is incremental process assembly: a process is opened by the root
 * commit and extended over time as each edge's parties and price resolve.
 *
 * `courierAuctionId` derives the auction id deterministically from the
 * processId, so checkout (which opens the auction) and the order page
 * (which reads it and lets a courier claim) agree without passing state.
 *
 * `stashCourierDraft` / `loadCourierDraft` carry the courier order's build
 * parameters — everything known at checkout EXCEPT the courier address and
 * the cleared price — from checkout to the post-claim commit. The stash is
 * device-local for now (the project runs on-device); cross-device transport
 * (IPFS pin + XMTP CID) is the documented follow-on for a production relay.
 */
import { keccak256, encodePacked, type Hex } from "viem";
import type { BuildOrderAgreementParams } from "@/lib/core/orderAgreement";
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

/**
 * The auction id for a process's courier edge. Derived from the processId
 * so it is reconstructible by anyone who knows the process — no state passed
 * between checkout and the order page.
 */
export function courierAuctionId(processId: Hex): Hex {
    return keccak256(encodePacked(["bytes32", "string"], [processId, "figaro-courier-auction-v1"]));
}

/**
 * The courier order's build parameters, captured at checkout. The courier
 * address (the auction's claimer) and the payment (the cleared price) are
 * NOT here — they are known only post-claim and supplied then.
 */
export interface CourierAuctionDraft {
    buyer: Hex;
    currency: Hex;
    processId: Hex;
    parentOrderHashes: Hex[];
    manifestFields: BuildOrderAgreementParams["manifestFields"];
    /** Human-readable street address, sent to the courier over the
     *  coordination channel after the courier order commits. */
    deliveryAddress?: string;
}

const draftKey = (processId: string) => `figaro:courier-draft:${processId}`;

export function stashCourierDraft(processId: string, draft: CourierAuctionDraft): void {
    writeJsonStorage(draftKey(processId), draft);
}

export function loadCourierDraft(processId: string): CourierAuctionDraft | null {
    return readJsonStorage<CourierAuctionDraft | null>(draftKey(processId), null);
}
