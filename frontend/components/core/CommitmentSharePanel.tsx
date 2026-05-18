/**
 * CommitmentSharePanel — displays an unsigned or partially-signed EIP-712
 * commitment and provides QR/link sharing for dual-signature collection.
 *
 * Flow:
 *   1. Initiating party signs → panel shows commitment details + QR code
 *   2. Counter-party scans QR (or opens link) → counter-signs
 *   3. Either party broadcasts the fully-signed commitment on-chain
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { formatToken } from "@/lib/shared/utils";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type {
    CommitmentPayload,
    CommitmentFlowStep,
} from "@/lib/core/useCommitmentFlow";
import { ZERO_PROCESS_ID, hexEqual } from "@/lib/shared/evm";
import type { MessageSendStatus } from "@/lib/shared/messageSendStatus";
import { extractErrorMessage } from "@/lib/shared/errors";
import { computeOrderHash } from "@/lib/core/commitmentStore";
import { CONTRACTS } from "@/lib/core/contracts";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { strippingReviver } from "@/lib/shared/safeJson";
import { truncateHex } from "@/lib/shared/formatHex";

// ── Serialization helpers ──────────────────────────────────────

/** Serialize commitment payload to a compact JSON string (bigints → hex strings). */
function serializePayload(p: CommitmentPayload): string {
    return JSON.stringify(p, (_key, value) =>
        typeof value === "bigint" ? `0x${value.toString(16)}` : value,
    );
}

/** Deserialize a JSON payload back to typed commitment (hex strings → bigints). */
export function deserializePayload(json: string): CommitmentPayload {
    // Strip __proto__ / constructor / prototype at parse time so a malicious
    // ?payload= parameter or XMTP-delivered envelope can't pollute the
    // prototype chain when downstream code spreads / Object.assigns the
    // parsed commitment.
    const raw = JSON.parse(json, strippingReviver);
    const c = raw.commitment;

    // Convert hex string fields back to bigint
    const bigintFields = ["payment", "salt", "deadline", "expectedCumulativeValue"];
    for (const f of bigintFields) {
        if (typeof c[f] === "string" && c[f].startsWith("0x")) {
            c[f] = BigInt(c[f]);
        }
    }
    return raw as CommitmentPayload;
}

function buildTransportPayload(payload: CommitmentPayload): CommitmentPayload {
    if (payload.agreement && payload.agreementUri) {
        return {
            ...payload,
            agreement: undefined,
        };
    }

    return payload;
}

/** Share-panel has no waiting state — exclude from the canonical send union. */
type TransportStatus = Exclude<MessageSendStatus, "waiting">;

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
    step: CommitmentFlowStep;
    /** Token decimals for formatting payment display. */
    tokenDecimals?: number;
    /** Called when the user wants to broadcast (both sigs present). */
    onBroadcast?: () => void;
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
    onBroadcast,
    onCopyLink,
    qrSize = 200,
}: CommitmentSharePanelProps) {
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const chainId = useChainId();
    const { coordinationMessaging } = useRuntimeServices();
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [qrUnavailable, setQrUnavailable] = useState(false);
    const [copied, setCopied] = useState(false);
    const [transportStatus, setTransportStatus] = useState<TransportStatus>("idle");
    const [transportError, setTransportError] = useState<string | null>(null);
    const [transportRecipient, setTransportRecipient] = useState<string | null>(null);

    const serialized = payload ? serializePayload(buildTransportPayload(payload)) : null;
    const recipientAddress = payload ? resolveRecipientAddress(payload, address) : null;

    useEffect(() => {
        setTransportStatus("idle");
        setTransportError(null);
        setTransportRecipient(null);
    }, [payload, recipientAddress]);

    // Generate QR when payload is ready and waiting for counter-party
    useEffect(() => {
        if (!serialized || step !== "awaiting-counter") {
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

        if (!CONTRACTS.core) {
            setTransportStatus("error");
            setTransportError("Core contract address is not configured, so the transport order ID cannot be derived.");
            return;
        }

        setTransportStatus("sending");
        setTransportError(null);
        try {
            const orderId = computeOrderHash(payload.commitment, chainId, CONTRACTS.core);
            await coordinationMessaging.sendCommitmentPayload({
                address,
                walletClient,
                recipientAddress,
                orderId,
                payloadJson: serializePayload(buildTransportPayload(payload)),
            });
            setTransportRecipient(recipientAddress);
            setTransportStatus("sent");
        } catch (error) {
            setTransportStatus("error");
            setTransportError(extractErrorMessage(error, "Failed to send the commitment payload over XMTP."));
        }
    }, [address, chainId, coordinationMessaging, payload, recipientAddress, walletClient]);

    if (!payload) return null;

    const commitment = payload.commitment;
    const isRoot = commitment.processId === ZERO_PROCESS_ID;
    const hasBuyerSig = !!payload.buyerSig;
    const hasSellerSig = !!payload.sellerSig;
    const hasBothSigs = hasBuyerSig && hasSellerSig;

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
                            {commitment.processId.slice(0, 10)}…
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

            {/* QR code (shown when awaiting counter-party) */}
            {step === "awaiting-counter" && (
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

            {payload.agreementUri && (
                <div className="text-xs text-gray-500 break-all">
                    Agreement artifact: <span className="font-mono text-black">{payload.agreementUri}</span>
                </div>
            )}

            {/* Signing state */}
            {step === "signing" && (
                <p className="text-xs text-blue-600 animate-pulse">
                    Waiting for wallet signature…
                </p>
            )}

            {/* Ready to broadcast */}
            {(step === "ready" || hasBothSigs) && (
                <Button
                    onClick={onBroadcast}
                    disabled={step === "broadcasting"}
                    data-testid="broadcast-commitment"
                    className="w-full"
                >
                    {step === "broadcasting" ? "Broadcasting…" : "Submit On-Chain"}
                </Button>
            )}

            {/* Done */}
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

