"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import {
    useCommitmentFlow,
    type CommitmentPayload,
} from "@/lib/core/useCommitmentFlow";
import { deserializePayload } from "@/components/core/CommitmentSharePanel";
import { calculateBonds } from "@figaro/core";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import { formatToken } from "@/lib/shared/utils";
import { extractErrorMessage } from "@/lib/shared/errors";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { truncateHex } from "@/lib/shared/formatHex";

// ── Pending commitment card ──────────────────────────────────────────────────

interface PendingOrderCardProps {
    payload: CommitmentPayload;
    onAccept: () => void;
    onDismiss: () => void;
    isAccepting: boolean;
    accentTone?: string;
}

function PendingOrderCard({ payload, onAccept, onDismiss, isAccepting, accentTone }: PendingOrderCardProps) {
    const { commitment } = payload;
    const accentStyle = accentTone ? { color: accentTone } : undefined;
    const accentBgStyle = accentTone ? { backgroundColor: accentTone, borderColor: accentTone } : undefined;
    const { decimals } = useTokenDecimals(commitment.currency as `0x${string}` | undefined);
    const sellerBond = calculateBonds(commitment.expectedCumulativeValue, commitment.payment).sellerBond;

    return (
        <div
            className="rounded-lg border border-neutral-200 bg-white p-5 space-y-4"
            data-testid="incoming-order-card"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1" style={accentStyle}>
                        Incoming Order
                    </p>
                    <p className="text-sm font-mono text-neutral-500 truncate">
                        From {truncateHex(commitment.buyer)}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Order value</p>
                    <p className="text-sm font-semibold text-black">
                        {formatToken(commitment.payment, decimals)}
                    </p>
                </div>
            </div>

            <div className="bg-neutral-50 rounded border border-neutral-200 p-3 text-xs text-neutral-600 space-y-1">
                <p>
                    <span className="font-medium text-neutral-700">Your seller bond:</span>{" "}
                    {formatToken(sellerBond, decimals)}
                    <span className="text-neutral-400 ml-1">(returned at settlement)</span>
                </p>
                <p className="text-neutral-400">
                    Both deposits are locked in the kernel until the order resolves. No rational actor profits from cheating.
                </p>
            </div>

            <div className="flex gap-2">
                <button
                    type="button"
                    data-testid="btn-accept-order"
                    onClick={onAccept}
                    disabled={isAccepting}
                    className="flex-1 rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100 disabled:opacity-40"
                    style={!isAccepting ? accentBgStyle ?? undefined : undefined}
                >
                    {isAccepting ? "Signing…" : "Accept Order"}
                </button>
                <button
                    type="button"
                    data-testid="btn-dismiss-order"
                    onClick={onDismiss}
                    disabled={isAccepting}
                    className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}

// ── Main module ──────────────────────────────────────────────────────────────

export function IncomingOrdersModule({ moduleId, context }: ModuleProps) {
    const { selectedRoleKind } = context;
    const { accentTone, cardStyle, labelStyle } = deriveModuleChrome(context);

    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();

    const { counterSign, broadcast, step: flowStep, error: flowError, reset } = useCommitmentFlow();

    const [pending, setPending] = useState<CommitmentPayload[]>([]);
    const [acceptingIndex, setAcceptingIndex] = useState<number | null>(null);
    const [acceptError, setAcceptError] = useState<string | null>(null);

    const receivedOrderIds = useRef<Set<string>>(new Set());
    const subscribed = useRef(false);

    const isMock = isE2EMockSession();

    // Subscribe to incoming commitment payloads via coordination messaging.
    useEffect(() => {
        if (isMock || !address || subscribed.current) return;

        subscribed.current = true;
        let cleanup: (() => void) | null = null;
        let cancelled = false;

        void context.services.coordinationMessaging.subscribeAnyCommitmentPayload({
            address,
            walletClient: walletClient ?? null,
            callback: (payloadJson, orderId) => {
                if (cancelled || receivedOrderIds.current.has(orderId)) return;

                try {
                    const payload = deserializePayload(payloadJson);
                    if (!payload.commitment?.buyer || !payload.commitment?.seller) return;

                    // Only show commitments where we are the seller
                    const isSeller = address.toLowerCase() === payload.commitment.seller.toLowerCase();
                    if (!isSeller) return;

                    receivedOrderIds.current.add(orderId);
                    setPending((prev) => [...prev, payload]);
                } catch {
                    // Malformed payload — ignore
                }
            },
        }).then((unsubscribe) => {
            if (cancelled) {
                unsubscribe();
                return;
            }
            cleanup = unsubscribe;
        }).catch(() => {
            // Coordination messaging unavailable — silent failure
        });

        return () => {
            cancelled = true;
            cleanup?.();
            subscribed.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address]);

    const handleAccept = useCallback(async (index: number) => {
        const payload = pending[index];
        if (!payload) return;

        setAcceptingIndex(index);
        setAcceptError(null);

        try {
            const signed = await counterSign(payload);
            await broadcast(signed);
            setPending((prev) => prev.filter((_, i) => i !== index));
            reset();
        } catch (e: unknown) {
            setAcceptError(extractErrorMessage(e, "Signing failed"));
        } finally {
            setAcceptingIndex(null);
        }
    }, [pending, counterSign, broadcast, reset]);

    const handleDismiss = useCallback((index: number) => {
        setPending((prev) => prev.filter((_, i) => i !== index));
    }, []);

    // Only show for restaurant role
    if (selectedRoleKind !== "merchant") return null;

    return (
        <div
            data-testid="incoming-orders-module"
            data-module-id={moduleId}
            data-skin={context.skinBundle?.skinId}
            className="space-y-4"
            style={cardStyle}
        >
            <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1" style={labelStyle}>
                    {context.shellPresentation.title}
                </p>
                <h2 className="text-xl font-bold text-black">Incoming Orders</h2>
            </div>

            {isMock ? (
                <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-500" data-testid="incoming-orders-mock-notice">
                    <p className="font-medium text-neutral-700 mb-1">Mock mode active</p>
                    <p>Orders placed in mock mode are committed directly on-chain — no incoming commitment inbox is needed. Switch to a real wallet to receive live orders.</p>
                </div>
            ) : pending.length === 0 ? (
                <div className="rounded-lg border border-neutral-200 bg-white p-5 text-sm text-neutral-500" data-testid="incoming-orders-empty">
                    <p className="font-medium text-neutral-700 mb-1">Listening for orders</p>
                    <p>When a buyer shares an order commitment with your wallet address, it will appear here for review and counter-signing.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {pending.map((payload, index) => (
                        <PendingOrderCard
                            key={index}
                            payload={payload}
                            onAccept={() => void handleAccept(index)}
                            onDismiss={() => handleDismiss(index)}
                            isAccepting={acceptingIndex === index || (flowStep === "signing" || flowStep === "broadcasting")}
                            accentTone={accentTone}
                        />
                    ))}
                </div>
            )}

            {(acceptError ?? flowError) && (
                <p className="text-sm text-red-600" data-testid="incoming-orders-error">
                    {acceptError ?? flowError}
                </p>
            )}
        </div>
    );
}
