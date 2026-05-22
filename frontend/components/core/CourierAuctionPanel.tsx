"use client";

/**
 * CourierAuctionPanel — the deferred courier edge of a dutch-auction
 * local-commerce process, surfaced on `/orders/[processId]`.
 *
 * Incremental process assembly: the buyer opened a descending-price auction
 * for the courier job at checkout (no courier order committed then). This
 * panel lets a courier claim the job at the decaying price, and — once
 * claimed — lets the claiming courier commit the courier order into the
 * open process at the cleared price. The courier drives that commit: the
 * deferred edge commits when it resolves, by the party that resolved it.
 *
 * Renders null for any process with no courier auction — so it is inert on
 * seller-assigned / consume-onsite / pickup processes.
 *
 * Device-local draft: the courier order's build parameters were stashed at
 * checkout (`courierAuction.ts`). Cross-device transport (IPFS pin + XMTP
 * CID) is the documented follow-on for a production relay.
 */

import { useState } from "react";
import { formatUnits, parseAbi, type Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useDutchAuction } from "@/lib/mechanisms/useDutchAuction";
import { useCommitmentFlow } from "@/lib/core/useCommitmentFlow";
import { courierAuctionId, loadCourierDraft } from "@/lib/mechanisms/courierAuction";
import { prepareOrderCommitment } from "@/lib/core/orderCommitmentPreparation";
import { CONTRACTS } from "@/lib/core/contracts";
import { computeOrderHash } from "@/lib/core/commitmentStore";
import { DEFAULT_COORDINATION_MESSAGING_SERVICE } from "@/lib/shared/coordinationMessagingService";
import { hexEqual, ZERO_ADDRESS } from "@/lib/shared/evm";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import { extractErrorMessage } from "@/lib/shared/errors";
import { truncateHex } from "@/lib/shared/formatHex";

const PROCESSES_ABI = parseAbi([
    "function processes(bytes32) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)",
]);

type ProcessTuple = readonly [Hex, Hex, bigint, number];

interface Props {
    processId: string;
}

