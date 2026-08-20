/**
 * CommitmentSharePanel — displays the buyer-signed EIP-712 commitment and the
 * transports for relaying it to the seller (XMTP send + QR/copy fallback).
 *
 * Flow:
 *   1. The buyer signs the order → the panel shows its details.
 *   2. The buyer relays it to the seller (XMTP, or QR/copy for the /sign page).
 *   3. The seller counter-signs and commits on-chain (in their /orders list).
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { formatToken } from "@/lib/shared/utils";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
    shareSignedOrder,
} from "@/lib/checkout/orderSignedAndShared";
import {
    serializeCommitmentPayload,
    type CommitmentPayload,
} from "@figaro-protocol/sdk/agent";
import type { OrderFlowStep } from "@/lib/checkout/orderCommitmentFlow";
import { ZERO_PROCESS_ID, hexEqual } from "@/lib/shared/evm";
import { extractErrorMessage } from "@/lib/shared/errors";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { truncateHex } from "@/lib/shared/formatHex";

/** Send state machine for the outbound share: idle → sending → sent | error. */
type TransportStatus = "idle" | "sending" | "sent" | "error";

function resolveRecipientAddress(
    payload: CommitmentPayload,
    currentAddress?: string,
): string | null {
    if (hexEqual(currentAddress, payload.commitment.buyer)) {
        return payload.commitment.seller;
    }

    if (hexEqual(currentAddress, payload.commitment.seller)) {
        return payload.commitment.buyer;
    }

    if (payload.buyerSig && !payload.sellerSig) {
        return payload.commitment.seller;
    }

    if (payload.sellerSig && !payload.buyerSig) {
        return payload.commitment.buyer;
    }

    return null;
}

// ── QR code generation ─────────────────────────────────────────

async function generateQRDataURL(payload: string, size: number): Promise<string> {
    const QRCode = await import("qrcode");
    return QRCode.toDataURL(payload, {
        width: size,
        margin: 2,
        errorCorrectionLevel: "L", // Lower correction → more data capacity
        color: { dark: "#000000", light: "#ffffff" },
    });
}

// ── Props ──────────────────────────────────────────────────────

interface CommitmentSharePanelProps {
    payload: CommitmentPayload | null;
    step: OrderFlowStep;
    /** Token decimals for formatting payment display. */
    tokenDecimals?: number;
    /** Called when the user copies the share link. */
    onCopyLink?: () => void;
    /** QR code size in px. */
    qrSize?: number;
}

// ── Component ──────────────────────────────────────────────────

