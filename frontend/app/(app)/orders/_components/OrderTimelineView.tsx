"use client";

/**
 * OrderTimelineView — consumer-facing per-order page rendered at
 * `/orders/[processId]`. Renders kernel events as consumer copy ("Carlo
 * received your order" instead of "figaro-merchant-process-v1 stage=0").
 * Wallet-aware: the buyer of the order sees a "Confirm receipt" CTA,
 * the seller of the order sees a "Mark as <next event>" CTA driven by
 * `figaro-merchant-process-v1`.
 *
 * Data sources:
 *  - `useSemanticProcessWorkspace` → process state, capabilities,
 *    `resolveProcess` execution path.
 *  - `getAttestationsByProcessAndSchema` → merchant-process events.
 *  - `getAttestationContent` + `decodeAbiParameters` → recover the
 *    original `(uint8 eventType, string evidenceUri)` from calldata.
 *  - `resolveRuntimeSubjectByAddress` → display names for buyer/seller.
 *
 * This page does NOT replace `/audit/[processId]` — that's the audit /
 * forensics surface (financials, BoL, hash verification). This is the
 * live operational surface.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { decodeAbiParameters, toHex, type Hex, type PublicClient } from "viem";
import { Button } from "@/components/ui/Button";
import { PreResolveOffsetPanel } from "@/components/core/PreResolveOffsetPanel";
import { useSemanticProcessWorkspace } from "@/hooks/core/useSemanticProcessWorkspace";
import { getAttestationsByProcessAndSchema } from "@/lib/core/indexer";
import { getAttestationContent } from "@/lib/mechanisms/useGHGDisclosure";
import { useOperatorListings } from "@/lib/mechanisms/useOperatorListings";
import { findListingByAddress } from "@/lib/shared/operatorListing";
import type { SemanticTone } from "@/lib/shared/tones";
import { MERCHANT_PROCESS_SCHEMA_ID, useMerchantProcessActions } from "@/lib/mechanisms/useMerchantProcess";
import { COURIER_PROCESS_SCHEMA_ID, useCourierProcessActions } from "@/lib/mechanisms/useCourierProcess";
import { getSection, PROXIMITY_POLICY_SCHEMA_KEY } from "@/lib/core/agreementManifest";
import { loadAgreement } from "@/lib/core/agreementStore";
import { DEFAULT_COORDINATION_MESSAGING_SERVICE } from "@/lib/shared/coordinationMessagingService";
import type { CourierEvent, MerchantEvent } from "@figaro/core/schemas";
import type { CapabilityModel } from "@/lib/semantic/models";
import { truncateHex } from "@/lib/shared/formatHex";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual } from "@/lib/shared/evm";

const MERCHANT_EVENT_BY_STAGE: Record<number, MerchantEvent> = {
    0: "order-received",
    1: "accepted",
    2: "prep-started",
    3: "ready-for-pickup",
    4: "handed-off",
    5: "cancelled",
};

/**
 * Structural placeholder for the courier's proximity-proof deviceSig.
 * `figaro-proximity-proof-v1` is Category-1: the on-chain validator
 * checks deviceSig length ∈ [65, 512] only — no ecrecover, the bytes
 * are not verified. The real per-handoff witness comes from a device
 * sensor (BLE / NFC / Wi-Fi); that capture SDK is not built yet, so
 * the button submits a structurally-valid 65-byte placeholder.
 */
const COURIER_DEVICE_SIG_PLACEHOLDER: Hex = `0x${"01".repeat(65)}`;

/** figaro-proximity-policy-v1 band name → on-chain ProximityProof band
 *  index. FigaroProximityProofV1Validator rejects band 0; the valid bands
 *  are 1=Zone/WiFi, 2=Nearby/BLE, 3=Contact/NFC. The courier's proximity
 *  proof must carry the band the assembly committed. */
const PROXIMITY_BAND_INDEX: Record<string, number> = {
    "zone-wifi": 1,
    "nearby-ble": 2,
    "contact-nfc": 3,
};

