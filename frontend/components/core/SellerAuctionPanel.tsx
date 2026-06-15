"use client";

/**
 * SellerAuctionPanel — the deferred seller edge of a dutch-auction
 * local-commerce process, surfaced on `/orders/[processId]`.
 *
 * Incremental process assembly: the buyer opened a descending-price auction
 * for the seller job at checkout (no delivery order committed then). This
 * panel lets a seller claim the job at the decaying price, and — once
 * claimed — lets the claiming seller sign the delivery order into the open
 * process at the cleared price and relay it to the buyer, who counter-signs
 * it in their inbox and broadcasts the commit (the bilateral relay — the
 * same share path the checkout uses).
 *
 * Renders null for any process with no seller auction — so it is inert on
 * seller-assigned / consume-onsite / pickup processes.
 *
 * Device-local draft: the delivery order's build parameters were stashed at
 * checkout (`sellerAuction.ts`). Cross-device transport of the DRAFT is the
 * documented follow-on; the signed payload itself rides the share path
 * (IPFS pin + coordination channel).
 */

import { useState } from "react";
import { formatUnits, parseAbi, type Hex } from "viem";
import { useAccount, useChainId, useReadContract, useWalletClient } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useDutchAuction } from "@/lib/mechanisms/useDutchAuction";
import { useCommitmentFlow } from "@/lib/core/useCommitmentFlow";
import { sellerAuctionId, loadSellerDraft } from "@/lib/seller/sellerAuction";
import { prepareOrderCommitment } from "@/lib/core/orderCommitmentPreparation";
import { validateCommitmentAgreement } from "@/lib/core/orderAgreement";
import { shareCommitmentPayload } from "@/lib/core/commitmentShare";
import { CONTRACTS } from "@/lib/core/contracts";
import { computeOrderHash } from "@/lib/core/commitmentStore";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
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