export function CommitmentSharePanel({
    payload,
    step,
    tokenDecimals = 18,
    onCopyLink,
    qrSize = 200,
}: CommitmentSharePanelProps) {
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const chainId = useChainId();
    const { handoffMessaging, evidenceTransport } = useRuntimeServices();
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [qrUnavailable, setQrUnavailable] = useState(false);
    const [copied, setCopied] = useState(false);
    const [transportStatus, setTransportStatus] = useState<TransportStatus>("idle");
    const [transportError, setTransportError] = useState<string | null>(null);
    const [transportRecipient, setTransportRecipient] = useState<string | null>(null);

    const serialized = payload ? serializeCommitmentPayload(payload) : null;
    const recipientAddress = payload ? resolveRecipientAddress(payload, address) : null;

    useEffect(() => {
        setTransportStatus("idle");
        setTransportError(null);
        setTransportRecipient(null);
    }, [payload, recipientAddress]);

    // Generate QR when payload is ready and waiting for counter-party
    useEffect(() => {
        if (!serialized || step !== "awaiting-seller") {
            setQrDataUrl(null);
            setQrUnavailable(false);
            return;
        }

        let cancelled = false;
        generateQRDataURL(serialized, qrSize)
            .then((url) => {
                if (!cancelled) {
                    setQrDataUrl(url);
                    setQrUnavailable(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setQrDataUrl(null);
                    setQrUnavailable(true);
                }
            });

        return () => { cancelled = true; };
    }, [serialized, step, qrSize]);

    const handleCopy = useCallback(async () => {
        if (!serialized) return;
        try {
            await navigator.clipboard.writeText(serialized);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            onCopyLink?.();
        } catch { /* clipboard not available */ }
    }, [serialized, onCopyLink]);

    const handleSendViaXmtp = useCallback(async () => {
        if (!payload || !address || !recipientAddress) {
            setTransportStatus("error");
            setTransportError("Could not determine the counter-party wallet for XMTP delivery.");
            return;
        }

        setTransportStatus("sending");
        setTransportError(null);
        try {
            await shareSignedOrder({
                payload,
                recipientAddress,
                senderAddress: address,
                walletClient,
                chainId,
                handoffMessaging,
                evidenceTransport,
            });
            setTransportRecipient(recipientAddress);
            setTransportStatus("sent");
        } catch (error) {
            setTransportStatus("error");
            setTransportError(extractErrorMessage(error, "Failed to send the commitment payload over XMTP."));
        }
    }, [address, chainId, handoffMessaging, evidenceTransport, payload, recipientAddress, walletClient]);

    if (!payload) return null;

    const commitment = payload.commitment;
    const isRoot = commitment.processId === ZERO_PROCESS_ID;
    const hasBuyerSig = !!payload.buyerSig;
    const hasSellerSig = !!payload.sellerSig;

    return (
        <Card className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
                {isRoot ? "Order Commitment" : "Sub-Order Commitment"}
            </h3>

            {/* Commitment details */}
            <div className="text-xs space-y-1 text-gray-600">
                <div className="flex justify-between">
                    <span>Buyer</span>
                    <span className="font-mono">{truncateHex(commitment.buyer)}</span>
                </div>
                <div className="flex justify-between">
                    <span>Seller</span>
                    <span className="font-mono">{truncateHex(commitment.seller)}</span>
                </div>
                <div className="flex justify-between">
                    <span>Payment</span>
                    <span>{formatToken(commitment.payment, tokenDecimals)} tokens</span>
                </div>
                {!isRoot && (
                    <div className="flex justify-between">
                        <span>Process</span>
                        <span className="font-mono">
                            {truncateHex(commitment.processId, { head: 10, tail: 0 })}
                        </span>
                    </div>
                )}
                <div className="flex justify-between">
                    <span>Deadline</span>
                    <span>{new Date(Number(commitment.deadline) * 1000).toLocaleTimeString()}</span>
                </div>
            </div>

            {/* Signature status */}
            <div className="flex gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded ${hasBuyerSig ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                    Buyer: {hasBuyerSig ? "Signed" : "Pending"}
                </span>
                <span className={`px-2 py-0.5 rounded ${hasSellerSig ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                    Seller: {hasSellerSig ? "Signed" : "Pending"}
                </span>
            </div>

            {/* QR code (shown when awaiting the seller's counter-signature) */}
            {step === "awaiting-seller" && (
                <div className="flex flex-col items-center gap-2">
                    <p className="text-xs text-gray-500">
                        Share with the counter-party to collect their signature.
                        Send it over XMTP or copy the payload as a fallback for the{" "}
                        <a href="/sign" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">/sign</a>{" "}
                        page.
                    </p>
                    {qrDataUrl && (
                        <Image
                            src={qrDataUrl}
                            alt="Commitment QR"
                            width={qrSize}
                            height={qrSize}
                            unoptimized
                            data-testid="commitment-qr"
                        />
                    )}
                    {qrUnavailable && (
                        <p className="text-xs text-amber-600 text-center" data-testid="commitment-qr-unavailable">
                            QR sharing is unavailable for this payload size. Use the copy button instead.
                        </p>
                    )}
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleCopy}
                            data-testid="copy-commitment-link"
                        >
                            {copied ? "Copied!" : "Copy Payload"}
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                                void handleSendViaXmtp();
                            }}
                            data-testid="send-commitment-xmtp"
                        >
                            {transportStatus === "sending" ? "Sending…" : "Send via XMTP"}
                        </Button>
                    </div>
                    {transportStatus === "sent" && transportRecipient && (
                        <p
                            className="text-[11px] text-green-700 text-center max-w-sm"
                            data-testid="commitment-xmtp-status"
                        >
                            Commitment payload sent over XMTP to {truncateHex(transportRecipient)}.
                        </p>
                    )}
                    {transportStatus === "error" && transportError && (
                        <p
                            className="text-[11px] text-amber-700 text-center max-w-sm"
                            data-testid="commitment-xmtp-status"
                        >
                            {transportError}
                        </p>
                    )}
                </div>
            )}

            {/* Signing state */}
            {step === "signing" && (
                <p className="text-xs text-blue-600 animate-pulse">
                    Waiting for wallet signature…
                </p>
            )}

            {/* Done — the seller has counter-signed and committed on-chain. */}
            {step === "done" && (
                <p className="text-xs text-green-600 font-medium">
                    Commitment submitted successfully.
                </p>
            )}

            {/* Error */}
            {step === "error" && (
                <p className="text-xs text-red-600">
                    Commitment failed. Check console for details.
                </p>
            )}
        </Card>
    );
}

