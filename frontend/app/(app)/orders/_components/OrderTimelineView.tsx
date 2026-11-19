"use client";

/**
 * OrderTimelineView — per-order page at `/orders/view?process=<processId>`.
 *
 * This surface NAMES NO CLAUSE. It renders only:
 *   - CORE state — placed / active / completed, from the commit + process
 *     state (the bilateral commit IS the order's arrival and the seller's
 *     approval; nobody "marks it received").
 *   - the GENERIC timeline — every attestation on the process, labeled
 *     straight from its clause's off-chain spec (`describeAttestation`), the
 *     clauseId taken from the event DATA.
 *   - the ATTESTATIONS COMPARED reader — for any assembly-scoped clause's
 *     declared stage, whether the parties' filings agree (derived, never stored).
 *   - the PRIVATE FILINGS panel — per order this wallet is a party to, the
 *     request for the counterparty's private filings and the sealed send of
 *     its own (`PrivateFilingsPanel`), and, where the process carries a
 *     private filing, the wallet's own export, import and removal of the
 *     private content this browser keeps for it (`KeptPrivateContentPanel`).
 *   - the CAPABILITY rail — every action the buyer/seller can take, DERIVED by
 *     the builder (`deriveProcessModelFromRuntime`) from the clauses the
 *     agreement carries + the attestation state, executed through one path
 *     (`executeCapability`). Add a clause → its capability surfaces here with
 *     no edit to this page. (Enforced by `lint-no-hardcoded-clauses-in-runtime`.)
 *
 * The resolution panel (FigaroCore proceeds — names no clause) renders once the
 * process is resolved. This page does NOT replace `/audit/view?process=<processId>`.
 */

