"use client";

/**
 * MemberDetailView — the buyer's BROWSE surface at `/s/view?seller=<address>`.
 *
 * Browse only: the seller's branding/hero, public-graph resolution history, and
 * catalog grid. The buyer selects items into the merchant-scoped cart and
 * follows the "Review order" CTA to `/s/checkout?seller=<address>`, where the method is
 * chosen and the bonded order is committed. This page composes NO order and
 * holds NO checkout state — that concern lives entirely on the checkout surface.
 *
 * Data sources:
 *  - `useRegisteredCatalogs` — IPFS catalog discovery.
 *  - `useMemberResolutionHistory` — on-chain resolution/coordination history.
 *  - `useCartStore` — global cart state (selection only; commit is checkout's).
 */

import Link from "@/components/shared/Link";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { CartLineList } from "@/components/runtime/CartLineList";
import { ContentImage } from "@/components/shared/ContentImage";
import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
import { MemberLogo } from "@/components/modules/MemberBrandingModule";
import { MemberAgentIdentity } from "@/components/members/MemberAgentIdentity";
import { useCommerce } from "@/lib/checkout";
import { useCartStore } from "@/lib/checkout/cartStore";
import { useRegisteredCatalogs } from "@/lib/member/useRegisteredCatalogs";
import { MemberResolutionHistory } from "@/components/runtime/MemberResolutionHistory";
import { useMemberResolutionHistory } from "@/lib/member/useMemberResolutionHistory";
import { useTokenSymbol } from "@/hooks/useTokenSymbol";
import { hexEqual, normalizeAddressParam } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatMass, formatVolume } from "@/lib/member/unitConversion";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";

import type { CatalogItemMetadata } from "@/lib/member/memberCatalogMetadata";

interface Props {
    sellerAddress: string;
}

