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
import { computeCommitmentProcessId, computeOrderHash } from "@/lib/core/commitmentStore";
import { prepareOrderCommitment } from "@/lib/core/orderCommitmentPreparation";
import { CONTRACTS } from "@/lib/core/contracts";
import { useTokenSymbol } from "@/components/operators/TokenAddressInput";
import { calculateBonds } from "@figaro/core";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatToken, parseToken } from "@/lib/shared/utils";
import { isE2EMockSession, isE2EDevnetSession } from "@/lib/shared/e2e";
import {
    FULFILMENT_MODE_LABELS,
    isDeliveryFulfilment,
    mapFulfilmentToHandoff,
} from "@/lib/seller/fulfilmentRouting";
import { useMerchantBoundAssemblies } from "@/lib/mechanisms/useAssemblyRegistry";
import { useDeviceLocation } from "@/hooks/core/useDeviceLocation";
import { DEFAULT_COORDINATION_MESSAGING_SERVICE } from "@/lib/shared/coordinationMessagingService";
import { formatMass, formatVolume } from "@/lib/seller/unitConversion";
import { type CatalogueClassOfService, CLASS_PRIORITY, CLASS_TO_SHORT_CODE, resolveCatalogueItemPrice } from "@/lib/shared/sellerCatalogueMetadata";

import type { CatalogueItem, SellerCatalogue } from "@/lib/seller/types";

const ALL_FULFILMENT_MODES: FulfillmentMode[] = [
    "consume-onsite",
    "pickup",
    "virtual",
    "deliver:buyer-assigned",
    "deliver:seller-assigned",
    "deliver:dutch-auction",
];

/**
 * Extract the figaro-jurisdiction-v1 clause an assembly authored, as the
 * manifest fields `buildOrderAgreement` re-emits into the committed order's
 * agreement. Layer-3 dispute recourse is read off this clause — without it
 * the committed order names no off-chain forum and the dispute surface has
 * nothing to drive. Returns `{}` for an assembly with no jurisdiction clause.
 */
