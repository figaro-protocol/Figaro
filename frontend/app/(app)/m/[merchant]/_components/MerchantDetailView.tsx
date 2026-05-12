"use client";

/**
 * MerchantDetailView — per-merchant landing page rendered at `/m/[merchant]`.
 *
 * Replaces the prior `/i/<assembly>?operator=<addr>` UX where the buyer
 * landed in a generic assembly runtime that re-listed all merchants. This
 * page is merchant-shaped: hero with branding, full menu grid, inline cart
 * with explicit "Place order" CTA, and post-commit redirect to
 * `/orders/<processId>` (Increment 2).
 *
 * Data sources:
 *  - `useRegisteredCatalogues` — IPFS / fixture catalogue discovery.
 *  - `resolveRuntimeSubjectByAddress` — display name + branding metadata.
 *  - `useCheckout` — token balance, approval, commit flow.
 *  - `useCartStore` — global cart state (shared with CartModule).
 *
 * Keeps the existing `MerchantBrandingModule` wrapper so accent colour /
 * logo bleed-through still works under the same merchant-skin convention.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChainId } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { ContentImage } from "@/components/shared/ContentImage";
import { MerchantBrandingModule, MerchantLogo } from "@/components/modules/MerchantBrandingModule";
import { useCommerce, useCheckout } from "@/lib/commerce";
import { useCartStore, type FulfillmentMode } from "@/lib/seller/cartStore";
import { useRegisteredCatalogues } from "@/lib/mechanisms/useRegisteredCatalogues";
import { computeCommitmentProcessId } from "@/lib/console/commitmentStore";
import { prepareOrderCommitment } from "@/lib/core/orderCommitmentPreparation";
import { CONTRACTS } from "@/lib/core/contracts";
import { useTokenSymbol } from "@/components/operators/TokenAddressInput";
import { calculateBonds } from "@figaro/core";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual } from "@/lib/shared/evm";
import { formatToken, parseToken } from "@/lib/shared/utils";
import { isE2EMockSession, isE2EDevnetSession } from "@/lib/shared/e2e";
import {
    FULFILMENT_MODE_LABELS,
    isDeliveryFulfilment,
    mapFulfilmentToHandoff,
} from "@/lib/seller/fulfilmentRouting";
import { useMerchantBoundModalities } from "@/lib/mechanisms/useAssemblyRegistry";
import { formatMass, formatVolume } from "@/lib/seller/unitConversion";
import type { CatalogueItem, SellerCatalogue } from "@/lib/seller/types";

const ALL_FULFILMENT_MODES: FulfillmentMode[] = [
    "consume-onsite",
    "pickup",
    "virtual",
    "deliver:buyer-assigned",
    "deliver:seller-assigned",
    "deliver:dutch-auction",
];

interface Props {
    merchantAddress: string;
}

export function MerchantDetailView({ merchantAddress }: Props) {
    const merchantAddressLower = merchantAddress.toLowerCase();
    const merchantAddressTyped = merchantAddressLower.startsWith("0x")
        ? (merchantAddressLower as `0x${string}`)
        : undefined;

    const router = useRouter();
    const chainId = useChainId();
    const { catalogues: restaurants, isLoading: cataloguesLoading } = useRegisteredCatalogues();

    const restaurant = useMemo(
        () => restaurants.find((r) => hexEqual(r.address, merchantAddressLower)) ?? null,
        [restaurants, merchantAddressLower],
    );

    // Identity lookup is reserved for follow-on enrichment (operator
    // attestations, did:web profiles). The runtime fixture's accent colour
    // currently lives in the catalogue branding metadata, not the
    // SubjectRecord — `MerchantBrandingModule` reads the catalogue path
    // already. Surface accent here only when we can read it cheaply; default
    // to undefined so MerchantBrandingModule's CSS variable wins.
    const accentTone: string | undefined = undefined;

    const { address: buyer } = useCommerce();
    // The merchant's value-system flag: pricing-token + accepted-tokens come
    // from THEIR profile, not from project-level CONTRACTS.* env vars. The
    // env-var fallback only kicks in for fixture / pre-schema-split
    // catalogues that don't carry a defaultTokenAddress.
    const currency = (restaurant?.defaultTokenAddress
        ?? CONTRACTS.mockToken
        ?? CONTRACTS.permitToken) as `0x${string}`;
    const { data: resolvedSymbol } = useTokenSymbol(currency);
    const tokenSymbol = resolvedSymbol
        ?? restaurant?.acceptedTokens?.find(
            (t) => hexEqual(t.address, currency),
        )?.symbol
        ?? "";
    const {
        decimals: tokenDecimals,
        balance: tokenBalance,
        needsAuthorization: needsApproval,
        authorize: approve,
        authorization: { isPending: isApprovePending, isConfirming: isApproveConfirming, isSuccess: isApproveSuccess },
        signAndPlace,
        initiateAsParty,
        order: { step: commitStep, error: commitError, payload },
        resetOrder: resetCommitment,
    } = useCheckout(currency);

    const { items, addItem, removeItem, removeLine, clearCart, getTotalPrice, getItemCount, fulfillmentMode, setFulfillmentMode } = useCartStore();
    const { openConnectModal } = useConnectModal();

    const itemCount = getItemCount();
    const totalPrice = getTotalPrice();
    const totalPriceAmount = items.length > 0 && totalPrice ? parseToken(totalPrice, tokenDecimals) : 0n;
    const buyerBondAmount = totalPriceAmount > 0n
        ? calculateBonds(totalPriceAmount, totalPriceAmount).buyerBond
        : 0n;

    // Bound-assembly modalities take precedence over the catalogue's
    // legacy fulfillmentModes field — the assembly is the authoritative
    // source of what this commerce class supports. When the merchant has
    // no on-chain bindings the catalogue still drives the choice set.
    const { modalities: boundModalities, hasOnChainBinding } =
        useMerchantBoundModalities(merchantAddressTyped);

    const supportedModes: FulfillmentMode[] = useMemo(() => {
        if (hasOnChainBinding && boundModalities.length > 0) {
            return ALL_FULFILMENT_MODES.filter((m) => boundModalities.includes(m));
        }
        if (!restaurant?.fulfillmentModes || restaurant.fulfillmentModes.length === 0) {
            return ALL_FULFILMENT_MODES;
        }
        return ALL_FULFILMENT_MODES.filter((m) => restaurant.fulfillmentModes!.includes(m));
    }, [restaurant?.fulfillmentModes, boundModalities, hasOnChainBinding]);

    // If the cart's persisted choice isn't supported by this merchant's
    // assembly, CLEAR it. The buyer must explicitly pick a supported mode
    // — no silent snap-to-first-available.
    useEffect(() => {
        if (fulfillmentMode && supportedModes.length > 0 && !supportedModes.includes(fulfillmentMode)) {
            setFulfillmentMode(undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supportedModes]);

    // Cart hygiene — two cases, both clear the persisted cart on mount:
    //   1. Cross-merchant leak: cart items belong to a different merchant
    //      than the one being viewed (zustand persists to one global key).
    //   2. Self-view: the connected wallet IS the merchant. Buyer == seller
    //      is allowed by the protocol but degenerate — leftover items from
    //      a prior testing session shouldn't auto-prepopulate the cart on
    //      a merchant's own profile page.
    useEffect(() => {
        if (items.length === 0) return;
        const allMatchCurrent = items.every(
            (item) => hexEqual(item.sellerAddress, merchantAddressLower),
        );
        const isSelfView = hexEqual(buyer, merchantAddressLower);
        if (!allMatchCurrent || isSelfView) {
            clearCart();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [merchantAddressLower, buyer]);

    const balance = tokenBalance ?? 0n;
    const hasInsufficientBalance = !!buyer && tokenBalance !== undefined && balance < buyerBondAmount;
    const isApproving = isApprovePending || isApproveConfirming;
    const pendingCheckout = useRef(false);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);

    // Auto-chain: when approval confirms, proceed to commit signing.
    useEffect(() => {
        if (pendingCheckout.current && isApproveSuccess) {
            pendingCheckout.current = false;
            void executeCheckout();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isApproveSuccess]);

    // Post-broadcast: route to /orders/<processId>. Mirrors CartModule's
    // redirect from Increment 2 — both surfaces converge on the per-order
    // page after a successful commit.
    const redirectedForCommitment = useRef<string | null>(null);
    useEffect(() => {
        if (commitStep !== "done") return;
        if (!payload?.commitment) return;
        const fingerprint = `${payload.commitment.agreementHash}:${payload.commitment.salt}`;
        if (redirectedForCommitment.current === fingerprint) return;
        redirectedForCommitment.current = fingerprint;
        try {
            const processId = computeCommitmentProcessId(
                payload.commitment,
                chainId,
                CONTRACTS.core,
            );
            clearCart();
            resetCommitment();
            router.push(`/orders/${processId}`);
        } catch (cause) {
            console.error("MerchantDetailView: failed to compute processId", cause);
            clearCart();
            resetCommitment();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commitStep, payload, chainId]);

    if (cataloguesLoading) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold text-neutral-500 mb-3">Merchant</p>
                <h1 className="text-3xl font-bold text-black">Loading…</h1>
            </div>
        );
    }

    if (!restaurant) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl space-y-4">
                <p className="text-xs font-semibold text-neutral-500 mb-3">Merchant not found</p>
                <h1 className="text-3xl font-bold text-black">No merchant registered for {merchantAddressLower.slice(0, 10)}…</h1>
                <p className="text-sm text-neutral-600">
                    The merchant may not be on the local-anvil network you&apos;re connected to,
                    or may have withdrawn from the operator registry.
                </p>
                <Link href="/discover" className="inline-block underline text-sm text-black hover:text-neutral-600">
                    ← Back to discover
                </Link>
            </div>
        );
    }

    const handleAddItem = (menuItem: CatalogueItem) => {
        addItem({
            menuItemId: menuItem.id,
            sellerId: restaurant.id,
            sellerAddress: restaurant.address,
            sellerName: restaurant.name,
            name: menuItem.name,
            price: menuItem.price,
            quantity: 1,
            imageURI: menuItem.image || undefined,
        });
    };

    const handleRemoveItem = (menuItemId: string) => {
        removeItem(menuItemId, restaurant.id);
    };

    const getItemQuantity = (menuItemId: string) => {
        const cartItem = items.find(
            (item) => item.menuItemId === menuItemId && item.sellerId === restaurant.id,
        );
        return cartItem?.quantity || 0;
    };

    // Filter cart to items from THIS merchant only — the inline cart on this
    // page is merchant-scoped. Items from other merchants live in the global
    // cart but aren't shown here.
    const merchantCartItems = items.filter((it) => it.sellerId === restaurant.id);
    const merchantTotalAmount = merchantCartItems.reduce(
        (sum, item) => sum + parseToken(item.price, tokenDecimals) * BigInt(item.quantity),
        0n,
    );
    const merchantBuyerBond = merchantTotalAmount > 0n
        ? calculateBonds(merchantTotalAmount, merchantTotalAmount).buyerBond
        : 0n;

    // Sum mass + volume across the cart (in metric — storage shape). Each
    // line aggregates as `perItem * quantity`. Display formats to the
    // catalogue's unitSystem at render time.
    const cartUnitSystem = restaurant.unitSystem ?? "metric";
    const merchantMassGrams = merchantCartItems.reduce((sum, cartItem) => {
        const menuItem = restaurant.menu.find((m) => m.id === cartItem.menuItemId);
        if (!menuItem?.massGrams) return sum;
        return sum + menuItem.massGrams * cartItem.quantity;
    }, 0);
    const merchantVolumeMl = merchantCartItems.reduce((sum, cartItem) => {
        const menuItem = restaurant.menu.find((m) => m.id === cartItem.menuItemId);
        if (!menuItem?.volumeMl) return sum;
        return sum + menuItem.volumeMl * cartItem.quantity;
    }, 0);

    const executeCheckout = async () => {
        if (!buyer) {
            setCheckoutError("Connect your wallet to place an order.");
            return;
        }
        if (merchantCartItems.length === 0) return;
        if (!fulfillmentMode) {
            setCheckoutError("Select a fulfilment mode before placing the order.");
            return;
        }
        const sellerAddress = restaurant.address as `0x${string}`;
        try {
            setCheckoutError(null);
            const prepared = await prepareOrderCommitment({
                buyer,
                seller: sellerAddress,
                currency,
                payment: merchantTotalAmount,
                lineItems: merchantCartItems.map((item) => ({
                    itemId: item.menuItemId,
                    name: item.name,
                    quantity: item.quantity,
                    unitPrice: item.price,
                })),
                manifestFields: {
                    origin: "",
                    destination: "",
                    fulfilmentMethod: fulfillmentMode,
                    handoffMode: mapFulfilmentToHandoff(fulfillmentMode),
                },
            });
            const immediateCommit = isE2EMockSession() || isE2EDevnetSession();
            if (immediateCommit) {
                await signAndPlace(
                    prepared.commitment,
                    prepared.commitmentMeta,
                    "buyer",
                );
            } else {
                await initiateAsParty(
                    prepared.commitment,
                    "buyer",
                    prepared.commitmentMeta,
                );
            }
            // Redirect is owned by the commitStep === "done" useEffect above.
        } catch (cause: unknown) {
            const msg = extractErrorMessage(cause, "Signing failed");
            setCheckoutError(msg);
        }
    };

    const handlePlaceOrder = () => {
        if (!buyer) {
            // No wallet connected — open the RainbowKit connect modal rather
            // than reporting an error. Once the user signs in, the page
            // re-renders with `buyer` set and the button text shifts to
            // "Place order"; the user can then click again to commit.
            openConnectModal?.();
            return;
        }
        if (merchantCartItems.length === 0) return;
        if (hasInsufficientBalance) {
            setCheckoutError(
                `Insufficient funds. Required: ${formatToken(merchantBuyerBond, tokenDecimals)}, available: ${formatToken(balance, tokenDecimals)}`,
            );
            return;
        }
        setCheckoutError(null);
        if (needsApproval(merchantBuyerBond)) {
            try {
                pendingCheckout.current = true;
                approve(merchantBuyerBond * 10n);
            } catch {
                pendingCheckout.current = false;
                setCheckoutError("Payment authorization failed. Please try again.");
            }
        } else {
            void executeCheckout();
        }
    };

    const categories = Array.from(new Set(restaurant.menu.map((item) => item.category)));
    const placingOrder = commitStep === "signing" || commitStep === "broadcasting" || commitStep === "ready";

    return (
        <MerchantBrandingModule sellerAddress={merchantAddressTyped}>
            <div data-testid="merchant-detail-view" data-merchant-address={merchantAddressLower} className="container mx-auto px-6 py-10 max-w-5xl space-y-8">
                <div>
                    <Link
                        href="/discover"
                        className="text-sm text-neutral-500 hover:text-black"
                    >
                        ← Back to discover
                    </Link>
                </div>

                {/* Hero */}
                <header className="rounded-3xl border border-neutral-200 bg-white p-8 space-y-4">
                    <div className="flex flex-wrap items-start gap-5">
                        <MerchantLogo
                            sellerAddress={merchantAddressTyped}
                            fallbackEmoji={restaurant.image}
                            fallbackName={restaurant.name}
                            size={88}
                        />
                        <div className="flex-1 min-w-0">
                            {restaurant.specialty && (
                                <p
                                    className="text-xs font-semibold text-neutral-500"
                                    style={accentTone ? { color: accentTone } : undefined}
                                >
                                    {restaurant.specialty}
                                </p>
                            )}
                            <h1 className="mt-1 text-4xl font-bold text-black">{restaurant.name}</h1>
                            <p className="mt-3 max-w-2xl text-base text-neutral-700">{restaurant.description}</p>
                            {restaurant.addressText && (
                                <p className="mt-2 text-sm text-neutral-500">{restaurant.addressText}</p>
                            )}
                            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                                {restaurant.acceptedTokens && restaurant.acceptedTokens.length > 0 && (
                                    <span data-testid="merchant-accepted-tokens">
                                        Accepts: {restaurant.acceptedTokens.map((t) => t.symbol).join(", ")}
                                    </span>
                                )}
                                {tokenSymbol && (
                                    <span data-testid="merchant-pricing-token">
                                        Priced in: <span className="font-semibold text-neutral-700">{tokenSymbol}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-8 items-start">
                    {/* Menu */}
                    <section className="space-y-8" data-testid="merchant-menu">
                        <p className="text-xs font-semibold text-neutral-500">Menu</p>
                        {categories.map((category) => (
                            <div key={category}>
                                <h2 className="text-lg font-semibold text-black mb-3">{category}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {restaurant.menu
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
                                                            src={menuItem.image}
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
                                                            {(menuItem.massGrams || menuItem.volumeMl || menuItem.classOfService) && (
                                                                <p
                                                                    className="text-[11px] text-neutral-500 mb-2 flex flex-wrap gap-x-2"
                                                                    data-testid={`menu-item-logistics-${menuItem.id}`}
                                                                >
                                                                    {menuItem.massGrams ? <span>{formatMass(menuItem.massGrams, cartUnitSystem)}</span> : null}
                                                                    {menuItem.volumeMl ? <span>· {formatVolume(menuItem.volumeMl, cartUnitSystem)}</span> : null}
                                                                    {menuItem.classOfService ? <span>· {menuItem.classOfService}</span> : null}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-semibold text-blue-700" style={accentTone ? { color: accentTone } : undefined}>
                                                                    {menuItem.price}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                                                                </span>
                                                                {quantity === 0 ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleAddItem(menuItem)}
                                                                        disabled={!menuItem.available}
                                                                        className="rounded border border-black px-3 py-1.5 text-sm font-semibold text-black hover:bg-neutral-100 disabled:opacity-40"
                                                                        style={menuItem.available && accentTone ? { backgroundColor: accentTone, borderColor: accentTone, color: "#ffffff" } : undefined}
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
                                                                            style={accentTone ? { backgroundColor: accentTone, borderColor: accentTone } : undefined}
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

                    {/* Inline cart */}
                    <aside
                        className="sticky top-6 rounded-lg border border-neutral-200 bg-white p-5 space-y-4"
                        data-testid="merchant-cart"
                    >
                        <p className="text-xs font-semibold text-neutral-500">Order</p>
                        {merchantCartItems.length === 0 ? (
                            <p className="text-sm text-neutral-500">
                                Your cart is empty. Add items from the menu to start an order with{" "}
                                <span className="font-semibold text-black">{restaurant.name}</span>.
                            </p>
                        ) : (
                            <>
                                <ul className="space-y-3 text-sm">
                                    {merchantCartItems.map((item) => (
                                        <li
                                            key={item.menuItemId}
                                            className="space-y-1"
                                            data-testid={`cart-line-${item.menuItemId}`}
                                        >
                                            <div className="flex items-baseline gap-2">
                                                <span className="flex-1 min-w-0 text-black font-medium truncate">
                                                    {item.name}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeLine(item.menuItemId, restaurant.id)}
                                                    className="text-neutral-400 hover:text-red-600 text-lg leading-none px-1 shrink-0"
                                                    aria-label={`Remove ${item.name} from cart`}
                                                    data-testid={`cart-line-delete-${item.menuItemId}`}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(item.menuItemId, restaurant.id)}
                                                        className="w-7 h-7 rounded border border-neutral-300 bg-white text-black text-base hover:bg-neutral-100"
                                                        aria-label={`Remove one ${item.name}`}
                                                        data-testid={`cart-line-decrement-${item.menuItemId}`}
                                                    >
                                                        −
                                                    </button>
                                                    <span className="w-6 text-center text-black font-semibold tabular-nums">
                                                        {item.quantity}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => addItem({ ...item, quantity: 1 })}
                                                        className="w-7 h-7 rounded border border-neutral-300 bg-white text-black text-base hover:bg-neutral-100"
                                                        aria-label={`Add another ${item.name}`}
                                                        data-testid={`cart-line-increment-${item.menuItemId}`}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                                <span className="text-neutral-900 font-semibold tabular-nums">
                                                    {(parseFloat(item.price) * item.quantity).toFixed(4)}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>

                                <div className="border-t border-neutral-200 pt-3 space-y-1.5 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-neutral-600">Payment to merchant</span>
                                        <span className="text-neutral-900 tabular-nums">
                                            {formatToken(merchantTotalAmount, tokenDecimals)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-600">Your bond (refundable on resolve)</span>
                                        <span className="text-neutral-900 tabular-nums">
                                            {formatToken(merchantTotalAmount, tokenDecimals)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-semibold">
                                        <span className="text-black">Locked at commit</span>
                                        <span className="text-black tabular-nums">
                                            {formatToken(merchantBuyerBond, tokenDecimals)}
                                        </span>
                                    </div>
                                    {(merchantMassGrams > 0 || merchantVolumeMl > 0) && (
                                        <div
                                            className="flex justify-between text-[11px] text-neutral-500 pt-1.5 border-t border-neutral-200"
                                            data-testid="cart-logistics-total"
                                        >
                                            <span>Shipment</span>
                                            <span className="tabular-nums">
                                                {merchantMassGrams > 0 ? formatMass(merchantMassGrams, cartUnitSystem) : ""}
                                                {merchantMassGrams > 0 && merchantVolumeMl > 0 ? " · " : ""}
                                                {merchantVolumeMl > 0 ? formatVolume(merchantVolumeMl, cartUnitSystem) : ""}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label
                                        htmlFor="fulfilment-mode-select"
                                        className="text-xs font-semibold text-neutral-500 mb-1 block"
                                    >
                                        Fulfilment
                                    </label>
                                    <select
                                        id="fulfilment-mode-select"
                                        value={fulfillmentMode ?? ""}
                                        onChange={(e) =>
                                            setFulfillmentMode(
                                                e.target.value === ""
                                                    ? undefined
                                                    : (e.target.value as FulfillmentMode),
                                            )
                                        }
                                        className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                                        data-testid="select-fulfilment-mode"
                                    >
                                        <option value="" data-testid="option-fulfilment-unset">
                                            Select one
                                        </option>
                                        {supportedModes.map((mode) => (
                                            <option key={mode} value={mode} data-testid={`option-fulfilment-${mode}`}>
                                                {FULFILMENT_MODE_LABELS[mode] ?? mode}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <Button
                                    onClick={handlePlaceOrder}
                                    disabled={
                                        isApproving
                                        || placingOrder
                                        || merchantCartItems.length === 0
                                        || !fulfillmentMode
                                    }
                                    data-testid="btn-place-order"
                                    className="w-full"
                                >
                                    {!buyer
                                        ? "Connect wallet to order"
                                        : isApproving
                                            ? "Approving payment…"
                                            : placingOrder
                                                ? "Placing order…"
                                                : !fulfillmentMode
                                                    ? "Select fulfilment to order"
                                                    : "Place order"}
                                </Button>

                                {(checkoutError || commitError) && (
                                    <p className="text-sm text-red-600" data-testid="merchant-checkout-error">
                                        {checkoutError ?? commitError}
                                    </p>
                                )}
                            </>
                        )}
                    </aside>
                </div>
            </div>
        </MerchantBrandingModule>
    );
}