/** figaro-courier-process-v1 stage for `arrived-pickup`. Once the courier
 *  has attested this (or later), the next handoff proof certifies the
 *  courier→buyer dropoff rather than the merchant→courier pickup. */
const COURIER_ARRIVED_PICKUP_STAGE = 3;

/** figaro-courier-process-v1 stage → a buyer-facing transit label, so the
 *  buyer can watch the one-hop delivery between commit and resolve. */
const COURIER_STAGE_LABEL: Record<number, string> = {
    1: "courier assigned",
    2: "heading to the pickup",
    3: "at the pickup point",
    4: "picked up — in transit",
    5: "arriving at your location",
    6: "delivered",
    7: "delivery cancelled",
};

interface MerchantTimelineEvent {
    eventType: MerchantEvent;
    stage: number;
    blockNumber: number;
    txHash: string | null;
}

interface ConsumerStatus {
    pillLabel: string;
    pillTone: SemanticTone;
    headline: string;
    subhead: string;
}

const HAPPY_PATH_EVENTS: readonly MerchantEvent[] = [
    "order-received",
    "accepted",
    "prep-started",
    "ready-for-pickup",
    "handed-off",
];

function formatAddress(addr: string): string {
    return truncateHex(addr);
}

function deriveBuyerStatus(
    sellerName: string,
    events: MerchantTimelineEvent[],
    isResolved: boolean,
): ConsumerStatus {
    if (isResolved) {
        return {
            pillLabel: "Completed",
            pillTone: "green",
            headline: "Order completed",
            subhead: "Bonds released. Receipt available on the audit page.",
        };
    }
    const seenStages = new Set(events.map((event) => event.stage));
    if (seenStages.has(5)) {
        return {
            pillLabel: "Cancelled",
            pillTone: "red",
            headline: `${sellerName} cancelled the order`,
            subhead: "Bonds remain locked until you resolve. Contact the merchant or open a dispute.",
        };
    }
    if (seenStages.has(4)) {
        return {
            pillLabel: "Handed off",
            pillTone: "blue",
            headline: "Handed off",
            subhead: `${sellerName} marked the order as handed over. Confirm receipt when you have it.`,
        };
    }
    if (seenStages.has(3)) {
        return {
            pillLabel: "Ready",
            pillTone: "amber",
            headline: "Ready for pickup",
            subhead: `${sellerName} marked the order as ready.`,
        };
    }
    if (seenStages.has(2)) {
        return {
            pillLabel: "Preparing",
            pillTone: "amber",
            headline: `${sellerName} is preparing the order`,
            subhead: "You'll see updates as the order progresses.",
        };
    }
    if (seenStages.has(1)) {
        return {
            pillLabel: "Accepted",
            pillTone: "blue",
            headline: `${sellerName} accepted the order`,
            subhead: "Preparation will begin shortly.",
        };
    }
    if (seenStages.has(0)) {
        return {
            pillLabel: "Received",
            pillTone: "blue",
            headline: `${sellerName} received the order`,
            subhead: "Waiting on acceptance.",
        };
    }
    return {
        pillLabel: "Placed",
        pillTone: "neutral",
        headline: "Order placed",
        subhead: `Waiting for ${sellerName} to accept.`,
    };
}

function deriveMerchantStatus(events: MerchantTimelineEvent[], isResolved: boolean): ConsumerStatus {
    if (isResolved) {
        return {
            pillLabel: "Completed",
            pillTone: "green",
            headline: "Order completed by buyer",
            subhead: "Bonds released. Receipt available on the audit page.",
        };
    }
    const seenStages = new Set(events.map((event) => event.stage));
    if (seenStages.has(5)) {
        return {
            pillLabel: "Cancelled",
            pillTone: "red",
            headline: "Order cancelled",
            subhead: "Bonds remain locked until the buyer resolves.",
        };
    }
    if (seenStages.has(4)) {
        return {
            pillLabel: "Handed off",
            pillTone: "blue",
            headline: "Handed off",
            subhead: "Waiting for the buyer to confirm receipt.",
        };
    }
    if (seenStages.has(3)) {
        return {
            pillLabel: "Ready",
            pillTone: "amber",
            headline: "Marked ready for pickup",
            subhead: "Hand off to the buyer when they collect the order.",
        };
    }
    if (seenStages.has(2)) {
        return {
            pillLabel: "Preparing",
            pillTone: "amber",
            headline: "Preparation in progress",
            subhead: "Mark ready when the order is complete.",
        };
    }
    if (seenStages.has(1)) {
        return {
            pillLabel: "Accepted",
            pillTone: "blue",
            headline: "Order accepted",
            subhead: "Begin preparation.",
        };
    }
    if (seenStages.has(0)) {
        return {
            pillLabel: "Received",
            pillTone: "blue",
            headline: "Order received",
            subhead: "Accept to confirm you'll fulfil it.",
        };
    }
    return {
        pillLabel: "New",
        pillTone: "neutral",
        headline: "New order",
        subhead: "Acknowledge receipt to begin.",
    };
}