export function CourierAuctionPanel({ processId }: Props) {
    const pid = processId as Hex;
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const chainId = useChainId();

    const { data: processData, refetch: refetchProcess } = useReadContract({
        address: CONTRACTS.core,
        abi: PROCESSES_ABI,
        functionName: "processes",
        args: [pid],
    });
    const process = processData as ProcessTuple | undefined;
    const rootBuyer = process?.[0] ?? ZERO_ADDRESS;
    const currency = process?.[1] ?? ZERO_ADDRESS;
    const cumulativeValue = process?.[2] ?? 0n;
    const activeOrderCount = process?.[3] ?? 0;

    // The courier auction is keyed deterministically off the processId, so
    // this panel finds it without any state passed from checkout.
    const auction = useDutchAuction({ id: courierAuctionId(pid), currency, payment: 0n });
    const { signAndBroadcast } = useCommitmentFlow();
    const { decimals } = useTokenDecimals(currency);

    const [error, setError] = useState("");
    const [committing, setCommitting] = useState(false);

    // No auction for this process — the panel is inert (seller-assigned,
    // consume-onsite, pickup, direct-sale all land here).
    if (!auction.started) return null;

    const isBuyer = hexEqual(address, rootBuyer);
    // The process opens with the root food order; the courier order is the
    // second to join. activeOrderCount >= 2 ⇒ the courier order has landed.
    const courierOrderCommitted = activeOrderCount >= 2;
    const fmt = (v: bigint | undefined) => formatUnits(v ?? 0n, decimals ?? 18);

    const handleCommit = async () => {
        if (!address) {
            setError("Connect your wallet to commit the delivery order.");
            return;
        }
        const draft = loadCourierDraft(processId);
        if (!draft) {
            setError("Delivery-order draft not found on this device — it was stashed at checkout.");
            return;
        }
        if (auction.clearingPrice === undefined) {
            setError("The auction has not been claimed yet.");
            return;
        }
        setError("");
        setCommitting(true);
        try {
            // Read the process's cumulative value fresh: the courier order's
            // expectedCumulativeValue must equal cumulativeValue + payment
            // (FigaroCore.commit's sub-order chain check).
            const fresh = (await refetchProcess()).data as ProcessTuple | undefined;
            const cumulative = fresh?.[2] ?? cumulativeValue;
            const courierPayment = auction.clearingPrice;

            const prepared = await prepareOrderCommitment({
                buyer: draft.buyer,
                seller: address,
                currency: draft.currency,
                payment: courierPayment,
                processId: draft.processId,
                parentOrderHashes: draft.parentOrderHashes,
                expectedCumulativeValue: cumulative + courierPayment,
                manifestFields: draft.manifestFields,
            });
            // The courier is the seller of this order. In devnet the buyer's
            // counter-signature is auto-collected from Anvil; in production
            // this is where the IPFS/XMTP relay carries the partial
            // commitment to the buyer for a counter-signature.
            const txHash = await signAndBroadcast(prepared.commitment, prepared.commitmentMeta, "seller");
            // Wait for the commit to mine before refetching — a stale read
            // would leave the panel showing the commit button with no
            // automatic recovery.
            if (publicClient && txHash) {
                await publicClient.waitForTransactionReceipt({ hash: txHash });
            }
            await refetchProcess();

            // Send the buyer's physical delivery address to the courier over
            // the coordination channel — best-effort: the courier order has
            // already committed, so a channel failure must not surface as a
            // commit error. Mirrors executeCheckout's seller-/buyer-assigned
            // handoff-address send; in the dutch-auction flow the buyer
            // stashed the address in the courier draft at checkout.
            if (draft.deliveryAddress) {
                try {
                    await DEFAULT_COORDINATION_MESSAGING_SERVICE.sendHandoffAddress({
                        address,
                        recipientAddress: address,
                        orderId: computeOrderHash(prepared.commitment, chainId, CONTRACTS.core),
                        deliveryAddress: draft.deliveryAddress,
                    });
                } catch (cause) {
                    console.warn("Handoff address send to courier failed", cause);
                }
            }
        } catch (cause) {
            setError(extractErrorMessage(cause, "Delivery-order commit failed"));
        } finally {
            setCommitting(false);
        }
    };

    return (
        <Card className="p-5 space-y-3 border-sky-200 bg-sky-50" data-testid="courier-auction-panel">
            <div>
                <h3 className="text-sm font-semibold text-sky-900">Delivery — Dutch auction</h3>
                <p className="text-xs text-sky-800 mt-1 leading-relaxed">
                    The delivery courier for this order is chosen by a descending-price auction.
                    A courier claims the job at the current price; the delivery order then joins
                    this process at the cleared price.
                </p>
            </div>

            {!auction.isClaimed && (
                <div className="space-y-2">
                    <p className="text-sm text-sky-900" data-testid="courier-auction-price">
                        Current price:{" "}
                        <span className="font-mono font-semibold">{fmt(auction.currentPrice)}</span>
                    </p>
                    {isBuyer ? (
                        <p className="text-xs text-sky-700">
                            Auction open — waiting for a courier to claim.
                        </p>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void auction.claimJob()}
                            disabled={auction.isPending || auction.isConfirming}
                            data-testid="btn-claim-courier-auction"
                            className="w-full text-sm px-4 py-2 rounded border border-sky-700 bg-sky-700 hover:bg-sky-800 text-white font-semibold disabled:opacity-50"
                        >
                            {auction.isPending || auction.isConfirming
                                ? "Claiming…"
                                : `Claim delivery job at ${fmt(auction.currentPrice)}`}
                        </button>
                    )}
                </div>
            )}

            {auction.isClaimed && (
                <div className="space-y-2">
                    <p className="text-sm text-sky-900" data-testid="courier-auction-claimed">
                        Claimed by{" "}
                        <span className="font-mono">{truncateHex(auction.assignedProvider ?? ZERO_ADDRESS)}</span>
                        {" at "}
                        <span className="font-mono font-semibold">{fmt(auction.clearingPrice)}</span>
                    </p>
                    {courierOrderCommitted ? (
                        <p className="text-xs text-sky-700" data-testid="courier-auction-committed">
                            Delivery order committed — it is now a bonded order in this process.
                        </p>
                    ) : auction.isMyJob ? (
                        <button
                            type="button"
                            onClick={() => void handleCommit()}
                            disabled={committing}
                            data-testid="btn-commit-courier-order"
                            className="w-full text-sm px-4 py-2 rounded border border-sky-700 bg-sky-700 hover:bg-sky-800 text-white font-semibold disabled:opacity-50"
                        >
                            {committing ? "Committing…" : "Commit delivery order"}
                        </button>
                    ) : (
                        <p className="text-xs text-sky-700">
                            Awaiting the courier&apos;s delivery-order commit.
                        </p>
                    )}
                </div>
            )}

            {(error || auction.actionError) && (
                <p
                    className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2"
                    role="alert"
                    data-testid="courier-auction-error"
                >
                    {error || auction.actionError}
                </p>
            )}
        </Card>
    );
}
