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
import { CourierAuctionPanel } from "@/components/core/CourierAuctionPanel";
import { GHGAnchorPanel } from "@/components/core/GHGAnchorPanel";
import { GHGWorkflowPanel } from "@/components/core/GHGWorkflowPanel";
import { useSemanticProcessWorkspace } from "@/hooks/core/useSemanticProcessWorkspace";
import { getAttestationsByProcessAndSchema } from "@/lib/core/indexer";
import { getAttestationContent } from "@/lib/mechanisms/useGHGDisclosure";
import { useOperatorListings } from "@/lib/mechanisms/useOperatorListings";
import { findListingByAddress } from "@/lib/shared/operatorListing";
import type { SemanticTone } from "@/lib/shared/tones";
import { MERCHANT_PROCESS_SCHEMA_ID, useMerchantProcessActions } from "@/lib/mechanisms/useMerchantProcess";
import {
    COURIER_PROCESS_SCHEMA_ID,
    PROXIMITY_SCHEMA_ID,
    encodeProximityProofContent,
    useCourierProcessActions,
} from "@/lib/mechanisms/useCourierProcess";
import { useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";
import {
    getSection,
    COURIER_PROCESS_SCHEMA_KEY,
    MERCHANT_PROCESS_SCHEMA_KEY,
    PROXIMITY_POLICY_SCHEMA_KEY,
} from "@/lib/core/agreementManifest";
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
    const { submitBuyerAttestation } = useAttestationCoordinatorActions();
    const { listings } = useOperatorListings();

    const [events, setEvents] = useState<MerchantTimelineEvent[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [merchantPending, setMerchantPending] = useState(false);
    const [merchantError, setMerchantError] = useState<string | null>(null);
    const [courierPending, setCourierPending] = useState(false);
    const [courierError, setCourierError] = useState<string | null>(null);
    const [buyerProofPending, setBuyerProofPending] = useState(false);
    const [buyerProofError, setBuyerProofError] = useState<string | null>(null);
    const [proximityAttesters, setProximityAttesters] = useState<string[]>([]);
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

    // Proximity-proof attestation log on this process — both the buyer
    // and the merchant attest under figaro-proximity-proof-v1 at the
    // pickup handoff edge. The set of attesters drives the per-role gate
    // on the "submit handoff proof" buttons (each party attests once).
    useEffect(() => {
        if (!publicClient || !chainId || !processId) return;
        let cancelled = false;
        (async () => {
            try {
                const logs = await getAttestationsByProcessAndSchema(
                    publicClient, chainId, processId, PROXIMITY_SCHEMA_ID,
                );
                if (cancelled) return;
                const attesters = logs
                    .map((log) => ((log.args ?? {}) as { attester?: string }).attester ?? "")
                    .filter((a) => a.length > 0);
                setProximityAttesters(attesters);
            } catch {
                if (!cancelled) setProximityAttesters([]);
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
    // The order the connected wallet sells — the root order or ANY sub-order.
    // The seller-side surface is driven by the schemas THIS order carries, not
    // by a fixed merchant-vs-courier role: figaro-merchant-process-v1 →
    // lifecycle events; figaro-courier-process-v1 → courier proximity proof;
    // figaro-proximity-policy-v1 → handoff witness. One surface, every
    // assembly topology (delivery, pickup, on-site, the kit diamond).
    // A wallet may sell MORE THAN ONE order in a process (e.g. coordinate AND
    // serve). No kernel constraint forbids a repeated seller — FigaroCore.commit
    // enforces only buyer == rootBuyer. One order surfaces one clause-driven
    // frontend at a time, so the seller switches between the orders it holds.
    const sellerOrders = useMemo(() => {
        if (!processModel || !address) return [];
        return processModel.orders.filter((order) => hexEqual(address, order.seller));
    }, [processModel, address]);
    const [selectedSellerOrderId, setSelectedSellerOrderId] = useState<string | null>(null);
    const sellerOrder = useMemo(() => {
        if (sellerOrders.length === 0) return null;
        return sellerOrders.find((o) => o.orderId === selectedSellerOrderId) ?? sellerOrders[0];
    }, [sellerOrders, selectedSellerOrderId]);
    const isSeller = !!sellerOrder;
    const isSellerRoot = !!sellerOrder && !!rootOrder && sellerOrder.orderId === rootOrder.orderId;
    const sellerOrderSchemas = useMemo(() => {
        if (!sellerOrder) return [] as string[];
        const agreement = workspace.processAgreements.get(sellerOrder.agreementHash) ?? null;
        return agreement ? agreement.sections.map((section) => section.schema) : [];
    }, [sellerOrder, workspace.processAgreements]);
    const sellerHasMerchantProcess = sellerOrderSchemas.includes(MERCHANT_PROCESS_SCHEMA_KEY);
    const sellerHasCourierProcess = sellerOrderSchemas.includes(COURIER_PROCESS_SCHEMA_KEY);
    const role: "buyer" | "seller" | "spectator" =
        isBuyer ? "buyer" : isSeller ? "seller" : "spectator";

    // The courier receives the buyer's human-readable delivery address over
    // the coordination channel (the geohash is the on-agreement term).
    const [handoffAddress, setHandoffAddress] = useState<string | null>(null);
    useEffect(() => {
        if (!sellerOrder || !sellerHasCourierProcess || !address) return;
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;
        DEFAULT_COORDINATION_MESSAGING_SERVICE.subscribeHandoffAddress({
            address,
            orderId: sellerOrder.orderId,
            callback: (deliveryAddress) => setHandoffAddress(deliveryAddress),
        }).then((u) => {
            if (cancelled) u();
            else unsubscribe = u;
        }).catch(() => { /* coordination channel unavailable */ });
        return () => { cancelled = true; unsubscribe?.(); };
    }, [sellerOrder, sellerHasCourierProcess, address]);

    const allOrders = processModel?.orders ?? [];
    // OrderNodeModel.state is the OrderState enum reverse-mapped to a string
    // ("Active" | "Resolved") in `deriveProcessModelFromRuntime`.
    const isResolved = allOrders.length > 0 && allOrders.every((order) => order.state !== "Active");

    // Pickup-edge handoff certification. When the merchant↔buyer root order
    // itself carries a committed figaro-proximity-policy-v1 clause AND there
    // is no courier sub-order, the handoff is buyer↔merchant rather than
    // merchant↔courier. The same proximity-proof primitive applies; both
    // parties attest under figaro-proximity-proof-v1 against the same root
    // order, just from opposite role gates (attestAsBuyer / attestAsSeller).
    const rootHasProximityPolicy = useMemo(() => {
        if (!rootOrder) return false;
        const agreement = workspace.processAgreements.get(rootOrder.agreementHash) ?? null;
        return !!agreement && !!getSection(agreement, PROXIMITY_POLICY_SCHEMA_KEY);
    }, [rootOrder, workspace.processAgreements]);
    // Buyer↔merchant handoff (no intermediary): the root carries proximity AND
    // the process is a single order — the buyer co-witnesses (pickup / on-site).
    const isPickupHandoff = rootHasProximityPolicy && allOrders.length <= 1;
    // The order the seller witnesses proximity against: its own order when it
    // carries the policy (pickup / on-site / a kit node); otherwise — for the
    // root merchant in a delivery — the sub-order that carries it (the courier
    // edge the merchant cross-witnesses).
    const sellerProximityTargetOrder = useMemo(() => {
        if (!sellerOrder) return null;
        if (sellerOrderSchemas.includes(PROXIMITY_POLICY_SCHEMA_KEY)) return sellerOrder;
        if (!isSellerRoot || !processModel) return null;
        return processModel.orders.find((order) => {
            if (order.orderId === sellerOrder.orderId) return false;
            const agreement = workspace.processAgreements.get(order.agreementHash) ?? null;
            return !!agreement && !!getSection(agreement, PROXIMITY_POLICY_SCHEMA_KEY);
        }) ?? null;
    }, [sellerOrder, sellerOrderSchemas, isSellerRoot, processModel, workspace.processAgreements]);
    const buyerAlreadyAttestedProximity = useMemo(() => {
        if (!address) return false;
        return proximityAttesters.some((a) => hexEqual(a, address));
    }, [proximityAttesters, address]);
    const sellerAlreadyAttestedProximity = useMemo(() => {
        if (!address) return false;
        return proximityAttesters.some((a) => hexEqual(a, address));
    }, [proximityAttesters, address]);

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
        if (!next || !sellerOrder) return;
        setMerchantPending(true);
        setMerchantError(null);
        try {
            await merchantActions.signal({
                orderHash: sellerOrder.orderId,
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

    // Read the committed proximity-policy band off the courier sub-order's
    // agreement (the policy lives on the courier's manifest, not the
    // merchant's). Both the courier's own proof and the merchant's cross-
    // witness derive their band from this same source so the on-chain
    // attestations agree on the committed band.
    const readCommittedBand = (orderAgreementHash: string): number => {
        const agreement = workspace.processAgreements.get(orderAgreementHash) ?? null;
        const committedBand = agreement
            ? ((getSection(agreement, PROXIMITY_POLICY_SCHEMA_KEY)
                ?.data as { bands?: string[] } | undefined)?.bands ?? [])[0]
            : undefined;
        return PROXIMITY_BAND_INDEX[committedBand ?? ""] ?? 1;
    };

    const handleCourierProximityProof = async () => {
        if (!sellerOrder || !publicClient) return;
        setCourierPending(true);
        setCourierError(null);
        try {
            // Fresh 32-byte nonce per handoff — the validator rejects a
            // zero nonce, and a unique nonce keeps each proof distinct.
            const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
            const band = readCommittedBand(sellerOrder.agreementHash);
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
                orderHash: sellerOrder.orderId,
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

    // Merchant cross-witness of the pickup handoff. Two cases collapsed
    // into the same primitive:
    //   - Delivery: target = courier sub-order, role = merchant's root order.
    //     Proximity-policy lives on the courier's manifest.
    //   - Pickup:   target = role = merchant's root order. Proximity-policy
    //     lives on the merchant's own manifest (the buyer↔merchant order).
    // Both cases call signalWithProof; submitSellerAttestation collapses to
    // a single commitment when roleOrderHash === orderHash.
    const handleMerchantProximityProof = async () => {
        if (!sellerOrder) return;
        const proximityOrder = sellerProximityTargetOrder ?? sellerOrder;
        setMerchantPending(true);
        setMerchantError(null);
        try {
            const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
            const band = readCommittedBand(proximityOrder.agreementHash);
            await merchantActions.signalWithProof({
                merchantOrderHash: sellerOrder.orderId,
                proximityTargetOrderHash: proximityOrder.orderId,
                eventType: "handed-off",
                proof: { band, nonce, deviceSig: COURIER_DEVICE_SIG_PLACEHOLDER },
            });
            setTick((t) => t + 1);
        } catch (cause: unknown) {
            setMerchantError(extractErrorMessage(cause, "Merchant handoff attestation failed"));
        } finally {
            setMerchantPending(false);
        }
    };

    // Buyer-side pickup witness — symmetric to the merchant path, but
    // through attestAsBuyer. The buyer attests proximity-proof against
    // their own (= the merchant↔buyer root) order. No process schema for
    // buyers per kernel-participant principle — proximity-proof is the
    // one runtime witness the buyer co-signs.
    const handleBuyerPickupProof = async () => {
        if (!rootOrder) return;
        setBuyerProofPending(true);
        setBuyerProofError(null);
        try {
            const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
            const band = readCommittedBand(rootOrder.agreementHash);
            await submitBuyerAttestation({
                orderHash: rootOrder.orderId as Hex,
                schemaId: PROXIMITY_SCHEMA_ID,
                stage: band,
                content: encodeProximityProofContent({
                    band, nonce, deviceSig: COURIER_DEVICE_SIG_PLACEHOLDER,
                }),
                failureMessage: "Buyer pickup proof submission failed",
            });
            setTick((t) => t + 1);
        } catch (cause: unknown) {
            setBuyerProofError(extractErrorMessage(cause, "Buyer pickup proof failed"));
        } finally {
            setBuyerProofPending(false);
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
                    {role === "seller" && (
                        isSellerRoot
                            ? <>You are the seller · buyer: <span className="text-neutral-700">{buyerDisplayName}</span></>
                            : <>You are the seller of a sub-order in this process</>
                    )}
                    {role === "spectator" && <>Read-only — your wallet is neither buyer nor seller on this order</>}
                </p>
            </header>

            {/* Deferred courier edge — a Dutch auction, if this process has one.
                Renders null for every non-auction process. */}
            <CourierAuctionPanel processId={processId} />

            {/* Emissions disclosure — sellers file figaro-ghg-measurement-v1
                measurements here. The panels self-render their empty states
                on non-GHG processes (no attestations, no disclosure capability). */}
            <GHGAnchorPanel processId={processId} />
            <GHGWorkflowPanel processId={processId} />

            {/* Primary action */}
            <section className="rounded-lg border border-neutral-200 bg-white p-5 space-y-3">
                <p className="text-xs font-semibold text-neutral-500">
                    {role === "buyer" ? "Your action" : role === "seller" ? "Next step" : "Status"}
                </p>

                {/* When the connected wallet sells more than one order in this
                    process, switch between them — each order surfaces its own
                    clause-driven frontend below. */}
                {role === "seller" && sellerOrders.length > 1 && (
                    <div
                        className="flex flex-row flex-wrap gap-1 pb-2 border-b border-neutral-200"
                        data-testid="seller-order-switcher"
                    >
                        {sellerOrders.map((o, i) => {
                            const active = o.orderId === sellerOrder?.orderId;
                            return (
                                <button
                                    key={o.orderId}
                                    type="button"
                                    onClick={() => setSelectedSellerOrderId(o.orderId)}
                                    aria-pressed={active}
                                    data-testid={`seller-order-tab-${o.orderId}`}
                                    className={`shrink-0 rounded border px-3 py-1 text-xs ${
                                        active
                                            ? "border-black bg-black text-white"
                                            : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500"
                                    }`}
                                >
                                    Order {i + 1}
                                </button>
                            );
                        })}
                    </div>
                )}

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
                                {isPickupHandoff && !buyerAlreadyAttestedProximity && (
                                    <div className="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-3">
                                        <p className="text-sm text-neutral-700">
                                            Submit an on-chain proximity proof to witness the
                                            handoff from {sellerDisplayName}. Fires the{" "}
                                            <code className="font-mono text-xs">figaro-proximity-proof-v1</code>{" "}
                                            attestation against your order.
                                        </p>
                                        <Button
                                            onClick={handleBuyerPickupProof}
                                            disabled={buyerProofPending}
                                            data-testid="btn-buyer-pickup-proof"
                                        >
                                            {buyerProofPending ? "Submitting…" : "Submit handoff proof"}
                                        </Button>
                                        {buyerProofError && (
                                            <p className="text-sm text-red-600" data-testid="buyer-proof-error">
                                                {buyerProofError}
                                            </p>
                                        )}
                                    </div>
                                )}
                                {isPickupHandoff && buyerAlreadyAttestedProximity && (
                                    <p
                                        className="text-sm rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-700"
                                        data-testid="buyer-proximity-attested"
                                    >
                                        Handoff proof witnessed.
                                    </p>
                                )}
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

                {role === "seller" && sellerHasMerchantProcess && (
                    <>
                        {next === "handed-off" && sellerProximityTargetOrder && !sellerAlreadyAttestedProximity ? (
                            // Cross-witness path. signalWithProof =
                            // proximity-proof + merchant-process handed-off,
                            // opened against whichever order carries the
                            // proximity policy: a downstream sub-order (the
                            // delivery courier edge the merchant cross-witnesses)
                            // or the seller's own order (pickup / on-site / a
                            // kit node). The buyer attests the symmetric witness
                            // via btn-buyer-pickup-proof when there is no
                            // intermediary.
                            <>
                                <p className="text-sm text-neutral-700">
                                    {sellerProximityTargetOrder.orderId !== sellerOrder?.orderId
                                        ? "Submit an on-chain proximity proof to certify the handoff to the next leg."
                                        : `Submit an on-chain proximity proof to certify the handoff to ${buyerDisplayName}.`}
                                    {" "}Fires the{" "}
                                    <code className="font-mono text-xs">figaro-proximity-proof-v1</code>{" "}
                                    attestation plus the merchant-process{" "}
                                    <code className="font-mono text-xs">handed-off</code> event.
                                </p>
                                <Button
                                    onClick={handleMerchantProximityProof}
                                    disabled={merchantPending || merchantActions.isPending || merchantActions.isConfirming}
                                    data-testid="btn-merchant-proximity-proof"
                                >
                                    {merchantPending ? "Submitting…" : "Submit handoff proof"}
                                </Button>
                            </>
                        ) : next ? (
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
                            <p className="text-sm text-red-600" data-testid="seller-action-error">
                                {merchantError}
                            </p>
                        )}
                    </>
                )}

                {role === "seller" && sellerHasCourierProcess && !sellerHasMerchantProcess && (
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

                {role === "seller" && !sellerHasMerchantProcess && !sellerHasCourierProcess && (
                    <p className="text-sm text-neutral-600" data-testid="seller-no-lifecycle">
                        {isResolved
                            ? "Order complete."
                            : "No lifecycle attestations for this order. File any emissions disclosures above; the buyer resolves the process."}
                    </p>
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