function nextMerchantEvent(events: MerchantTimelineEvent[]): MerchantEvent | null {
    const seenStages = new Set(events.map((event) => event.stage));
    if (seenStages.has(4) || seenStages.has(5)) return null;
    for (const eventType of HAPPY_PATH_EVENTS) {
        const stage = HAPPY_PATH_EVENTS.indexOf(eventType);
        if (!seenStages.has(stage)) return eventType;
    }
    return null;
}

const EVENT_LABELS_FOR_BUYER: Record<MerchantEvent, string> = {
    "order-received": "Order received by merchant",
    "accepted": "Accepted",
    "prep-started": "Preparation started",
    "ready-for-pickup": "Ready",
    "handed-off": "Handed off",
    "cancelled": "Cancelled by merchant",
};

const EVENT_LABELS_FOR_MERCHANT: Record<MerchantEvent, string> = {
    "order-received": "Order received",
    "accepted": "Accepted",
    "prep-started": "Preparation started",
    "ready-for-pickup": "Ready for pickup",
    "handed-off": "Handed off",
    "cancelled": "Cancelled",
};

const NEXT_EVENT_BUTTON_LABEL: Record<MerchantEvent, string> = {
    "order-received": "Mark as received",
    "accepted": "Mark as accepted",
    "prep-started": "Mark prep started",
    "ready-for-pickup": "Mark ready for pickup",
    "handed-off": "Mark as handed off",
    "cancelled": "Cancel order",
};

function toneClasses(tone: ConsumerStatus["pillTone"]): string {
    switch (tone) {
        case "amber": return "border-amber-200 bg-amber-50 text-amber-800";
        case "blue": return "border-blue-200 bg-blue-50 text-blue-800";
        case "green": return "border-green-200 bg-green-50 text-green-800";
        case "red": return "border-red-200 bg-red-50 text-red-800";
        default: return "border-neutral-200 bg-neutral-50 text-neutral-700";
    }
}

async function decodeMerchantEvent(
    client: PublicClient,
    txHash: Hex,
): Promise<{ eventType: MerchantEvent; evidenceUri: string } | null> {
    const content = await getAttestationContent(client, txHash);
    if (!content) return null;
    try {
        const [eventTypeIdx, evidenceUri] = decodeAbiParameters(
            [{ type: "uint8" }, { type: "string" }],
            content,
        );
        const eventType = MERCHANT_EVENT_BY_STAGE[Number(eventTypeIdx)];
        if (!eventType) return null;
        return { eventType, evidenceUri };
    } catch {
        return null;
    }
}

interface Props {
    processId: string;
}