export function MemberDetailView({ sellerAddress }: Props) {
    const { lower: sellerAddressLower, typed: sellerAddressTyped } = normalizeAddressParam(sellerAddress);

    const { catalogs: memberCatalogs, isLoading: catalogsLoading } = useRegisteredCatalogs();

    const memberCatalog = useMemo(
        () => memberCatalogs.find((r) => hexEqual(r.address, sellerAddressLower)) ?? null,
        [memberCatalogs, sellerAddressLower],
    );

    const { address: buyer } = useCommerce();
    // The seller's declared denomination, or undefined — never a coined
    // default (resolved-empty = absence).
    const currency = memberCatalog?.defaultTokenAddress as `0x${string}` | undefined;
    const { data: resolvedSymbol } = useTokenSymbol(currency ?? "");
    const tokenSymbol = resolvedSymbol
        ?? (currency ? memberCatalog?.acceptedTokens?.find((t) => hexEqual(t.address, currency))?.symbol : undefined)
        ?? "";

    const { items, addItem, removeItem, clearCart } = useCartStore();
    const { resolutionHistory, isLoading: resolutionHistoryLoading } = useMemberResolutionHistory(sellerAddressLower);

    // Cart hygiene — clear the persisted cart on mount when it leaked across
    // merchants (zustand persists to one global key) or when the connected
    // wallet IS this merchant (buyer == seller is allowed but degenerate, and
    // leftover items shouldn't auto-prepopulate a merchant's own page).
    useEffect(() => {
        if (items.length === 0) return;
        const allMatchCurrent = items.every((item) => hexEqual(item.sellerAddress, sellerAddressLower));
        const isSelfView = hexEqual(buyer, sellerAddressLower);
        if (!allMatchCurrent || isSelfView) {
            clearCart();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sellerAddressLower, buyer]);

    if (catalogsLoading) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold text-ink-muted mb-3">Seller</p>
                <h1 className="text-3xl font-bold text-ink-primary">Loading…</h1>
            </div>
        );
    }

    if (!memberCatalog) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl space-y-4">
                <p className="text-xs font-semibold text-ink-muted mb-3">Member not found</p>
                <h1 className="text-3xl font-bold text-ink-primary">No member page for {truncateHex(sellerAddressLower, { head: 10, tail: 0 })}</h1>
                <p className="text-sm text-ink-body">
                    This wallet holds no live registration in <code className="text-xs">MembersRegistry</code> on the network
                    you&apos;re connected to, or its profile binds no published assembly, or it has pinned no catalog. If this is your wallet, you can complete the registration through the onboarding flow.
                </p>
                <div className="flex items-center gap-3 pt-2">
                    <Link href="/members" className="inline-block text-sm px-3 py-1.5 rounded border border-ink-primary bg-ink-primary text-paper hover:bg-ink-body">
                        Register as a member
                    </Link>
                    <Link href="/discover" className="inline-block underline text-sm text-ink-primary hover:text-ink-body">
                        ← Back to discover
                    </Link>
                </div>
            </div>
        );
    }

    const handleAddItem = (catalogItem: CatalogItemMetadata) => {
        addItem({
            catalogItemId: catalogItem.id,
            sellerId: sellerAddressLower,
            sellerAddress: memberCatalog.address,
            sellerName: memberCatalog.name,
            name: catalogItem.name,
            price: catalogItem.price,
            quantity: 1,
            imageURI: catalogItem.image || undefined,
            massGrams: catalogItem.massGrams,
            volumeMl: catalogItem.volumeMl,
            lengthMm: catalogItem.lengthMm,
            widthMm: catalogItem.widthMm,
            heightMm: catalogItem.heightMm,
            clauseValues: catalogItem.clauseValues,
            dataSold: catalogItem.dataSold,
        });
    };

    const handleRemoveItem = (catalogItemId: string) => {
        removeItem(catalogItemId, sellerAddressLower);
    };

    const getItemQuantity = (catalogItemId: string) => {
        const cartItem = items.find(
            (item) => item.catalogItemId === catalogItemId && item.sellerId === sellerAddressLower,
        );
        return cartItem?.quantity || 0;
    };

    // The merchant-scoped cart — the basis for the "Review order" summary. The
    // bond math, method choice, and commit all live on the checkout surface.
    const cartItems = items.filter((it) => it.sellerId === sellerAddressLower);
    const cartCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);
    const cartUnitSystem = memberCatalog.unitSystem ?? "metric";

    // `category` is optional on a catalog item; items without one group under
    // an explicit, visible fallback — never an undefined key / heading-less
    // group. Matches the "(unclassified)" convention groupClausesByArticle uses.
    const categoryOf = (item: CatalogItemMetadata) => item.category ?? "(unclassified)";
    const categories = Array.from(new Set(memberCatalog.items.map(categoryOf)));

    return (
        <div>
            <div data-testid="member-detail-view" data-seller-address={sellerAddressLower} className="container mx-auto px-6 py-10 max-w-5xl space-y-8">
                <div>
                    <Link href="/discover" className="text-sm text-ink-muted hover:text-ink-primary">
                        ← Back to discover
                    </Link>
                </div>

                {/* Hero */}
                <header className="rounded-3xl border border-default bg-paper p-8 space-y-4">
                    <div className="flex flex-wrap items-start gap-5">
                        <MemberLogo
                            sellerAddress={sellerAddressTyped}
                            fallbackEmoji={memberCatalog.image}
                            fallbackName={memberCatalog.name}
                            size={88}
                        />
                        <div className="flex-1 min-w-0">
                            {memberCatalog.specialty && (
                                <p className="text-xs font-semibold text-ink-muted">{memberCatalog.specialty}</p>
                            )}
                            <h1 className="mt-1 text-4xl font-bold text-ink-primary">{memberCatalog.name}</h1>
                            <p className="mt-3 max-w-2xl text-base text-ink-body">{memberCatalog.description}</p>
                            {memberCatalog.addressText && (
                                <p className="mt-2 text-sm text-ink-muted">{memberCatalog.addressText}</p>
                            )}
                            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                                {memberCatalog.acceptedTokens && memberCatalog.acceptedTokens.length > 0 && (
                                    <span data-testid="seller-accepted-tokens">
                                        Accepts: {memberCatalog.acceptedTokens.map((t) => t.symbol).join(", ")}
                                    </span>
                                )}
                                {tokenSymbol && (
                                    <span data-testid="seller-pricing-token">
                                        Priced in: <span className="font-semibold text-ink-body">{tokenSymbol}</span>
                                    </span>
                                )}
                                {(() => {
                                    // Data-disclosure declaration — summary chip; the
                                    // class-by-class list renders as its own section
                                    // below the hero. Absent policy renders nothing:
                                    // the default (each party holds its own copy) is not a
                                    // declaration to display.
                                    const offered = memberCatalog.disclosurePolicy?.filter((e) => e.offered) ?? [];
                                    if (offered.length === 0) return null;
                                    return (
                                        <span>
                                            Data for sale: {offered.length} offer{offered.length === 1 ? "" : "s"}
                                        </span>
                                    );
                                })()}
                            </div>
                            {/* Agent identity — the member's published did:web / service
                                endpoints, with the did:web verified against this wallet. */}
                            <MemberAgentIdentity sellerAddress={sellerAddressTyped} />
                        </div>
                    </div>
                </header>

                {/* Data for sale — the member's declared offers: what data, which
                    side they co-produced it on, who may buy, and when it
                    opens. The PRICED form is a catalog item carrying dataSold. */}
                {(() => {
                    const offered = memberCatalog.disclosurePolicy?.filter((e) => e.offered) ?? [];
                    if (offered.length === 0) return null;
                    return (
                        <section
                            className="rounded-lg border border-default bg-paper p-5 space-y-3"
                            data-testid="seller-disclosure-policy"
                        >
                            <p className="text-xs font-semibold text-ink-muted">Data for sale</p>
                            <ul className="space-y-2 text-sm text-ink-body">
                                {offered.map((entry) => {
                                    const title = getClauseSpec(entry.clauseId)?.title ?? entry.clauseId;
                                    const embargo = entry.calendar?.embargoDaysAfterResolution;
                                    return (
                                        <li
                                            key={`${entry.compositionHash}-${entry.clauseId}-${entry.posture}`}
                                            className="flex flex-wrap items-baseline gap-x-2"
                                            data-testid={`disclosure-data-${entry.clauseId}-${entry.posture}`}
                                        >
                                            <span className="font-medium text-ink-primary">{title}</span>
                                            <span className="text-ink-muted">data · as {entry.posture}</span>
                                            <span className="text-ink-muted">
                                                · {entry.whitelist?.length
                                                    ? `${entry.whitelist.length} wallet${entry.whitelist.length === 1 ? "" : "s"} whitelisted`
                                                    : "any counterparty"}
                                            </span>
                                            <span className="text-ink-muted">
                                                · {embargo
                                                    ? `opens ${embargo} day${embargo === 1 ? "" : "s"} after resolution`
                                                    : "available at resolution"}
                                            </span>
                                            <code className="text-[11px] text-ink-faint font-mono">
                                                {truncateHex(entry.compositionHash, { head: 10, tail: 0 })}
                                            </code>
                                        </li>
                                    );
                                })}
                            </ul>
                            <p className="text-xs text-ink-muted">
                                Priced data appears in the catalog below.
                            </p>
                        </section>
                    );
                })()}

                {/* Seller resolution history — public-graph-derived resolution
                    + coordination history, recomputed from on-chain events. */}
                <MemberResolutionHistory record={resolutionHistory} isLoading={resolutionHistoryLoading} />

                <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-8 items-start">
                    {/* Catalog */}
                    <section className="space-y-8" data-testid="seller-catalog">
                        <p className="text-xs font-semibold text-ink-muted">Catalog</p>
                        {categories.map((category) => (
                            <div key={category}>
                                <h2 className="text-lg font-semibold text-ink-primary mb-3">{category}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {memberCatalog.items
                                        .filter((item) => categoryOf(item) === category)
                                        .map((catalogItem) => {
                                            const quantity = getItemQuantity(catalogItem.id);
                                            return (
                                                <div
                                                    key={catalogItem.id}
                                                    className="bg-paper border border-default rounded-lg p-4 hover:border-default-strong transition-all shadow-sm"
                                                    data-testid={`catalog-item-${catalogItem.id}`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <ContentImage
                                                            src={catalogItem.image ?? ""}
                                                            alt={catalogItem.name}
                                                            className="w-12 h-12 rounded object-cover text-3xl flex items-center justify-center"
                                                            fallback={
                                                                <InitialsAvatar
                                                                    name={catalogItem.name}
                                                                    tone="neutral"
                                                                    size={48}
                                                                    className="shrink-0"
                                                                    aria-hidden
                                                                />
                                                            }
                                                        />
                                                        <div className="flex-1">
                                                            <h3 className="font-semibold text-ink-primary mb-1">{catalogItem.name}</h3>
                                                            <p className="text-sm text-ink-muted mb-2">{catalogItem.description}</p>
                                                            {catalogItem.dataSold && (
                                                                <p
                                                                    className="text-[11px] text-ink-muted mb-2"
                                                                    data-testid={`catalog-item-data-sold-${catalogItem.id}`}
                                                                >
                                                                    Data for sale · {getClauseSpec(catalogItem.dataSold.clauseId)?.title ?? catalogItem.dataSold.clauseId} · as {catalogItem.dataSold.posture}
                                                                </p>
                                                            )}
                                                            {(catalogItem.massGrams || catalogItem.volumeMl) && (
                                                                <p
                                                                    className="text-[11px] text-ink-muted mb-2 flex flex-wrap gap-x-2"
                                                                    data-testid={`catalog-item-logistics-${catalogItem.id}`}
                                                                >
                                                                    {catalogItem.massGrams ? <span>{formatMass(catalogItem.massGrams, cartUnitSystem)}</span> : null}
                                                                    {catalogItem.volumeMl ? <span>· {formatVolume(catalogItem.volumeMl, cartUnitSystem)}</span> : null}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-semibold text-ink-primary">
                                                                    {catalogItem.price}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                                                                    {catalogItem.pricingPolicy === "rate" && (
                                                                        <span className="text-ink-muted font-normal"> / {catalogItem.rateUnit || "unit"}</span>
                                                                    )}
                                                                </span>
                                                                {quantity === 0 ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleAddItem(catalogItem)}
                                                                        disabled={!catalogItem.available}
                                                                        className="rounded border border-ink-heading px-3 py-1.5 text-sm font-semibold text-ink-primary hover:bg-subtle disabled:opacity-40"
                                                                        data-testid={`btn-add-${catalogItem.id}`}
                                                                    >
                                                                        Add
                                                                    </button>
                                                                ) : (
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveItem(catalogItem.id)}
                                                                            className="w-8 h-8 rounded border border-default bg-paper text-ink-primary hover:bg-subtle"
                                                                            aria-label={`Remove one ${catalogItem.name}`}
                                                                        >
                                                                            −
                                                                        </button>
                                                                        <span className="w-6 text-center text-ink-primary font-semibold">{quantity}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleAddItem(catalogItem)}
                                                                            className="w-8 h-8 rounded border border-ink-primary bg-ink-primary text-paper hover:bg-ink-body"
                                                                            aria-label={`Add another ${catalogItem.name}`}
                                                                        >
                                                                            +
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        ))}
                    </section>

                    {/* Order summary — selection only; review + commit on checkout. */}
                    <aside
                        className="sticky top-6 rounded-lg border border-default bg-paper p-5 space-y-4"
                        data-testid="seller-cart"
                    >
                        <p className="text-xs font-semibold text-ink-muted">Order</p>
                        {cartItems.length === 0 ? (
                            <p className="text-sm text-ink-muted">
                                Your cart is empty. Add items from the catalog to start an order with{" "}
                                <span className="font-semibold text-ink-primary">{memberCatalog.name}</span>.
                            </p>
                        ) : (
                            <>
                                <CartLineList items={cartItems} tokenSymbol={tokenSymbol} showSubtotal />
                                <Link href={`/s/checkout?seller=${sellerAddressLower}`} className="block">
                                    <Button className="w-full" data-testid="btn-review-order">
                                        Review order ({cartCount})
                                    </Button>
                                </Link>
                            </>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
}
