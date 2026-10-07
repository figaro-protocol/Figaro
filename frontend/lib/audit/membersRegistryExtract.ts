/**
 * Members-registry extractor — surfaces a party's
 * `MembersRegistry.MemberRegistered(member, metadataURI)` event (if any)
 * so the audit bundle includes that member's claimed off-chain identity at
 * registration time. It reads either party of the order: the seller and the
 * buyer are both members when they register, and the buyer of one process
 * sells its data in the next.
 *
 * Note on FigaroCore's design: `src/core/kernel/FigaroCore.sol` does NOT enforce that
 * a party be registered in the MembersRegistry — the Core "does not
 * gate any operation on seller state" (CLAUDE.md). Registration is an
 * off-chain discovery convention, not a resolution precondition.
 *
 * For audit purposes, however, a wallet that sells is expected to be
 * registered — this is a runtime-tier protocol convention. An unregistered
 * seller is itself an audit-significant flag (the bundle will surface
 * `registered: false` rather than silently omit). A wallet may buy without
 * registering, so an unregistered buyer is stated as a fact and not flagged;
 * a party of either kind that registered and then withdrew is flagged.
 *
 * Pure function. Caller fetches `MemberRegistered` events from the
 * MembersRegistry contract and passes them in; the extractor keeps the rows
 * of the party it was asked for.
 */

import type { Order } from "@/lib/kernel/store";
import type { ExtractedDocument } from "./types";
import { hexEqual } from "@/lib/shared/evm";

/** Which party of an order a registry entry is about. */
export type OrderParty = "seller" | "buyer";

export interface MemberRegisteredEvent {
    member: string;
    metadataURI: string;
    blockNumber?: number;
    transactionHash?: string;
    /** True when the caller's withdrawal-aware fold (`getActiveMembers` /
     *  `getMemberState` in `lib/protocol/membersRegistryIndexer.ts`) has
     *  determined this member is no longer current — a `MemberRegistered`
     *  followed by a `MemberWithdrawalRequested` at or after it. This
     *  extractor trusts the caller's fold rather than re-deriving it from
     *  raw events, so every row for a given member must carry the same
     *  value. */
    withdrawn?: boolean;
}

export interface MembersRegistryDocument extends ExtractedDocument {
    /** Which party of the order this entry is about. */
    party: OrderParty;
    /** The wallet the entry is about — the order's seller or its buyer. */
    member: string;
    /** Whether that wallet has a current `MemberRegistered` event on chain. */
    registered: boolean;
    /** IPFS / HTTPS URI pointing to the member's metadata JSON, if registered. */
    metadataURI?: string;
    /** Block at which the member registered. */
    registeredAtBlock?: number;
    /** Transaction hash of the registration. */
    registrationTransactionHash?: string;
    /** Audit notice. Empty string when registered; populated explanation
     *  when not registered (so the PDF page surfaces the gap clearly
     *  instead of looking like a missing field). */
    notice: string;
    /** True when the notice is a flag an auditor follows up: an unregistered
     *  seller, or either party withdrawn. False for a registered party and
     *  for a buyer that never registered. */
    auditSignificant: boolean;
}

/**
 * @param order        The committed order whose party's registration we
 *                     want to surface.
 * @param events       `MemberRegistered` events. Rows of other wallets are
 *                     ignored. Pass an empty array if the party has no
 *                     registration. If multiple rows are passed (e.g. the
 *                     member re-registered after withdrawing the stake),
 *                     the most recent block wins.
 * @param party        Which party to read: the order's seller (the
 *                     default) or its buyer.
 */
export function extractMembersRegistry(
    order: Order,
    events: readonly MemberRegisteredEvent[],
    party: OrderParty = "seller",
): MembersRegistryDocument {
    const member = party === "seller" ? order.seller : order.buyer;
    const base = {
        title: `Members registry entry — the ${party}`,
        orderHash: order.orderHash,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        party,
        member,
    };

    const memberEvents = events.filter((e) => hexEqual(e.member, member));
    if (memberEvents.length === 0) {
        return {
            ...base,
            registered: false,
            notice: party === "seller"
                ? "The seller is NOT registered in MembersRegistry. The Core does not require registration, " +
                  "but a wallet that sells is expected to be a member (runtime convention). Audit-significant: " +
                  "investigate the seller's claimed identity through other channels."
                : "The buyer is not registered in MembersRegistry. The Core does not require registration, " +
                  "and a wallet may buy without it. An unregistered buyer has published no profile and " +
                  "offers none of the data this order produced.",
            auditSignificant: party === "seller",
        };
    }

    // Most recent registration wins (handles withdraw + re-register).
    const sorted = [...memberEvents].sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));
    const latest = sorted[0];

    if (latest.withdrawn) {
        return {
            ...base,
            registered: false,
            metadataURI: latest.metadataURI,
            registeredAtBlock: latest.blockNumber,
            registrationTransactionHash: latest.transactionHash,
            notice:
                `The ${party} registered in MembersRegistry but has since WITHDRAWN ` +
                "(MemberWithdrawalRequested at or after the registration) and is no longer current. " +
                `Audit-significant: the ${party} de-surfaced after this registration entry was created.`,
            auditSignificant: true,
        };
    }

    return {
        ...base,
        registered: true,
        metadataURI: latest.metadataURI,
        registeredAtBlock: latest.blockNumber,
        registrationTransactionHash: latest.transactionHash,
        notice: "",
        auditSignificant: false,
    };
}
