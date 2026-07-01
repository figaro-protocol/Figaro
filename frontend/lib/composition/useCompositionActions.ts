"use client";

import { usePublicClient } from "wagmi";
import { useDutchAuctionActions } from "@/lib/composition/useDutchAuction";
import { sellerAuctionId } from "@/lib/seller/sellerAuction";
import { parseToken } from "@/lib/shared/utils";

/**
 * useCompositionActions — the ONE interface→handler dispatch seam for the fifth
 * noun (composition).
 *
 * The checkout surface is fully open-world: it discovers WHICH orders compose an
 * on-network contract by reading `block.composes` off the clause spec, renders
 * each composition's `block.fields` generically (one form, no interface name),
 * and hands the collected `{ interface, fieldValues }` here. This hook is the
 * single place a standard interface NAME maps to the concrete call — a spec-
 * routed dispatch, never a clause-id switch scattered through the UI. A
 * never-seen clause still renders and collects its fields with zero code here;
 * INVOKING a novel contract is the only thing that needs either a registered
 * handler (below) or, later, Level-2 choreography (`choreographyCID`).
 *
 * The contract ADDRESS + ABI stay inside each interface's own hook
 * (`useDutchAuctionActions` for "descending-auction"); this layer only routes.
 */

/** Context the checkout walk hands each composition invocation. All fields are
 *  DERIVED (order/process/currency) except `fieldValues`, which are the buyer's
 *  `block.fields` inputs collected by the generic runtime form. */
export interface ComposeContext {
    /** The standard interface named by the clause's `block.composes.interface`. */
    interface: string;
    /** The buyer's `block.fields` values for the composing clause, by field name. */
    fieldValues: Record<string, unknown>;
    processId: `0x${string}`;
    currency: `0x${string}`;
    tokenDecimals: number;
}

export interface ComposeResult {
    /** True when the composition DEFERS the order's counterparty selection — the
     *  order is stashed and joins the process when the composition resolves (e.g.
     *  a seller claims the descending auction), so the checkout walk skips
     *  committing it now. False → the composition runs alongside a normal commit. */
    deferred: boolean;
}

export function useCompositionActions() {
    const dutch = useDutchAuctionActions();
    const publicClient = usePublicClient();

    const compose = async (ctx: ComposeContext): Promise<ComposeResult> => {
        switch (ctx.interface) {
            case "descending-auction": {
                // The descending auction's sole runtime input is its opening
                // (maximum) price — the auction id + process + currency are all
                // derived. The auction selects the counterparty, so the order is
                // deferred until a provider claims.
                const startPrice = parseToken(String(ctx.fieldValues.startPrice ?? "0"), ctx.tokenDecimals);
                if (startPrice <= 0n) {
                    throw new Error("A descending auction needs an opening price above zero.");
                }
                const hash = await dutch.createAuction(sellerAuctionId(ctx.processId), startPrice, ctx.processId, ctx.currency);
                if (publicClient && hash) {
                    await publicClient.waitForTransactionReceipt({ hash });
                }
                return { deferred: true };
            }
            default:
                throw new Error(
                    `No runtime handler for composition interface "${ctx.interface}". ` +
                    "A novel interface needs a registered handler here (or Level-2 choreography).",
                );
        }
    };

    return { compose, available: dutch.available };
}
