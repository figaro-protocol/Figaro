"use client";

/**
 * MemberDetailView — the buyer's BROWSE surface at `/s/view?seller=<address>`.
 *
 * Browse only: the seller's branding/hero, public-graph track record, and
 * catalogue grid. The buyer selects items into the merchant-scoped cart and
 * follows the "Review order" CTA to `/s/checkout?seller=<address>`, where the method is
 * chosen and the bonded order is committed. This page composes NO order and
 * holds NO checkout state — that concern lives entirely on the checkout surface.
 *
 * Data sources:
 *  - `useRegisteredCatalogues` — IPFS catalogue discovery.
 *  - `useMemberTrackRecord` — on-chain settlement/coordination history.
 *  - `useCartStore` — global cart state (selection only; commit is checkout's).
 */

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { CartLineList } from "@/components/runtime/CartLineList";
import { ContentImage } from "@/components/shared/ContentImage";
import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
import { MemberLogo } from "@/components/modules/MemberBrandingModule";
import { MemberAgentIdentity } from "@/components/members/MemberAgentIdentity";
import { useCommerce } from "@/lib/checkout";
import { useCartStore } from "@/lib/checkout/cartStore";
import { useRegisteredCatalogues } from "@/lib/member/useRegisteredCatalogues";
import { MemberTrackRecord } from "@/components/runtime/MemberTrackRecord";
import { useMemberTrackRecord } from "@/lib/member/useMemberTrackRecord";
import { useTokenSymbol } from "@/hooks/useTokenSymbol";
import { hexEqual, normalizeAddressParam } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatMass, formatVolume } from "@/lib/member/unitConversion";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";

import type { CatalogueItemMetadata } from "@/lib/member/memberCatalogueMetadata";

interface Props {
    sellerAddress: string;
}

