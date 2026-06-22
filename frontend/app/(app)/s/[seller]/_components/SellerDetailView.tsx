"use client";

/**
 * SellerDetailView — the buyer's BROWSE surface at `/s/[seller]`.
 *
 * Browse only: the seller's branding/hero, public-graph track record, and
 * catalogue grid. The buyer selects items into the merchant-scoped cart and
 * follows the "Review order" CTA to `/s/[seller]/checkout`, where the method is
 * chosen and the bonded order is committed. This page composes NO order and
 * holds NO checkout state — that concern lives entirely on the checkout surface.
 *
 * Data sources:
 *  - `useRegisteredCatalogues` — IPFS catalogue discovery.
 *  - `useSellerTrackRecord` — on-chain settlement/coordination history.
 *  - `useCartStore` — global cart state (selection only; commit is checkout's).
 */

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { ContentImage } from "@/components/shared/ContentImage";
import { SellerBrandingModule, SellerLogo } from "@/components/modules/SellerBrandingModule";
import { useCommerce } from "@/lib/commerce";
import { useCartStore } from "@/lib/commerce/cartStore";
import { useRegisteredCatalogues } from "@/lib/seller/useRegisteredCatalogues";
import { CONTRACTS } from "@/lib/core/contracts";
import { SellerTrackRecord } from "@/components/core/SellerTrackRecord";
import { useSellerTrackRecord } from "@/lib/seller/useSellerTrackRecord";
import { useTokenSymbol } from "@/components/sellers/TokenAddressInput";
import { hexEqual } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatMass, formatVolume } from "@/lib/seller/unitConversion";

import type { CatalogueItemMetadata } from "@/lib/seller/sellerCatalogueMetadata";

interface Props {
    sellerAddress: string;
}

