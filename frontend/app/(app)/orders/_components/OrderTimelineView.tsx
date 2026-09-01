"use client";

/**
 * OrderTimelineView — per-order page at `/orders/view?process=<processId>`.
 *
 * This surface NAMES NO CLAUSE. It renders only:
 *   - CORE state — placed / active / completed, from the commit + process
 *     state (the bilateral commit IS the order's arrival and the seller's
 *     approval; nobody "marks it received").
 *   - the GENERIC timeline — every attestation on the process, labelled
 *     straight from its clause's off-chain spec (`describeAttestation`), the
 *     clauseId taken from the event DATA.
 *   - the CAPABILITY rail — every action the buyer/seller can take, DERIVED by
 *     the builder (`deriveProcessModelFromRuntime`) from the clauses the
 *     agreement carries + the attestation state, executed through one path
 *     (`executeCapability`). Add a clause → its capability surfaces here with
 *     no edit to this page. (Enforced by `lint-no-hardcoded-clauses-in-runtime`.)
 *
 * The settlement panel (kernel proceeds — names no clause) renders once the
 * process is resolved. This page does NOT replace `/audit/view?process=<processId>`.
 */

import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { SettlementProceedsPanel } from "@/components/runtime/SettlementProceedsPanel";
import { PayoutRoutingPanel } from "@/components/runtime/PayoutRoutingPanel";
import { CapabilityRail } from "@/components/runtime/CapabilityRail";
import { OrderInteractionSurfaces } from "@/components/runtime/OrderInteractionSurfaces";
import { useSemanticProcessWorkspace } from "@/hooks/useSemanticProcessWorkspace";
import useProcessResolveCapacity from "@/hooks/useProcessResolveCapacity";
import { useMemberListings } from "@/lib/member/useMemberListings";
import { findListingByAddress } from "@/lib/member/memberListing";
import { describeAttestation } from "@/lib/shared/clauseSpecSource";
import { truncateHex } from "@/lib/shared/formatHex";
import { hexEqual, ZERO_ADDRESS } from "@/lib/shared/evm";

type Tone = "neutral" | "blue" | "green";

function toneClasses(tone: Tone): string {
    switch (tone) {
        case "blue": return "border-info/30 bg-info/10 text-info-fg";
        case "green": return "border-success/30 bg-success/10 text-success-fg";
        default: return "border-default bg-subtle text-ink-body";
    }
}

interface Props {
    processId: string;
}

