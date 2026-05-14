"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { truncateHex } from "@/lib/shared/formatHex";
import { extractErrorMessage } from "@/lib/shared/errors";

/**
 * HandoffKeyExchangeModule — buyer-side panel that auto-sends the per-order
 * AES-256-GCM manifest key to the assigned fulfiller via XMTP (or mock channel).
 *
 * Behaviour:
 *   1. "Waiting for fulfiller assignment…"  (auction running)
 *   2. "Sending key to fulfiller 0x…"       (fulfiller assigned, channel send in progress)
 *   3. "Key delivered to fulfiller 0x…"     (sent successfully)
 *   4. Fallback: manual copy always available via details disclosure.
 *
 * Gets the assigned fulfiller address and order IDs from mechanism context,
 * never imports contract addresses directly.
 */

type SendStatus = "idle" | "waiting" | "sending" | "sent" | "error";

export function HandoffKeyExchangeModule({ moduleId, context }: ModuleProps) {
    const { selectedRoleKind } = context;
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const { coordinationMessaging, handoffPersistence } = context.services;
    const { shellLabel, cardStyle, labelStyle } = deriveModuleChrome(context);
    const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const sendAttemptKeyRef = useRef<string | null>(null);

    // Only visible to buyer role
    if (selectedRoleKind !== "buyer") return null;

    // Extract state from mechanism context
    const coordinatorMech = context.mechanisms.find((m) => m.kind === "coordinator");
    const auctionMech = context.mechanisms.find((m) => m.kind === "auction");
    const meta = (coordinatorMech ?? auctionMech) as unknown as Record<string, unknown> | undefined;

    const orderId = context.selectedOrder?.orderId;
    const processId = context.selectedOrder?.processId;
    const assignedFulfiller =
        (meta?.assignedDriver as string) ??
        (meta?.assignedFulfiller as string) ??
        null;
    const fulfillerAddress =
        assignedFulfiller && assignedFulfiller !== ZERO_ADDRESS
            ? assignedFulfiller
            : null;

    // Look up the stored AES key for this order
    const storedKey = address && processId && orderId
        ? handoffPersistence.getHandoffKey(address, processId, orderId)
        : null;
    const keyB64 = storedKey?.keyB64 ?? null;

    // If no key stored, nothing to exchange
    if (!keyB64 || !orderId) return null;

    // Reset module-local send state when the selected handoff changes.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
        sendAttemptKeyRef.current = null;
        setSendStatus("idle");
        setError(null);
        setSentTo(null);
    }, [address, processId, orderId, fulfillerAddress, keyB64]);

    // Auto-send key when fulfiller is assigned
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
        if (!address || !fulfillerAddress || !orderId || !keyB64) return;
        const sendAttemptKey = `${address}:${orderId}:${fulfillerAddress}:${keyB64}:${retryCount}`;
        if (sendAttemptKeyRef.current === sendAttemptKey) return;

        sendAttemptKeyRef.current = sendAttemptKey;

        let cancelled = false;
        setSendStatus("sending");
        setError(null);

        const send = async () => {
            try {
                await coordinationMessaging.sendHandoffKey({
                    address,
                    walletClient,
                    recipientAddress: fulfillerAddress,
                    orderId,
                    keyB64,
                });

                if (!cancelled) {
                    setSendStatus("sent");
                    setSentTo(fulfillerAddress);
                }
            } catch (err) {
                if (!cancelled) {
                    setSendStatus("error");
                    setError(extractErrorMessage(err, "Failed to send key"));
                }
                sendAttemptKeyRef.current = null;
            }
        };

        void send();
        return () => {
            cancelled = true;
        };
    }, [address, coordinationMessaging, fulfillerAddress, orderId, keyB64, retryCount, walletClient]);

    // Set waiting state when no fulfiller yet
    if (!fulfillerAddress && sendStatus === "idle") {
        return (
            <div
                data-testid="handoff-key-module"
                data-module-id={moduleId}
                data-skin={context.skinBundle?.skinId}
                className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
                style={cardStyle}
            >
                <p className="mb-3 text-xs font-semibold text-neutral-500" style={labelStyle}>
                    {shellLabel}
                </p>
                <div className="flex items-start gap-3">
                    <span className="text-2xl" aria-hidden>🔐</span>
                    <div>
                        <p data-testid="key-exchange-status" className="text-sm font-semibold text-neutral-700">
                            Your destination is encrypted. Waiting for a fulfiller to claim your order…
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                            The key will be sent automatically via secure channel once a fulfiller is assigned.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            data-testid="handoff-key-module"
            data-module-id={moduleId}
            data-skin={context.skinBundle?.skinId}
            className="rounded-lg border border-green-200 bg-green-50 p-4"
            style={cardStyle}
        >
            <p className="mb-3 text-xs font-semibold text-neutral-500" style={labelStyle}>
                {shellLabel}
            </p>
            <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>
                    {sendStatus === "sent" ? "✅" : sendStatus === "error" ? "⚠️" : "🔐"}
                </span>
                <div className="flex-1 min-w-0">
                    {sendStatus === "sending" && (
                        <p data-testid="key-exchange-status" className="text-sm font-semibold text-green-900">
                            Sending encrypted key to fulfiller {truncateHex(fulfillerAddress)}…
                        </p>
                    )}

                    {sendStatus === "sent" && (
                        <p data-testid="key-exchange-status" className="text-sm font-semibold text-green-900">
                            Key sent to fulfiller {truncateHex(sentTo)} via secure channel.
                        </p>
                    )}

                    {sendStatus === "error" && (
                        <>
                            <p data-testid="key-exchange-status" className="text-sm font-semibold text-yellow-900">
                                Could not send key automatically.
                            </p>
                            {error && <p className="mt-1 text-xs text-yellow-700">{error}</p>}
                            <button
                                onClick={() => {
                                    sendAttemptKeyRef.current = null;
                                    setError(null);
                                    setSendStatus("idle");
                                    setRetryCount((value) => value + 1);
                                }}
                                className="mt-1 text-xs text-yellow-700 hover:text-yellow-900 underline"
                            >
                                Retry
                            </button>
                        </>
                    )}

                    {/* Fallback: manual key copy */}
                    <details className="mt-2">
                        <summary className="text-xs text-green-700 cursor-pointer hover:text-green-900">
                            Show key (manual fallback)
                        </summary>
                        <p
                            data-testid="handoff-key-value"
                            className="mt-1 font-mono text-xs text-green-800 break-all"
                        >
                            {keyB64}
                        </p>
                        <button
                            data-testid="btn-copy-handoff-key"
                            className="mt-1 text-xs px-2 py-1 border border-green-400 rounded bg-green-100 hover:bg-green-200 text-green-900"
                            onClick={() => {
                                navigator.clipboard.writeText(keyB64).catch(() => { });
                            }}
                        >
                            Copy
                        </button>
                    </details>
                </div>
            </div>
        </div>
    );
}