export function SellerDetailView({ sellerAddress }: Props) {
    const sellerAddressLower = sellerAddress.toLowerCase();
    const sellerAddressTyped = sellerAddressLower.startsWith("0x")
        ? (sellerAddressLower as `0x${string}`)
        : undefined;

    const { catalogues: sellerCatalogues, isLoading: cataloguesLoading } = useRegisteredCatalogues();

    const sellerCatalogue = useMemo(
        () => sellerCatalogues.find((r) => hexEqual(r.address, sellerAddressLower)) ?? null,
        [sellerCatalogues, sellerAddressLower],
    );

    const { address: buyer } = useCommerce();
    // The seller's declared settlement currency, or undefined — never a coined
    // default (resolved-empty = absence).
    const currency = sellerCatalogue?.defaultTokenAddress as `0x${string}` | undefined;
    const { data: resolvedSymbol } = useTokenSymbol(currency ?? "");
    const tokenSymbol = resolvedSymbol
        ?? (currency ? sellerCatalogue?.acceptedTokens?.find((t) => hexEqual(t.address, currency))?.symbol : undefined)
        ?? "";

    const { items, addItem, removeItem, clearCart } = useCartStore();
    const { trackRecord, isLoading: trackRecordLoading } = useSellerTrackRecord(sellerAddressLower);

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

    if (!sellerCatalogue) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl space-y-4">
                <p className="text-xs font-semibold text-neutral-500 mb-3">Seller not found</p>
                <h1 className="text-3xl font-bold text-black">No seller registered for {truncateHex(sellerAddressLower, { head: 10, tail: 0 })}</h1>
                <p className="text-sm text-neutral-600">
                    This wallet hasn&apos;t registered itself in <code className="text-xs">SellerRegistry</code> on the network
                    you&apos;re connected to, or hasn&apos;t pinned a catalogue. If this is your wallet, you can complete the registration through the onboarding flow.
                </p>
                <div className="flex items-center gap-3 pt-2">
                    <Link href="/sellers" className="inline-block text-sm px-3 py-1.5 rounded border border-black bg-black text-white hover:bg-neutral-800">
                        Register as an seller
                    </Link>
                    <Link href="/discover" className="inline-block underline text-sm text-black hover:text-neutral-600">
                        ← Back to discover
                    </Link>
                </div>
            </div>
        );
    }

    const handleAddItem = (menuItem: CatalogueItemMetadata) => {
        addItem({
            menuItemId: menuItem.id,
            sellerId: sellerCatalogue.id,
            sellerAddress: sellerCatalogue.address,
            sellerName: sellerCatalogue.name,
            name: menuItem.name,
            price: menuItem.price,
            quantity: 1,
            imageURI: menuItem.image || undefined,
            massGrams: menuItem.massGrams,
            volumeMl: menuItem.volumeMl,
        });
    };

    const handleRemoveItem = (menuItemId: string) => {
        removeItem(menuItemId, sellerCatalogue.id);
    };

    const getItemQuantity = (menuItemId: string) => {
        const cartItem = items.find(
            (item) => item.menuItemId === menuItemId && item.sellerId === sellerCatalogue.id,
        );
        return cartItem?.quantity || 0;
    };

    // The merchant-scoped cart — the basis for the "Review order" summary. The
    // bond math, method choice, and commit all live on the checkout surface.
    const cartItems = items.filter((it) => it.sellerId === sellerCatalogue.id);
    const cartCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);
    const cartSubtotal = cartItems.reduce((sum, it) => sum + parseFloat(it.price || "0") * it.quantity, 0);
    const cartUnitSystem = sellerCatalogue.unitSystem ?? "metric";

    const categories = Array.from(new Set(sellerCatalogue.items.map((item) => item.category)));

    return (
        <SellerBrandingModule sellerAddress={sellerAddressTyped}>
            <div data-testid="seller-detail-view" data-seller-address={sellerAddressLower} className="container mx-auto px-6 py-10 max-w-5xl space-y-8">
                <div>
                    <Link href="/discover" className="text-sm text-neutral-500 hover:text-black">
                        ← Back to discover
                    </Link>
                </div>

                {/* Hero */}
                <header className="rounded-3xl border border-neutral-200 bg-white p-8 space-y-4">
                    <div className="flex flex-wrap items-start gap-5">
                        <SellerLogo
                            sellerAddress={sellerAddressTyped}
                            fallbackEmoji={sellerCatalogue.image}
                            fallbackName={sellerCatalogue.name}
                            size={88}
                        />
                        <div className="flex-1 min-w-0">
                            {sellerCatalogue.specialty && (
                                <p className="text-xs font-semibold text-neutral-500">{sellerCatalogue.specialty}</p>
                            )}
                            <h1 className="mt-1 text-4xl font-bold text-black">{sellerCatalogue.name}</h1>
                            <p className="mt-3 max-w-2xl text-base text-neutral-700">{sellerCatalogue.description}</p>
                            {sellerCatalogue.addressText && (
                                <p className="mt-2 text-sm text-neutral-500">{sellerCatalogue.addressText}</p>
                            )}
                            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                                {sellerCatalogue.acceptedTokens && sellerCatalogue.acceptedTokens.length > 0 && (
                                    <span data-testid="seller-accepted-tokens">
                                        Accepts: {sellerCatalogue.acceptedTokens.map((t) => t.symbol).join(", ")}
                                    </span>
                                )}
                                {tokenSymbol && (
                                    <span data-testid="seller-pricing-token">
                                        Priced in: <span className="font-semibold text-neutral-700">{tokenSymbol}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Seller track record — public-graph-derived settlement
                    + coordination history, recomputed from on-chain events. */}
                <SellerTrackRecord record={trackRecord} isLoading={trackRecordLoading} />

                <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-8 items-start">
                    {/* Menu */}
                    <section className="space-y-8" data-testid="seller-menu">
                        <p className="text-xs font-semibold text-neutral-500">Menu</p>
                        {categories.map((category) => (
                            <div key={category}>
                                <h2 className="text-lg font-semibold text-black mb-3">{category}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {sellerCatalogue.items
                                        .filter((item) => item.category === category)
                                        .map((menuItem) => {
                                            const quantity = getItemQuantity(menuItem.id);
                                            return (
                                                <div
                                                    key={menuItem.id}
                                                    className="bg-white border border-neutral-200 rounded-lg p-4 hover:border-blue-400 transition-all shadow-sm"
                                                    data-testid={`menu-item-${menuItem.id}`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <ContentImage
                                                            src={menuItem.image ?? ""}
                                                            alt={menuItem.name}
                                                            className="w-12 h-12 rounded object-cover text-3xl flex items-center justify-center"
                                                            fallback={
                                                                <div className="w-12 h-12 rounded shrink-0 bg-neutral-100 border border-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-600" aria-hidden="true">
                                                                    {menuItem.name.slice(0, 2).toUpperCase()}
                                                                </div>
                                                            }
                                                        />
                                                        <div className="flex-1">
                                                            <h3 className="font-semibold text-black mb-1">{menuItem.name}</h3>
                                                            <p className="text-sm text-neutral-500 mb-2">{menuItem.description}</p>
                                                            {(menuItem.massGrams || menuItem.volumeMl) && (
                                                                <p
                                                                    className="text-[11px] text-neutral-500 mb-2 flex flex-wrap gap-x-2"
                                                                    data-testid={`menu-item-logistics-${menuItem.id}`}
                                                                >
                                                                    {menuItem.massGrams ? <span>{formatMass(menuItem.massGrams, cartUnitSystem)}</span> : null}
                                                                    {menuItem.volumeMl ? <span>· {formatVolume(menuItem.volumeMl, cartUnitSystem)}</span> : null}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-semibold text-blue-700">
                                                                    {menuItem.price}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                                                                </span>
                                                                {quantity === 0 ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleAddItem(menuItem)}
                                                                        disabled={!menuItem.available}
                                                                        className="rounded border border-black px-3 py-1.5 text-sm font-semibold text-black hover:bg-neutral-100 disabled:opacity-40"
                                                                        data-testid={`btn-add-${menuItem.id}`}
                                                                    >
                                                                        Add
                                                                    </button>
                                                                ) : (
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveItem(menuItem.id)}
                                                                            className="w-8 h-8 rounded border border-neutral-300 bg-white text-black hover:bg-neutral-100"
                                                                            aria-label={`Remove one ${menuItem.name}`}
                                                                        >
                                                                            −
                                                                        </button>
                                                                        <span className="w-6 text-center text-black font-semibold">{quantity}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleAddItem(menuItem)}
                                                                            className="w-8 h-8 rounded border border-black bg-black text-white hover:bg-neutral-800"
                                                                            aria-label={`Add another ${menuItem.name}`}
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
                                Your cart is empty. Add items from the menu to start an order with{" "}
                                <span className="font-semibold text-black">{sellerCatalogue.name}</span>.
                            </p>
                        ) : (
                            <>
                                <ul className="space-y-2 text-sm">
                                    {cartItems.map((item) => (
                                        <li
                                            key={item.menuItemId}
                                            className="flex items-baseline justify-between gap-2"
                                            data-testid={`cart-line-${item.menuItemId}`}
                                        >
                                            <span className="flex-1 min-w-0 text-black font-medium truncate">
                                                {item.name} <span className="text-neutral-400">× {item.quantity}</span>
                                            </span>
                                            <span className="text-neutral-900 tabular-nums shrink-0">
                                                {(parseFloat(item.price || "0") * item.quantity).toFixed(4)}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="flex justify-between border-t border-neutral-200 pt-3 text-sm font-semibold">
                                    <span className="text-black">Subtotal</span>
                                    <span className="text-black tabular-nums" data-testid="cart-subtotal">
                                        {cartSubtotal.toFixed(4)}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                                    </span>
                                </div>
                                <Link href={`/s/${sellerAddressLower}/checkout`} className="block">
                                    <Button className="w-full" data-testid="btn-review-order">
                                        Review order ({cartCount})
                                    </Button>
                                </Link>
                            </>
                        )}
                    </aside>
                </div>
            </div>
        </SellerBrandingModule>
    );
}