export function SellerAuctionPanel({ processId }: Props) {
    const pid = processId as Hex;
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const chainId = useChainId();
    const { coordinationMessaging, evidenceTransport } = useRuntimeServices();

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

    // The seller auction is keyed deterministically off the processId, so
    // this panel finds it without any state passed from checkout.
    const auction = useDutchAuction({ id: sellerAuctionId(pid), currency, payment: 0n });
    const { signCommitment } = useCommitmentFlow();
    const { decimals } = useTokenDecimals(currency);

    const [error, setError] = useState("");
    const [relaying, setRelaying] = useState(false);
    const [sentToBuyer, setSentToBuyer] = useState(false);

    // No auction for this process — the panel is inert (seller-assigned,
    // consume-onsite, pickup, direct-sale all land here).
    if (!auction.started) return null;

    const isBuyer = hexEqual(address, rootBuyer);
    // The process opens with the root food order; the delivery order is the
    // second to join. activeOrderCount >= 2 ⇒ the delivery order has landed.
    const sellerOrderCommitted = activeOrderCount >= 2;
    const fmt = (v: bigint | undefined) => formatUnits(v ?? 0n, decimals ?? 18);

    const handleCommit = async () => {
        if (!address) {
            setError("Connect your wallet to commit the delivery order.");
            return;
        }
        const draft = loadSellerDraft(processId);
        if (!draft) {
            setError("Delivery-order draft not found on this device — it was stashed at checkout.");
            return;
        }
        if (auction.clearingPrice === undefined) {
            setError("The auction has not been claimed yet.");
            return;
        }
        setError("");
        setRelaying(true);
        try {
            // Read the process's cumulative value fresh: the delivery order's
            // expectedCumulativeValue must equal cumulativeValue + payment
            // (FigaroCore.commit's sub-order chain check).
            const fresh = (await refetchProcess()).data as ProcessTuple | undefined;
            const cumulative = fresh?.[2] ?? cumulativeValue;
            const sellerPayment = auction.clearingPrice;

            const prepared = await prepareOrderCommitment({
                buyer: draft.buyer,
                seller: address,
                currency: draft.currency,
                payment: sellerPayment,
                processId: draft.processId,
                parentOrderHashes: draft.parentOrderHashes,
                expectedCumulativeValue: cumulative + sellerPayment,
                clauseFields: draft.clauseFields,
            });
            // Layer A — the seller does not sign an invalid order (the same
            // gate the checkout runs at the buyer's sign point).
            const check = validateCommitmentAgreement(prepared.agreement, prepared.agreementHash);
            if (!check.ok) {
                setError(
                    `The delivery order isn't valid to sign yet: ${check.issues
                        .map((i) => `${i.clause} ${i.path}: ${i.message}`)
                        .join("; ")}`,
                );
                return;
            }
            // Bilateral relay: the seller signs its side and shares the
            // partial commitment to the buyer, who counter-signs in their
            // inbox and broadcasts — the same share path as the checkout.
            const sellerSig = await signCommitment(prepared.commitment);
            await shareCommitmentPayload({
                payload: {
                    commitment: prepared.commitment,
                    sellerSig,
                    agreement: prepared.commitmentMeta.agreement,
                    agreementUri: prepared.commitmentMeta.agreementUri,
                },
                recipientAddress: draft.buyer,
                senderAddress: address,
                walletClient,
                chainId,
                coordinationMessaging,
                evidenceTransport,
            });
            setSentToBuyer(true);

            // Stash the buyer's physical delivery address in the seller's own
            // channel store — best-effort: the relay has already gone out, so
            // a channel failure must not surface as a relay error. In the
            // dutch-auction flow the buyer stashed the address in the seller
            // draft at checkout.
            if (draft.deliveryAddress) {
                try {
                    await coordinationMessaging.sendHandoffAddress({
                        address,
                        recipientAddress: address,
                        orderId: computeOrderHash(prepared.commitment, chainId, CONTRACTS.core),
                        deliveryAddress: draft.deliveryAddress,
                    });
                } catch (cause) {
                    console.warn("Handoff address send to seller failed", cause);
                }
            }
        } catch (cause) {
            setError(extractErrorMessage(cause, "Delivery-order relay failed"));
        } finally {
            setRelaying(false);
        }
    };

    return (
        <Card className="p-5 space-y-3 border-sky-200 bg-sky-50" data-testid="seller-auction-panel">
            <div>
                <h3 className="text-sm font-semibold text-sky-900">Delivery — Dutch auction</h3>
                <p className="text-xs text-sky-800 mt-1 leading-relaxed">
                    The delivery seller for this order is chosen by a descending-price auction.
                    A seller claims the job at the current price; the delivery order then joins
                    this process at the cleared price.
                </p>
            </div>

            {!auction.isClaimed && (
                <div className="space-y-2">
                    <p className="text-sm text-sky-900" data-testid="seller-auction-price">
                        Current price:{" "}
                        <span className="font-mono font-semibold">{fmt(auction.currentPrice)}</span>
                    </p>
                    {isBuyer ? (
                        <p className="text-xs text-sky-700">
                            Auction open — waiting for a seller to claim.
                        </p>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void auction.claimJob()}
                            disabled={auction.isPending || auction.isConfirming}
                            data-testid="btn-claim-seller-auction"
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
                    <p className="text-sm text-sky-900" data-testid="seller-auction-claimed">
                        Claimed by{" "}
                        <span className="font-mono">{truncateHex(auction.assignedProvider ?? ZERO_ADDRESS)}</span>
                        {" at "}
                        <span className="font-mono font-semibold">{fmt(auction.clearingPrice)}</span>
                    </p>
                    {sellerOrderCommitted ? (
                        <p className="text-xs text-sky-700" data-testid="seller-auction-committed">
                            Delivery order committed — it is now a bonded order in this process.
                        </p>
                    ) : auction.isMyJob ? (
                        sentToBuyer ? (
                            <p className="text-xs text-sky-700" data-testid="seller-auction-sent">
                                Delivery order signed and sent to the buyer to counter-sign.
                            </p>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void handleCommit()}
                                disabled={relaying}
                                data-testid="btn-commit-seller-order"
                                className="w-full text-sm px-4 py-2 rounded border border-sky-700 bg-sky-700 hover:bg-sky-800 text-white font-semibold disabled:opacity-50"
                            >
                                {relaying ? "Signing…" : "Sign & send delivery order"}
                            </button>
                        )
                    ) : (
                        <p className="text-xs text-sky-700">
                            Awaiting the seller&apos;s delivery-order commit.
                        </p>
                    )}
                </div>
            )}

            {(error || auction.actionError) && (
                <p
                    className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2"
                    role="alert"
                    data-testid="seller-auction-error"
                >
                    {error || auction.actionError}
                </p>
            )}
        </Card>
    );
}