export function OrderTimelineView({ processId }: Props) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const chainId = publicClient?.chain?.id ?? 0;
    const workspace = useSemanticProcessWorkspace({ processId });
    const merchantActions = useMerchantProcessActions();
    const courierActions = useCourierProcessActions();
    const { listings } = useOperatorListings();

    const [events, setEvents] = useState<MerchantTimelineEvent[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [merchantPending, setMerchantPending] = useState(false);
    const [merchantError, setMerchantError] = useState<string | null>(null);
    const [courierPending, setCourierPending] = useState(false);
    const [courierError, setCourierError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!publicClient || !chainId || !processId) return;
        let cancelled = false;
        setEventsLoading(true);
        (async () => {
            try {
                const logs = await getAttestationsByProcessAndSchema(
                    publicClient,
                    chainId,
                    processId,
                    MERCHANT_PROCESS_SCHEMA_ID,
                );
                if (cancelled) return;
                const decoded = await Promise.all(logs.map(async (log) => {
                    const args = (log.args ?? {}) as Record<string, unknown>;
                    const txHash = (log.transactionHash as Hex | null) ?? null;
                    const stage = Number(args.stage ?? 0);
                    let eventType = MERCHANT_EVENT_BY_STAGE[stage];
                    if (txHash) {
                        const decoded = await decodeMerchantEvent(publicClient, txHash);
                        if (decoded) eventType = decoded.eventType;
                    }
                    return {
                        eventType,
                        stage,
                        blockNumber: Number(log.blockNumber ?? 0),
                        txHash,
                    } as MerchantTimelineEvent;
                }));
                if (cancelled) return;
                decoded.sort((a, b) => a.blockNumber - b.blockNumber);
                setEvents(decoded);
            } catch (cause) {
                if (!cancelled) {
                    console.error("OrderTimelineView event fetch failed", cause);
                    setEvents([]);
                }
            } finally {
                if (!cancelled) setEventsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [publicClient, chainId, processId, tick]);

    // Courier-process transit — fetched so the buyer (and any non-courier
    // viewer) can watch the one-hop delivery between commit and resolve.
    const [courierTransitStages, setCourierTransitStages] = useState<number[]>([]);
    useEffect(() => {
        if (!publicClient || !chainId || !processId) return;
        let cancelled = false;
        (async () => {
            try {
                const logs = await getAttestationsByProcessAndSchema(
                    publicClient, chainId, processId, COURIER_PROCESS_SCHEMA_ID,
                );
                if (cancelled) return;
                const stages = logs
                    .map((log) => ({
                        stage: Number(((log.args ?? {}) as { stage?: unknown }).stage ?? 0),
                        blockNumber: Number(log.blockNumber ?? 0),
                    }))
                    .sort((a, b) => a.blockNumber - b.blockNumber)
                    .map((e) => e.stage);
                setCourierTransitStages(stages);
            } catch {
                if (!cancelled) setCourierTransitStages([]);
            }
        })();
        return () => { cancelled = true; };
    }, [publicClient, chainId, processId, tick]);

    const processModel = workspace.processModel;
    const rootOrder = processModel?.orders.find((order) => order.orderId === processModel.rootOrderId)
        ?? processModel?.orders[0]
        ?? null;

    const sellerListing = rootOrder ? findListingByAddress(listings, rootOrder.seller) : undefined;
    const sellerDisplayName = sellerListing?.name
        ?? (rootOrder ? formatAddress(rootOrder.seller) : "the merchant");

    const buyerListing = rootOrder ? findListingByAddress(listings, rootOrder.buyer) : undefined;
    const buyerDisplayName = buyerListing?.name
        ?? (rootOrder ? formatAddress(rootOrder.buyer) : "the buyer");

    const isBuyer = !!rootOrder && hexEqual(address, rootOrder.buyer);
    const isSeller = !!rootOrder && hexEqual(address, rootOrder.seller);
    // A courier is the seller of a non-root sub-order — distinct from the
    // root seller (the merchant). Without this branch the courier falls
    // through to "spectator" and the handoff action is unreachable.
    const courierOrder = useMemo(() => {
        if (!processModel || !address || isBuyer || isSeller) return null;
        return processModel.orders.find(
            (order) => order.orderId !== processModel.rootOrderId && hexEqual(address, order.seller),
        ) ?? null;
    }, [processModel, address, isBuyer, isSeller]);
    const role: "buyer" | "seller" | "courier" | "spectator" =
        isBuyer ? "buyer" : isSeller ? "seller" : courierOrder ? "courier" : "spectator";

    // The courier receives the buyer's human-readable delivery address over
    // the coordination channel (the geohash is the on-agreement term).
    const [handoffAddress, setHandoffAddress] = useState<string | null>(null);
    useEffect(() => {
        if (role !== "courier" || !courierOrder || !address) return;
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;
        DEFAULT_COORDINATION_MESSAGING_SERVICE.subscribeHandoffAddress({
            address,
            orderId: courierOrder.orderId,
            callback: (deliveryAddress) => setHandoffAddress(deliveryAddress),
        }).then((u) => {
            if (cancelled) u();
            else unsubscribe = u;
        }).catch(() => { /* coordination channel unavailable */ });
        return () => { cancelled = true; unsubscribe?.(); };
    }, [role, courierOrder, address]);

    const allOrders = processModel?.orders ?? [];
    // OrderNodeModel.state is the OrderState enum reverse-mapped to a string
    // ("Active" | "Resolved") in `deriveProcessModelFromRuntime`.
    const isResolved = allOrders.length > 0 && allOrders.every((order) => order.state !== "Active");

    const status = role === "seller"
        ? deriveMerchantStatus(events, isResolved)
        : deriveBuyerStatus(sellerDisplayName, events, isResolved);

    const next = nextMerchantEvent(events);

    const resolveCapability: CapabilityModel | undefined = useMemo(() => {
        return workspace.runtimeCapabilities.find((cap) => cap.action.kind === "resolve-process");
    }, [workspace.runtimeCapabilities]);

    const handleConfirmReceipt = async () => {
        if (!resolveCapability) return;
        const proceed = window.confirm(
            "Confirm you have received the order. This finalises the order and releases the bonds for both parties. You cannot undo this action.",
        );
        if (!proceed) return;
        await workspace.executeCapability(resolveCapability);
    };

    const handleMerchantNext = async () => {
        if (!next || !rootOrder) return;
        setMerchantPending(true);
        setMerchantError(null);
        try {
            await merchantActions.signal({
                orderHash: rootOrder.orderId,
                eventType: next,
            });
            // Re-fetch events on success
            setTick((t) => t + 1);
        } catch (cause: unknown) {
            setMerchantError(extractErrorMessage(cause, "Attestation failed"));
        } finally {
            setMerchantPending(false);
        }
    };

    const handleCourierProximityProof = async () => {
        if (!courierOrder || !publicClient) return;
        setCourierPending(true);
        setCourierError(null);
        try {
            // Fresh 32-byte nonce per handoff — the validator rejects a
            // zero nonce, and a unique nonce keeps each proof distinct.
            const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
            // Read the band off the courier order's committed
            // figaro-proximity-policy-v1 clause — the proof carries the band
            // the assembly authored, not a hardcoded default.
            const courierAgreement = loadAgreement(courierOrder.agreementHash);
            const committedBand = courierAgreement
                ? ((getSection(courierAgreement, PROXIMITY_POLICY_SCHEMA_KEY)
                    ?.data as { bands?: string[] } | undefined)?.bands ?? [])[0]
                : undefined;
            const band = PROXIMITY_BAND_INDEX[committedBand ?? ""] ?? 1;
            // Which handoff edge: the courier-process event log decides. Once
            // arrived-pickup is attested, this proof certifies the
            // courier→buyer dropoff; before it, the merchant→courier pickup.
            const courierLogs = await getAttestationsByProcessAndSchema(
                publicClient, chainId, processId, COURIER_PROCESS_SCHEMA_ID,
            );
            const pickupDone = courierLogs.some(
                (log) => Number(((log.args ?? {}) as { stage?: unknown }).stage ?? 0)
                    >= COURIER_ARRIVED_PICKUP_STAGE,
            );
            const eventType: CourierEvent = pickupDone ? "arrived-dropoff" : "arrived-pickup";
            await courierActions.signalWithProof({
                orderHash: courierOrder.orderId,
                eventType,
                proof: { band, nonce, deviceSig: COURIER_DEVICE_SIG_PLACEHOLDER },
            });
            setTick((t) => t + 1);
        } catch (cause: unknown) {
            setCourierError(extractErrorMessage(cause, "Proximity proof submission failed"));
        } finally {
            setCourierPending(false);
        }
    };

    if (!processModel) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold text-neutral-500 mb-3">
                    Order
                </p>
                <h1 className="text-3xl font-bold text-black mb-4">Loading…</h1>
                <p className="text-sm text-neutral-600">
                    Reading process <code className="font-mono text-xs">{truncateHex(processId, { head: 10, tail: 0 })}</code> from
                    chain. If this persists, the process ID may be wrong or the
                    indexer may be unreachable.
                </p>
            </div>
        );
    }

    return (
        <div data-testid="order-timeline-view" className="container mx-auto px-6 py-10 max-w-3xl space-y-8">
            <header className="space-y-3">
                <p className="text-xs font-semibold text-neutral-500">
                    Order
                </p>
                <div className="flex flex-wrap items-baseline gap-3">
                    <h1 className="text-3xl font-bold text-black">{status.headline}</h1>
                    <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses(status.pillTone)}`}
                        data-testid="order-status-pill"
                    >
                        {status.pillLabel}
                    </span>
                </div>
                <p className="text-sm text-neutral-700">{status.subhead}</p>
                <p className="text-xs text-neutral-500 font-mono">
                    Process <span data-testid="order-process-id">{truncateHex(processId, { head: 10, tail: 6 })}</span>
                    {" · "}
                    {role === "buyer" && <>You are the buyer · seller: <span className="text-neutral-700">{sellerDisplayName}</span></>}
                    {role === "seller" && <>You are the seller · buyer: <span className="text-neutral-700">{buyerDisplayName}</span></>}
                    {role === "courier" && <>You are the courier on a delivery sub-order of this process</>}
                    {role === "spectator" && <>Read-only — your wallet is neither buyer nor seller on this order</>}
                </p>
            </header>

            {/* Primary action */}
            <section className="rounded-lg border border-neutral-200 bg-white p-5 space-y-3">
                <p className="text-xs font-semibold text-neutral-500">
                    {role === "buyer" ? "Your action" : role === "seller" ? "Next step" : role === "courier" ? "Handoff" : "Status"}
                </p>

                {role === "buyer" && (
                    <>
                        {courierTransitStages.length > 0 && (
                            <p
                                className="text-sm rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-700"
                                data-testid="courier-transit-status"
                            >
                                <span className="font-semibold text-neutral-500">Courier · </span>
                                {COURIER_STAGE_LABEL[courierTransitStages[courierTransitStages.length - 1]] ?? "en route"}
                            </p>
                        )}
                        {isResolved ? (
                            <p className="text-sm text-neutral-600">Order is complete. No further action.</p>
                        ) : resolveCapability ? (
                            <>
                                <PreResolveOffsetPanel processId={processId as `0x${string}`} />
                                <p className="text-sm text-neutral-700">
                                    When you have received the order from {sellerDisplayName}, confirm to release
                                    bonds and finalise.
                                </p>
                                <Button
                                    onClick={handleConfirmReceipt}
                                    disabled={workspace.isPending || workspace.isConfirming}
                                    data-testid="btn-confirm-receipt"
                                >
                                    {workspace.isPending || workspace.isConfirming ? "Confirming…" : "Confirm receipt"}
                                </Button>
                            </>
                        ) : (
                            <p className="text-sm text-neutral-500">
                                Confirm-receipt action unavailable. Reload after the seller has accepted.
                            </p>
                        )}
                    </>
                )}

                {role === "seller" && (
                    <>
                        {next ? (
                            <Button
                                onClick={handleMerchantNext}
                                disabled={merchantPending || merchantActions.isPending || merchantActions.isConfirming}
                                data-testid={`btn-merchant-next-${next}`}
                            >
                                {merchantPending ? "Signing…" : NEXT_EVENT_BUTTON_LABEL[next]}
                            </Button>
                        ) : (
                            <p className="text-sm text-neutral-600">
                                {isResolved
                                    ? "Order complete."
                                    : "Handed off — waiting for the buyer to confirm receipt."}
                            </p>
                        )}
                        {merchantError && (
                            <p className="text-sm text-red-600" data-testid="merchant-action-error">
                                {merchantError}
                            </p>
                        )}
                    </>
                )}

                {role === "courier" && (
                    <>
                        {handoffAddress && (
                            <div
                                className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2"
                                data-testid="courier-handoff-address"
                            >
                                <p className="text-[11px] font-semibold text-neutral-500">Delivery address</p>
                                <p className="text-sm text-neutral-800 whitespace-pre-wrap">{handoffAddress}</p>
                            </div>
                        )}
                        <p className="text-sm text-neutral-700">
                            Submit an on-chain proximity proof to certify the next
                            delivery handoff. This fires the{" "}
                            <code className="font-mono text-xs">figaro-proximity-proof-v1</code>{" "}
                            attestation and logs the courier-process handoff event.
                        </p>
                        <Button
                            onClick={handleCourierProximityProof}
                            disabled={courierPending || courierActions.isPending || courierActions.isConfirming}
                            data-testid="btn-courier-proximity-proof"
                        >
                            {courierPending ? "Submitting…" : "Submit proximity proof"}
                        </Button>
                        {courierError && (
                            <p className="text-sm text-red-600" data-testid="courier-action-error">
                                {courierError}
                            </p>
                        )}
                    </>
                )}

                {role === "spectator" && (
                    <p className="text-sm text-neutral-600">
                        You are not party to this order. Open the audit page for the public record.
                    </p>
                )}

                {workspace.actionError && (
                    <p className="text-sm text-red-600" data-testid="workspace-action-error">
                        {workspace.actionError}
                    </p>
                )}
            </section>

            {/* Timeline */}
            <section className="space-y-3">
                <p className="text-xs font-semibold text-neutral-500">
                    Timeline
                </p>
                <ol className="space-y-2" data-testid="order-timeline">
                    <li className="flex items-start gap-3 rounded border border-neutral-200 bg-white p-3">
                        <span className="mt-1 inline-block h-3 w-3 rounded-full border bg-green-500 border-green-500" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-black">Order placed</p>
                            <p className="text-xs text-neutral-500">
                                {role === "buyer" ? `You committed to ${sellerDisplayName}.` : `${buyerDisplayName} committed.`}
                            </p>
                        </div>
                    </li>
                    {events.map((event) => {
                        const labels = role === "seller" ? EVENT_LABELS_FOR_MERCHANT : EVENT_LABELS_FOR_BUYER;
                        return (
                            <li
                                key={`${event.eventType}-${event.blockNumber}`}
                                className="flex items-start gap-3 rounded border border-neutral-200 bg-white p-3"
                                data-testid={`timeline-event-${event.eventType}`}
                            >
                                <span className="mt-1 inline-block h-3 w-3 rounded-full border bg-green-500 border-green-500" />
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-black">{labels[event.eventType]}</p>
                                    <p className="text-xs text-neutral-500">block {event.blockNumber}</p>
                                </div>
                            </li>
                        );
                    })}
                    {eventsLoading && (
                        <li className="text-xs text-neutral-500" data-testid="timeline-loading">Loading events…</li>
                    )}
                    {isResolved && (
                        <li className="flex items-start gap-3 rounded border border-neutral-200 bg-white p-3">
                            <span className="mt-1 inline-block h-3 w-3 rounded-full border bg-green-500 border-green-500" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-black">Order completed</p>
                                <p className="text-xs text-neutral-500">Bonds released.</p>
                            </div>
                        </li>
                    )}
                </ol>
            </section>

            {/* Secondary affordances */}
            <section className="flex flex-wrap gap-3 text-sm">
                <Link
                    href={`/audit/${processId}`}
                    className="rounded border border-neutral-300 px-4 py-2 text-neutral-700 hover:bg-neutral-50"
                    data-testid="link-audit"
                >
                    View audit record
                </Link>
                <Link
                    href="/dispute"
                    className="rounded border border-neutral-300 px-4 py-2 text-neutral-700 hover:bg-neutral-50"
                    data-testid="link-dispute"
                >
                    Report a problem
                </Link>
            </section>
        </div>
    );
}