export function OrderTimelineView({ processId }: Props) {
    const { address } = useAccount();
    const workspace = useSemanticProcessWorkspace({ processId });
    const { listings } = useMemberListings();
    const resolveCapacity = useProcessResolveCapacity(processId as `0x${string}`);

    const processModel = workspace.processModel;

    const rootOrder = useMemo(() => {
        if (!processModel) return null;
        return processModel.orders.find((order) => order.orderId === processModel.rootOrderId)
            ?? processModel.orders[0]
            ?? null;
    }, [processModel]);

    const sellerOrder = useMemo(() => {
        if (!processModel || !address) return null;
        return processModel.orders.find((order) => hexEqual(address, order.seller)) ?? null;
    }, [processModel, address]);

    const isBuyer = !!rootOrder && hexEqual(address, rootOrder.buyer);
    const isSeller = !!sellerOrder;
    const role: "buyer" | "seller" | "spectator" = isBuyer ? "buyer" : isSeller ? "seller" : "spectator";

    const allOrders = processModel?.orders ?? [];
    const isResolved = allOrders.length > 0 && allOrders.every((order) => order.state !== "Active");

    const memberListing = rootOrder ? findListingByAddress(listings, rootOrder.seller) : undefined;
    const sellerDisplayName = memberListing?.name ?? (rootOrder ? truncateHex(rootOrder.seller) : "the seller");
    const buyerListing = rootOrder ? findListingByAddress(listings, rootOrder.buyer) : undefined;
    const buyerDisplayName = buyerListing?.name ?? (rootOrder ? truncateHex(rootOrder.buyer) : "the buyer");

    if (!processModel) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold text-ink-muted mb-3">Order</p>
                <h1 className="text-3xl font-bold text-ink-primary mb-4">Loading…</h1>
                <p className="text-sm text-ink-body">
                    Reading process <code className="font-mono text-xs">{truncateHex(processId, { head: 10, tail: 0 })}</code> from
                    chain. If this persists, the process ID may be wrong or the indexer may be unreachable.
                </p>
            </div>
        );
    }

    const pillLabel = isResolved ? "Completed" : "Active";
    const pillTone: Tone = isResolved ? "green" : "blue";
    const headline = isResolved ? "Order completed" : "Order active";
    const subhead = isResolved
        ? "Bonds released. Receipt available on the audit page."
        : role === "buyer"
            ? `${sellerDisplayName} has your order. Track progress below and resolve when you have received it.`
            : role === "seller"
                ? "The order is committed. Advance it through the steps below."
                : "Read-only view of a committed process.";

    const myOrder = isSeller && sellerOrder ? sellerOrder : rootOrder;

    return (
        <div data-testid="order-timeline-view" className="container mx-auto px-6 py-10 max-w-3xl space-y-8">
            <header className="space-y-3">
                <p className="text-xs font-semibold text-ink-muted">Order</p>
                <div className="flex flex-wrap items-baseline gap-3">
                    <h1 className="text-3xl font-bold text-ink-primary">{headline}</h1>
                    <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses(pillTone)}`}
                        data-testid="order-status-pill"
                    >
                        {pillLabel}
                    </span>
                </div>
                <p className="text-sm text-ink-body">{subhead}</p>
                {processModel.rootModality && (
                    // The committed modality, shown as the clause's own
                    // code (the agreement is the source) — read off the builder's
                    // model, never a clause section or a frontend label map.
                    <p className="text-xs text-ink-body" data-testid="order-modality">
                        Modality: <span className="font-medium text-ink-primary">{processModel.rootModality}</span>
                    </p>
                )}
                {/* Resolve-ceiling position — depth vs the chain's atomic-resolve
                    cap (chain-adaptive, read live; the same ceiling the designer
                    canvas gates on). Active processes only; absence = no read. */}
                {!isResolved && resolveCapacity && (
                    <p className="text-xs text-ink-body" data-testid="order-process-capacity">
                        Process orders:{" "}
                        <span className={resolveCapacity.remaining <= Math.max(1, Math.floor(resolveCapacity.cap / 20))
                            ? "font-medium text-warning-fg"
                            : "font-medium text-ink-primary"}>
                            {resolveCapacity.activeOrderCount} / {resolveCapacity.cap} resolvable in one settlement
                        </span>
                    </p>
                )}
                <p className="text-xs text-ink-muted font-mono">
                    Process <span data-testid="order-process-id">{truncateHex(processId, { head: 10, tail: 6 })}</span>
                    {" · "}
                    {role === "buyer" && <>You are the buyer · seller: <span className="text-ink-body">{sellerDisplayName}</span></>}
                    {role === "seller" && <>You are the seller · buyer: <span className="text-ink-body">{buyerDisplayName}</span></>}
                    {role === "spectator" && <>Read-only — your wallet is neither buyer nor seller on this order</>}
                </p>
            </header>

            {/* Settlement — once resolved, what moved: payment + bond, returned.
                Rendered only when the derived breakdown is present — absence is
                absence, never a locally re-implemented 2x fallback. */}
            {isResolved && (isBuyer || isSeller) && myOrder?.settlementBreakdown?.lockedBond && (
                <SettlementProceedsPanel
                    sourceOrderId={myOrder.orderId}
                    currency={(myOrder.currency ?? ZERO_ADDRESS) as `0x${string}`}
                    isSeller={isSeller}
                    payment={myOrder.payment}
                    bondReturned={myOrder.settlementBreakdown.lockedBond.amount}
                />
            )}

            {/* Post-settlement payout routing — the settled seller splits its
                own receipts onward through the composed public multisender.
                Kernel-core sibling of the proceeds panel (no clause to key
                on); renders only when a multisender is configured. */}
            {isResolved && isSeller && myOrder && (
                <PayoutRoutingPanel currency={(myOrder.currency ?? ZERO_ADDRESS) as `0x${string}`} />
            )}

            {/* Declared interaction surfaces — for every clause, on every order
                this wallet is a PARTY to, whose spec declares a
                block.runtime.interaction this frontend has a registered surface for
                (a QR order-identity challenge at a hand-off, the private
                address ceremony on a geolocation-committed order). The buyer
                is a party to every order (kernel star shape); a seller to its
                own. Names no clause; the dispatch key is the spec's own
                declaration. */}
            {role !== "spectator" && processModel.orders
                .filter((order) => hexEqual(address, order.buyer) || hexEqual(address, order.seller))
                .map((order) => (
                    <OrderInteractionSurfaces
                        key={order.orderId}
                        processId={processId}
                        orderHash={order.orderId}
                        agreementHash={order.agreementHash}
                        buyer={order.buyer}
                        seller={order.seller}
                    />
                ))}

            {/* What you can do — every action the builder derived from the
                agreement's clauses + attestation state. One execution path. */}
            {role !== "spectator" && (
                <CapabilityRail
                    capabilities={workspace.runtimeCapabilities}
                    executableCapabilityIds={workspace.executableCapabilityIds}
                    executingCapabilityId={workspace.executingCapabilityId}
                    onExecute={(capability, input) => workspace.executeCapability(capability, input)}
                    contextLabel={role === "buyer" ? "Your actions" : "Next steps"}
                />
            )}
            {workspace.actionError && (
                <p className="text-sm text-error-fg" data-testid="workspace-action-error">{workspace.actionError}</p>
            )}

            {/* Timeline — the process's attestation log, each row labelled from
                the clause's own spec (clauseId comes from the event data). */}
            <section className="space-y-3">
                <p className="text-xs font-semibold text-ink-muted">Timeline</p>
                <ol className="space-y-2" data-testid="order-timeline">
                    <li className="flex items-start gap-3 rounded border border-default bg-paper p-3">
                        <span className="mt-1 inline-block h-3 w-3 rounded-full border bg-success border-success" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-ink-primary">order placed</p>
                            <p className="text-xs text-ink-muted">
                                {role === "buyer" ? `You committed to ${sellerDisplayName}.` : `${buyerDisplayName} committed.`}
                            </p>
                        </div>
                    </li>
                    {workspace.processAttestations.map((att) => {
                        const { clauseTitle, eventLabel, eventCode } = describeAttestation(att.clauseId, att.stage);
                        return (
                            <li
                                key={`${att.clauseId}-${att.orderHash}-${att.stage}-${att.blockNumber}`}
                                className="flex items-start gap-3 rounded border border-default bg-paper p-3"
                                // Stable raw event code for targeting (the humanized
                                // eventLabel is the visible text below).
                                data-testid={`timeline-event-${eventCode}`}
                                data-event-code={eventCode}
                            >
                                <span className="mt-1 inline-block h-3 w-3 rounded-full border bg-success border-success" />
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-ink-primary">{eventLabel}</p>
                                    <p className="text-xs text-ink-muted">{clauseTitle} · block {att.blockNumber}</p>
                                </div>
                            </li>
                        );
                    })}
                    {isResolved && (
                        <li className="flex items-start gap-3 rounded border border-default bg-paper p-3">
                            <span className="mt-1 inline-block h-3 w-3 rounded-full border bg-success border-success" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-ink-primary">order completed</p>
                                <p className="text-xs text-ink-muted">Bonds released.</p>
                            </div>
                        </li>
                    )}
                </ol>
            </section>

            {/* Secondary affordances */}
            <section className="flex flex-wrap gap-3 text-sm">
                <Link
                    href={`/audit/view?process=${processId}`}
                    className="rounded border border-default px-4 py-2 text-ink-body hover:bg-subtle"
                    data-testid="link-audit"
                >
                    View audit record
                </Link>
            </section>
        </div>
    );
}
