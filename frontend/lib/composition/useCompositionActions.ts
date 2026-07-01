"use client";

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import { compositionTarget } from "@/lib/composition/compositionTarget";
import { sellerAuctionId } from "@/lib/seller/sellerAuction";
import { parseToken } from "@/lib/shared/utils";

/**
 * useCompositionActions — the ONE interface→handler dispatch seam for the fifth
 * noun (composition).
 *
 * The checkout surface is fully open-world: it discovers WHICH orders compose an
 * on-network contract by reading `block.composes` off the clause spec, renders
 * each composition's `block.fields` generically (one form, no interface name),
 * and hands the collected `{ interface, fieldValues, abiCID? }` here. This hook
 * is the single place a standard interface NAME maps to the concrete call — a
 * spec-routed dispatch, never a clause-id switch scattered through the UI.
 *
 * The concrete `{ address, abi }` comes from `compositionTarget` (env address;
 * ABI from a Level-2 `abiCID` on IPFS, else the bundled Level-1 shape), so this
 * hook carries no bundled contract handle. What stays here is the CALL-SHAPE
 * (which function, in what arg order) — integration code, per the K1-OW P1
 * doctrine (separate deployment facts from integration code). The call-shape is
 * the interface STANDARD; the trade-level coordination is the ASSEMBLY — there
 * is no separate choreography artifact. A never-seen clause still renders and
 * collects its fields with zero code here; invoking a novel contract needs a
 * handler here.
 */

/** Context the checkout walk hands each composition invocation. All fields are
 *  DERIVED (order/process/currency) except `fieldValues` (the buyer's
 *  `block.fields` inputs) and `abiCID` (the clause's Level-2 ABI pin, if any). */
export interface ComposeContext {
    /** The standard interface named by the clause's `block.composes.interface`. */
    interface: string;
    /** The buyer's `block.fields` values for the composing clause, by field name. */
    fieldValues: Record<string, unknown>;
    /** The clause's `block.composes.abiCID` — a Level-2 ABI pin, when present. */
    abiCID?: string;
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
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { writeContractAsync } = useWriteContract();

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
                if (!address) {
                    throw new Error("Connect a wallet to open the auction.");
                }
                const target = await compositionTarget(ctx.interface, { abiCID: ctx.abiCID });
                if (!target) {
                    throw new Error(`No on-network instance available for composition interface "${ctx.interface}".`);
                }
                // Call-shape is integration code: createAuction(auctionId, maxPrice,
                // processId, currency). Address + ABI came from compositionTarget.
                const hash = await writeContractAsync({
                    address: target.address,
                    abi: target.abi,
                    functionName: "createAuction",
                    args: [sellerAuctionId(ctx.processId), startPrice, ctx.processId, ctx.currency],
                    account: address,
                    chain: activeChain,
                });
                if (publicClient && hash) {
                    await publicClient.waitForTransactionReceipt({ hash });
                }
                return { deferred: true };
            }
            default:
                throw new Error(
                    `No runtime handler for composition interface "${ctx.interface}". ` +
                    "A novel interface needs a registered handler here.",
                );
        }
    };

    return { compose, available: !!address };
}