import Link from "@/components/shared/Link";
import { buttonVariants } from "@/components/ui/Button";
import { useCallback, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ResolutionProceedsPanel } from "@/components/runtime/ResolutionProceedsPanel";
import { PayoutRoutingPanel } from "@/components/runtime/PayoutRoutingPanel";
import { CapabilityRail } from "@/components/runtime/CapabilityRail";
import { OrderInteractionSurfaces } from "@/components/runtime/OrderInteractionSurfaces";
import { PrivateFilingsPanel } from "@/components/runtime/PrivateFilingsPanel";
import { privateFilingsInPlay } from "@/lib/data/handoff/privateFilings";
import { KeptPrivateContentPanel } from "@/components/runtime/KeptPrivateContentPanel";
import { useWitnessHolder } from "@/lib/core/useWitnessHolder";
import { encodedSetPrivacy } from "@/lib/core/witnessContent";
import { attestationPathLabel } from "@/lib/core/attestationPath";
import { StageAttestationComparison } from "@/components/runtime/StageAttestationComparison";
import { RowBoundary } from "@/components/data/RowBoundary";
import { useSemanticProcessWorkspace } from "@/hooks/useSemanticProcessWorkspace";
import useProcessResolveCapacity from "@/hooks/useProcessResolveCapacity";
import { useMemberListings } from "@/lib/registries/useMemberListings";
import { findListingByAddress } from "@/lib/registries/memberListing";
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
    const holder = useWitnessHolder();
    const workspace = useSemanticProcessWorkspace({ processId });
    const { read: listingsRead } = useMemberListings();
    // Names come only from listings the registry returned; an absent read
    // names no one (the address itself is shown).
    const listings = listingsRead.status === "present" ? listingsRead.value : [];
    const resolveCapacity = useProcessResolveCapacity(processId as `0x${string}`);
    const [filingsKeptRound, setFilingsKeptRound] = useState(0);
    const onFilingsKept = useCallback(() => setFilingsKeptRound((n) => n + 1), []);

    const processModel = workspace.processModel;

    const rootOrder = useMemo(() => {
        if (!processModel) return null;
        // The chain's root only; no other order stands in for it.
        return processModel.orders.find((order) => order.orderId === processModel.rootOrderId) ?? null;
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

    // A failed read renders nothing; only a read in flight shows loading.
    if (workspace.processModelRead.status === "absent") return null;
    if (workspace.processModelRead.status === "present" && !processModel) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold text-ink-muted mb-3">Order</p>
                <p className="text-sm text-ink-body">
                    No order is committed under process <code className="font-mono text-xs">{truncateHex(processId, { head: 10, tail: 0 })}</code>.
                </p>
            </div>
        );
    }
    if (!processModel) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold text-ink-muted mb-3">Order</p>
                <h1 className="text-heading-h1 text-ink-heading mb-4">Loading…</h1>
            </div>
        );
    }

    const pillLabel = isResolved ? "Completed" : "Active";
    const pillTone: Tone = isResolved ? "green" : "blue";
    const headline = isResolved ? "Order completed" : "Order active";
    const subhead = isResolved
        ? "Bonds refunded. Receipt available on the audit page."
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
                    <h1 className="text-heading-h1 text-ink-heading">{headline}</h1>
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
                    // model, never a clause or a frontend label map.
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
                            {resolveCapacity.activeOrderCount} / {resolveCapacity.cap} resolvable in one call
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

            {/* Resolution — once resolved, what moved: payment + bond, returned.
                Rendered only when the derived breakdown is present — absence is
                absence, never a locally re-implemented 2x fallback. */}
            {isResolved && (isBuyer || isSeller) && myOrder?.resolutionBreakdown?.settledAvailable && (
                <ResolutionProceedsPanel
                    sourceOrderId={myOrder.orderId}
                    currency={(myOrder.currency ?? ZERO_ADDRESS) as `0x${string}`}
                    isSeller={isSeller}
                    payment={myOrder.payment}
                    bondReturned={myOrder.resolutionBreakdown.settledAvailable.amount}
                />
            )}

            {/* Post-resolution payout routing — the resolved seller splits its
                own receipts onward through the composed public multisender.
                Sibling of the proceeds panel (no clause to key
                on); renders only when a multisender is configured. */}
            {isResolved && isSeller && myOrder && (
                <PayoutRoutingPanel currency={(myOrder.currency ?? ZERO_ADDRESS) as `0x${string}`} />
            )}

            {/* Declared interaction surfaces — for every clause, on every order
                this wallet is a PARTY to, whose spec declares a
                block.runtime.interaction this frontend has a registered surface for
                (a QR order-identity challenge at a handoff, the private
                address ceremony on a geolocation-committed order). The buyer
                is a party to every order (the star shape); a seller to its
                own. Names no clause; the dispatch key is the spec's own
                declaration. */}
            {role !== "spectator" && processModel.orders
                .filter((order) => hexEqual(address, order.buyer) || hexEqual(address, order.seller))
                .map((order) => (
                    <div key={order.orderId} className="space-y-3">
                        <OrderInteractionSurfaces
                            processId={processId}
                            orderHash={order.orderId}
                            checkoutHash={order.checkoutHash}
                            buyer={order.buyer}
                            seller={order.seller}
                        />
                        {/* The private filings of this order, where any
                            concern this wallet: the party that does not hold
                            the content asks, its attester sends on that
                            request alone. Names no clause. */}
                        {address && holder && workspace.processAttestations && privateFilingsInPlay(
                            order.orderId, workspace.processAttestations, holder,
                            hexEqual(address, order.seller) ? order.buyer : order.seller,
                        ) && (
                            <PrivateFilingsPanel
                                orderHash={order.orderId}
                                buyer={order.buyer}
                                seller={order.seller}
                                attestations={workspace.processAttestations}
                                onKept={onFilingsKept}
                            />
                        )}
                    </div>
                ))}

            {/* The wallet's own copies of private content, where this process
                carries a filing whose set its clause's spec declares private:
                export, import, removal. Names no clause. */}
            {role !== "spectator" && holder && workspace.processAttestations?.some(
                (att) => encodedSetPrivacy(att.clauseId, att.stage) === true,
            ) && (
                <KeptPrivateContentPanel holder={holder} refreshKey={filingsKeptRound} onChanged={onFilingsKept} />
            )}

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

            {/* Timeline — the process's attestation log, each row labeled from
                the clause's own spec (clauseId comes from the event data). */}
            <section className="space-y-3">
                <p className="text-xs font-semibold text-ink-muted">Timeline</p>
                <ol className="space-y-2" data-testid="order-timeline">
                    <li className="flex items-start gap-3 rounded-tile border border-default bg-paper p-3" data-testid="timeline-placed">
                        <span className="mt-1 inline-block h-3 w-3 rounded-full border bg-success border-success" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-ink-primary">order placed</p>
                            <p className="text-xs text-ink-muted">
                                {role === "buyer" ? `You committed to ${sellerDisplayName}.` : `${buyerDisplayName} committed.`}
                            </p>
                            <RowBoundary boundary="protocol-enforced" source="derived at read time from the order events" />
                        </div>
                    </li>
                    {(workspace.processAttestations ?? []).map((att) => {
                        const { clauseTitle, eventLabel, eventCode } = describeAttestation(att.clauseId, att.stage);
                        return (
                            <li
                                key={`${att.clauseId}-${att.orderHash}-${att.stage}-${att.blockNumber}`}
                                className="flex items-start gap-3 rounded-tile border border-default bg-paper p-3"
                                // Stable raw event code for targeting (the humanized
                                // eventLabel is the visible text below).
                                data-testid={`timeline-event-${eventCode}`}
                                data-event-code={eventCode}
                            >
                                <span className="mt-1 inline-block h-3 w-3 rounded-full border bg-success border-success" />
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-ink-primary">{eventLabel}</p>
                                    <p className="text-xs text-ink-muted">
                                        {clauseTitle} · block {att.blockNumber} ·{" "}
                                        <span data-testid="timeline-event-path" data-universe={att.universe} title={attestationPathLabel(att.universe)}>
                                            {att.universe} path
                                        </span>
                                    </p>
                                    {/* The row reads the event alone: its clause key, stage
                                        and block, named from the clause's registered spec. */}
                                    <RowBoundary
                                        boundary="protocol-derived"
                                        source="derived at read time from the Attestation event, named from the clause's registered spec"
                                    />
                                </div>
                            </li>
                        );
                    })}
                    {isResolved && (
                        <li className="flex items-start gap-3 rounded-tile border border-default bg-paper p-3" data-testid="timeline-completed">
                            <span className="mt-1 inline-block h-3 w-3 rounded-full border bg-success border-success" />
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-ink-primary">order completed</p>
                                <p className="text-xs text-ink-muted">Bonds refunded.</p>
                                <RowBoundary boundary="protocol-enforced" source="derived at read time from the order events" />
                            </div>
                        </li>
                    )}
                </ol>
            </section>

            {/* Attestations compared — for every assembly-scoped clause whose
                declared stage more than one party attested, whether their
                filings agree, field by field. Derived from the same log and
                the content its fingerprints resolve to; read-only, ungated. */}
            {workspace.processAttestations && (
                // Read again each time this browser keeps the counterparty's filings.
                <StageAttestationComparison key={filingsKeptRound} attestations={workspace.processAttestations} />
            )}

            {/* Secondary affordances */}
            <section className="flex flex-wrap gap-3 text-sm">
                <Link
                    href={`/audit/view?process=${processId}`}
                    className={buttonVariants({ variant: "outline" })}
                    data-testid="link-audit"
                >
                    View audit data
                </Link>
                {isResolved && (
                    <Link
                        href="/data/yours"
                        className={buttonVariants({ variant: "outline" })}
                        data-testid="link-your-data"
                    >
                        Your data
                    </Link>
                )}
            </section>
        </div>
    );
}