export function MemberDetailView({ sellerAddress }: Props) {
    const { lower: sellerAddressLower, typed: sellerAddressTyped } = normalizeAddressParam(sellerAddress);

    const { catalogues: memberCatalogues, isLoading: cataloguesLoading } = useRegisteredCatalogues();

    const memberCatalogue = useMemo(
        () => memberCatalogues.find((r) => hexEqual(r.address, sellerAddressLower)) ?? null,
        [memberCatalogues, sellerAddressLower],
    );

    const { address: buyer } = useCommerce();
    // The seller's declared settlement currency, or undefined — never a coined
    // default (resolved-empty = absence).
    const currency = memberCatalogue?.defaultTokenAddress as `0x${string}` | undefined;
    const { data: resolvedSymbol } = useTokenSymbol(currency ?? "");
    const tokenSymbol = resolvedSymbol
        ?? (currency ? memberCatalogue?.acceptedTokens?.find((t) => hexEqual(t.address, currency))?.symbol : undefined)
        ?? "";

    const { items, addItem, removeItem, clearCart } = useCartStore();
    const { trackRecord, isLoading: trackRecordLoading } = useMemberTrackRecord(sellerAddressLower);

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

    if (cataloguesLoading) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold text-neutral-500 mb-3">Seller</p>
                <h1 className="text-3xl font-bold text-black">Loading…</h1>
            </div>
        );
    }

    if (!memberCatalogue) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl space-y-4">
                <p className="text-xs font-semibold text-neutral-500 mb-3">Seller not found</p>
                <h1 className="text-3xl font-bold text-black">No seller registered for {truncateHex(sellerAddressLower, { head: 10, tail: 0 })}</h1>
                <p className="text-sm text-neutral-600">
                    This wallet hasn&apos;t registered itself in <code className="text-xs">MembersRegistry</code> on the network
                    you&apos;re connected to, or hasn&apos;t pinned a catalogue. If this is your wallet, you can complete the registration through the onboarding flow.
                </p>
                <div className="flex items-center gap-3 pt-2">
                    <Link href="/members" className="inline-block text-sm px-3 py-1.5 rounded border border-black bg-black text-white hover:bg-neutral-800">
                        Register as a member
                    </Link>
                    <Link href="/discover" className="inline-block underline text-sm text-black hover:text-neutral-600">
                        ← Back to discover
                    </Link>
                </div>
            </div>
        );
    }

    const handleAddItem = (catalogueItem: CatalogueItemMetadata) => {
        addItem({
            catalogueItemId: catalogueItem.id,
            sellerId: sellerAddressLower,
            sellerAddress: memberCatalogue.address,
            sellerName: memberCatalogue.name,
            name: catalogueItem.name,
            price: catalogueItem.price,
            quantity: 1,
            imageURI: catalogueItem.image || undefined,
            massGrams: catalogueItem.massGrams,
            volumeMl: catalogueItem.volumeMl,
            lengthMm: catalogueItem.lengthMm,
            widthMm: catalogueItem.widthMm,
            heightMm: catalogueItem.heightMm,
            clauseValues: catalogueItem.clauseValues,
            dataSold: catalogueItem.dataSold,
        });
    };

    const handleRemoveItem = (catalogueItemId: string) => {
        removeItem(catalogueItemId, sellerAddressLower);
    };

    const getItemQuantity = (catalogueItemId: string) => {
        const cartItem = items.find(
            (item) => item.catalogueItemId === catalogueItemId && item.sellerId === sellerAddressLower,
        );
        return cartItem?.quantity || 0;
    };

    // The merchant-scoped cart — the basis for the "Review order" summary. The
    // bond math, method choice, and commit all live on the checkout surface.
    const cartItems = items.filter((it) => it.sellerId === sellerAddressLower);
    const cartCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);
    const cartUnitSystem = memberCatalogue.unitSystem ?? "metric";

    // `category` is optional on a catalogue item; items without one group under
    // an explicit, visible fallback — never an undefined key / heading-less
    // group. Matches the "(unclassified)" convention groupClausesByArticle uses.
    const categoryOf = (item: CatalogueItemMetadata) => item.category ?? "(unclassified)";
    const categories = Array.from(new Set(memberCatalogue.items.map(categoryOf)));

    return (
        <div>
            <div data-testid="member-detail-view" data-seller-address={sellerAddressLower} className="container mx-auto px-6 py-10 max-w-5xl space-y-8">
                <div>
                    <Link href="/discover" className="text-sm text-neutral-500 hover:text-black">
                        ← Back to discover
                    </Link>
                </div>

                {/* Hero */}
                <header className="rounded-3xl border border-neutral-200 bg-white p-8 space-y-4">
                    <div className="flex flex-wrap items-start gap-5">
                        <MemberLogo
                            sellerAddress={sellerAddressTyped}
                            fallbackEmoji={memberCatalogue.image}
                            fallbackName={memberCatalogue.name}
                            size={88}
                        />
                        <div className="flex-1 min-w-0">
                            {memberCatalogue.specialty && (
                                <p className="text-xs font-semibold text-neutral-500">{memberCatalogue.specialty}</p>
                            )}
                            <h1 className="mt-1 text-4xl font-bold text-black">{memberCatalogue.name}</h1>
                            <p className="mt-3 max-w-2xl text-base text-neutral-700">{memberCatalogue.description}</p>
                            {memberCatalogue.addressText && (
                                <p className="mt-2 text-sm text-neutral-500">{memberCatalogue.addressText}</p>
                            )}
                            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                                {memberCatalogue.acceptedTokens && memberCatalogue.acceptedTokens.length > 0 && (
                                    <span data-testid="seller-accepted-tokens">
                                        Accepts: {memberCatalogue.acceptedTokens.map((t) => t.symbol).join(", ")}
                                    </span>
                                )}
                                {tokenSymbol && (
                                    <span data-testid="seller-pricing-token">
                                        Priced in: <span className="font-semibold text-neutral-700">{tokenSymbol}</span>
                                    </span>
                                )}
                                {(() => {
                                    // Data-disclosure declaration — summary chip; the
                                    // class-by-class list renders as its own section
                                    // below the hero. Absent policy renders nothing:
                                    // the default (each party holds its own copy) is not a
                                    // declaration to display.
                                    const offered = memberCatalogue.disclosurePolicy?.filter((e) => e.offered) ?? [];
                                    if (offered.length === 0) return null;
                                    return (
                                        <span>
                                            Data for sale: {offered.length} offer{offered.length === 1 ? "" : "s"}
                                        </span>
                                    );
                                })()}
                            </div>
                            {/* Agent identity — the seller's published did:web / service
                                endpoints, with the did:web verified against this wallet. */}
                            <MemberAgentIdentity sellerAddress={sellerAddressTyped} />
                        </div>
                    </div>
                </header>

                {/* Data for sale — the member's declared offers: what data, which
                    side they co-produced it on, who may buy, and when it
                    opens. The PRICED form is a catalogue item carrying dataSold. */}
                {(() => {
                    const offered = memberCatalogue.disclosurePolicy?.filter((e) => e.offered) ?? [];
                    if (offered.length === 0) return null;
                    return (
                        <section
                            className="rounded-lg border border-neutral-200 bg-white p-5 space-y-3"
                            data-testid="seller-disclosure-policy"
                        >
                            <p className="text-xs font-semibold text-neutral-500">Data for sale</p>
                            <ul className="space-y-2 text-sm text-neutral-700">
                                {offered.map((entry) => {
                                    const title = getClauseSpec(entry.clauseId)?.title ?? entry.clauseId;
                                    const embargo = entry.calendar?.embargoDaysAfterSettlement;
                                    return (
                                        <li
                                            key={`${entry.compositionHash}-${entry.clauseId}-${entry.posture}`}
                                            className="flex flex-wrap items-baseline gap-x-2"
                                            data-testid={`disclosure-data-${entry.clauseId}-${entry.posture}`}
                                        >
                                            <span className="font-medium text-black">{title}</span>
                                            <span className="text-neutral-500">data · as {entry.posture}</span>
                                            <span className="text-neutral-500">
                                                · {entry.whitelist?.length
                                                    ? `${entry.whitelist.length} wallet${entry.whitelist.length === 1 ? "" : "s"} whitelisted`
                                                    : "any counterparty"}
                                            </span>
                                            <span className="text-neutral-500">
                                                · {embargo
                                                    ? `opens ${embargo} day${embargo === 1 ? "" : "s"} after settlement`
                                                    : "available on settlement"}
                                            </span>
                                            <code className="text-[11px] text-neutral-400 font-mono">
                                                {truncateHex(entry.compositionHash, { head: 10, tail: 0 })}
                                            </code>
                                        </li>
                                    );
                                })}
                            </ul>
                            <p className="text-xs text-neutral-500">
                                Priced data appears in the catalogue below.
                            </p>
                        </section>
                    );
                })()}

                {/* Seller track record — public-graph-derived settlement
                    + coordination history, recomputed from on-chain events. */}
                <MemberTrackRecord record={trackRecord} isLoading={trackRecordLoading} />

                <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-8 items-start">
                    {/* Catalogue */}
                    <section className="space-y-8" data-testid="seller-catalogue">
                        <p className="text-xs font-semibold text-neutral-500">Catalogue</p>
                        {categories.map((category) => (
                            <div key={category}>
                                <h2 className="text-lg font-semibold text-black mb-3">{category}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {memberCatalogue.items
                                        .filter((item) => categoryOf(item) === category)
                                        .map((catalogueItem) => {
                                            const quantity = getItemQuantity(catalogueItem.id);
                                            return (
                                                <div
                                                    key={catalogueItem.id}
                                                    className="bg-white border border-neutral-200 rounded-lg p-4 hover:border-blue-400 transition-all shadow-sm"
                                                    data-testid={`catalogue-item-${catalogueItem.id}`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <ContentImage
                                                            src={catalogueItem.image ?? ""}
                                                            alt={catalogueItem.name}
                                                            className="w-12 h-12 rounded object-cover text-3xl flex items-center justify-center"
                                                            fallback={
                                                                <InitialsAvatar
                                                                    name={catalogueItem.name}
                                                                    tone="neutral"
                                                                    size={48}
                                                                    className="shrink-0"
                                                                    aria-hidden
                                                                />
                                                            }
                                                        />
                                                        <div className="flex-1">
                                                            <h3 className="font-semibold text-black mb-1">{catalogueItem.name}</h3>
                                                            <p className="text-sm text-neutral-500 mb-2">{catalogueItem.description}</p>
                                                            {catalogueItem.dataSold && (
                                                                <p
                                                                    className="text-[11px] text-neutral-500 mb-2"
                                                                    data-testid={`catalogue-item-data-sold-${catalogueItem.id}`}
                                                                >
                                                                    Data for sale · {getClauseSpec(catalogueItem.dataSold.clauseId)?.title ?? catalogueItem.dataSold.clauseId} · as {catalogueItem.dataSold.posture}
                                                                </p>
                                                            )}
                                                            {(catalogueItem.massGrams || catalogueItem.volumeMl) && (
                                                                <p
                                                                    className="text-[11px] text-neutral-500 mb-2 flex flex-wrap gap-x-2"
                                                                    data-testid={`catalogue-item-logistics-${catalogueItem.id}`}
                                                                >
                                                                    {catalogueItem.massGrams ? <span>{formatMass(catalogueItem.massGrams, cartUnitSystem)}</span> : null}
                                                                    {catalogueItem.volumeMl ? <span>· {formatVolume(catalogueItem.volumeMl, cartUnitSystem)}</span> : null}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-semibold text-blue-700">
                                                                    {catalogueItem.price}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                                                                    {catalogueItem.pricingPolicy === "rate" && (
                                                                        <span className="text-neutral-500 font-normal"> / {catalogueItem.rateUnit || "unit"}</span>
                                                                    )}
                                                                </span>
                                                                {quantity === 0 ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleAddItem(catalogueItem)}
                                                                        disabled={!catalogueItem.available}
                                                                        className="rounded border border-black px-3 py-1.5 text-sm font-semibold text-black hover:bg-neutral-100 disabled:opacity-40"
                                                                        data-testid={`btn-add-${catalogueItem.id}`}
                                                                    >
                                                                        Add
                                                                    </button>
                                                                ) : (
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveItem(catalogueItem.id)}
                                                                            className="w-8 h-8 rounded border border-neutral-300 bg-white text-black hover:bg-neutral-100"
                                                                            aria-label={`Remove one ${catalogueItem.name}`}
                                                                        >
                                                                            −
                                                                        </button>
                                                                        <span className="w-6 text-center text-black font-semibold">{quantity}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleAddItem(catalogueItem)}
                                                                            className="w-8 h-8 rounded border border-black bg-black text-white hover:bg-neutral-800"
                                                                            aria-label={`Add another ${catalogueItem.name}`}
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
                        className="sticky top-6 rounded-lg border border-neutral-200 bg-white p-5 space-y-4"
                        data-testid="seller-cart"
                    >
                        <p className="text-xs font-semibold text-neutral-500">Order</p>
                        {cartItems.length === 0 ? (
                            <p className="text-sm text-neutral-500">
                                Your cart is empty. Add items from the catalogue to start an order with{" "}
                                <span className="font-semibold text-black">{memberCatalogue.name}</span>.
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