function assemblyJurisdictionFields(
    manifest: { agreements?: Record<string, { sections?: Array<{ schema: string; data?: Record<string, unknown> }> }> },
): Record<string, string> {
    for (const agreement of Object.values(manifest.agreements ?? {})) {
        const section = (agreement.sections ?? []).find((s) => s.schema === "figaro-jurisdiction-v1");
        if (!section) continue;
        const data = section.data ?? {};
        const out: Record<string, string> = {};
        for (const key of ["klerosCourt", "klerosMinJurors", "applicableLaw", "forum", "language"]) {
            const v = data[key];
            if (typeof v === "string" && v) out[key] = v;
            else if (typeof v === "number") out[key] = String(v);
        }
        if (Object.keys(out).length > 0) return out;
    }
    return {};
}

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
    // The operator's accepted-token identity declaration: pricing-token +
    // accepted-tokens come from THEIR profile, not from project-level
    // CONTRACTS.* env vars. The env-var fallback only kicks in for fixture /
    // pre-schema-split catalogues that don't carry a defaultTokenAddress.
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

    const { items, addItem, removeItem, removeLine, updateItemPrice, clearCart, getTotalPrice, getItemCount, fulfillmentMode, setFulfillmentMode } = useCartStore();
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
    const { assemblies: boundAssemblies, modalities: boundModalities, hasOnChainBinding } =
        useMerchantBoundAssemblies(merchantAddressTyped);

    const supportedModes: FulfillmentMode[] = useMemo(() => {
        if (hasOnChainBinding && boundModalities.length > 0) {
            return ALL_FULFILMENT_MODES.filter((m) => boundModalities.includes(m));
        }
        if (!restaurant?.fulfillmentModes || restaurant.fulfillmentModes.length === 0) {
            return ALL_FULFILMENT_MODES;
        }
        return ALL_FULFILMENT_MODES.filter((m) => restaurant.fulfillmentModes!.includes(m));
    }, [restaurant?.fulfillmentModes, boundModalities, hasOnChainBinding]);

    // Buyer-facing delivery options = the operator's array of bound
    // assemblies. Each bound assembly is one option; its root fulfilment
    // method is the cart selection. A merchant with no on-chain bindings
    // falls back to the catalogue-derived `supportedModes`.
    const assemblyOptions = useMemo(
        () => boundAssemblies.flatMap((a) =>
            a.fulfilmentMethod
                ? [{ method: a.fulfilmentMethod as FulfillmentMode, name: a.name }]
                : [],
        ),
        [boundAssemblies],
    );
    const fulfilmentOptions: { method: FulfillmentMode; name: string }[] = useMemo(
        () => (assemblyOptions.length > 0
            ? assemblyOptions
            : supportedModes.map((m) => ({ method: m, name: FULFILMENT_MODE_LABELS[m] ?? m }))),
        [assemblyOptions, supportedModes],
    );

    // If the cart's persisted choice isn't supported by this merchant's
    // assembly, CLEAR it. The buyer must explicitly pick a supported mode
    // — no silent snap-to-first-available.
    useEffect(() => {
        if (
            fulfillmentMode
            && fulfilmentOptions.length > 0
            && !fulfilmentOptions.some((o) => o.method === fulfillmentMode)
        ) {
            setFulfillmentMode(undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fulfilmentOptions]);

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
    // Buyer's delivery location for delivery-fulfilment checkout. The geohash
    // is the merkle-committed location term on the courier order's
    // figaro-geo-v2 section; precision 9 ≈ a few metres.
    const deliveryLocation = useDeviceLocation(9);
    // The human-readable street address — sent to the courier over the
    // coordination channel (off-agreement; the operational delivery detail).
    const [deliveryAddress, setDeliveryAddress] = useState("");

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
    // Set while executeCheckout is mid-flight on a multi-order assembly —
    // suppresses this single-commit redirect so the courier commit runs
    // before navigation; executeCheckout owns the redirect in that path.
    const multiOrderCheckout = useRef(false);
    useEffect(() => {
        if (commitStep !== "done") return;
        if (multiOrderCheckout.current) return;
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
                <h1 className="text-3xl font-bold text-black">No merchant registered for {truncateHex(merchantAddressLower, { head: 10, tail: 0 })}</h1>
                <p className="text-sm text-neutral-600">
                    This wallet hasn&apos;t registered itself in <code className="text-xs">OperatorRegistry</code> on the network
                    you&apos;re connected to, or hasn&apos;t pinned a catalogue. If this is your wallet, you can complete the registration through the onboarding flow.
                </p>
                <div className="flex items-center gap-3 pt-2">
                    <Link href="/operators" className="inline-block text-sm px-3 py-1.5 rounded border border-black bg-black text-white hover:bg-neutral-800">
                        Register as an operator
                    </Link>
                    <Link href="/discover" className="inline-block underline text-sm text-black hover:text-neutral-600">
                        ← Back to discover
                    </Link>
                </div>
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
    // The pricing policy of a cart line's catalogue item — drives the
    // buyer-set price input in the cart aside below.
    const menuPolicyOf = (menuItemId: string) =>
        restaurant.menu.find((m) => m.id === menuItemId)?.pricingPolicy ?? "fixed";
    const merchantTotalAmount = merchantCartItems.reduce(
        // `item.price` may be empty mid-edit on a buyer-set line — treat as 0;
        // the executeCheckout guard blocks an unpriced buyer-set commit.
        (sum, item) => sum + parseToken(item.price || "0", tokenDecimals) * BigInt(item.quantity),
        0n,
    );
    const merchantBuyerBond = merchantTotalAmount > 0n
        ? calculateBonds(merchantTotalAmount, merchantTotalAmount).buyerBond
        : 0n;

    // Sum mass + volume across the cart (in metric — storage shape). Each
    // line aggregates as `perItem * quantity`. Display formats to the
    // catalogue's unitSystem at render time; the commit-time manifest
    // sends the metric numbers directly.
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
    // Highest-priority class across the cart. Default "standard" when
    // no item carries a class annotation.
    const merchantClassOfService: CatalogueClassOfService = merchantCartItems.reduce<CatalogueClassOfService>(
        (highest, cartItem) => {
            const menuItem = restaurant.menu.find((m) => m.id === cartItem.menuItemId);
            const itemClass = menuItem?.classOfService;
            if (!itemClass) return highest;
            return CLASS_PRIORITY[itemClass] > CLASS_PRIORITY[highest] ? itemClass : highest;
        },
        "standard",
    );

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
        // A buyer-set item must carry a buyer-entered price before commit.
        const unpricedBuyerSet = merchantCartItems.find(
            (it) => menuPolicyOf(it.menuItemId) === "buyer-set" && !(parseFloat(it.price) > 0),
        );
        if (unpricedBuyerSet) {
            setCheckoutError(`Enter your price for "${unpricedBuyerSet.name}" before placing the order.`);
            return;
        }
        const sellerAddress = restaurant.address as `0x${string}`;
        // The picked assembly drives the order. A multi-order assembly
        // (e.g. local-commerce) is a process of more than one order — the
        // root merchant order plus a courier order parented to it.
        const pickedAssembly = boundAssemblies.find(
            (a) => a.fulfilmentMethod === fulfillmentMode,
        );
        const isMultiOrder = !!pickedAssembly && pickedAssembly.manifest.orders.length > 1;
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
                    // `item.price` is the catalogue's display string ("0.01"
                    // MOCK) — must be parsed to wei BEFORE the agreement
                    // encoder, which calls `BigInt(unitPrice)` directly
                    // (agreementManifest.ts:420). Same parseToken pattern
                    // the cart-total computation already uses at line 273.
                    unitPrice: parseToken(item.price, tokenDecimals).toString(),
                })),
                manifestFields: {
                    origin: "",
                    destination: "",
                    fulfilmentMethod: fulfillmentMode,
                    handoffMode: mapFulfilmentToHandoff(fulfillmentMode),
                    // A delivery order has the merchant run a prep-and-handoff
                    // process (order-received → … → handed-off to the courier),
                    // so the food order anchors figaro-merchant-process-v1 —
                    // without the clause the merchant cannot attest it.
                    ...(fulfillmentMode.startsWith("deliver:") ? { merchantProcessIncluded: true } : {}),
                    // The off-chain dispute forum the assembly authored — the
                    // committed order carries the jurisdiction clause so the
                    // dispute surface can read its Layer-3 recourse.
                    ...(pickedAssembly ? assemblyJurisdictionFields(pickedAssembly.manifest) : {}),
                    // Geo fields aggregated from the cart's catalogue annotations.
                    // mass / volume strings are parsed by `parseMassToGrams` /
                    // `parseVolumeToMl` in `manifestFieldsToGeoSection`; class_
                    // is the SDK short code consumed by `encodeGeoContent`.
                    ...(merchantMassGrams > 0 ? { mass: `${merchantMassGrams} g` } : {}),
                    ...(merchantVolumeMl > 0 ? { volume: `${merchantVolumeMl} ml` } : {}),
                    class_: CLASS_TO_SHORT_CODE[merchantClassOfService],
                },
            });

            const immediateCommit = isE2EMockSession() || isE2EDevnetSession();
            if (!immediateCommit) {
                // Production two-party relay — root order only. Multi-order
                // (courier) checkout via the relay is follow-on work.
                await initiateAsParty(prepared.commitment, "buyer", prepared.commitmentMeta);
                return;
            }
            if (!isMultiOrder) {
                // Single-order assembly — commit; the redirect effect routes
                // to /orders/<processId>.
                await signAndPlace(prepared.commitment, prepared.commitmentMeta, "buyer");
                return;
            }

            // ── Multi-order assembly: root order, then the courier order ──
            // Suppress the single-commit redirect until both orders land.
            multiOrderCheckout.current = true;
            await signAndPlace(prepared.commitment, prepared.commitmentMeta, "buyer");

            const processId = computeCommitmentProcessId(prepared.commitment, chainId, CONTRACTS.core);
            const rootOrderHash = computeOrderHash(prepared.commitment, chainId, CONTRACTS.core);

            // The courier wallet is the operator's designated courier for
            // this assembly (seller-assigned coordination; dutch-auction /
            // buyer-assigned courier selection is follow-on work).
            const courier = pickedAssembly!.counterpartyBindings
                .find((cb) => cb.schemaId === "figaro-courier-process-v1")
                ?.addresses[0];
            if (!courier) {
                multiOrderCheckout.current = false;
                setCheckoutError("This assembly needs a courier, but the merchant has designated none.");
                return;
            }

            // The courier order — buyer↔courier, parented to the root order,
            // carrying the figaro-courier-process-v1 clause.
            //
            // Read the courier order's handoff clause off the picked
            // assembly — the assembly is the template, so the committed
            // courier order carries the same proximity-policy band the
            // assembly declares (rather than a runtime guess).
            const assemblyManifest = pickedAssembly!.manifest;
            const courierAgreementHash = assemblyManifest.orders
                .map((o) => o.agreementHash)
                .find((hash) => hash && (assemblyManifest.agreements[hash]?.sections ?? [])
                    .some((s: { schema: string }) => s.schema === "figaro-courier-process-v1"));
            const courierProximityBands: string[] = courierAgreementHash
                ? (((assemblyManifest.agreements[courierAgreementHash]?.sections ?? [])
                    .find((s: { schema: string }) => s.schema === "figaro-proximity-policy-v1")
                    ?.data as { bands?: string[] } | undefined)?.bands ?? [])
                : [];

            // The courier delivery price comes from the courier's OWN
            // catalogue — the courier is a peer operator, not priced by the
            // merchant. resolveCatalogueItemPrice keys the courier's rate
            // card on the merchant it serves (the negotiated price list).
            const courierCatalogue = restaurants.find((r) => hexEqual(r.address, courier));
            const courierDeliveryItem = courierCatalogue?.menu.find((i) => i.category === "delivery");
            if (!courierDeliveryItem) {
                multiOrderCheckout.current = false;
                setCheckoutError("The designated courier has not published a delivery price.");
                return;
            }
            const courierPayment = parseToken(
                resolveCatalogueItemPrice(courierDeliveryItem, merchantAddressLower).price,
                tokenDecimals,
            );
            const courierPrepared = await prepareOrderCommitment({
                buyer,
                seller: courier,
                currency,
                payment: courierPayment,
                processId,
                parentOrderHashes: [rootOrderHash],
                expectedCumulativeValue: merchantTotalAmount + courierPayment,
                manifestFields: {
                    origin: restaurant?.geohash ?? "",
                    destination: deliveryLocation.geohash ?? "",
                    courierProcessIncluded: true,
                    ...assemblyJurisdictionFields(assemblyManifest),
                    ...(courierProximityBands.length > 0 ? { proximityBands: courierProximityBands } : {}),
                    ...(merchantMassGrams > 0 ? { mass: `${merchantMassGrams} g` } : {}),
                    ...(merchantVolumeMl > 0 ? { volume: `${merchantVolumeMl} ml` } : {}),
                    class_: CLASS_TO_SHORT_CODE[merchantClassOfService],
                },
            });
            await signAndPlace(courierPrepared.commitment, courierPrepared.commitmentMeta, "buyer");

            // Send the human-readable delivery address to the courier over
            // the coordination channel — best-effort: both commits already
            // landed, so a channel failure must not fail the checkout.
            if (deliveryAddress.trim()) {
                try {
                    await DEFAULT_COORDINATION_MESSAGING_SERVICE.sendHandoffAddress({
                        address: buyer,
                        recipientAddress: courier,
                        orderId: computeOrderHash(courierPrepared.commitment, chainId, CONTRACTS.core),
                        deliveryAddress: deliveryAddress.trim(),
                    });
                } catch (cause) {
                    console.warn("Handoff address send to courier failed", cause);
                }
            }

            // Both orders committed — navigate to the process page.
            multiOrderCheckout.current = false;
            clearCart();
            resetCommitment();
            router.push(`/orders/${processId}`);
        } catch (cause: unknown) {
            multiOrderCheckout.current = false;
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
                                                {menuPolicyOf(item.menuItemId) === "buyer-set" ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={item.price}
                                                            onChange={(e) => updateItemPrice(item.menuItemId, restaurant.id, e.target.value)}
                                                            placeholder="Your price"
                                                            aria-label={`Your price for ${item.name}`}
                                                            data-testid={`cart-line-buyer-price-${item.menuItemId}`}
                                                            className="w-24 rounded border border-neutral-300 px-2 py-1 text-right text-sm tabular-nums"
                                                        />
                                                        <span className="text-xs text-neutral-500 shrink-0">
                                                            {tokenSymbol ? `${tokenSymbol} ` : ""}× {item.quantity}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-neutral-900 font-semibold tabular-nums">
                                                        {(parseFloat(item.price) * item.quantity).toFixed(4)}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                                                    </span>
                                                )}
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
                                        {fulfilmentOptions.map((opt) => (
                                            <option key={opt.method} value={opt.method} data-testid={`option-fulfilment-${opt.method}`}>
                                                {opt.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {fulfillmentMode?.startsWith("deliver:") && (
                                    <div className="space-y-1.5" data-testid="delivery-location-block">
                                        <label
                                            htmlFor="delivery-geohash-input"
                                            className="text-xs font-semibold text-neutral-500 block"
                                        >
                                            Delivery location
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                id="delivery-geohash-input"
                                                type="text"
                                                value={deliveryLocation.geohash ?? ""}
                                                onChange={(e) => deliveryLocation.setManualGeohash(e.target.value)}
                                                placeholder="geohash, e.g. dr5regw3p"
                                                data-testid="input-delivery-geohash"
                                                className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => deliveryLocation.request()}
                                                data-testid="btn-use-my-location"
                                                className="shrink-0 rounded border border-neutral-300 px-3 py-2 text-xs text-neutral-600 hover:border-neutral-500"
                                            >
                                                Use my location
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-neutral-500">
                                            Where the courier delivers — committed to the order as a geohash.
                                        </p>
                                        <textarea
                                            value={deliveryAddress}
                                            onChange={(e) => setDeliveryAddress(e.target.value)}
                                            placeholder="Street address, apt, entry notes — sent to the courier"
                                            data-testid="input-delivery-address"
                                            rows={2}
                                            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                                        />
                                    </div>
                                )}

                                <Button
                                    onClick={handlePlaceOrder}
                                    disabled={
                                        isApproving
                                        || placingOrder
                                        || merchantCartItems.length === 0
                                        || !fulfillmentMode
                                        || (fulfillmentMode.startsWith("deliver:") && !deliveryLocation.geohash)
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
