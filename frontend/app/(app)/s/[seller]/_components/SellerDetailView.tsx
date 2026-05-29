"use client";

/**
 * SellerDetailView — per-seller landing page rendered at `/s/[seller]`.
 *
 * Replaces the prior `/i/<assembly>?seller=<addr>` UX where the buyer
 * landed in a generic assembly runtime that re-listed all sellers. This
 * page is seller-shaped: hero with branding, full menu grid, inline cart
 * with explicit "Place order" CTA, and post-commit redirect to
 * `/orders/<processId>` (Increment 2).
 *
 * Data sources:
 *  - `useRegisteredCatalogues` — IPFS / fixture catalogue discovery.
 *  - `resolveRuntimeSubjectByAddress` — display name + branding metadata.
 *  - `useCheckout` — token balance, approval, commit flow.
 *  - `useCartStore` — global cart state (shared with CartModule).
 *
 * Keeps the existing `SellerBrandingModule` wrapper so accent colour /
 * logo bleed-through still works under the same merchant-skin convention.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChainId, usePublicClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { ContentImage } from "@/components/shared/ContentImage";
import { SellerBrandingModule, SellerLogo } from "@/components/modules/SellerBrandingModule";
import { useCommerce, useCheckout } from "@/lib/commerce";
import { useCartStore, type FulfillmentMode } from "@/lib/seller/cartStore";
import { useRegisteredCatalogues } from "@/lib/mechanisms/useRegisteredCatalogues";
import { computeCommitmentProcessId, computeOrderHash } from "@/lib/core/commitmentStore";
import { prepareOrderCommitment } from "@/lib/core/orderCommitmentPreparation";
import { planSubOrderSellers, resolveSubOrderPayment } from "@/lib/core/assemblySubOrderPlan";
import { CONTRACTS } from "@/lib/core/contracts";
import {
    readAssemblyClause,
    readAssemblyOrderGhgStandards,
    APPLICABLE_LAW_CLAUSE_KEY,
    ARBITRATION_KLEROS_CLAUSE_KEY,
    MERCHANT_PROCESS_CLAUSE_KEY,
    PROXIMITY_POLICY_CLAUSE_KEY,
    type Agreement,
} from "@/lib/core/agreement";
import { getTopologyParentOrderHashes } from "@/lib/core/orderAgreement";
import { readAgreementFields } from "@/lib/designer/syntheticProcess";
import type { ClauseFields } from "@/lib/core/encoding";
import { useDutchAuctionActions } from "@/lib/mechanisms/useDutchAuction";
import { sellerAuctionId, stashSellerDraft } from "@/lib/mechanisms/sellerAuction";
import { SellerCataloguePicker, type SellerSelection } from "@/components/core/SellerCataloguePicker";
import { SellerTrackRecord } from "@/components/core/SellerTrackRecord";
import { useSellerTrackRecord } from "@/lib/mechanisms/useSellerTrackRecord";
import { useTokenSymbol } from "@/components/sellers/TokenAddressInput";
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
import { useSellerBoundAssemblies } from "@/lib/mechanisms/useAssemblyRegistry";
import { useDeviceLocation } from "@/hooks/core/useDeviceLocation";
import { DEFAULT_COORDINATION_MESSAGING_SERVICE } from "@/lib/shared/coordinationMessagingService";
import { formatMass, formatVolume } from "@/lib/seller/unitConversion";
import { type CatalogueClassOfService, CLASS_PRIORITY, CLASS_TO_SHORT_CODE } from "@/lib/shared/sellerCatalogueMetadata";

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
 * Extract the dispute-resolution clauses an assembly authored —
 * `figaro-arbitration-kleros-v1` (decentralized ODR layer) and/or
 * `figaro-applicable-law-v1` (state / ADR recourse layer) — as the
 * manifest fields `buildOrderAgreement` re-emits into the committed order's
 * agreement. Without these the committed order names no off-chain forum and
 * the dispute surface has nothing to drive. Returns `{}` for an assembly
 * with no dispute-resolution clauses.
 */
function assemblyJurisdictionFields(
    manifest: { agreements: Record<string, Agreement> },
): Record<string, string> {
    const out: Record<string, string> = {};
    const kleros = readAssemblyClause(manifest, ARBITRATION_KLEROS_CLAUSE_KEY);
    if (kleros) {
        for (const key of ["klerosCourt", "klerosMinJurors"]) {
            const v = kleros.data[key];
            if (typeof v === "string" && v) out[key] = v;
            else if (typeof v === "number") out[key] = String(v);
        }
    }
    const law = readAssemblyClause(manifest, APPLICABLE_LAW_CLAUSE_KEY);
    if (law) {
        for (const key of ["applicableLaw", "forum", "language"]) {
            const v = law.data[key];
            if (typeof v === "string" && v) out[key] = v;
        }
    }
    return out;
}

interface Props {
    sellerAddress: string;
}

export function SellerDetailView({ sellerAddress }: Props) {
    const sellerAddressLower = sellerAddress.toLowerCase();
    const sellerAddressTyped = sellerAddressLower.startsWith("0x")
        ? (sellerAddressLower as `0x${string}`)
        : undefined;

    const router = useRouter();
    const chainId = useChainId();
    const publicClient = usePublicClient();
    const { catalogues: sellerCatalogues, isLoading: cataloguesLoading } = useRegisteredCatalogues();

    const sellerCatalogue = useMemo(
        () => sellerCatalogues.find((r) => hexEqual(r.address, sellerAddressLower)) ?? null,
        [sellerCatalogues, sellerAddressLower],
    );

    // Identity lookup is reserved for follow-on enrichment (seller
    // attestations, did:web profiles). The runtime fixture's accent colour
    // currently lives in the catalogue branding metadata, not the
    // SubjectRecord — `SellerBrandingModule` reads the catalogue path
    // already. Surface accent here only when we can read it cheaply; default
    // to undefined so SellerBrandingModule's CSS variable wins.
    const accentTone: string | undefined = undefined;

    const { address: buyer } = useCommerce();
    // The seller's accepted-token identity declaration: pricing-token +
    // accepted-tokens come from THEIR profile, not from project-level
    // CONTRACTS.* env vars. The env-var fallback only kicks in for fixture /
    // pre-clause-split catalogues that don't carry a defaultTokenAddress.
    const currency = (sellerCatalogue?.defaultTokenAddress
        ?? CONTRACTS.mockToken
        ?? CONTRACTS.permitToken) as `0x${string}`;
    const { data: resolvedSymbol } = useTokenSymbol(currency);
    const tokenSymbol = resolvedSymbol
        ?? sellerCatalogue?.acceptedTokens?.find(
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

    const { items, addItem, removeItem, removeLine, updateItemPrice, clearCart, getTotalPrice, getItemCount, fulfillmentMode, setFulfillmentMode, deliveryMaxPrice } = useCartStore();
    const { createAuction } = useDutchAuctionActions();
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
        useSellerBoundAssemblies(sellerAddressTyped);

    const supportedModes: FulfillmentMode[] = useMemo(() => {
        if (hasOnChainBinding && boundModalities.length > 0) {
            return ALL_FULFILMENT_MODES.filter((m) => boundModalities.includes(m));
        }
        if (!sellerCatalogue?.fulfillmentModes || sellerCatalogue.fulfillmentModes.length === 0) {
            return ALL_FULFILMENT_MODES;
        }
        return ALL_FULFILMENT_MODES.filter((m) => sellerCatalogue.fulfillmentModes!.includes(m));
    }, [sellerCatalogue?.fulfillmentModes, boundModalities, hasOnChainBinding]);

    // Buyer-facing delivery options = the seller's array of bound
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
            (item) => hexEqual(item.sellerAddress, sellerAddressLower),
        );
        const isSelfView = hexEqual(buyer, sellerAddressLower);
        if (!allMatchCurrent || isSelfView) {
            clearCart();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sellerAddressLower, buyer]);

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
    // The buyer's courier selection — chosen through SellerCataloguePicker
    // (the merchant's partner list for seller-assigned, any address for
    // buyer-assigned). null until a courier + delivery item are chosen.
    const [sellerSelection, setSellerSelection] = useState<SellerSelection | null>(null);
    // Courier addresses the merchant designated for the picked delivery
    // assembly — the seller-assigned partner list.
    const sellerPartnerAddresses = useMemo(() => {
        const picked = boundAssemblies.find((a) => a.fulfilmentMethod === fulfillmentMode);
        return picked?.counterpartyBindings
            .find((cb) => cb.clauseId === "figaro-courier-process-v1")?.addresses ?? [];
    }, [boundAssemblies, fulfillmentMode]);
    // The merchant's public-graph track record — settlement + coordination
    // history reconstructed from on-chain events.
    const { trackRecord, isLoading: trackRecordLoading } = useSellerTrackRecord(sellerAddressLower);

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
            console.error("SellerDetailView: failed to compute processId", cause);
            clearCart();
            resetCommitment();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commitStep, payload, chainId]);

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

    const handleAddItem = (menuItem: CatalogueItem) => {
        addItem({
            menuItemId: menuItem.id,
            sellerId: sellerCatalogue.id,
            sellerAddress: sellerCatalogue.address,
            sellerName: sellerCatalogue.name,
            name: menuItem.name,
            price: menuItem.price,
            quantity: 1,
            imageURI: menuItem.image || undefined,
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

    // Filter cart to items from THIS merchant only — the inline cart on this
    // page is merchant-scoped. Items from other merchants live in the global
    // cart but aren't shown here.
    const cartItems = items.filter((it) => it.sellerId === sellerCatalogue.id);
    // Product-driven assembly selection — when a cart item names an assembly
    // (CatalogueItemMetadata.assemblySlug), the product picks the process and
    // the fulfilment-mode dropdown is bypassed.
    const cartProductAssemblySlug = cartItems
        .map((it) => sellerCatalogue.menu.find((m) => m.id === it.menuItemId)?.assemblySlug)
        .find((slug): slug is string => !!slug);
    // The pricing policy of a cart line's catalogue item — drives the
    // buyer-set price input in the cart aside below.
    const menuPolicyOf = (menuItemId: string) =>
        sellerCatalogue.menu.find((m) => m.id === menuItemId)?.pricingPolicy ?? "fixed";
    const cartTotal = cartItems.reduce(
        // `item.price` may be empty mid-edit on a buyer-set line — treat as 0;
        // the executeCheckout guard blocks an unpriced buyer-set commit.
        (sum, item) => sum + parseToken(item.price || "0", tokenDecimals) * BigInt(item.quantity),
        0n,
    );
    const buyerBond = cartTotal > 0n
        ? calculateBonds(cartTotal, cartTotal).buyerBond
        : 0n;

    // Product-driven assembly: the price the buyer pays is the sum of every
    // contributor's cut, each priced LIVE from that contributor's own
    // catalogue (rate negotiated with this merchant), plus the lead's own
    // orders. Built from the SAME planSubOrderSellers + resolveSubOrderPayment
    // the checkout commits with, so the shown total equals what commits. The
    // buyer sees what each seller actually gets — Figaro's transparency.
    // Plain computation, not a hook: this sits after the component's
    // loading/not-found early return, so a useMemo here would run
    // conditionally and break the Rules of Hooks. The cost is a 4-order
    // topological sort — negligible per render.
    const kitBreakdown = ((): { rows: Array<{ name: string; payment: bigint }>; total: bigint } | null => {
        if (!cartProductAssemblySlug) return null;
        const assembly = boundAssemblies.find((a) => a.manifest.slug === cartProductAssemblySlug);
        if (!assembly || assembly.manifest.orders.length <= 1) return null;
        const lead = sellerCatalogue.address as `0x${string}`;
        const nameOf = (addr: `0x${string}`) =>
            sellerCatalogues.find((c) => hexEqual(c.address, addr))?.name ?? truncateHex(addr);
        let plan: ReturnType<typeof planSubOrderSellers>;
        try {
            plan = planSubOrderSellers(assembly);
        } catch {
            return null;
        }
        const rows = [
            { name: nameOf(lead), payment: cartTotal },
            ...plan.map(({ node, seller }) => ({
                name: seller ? nameOf(seller) : "(unbound)",
                payment: seller
                    ? resolveSubOrderPayment({ node, seller, leadAddress: lead, sellerCatalogues, tokenDecimals })
                    : 0n,
            })),
        ];
        return { rows, total: rows.reduce((s, r) => s + r.payment, 0n) };
    })();

    // Sum mass + volume across the cart (in metric — storage shape). Each
    // line aggregates as `perItem * quantity`. Display formats to the
    // catalogue's unitSystem at render time; the commit-time manifest
    // sends the metric numbers directly.
    const cartUnitSystem = sellerCatalogue.unitSystem ?? "metric";
    const cartMassGrams = cartItems.reduce((sum, cartItem) => {
        const menuItem = sellerCatalogue.menu.find((m) => m.id === cartItem.menuItemId);
        if (!menuItem?.massGrams) return sum;
        return sum + menuItem.massGrams * cartItem.quantity;
    }, 0);
    const cartVolumeMl = cartItems.reduce((sum, cartItem) => {
        const menuItem = sellerCatalogue.menu.find((m) => m.id === cartItem.menuItemId);
        if (!menuItem?.volumeMl) return sum;
        return sum + menuItem.volumeMl * cartItem.quantity;
    }, 0);
    // Highest-priority class across the cart. Default "standard" when
    // no item carries a class annotation.
    const cartClassOfService: CatalogueClassOfService = cartItems.reduce<CatalogueClassOfService>(
        (highest, cartItem) => {
            const menuItem = sellerCatalogue.menu.find((m) => m.id === cartItem.menuItemId);
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
        if (cartItems.length === 0) return;
        // Product-driven selection: a catalogue item may name the assembly it
        // composes (e.g. a kit assembled by several sellers). When the cart
        // carries such an item the PRODUCT picks the assembly — the buyer
        // selects what they want, not how it's fulfilled. Falls back to the
        // fulfilment-mode dropdown for ordinary single-/two-party assemblies.
        const productAssemblySlug = cartItems
            .map((it) => sellerCatalogue.menu.find((m) => m.id === it.menuItemId)?.assemblySlug)
            .find((slug): slug is string => !!slug);
        if (!fulfillmentMode && !productAssemblySlug) {
            setCheckoutError("Select a fulfilment mode before placing the order.");
            return;
        }
        // A buyer-set item must carry a buyer-entered price before commit.
        const unpricedBuyerSet = cartItems.find(
            (it) => menuPolicyOf(it.menuItemId) === "buyer-set" && !(parseFloat(it.price) > 0),
        );
        if (unpricedBuyerSet) {
            setCheckoutError(`Enter your price for "${unpricedBuyerSet.name}" before placing the order.`);
            return;
        }
        const sellerAddress = sellerCatalogue.address as `0x${string}`;
        // The picked assembly drives the order. Product-driven: the cart item
        // names the assembly by slug. Otherwise a multi-order assembly
        // (e.g. local-commerce) is selected by fulfilment mode. The kernel sees
        // a linear commit chain; the parent edges are off-chain topology.
        const pickedAssembly = productAssemblySlug
            ? boundAssemblies.find((a) => a.manifest.slug === productAssemblySlug)
            : boundAssemblies.find((a) => a.fulfilmentMethod === fulfillmentMode);
        const isMultiOrder = !!pickedAssembly && pickedAssembly.manifest.orders.length > 1;
        try {
            setCheckoutError(null);
            const prepared = await prepareOrderCommitment({
                buyer,
                seller: sellerAddress,
                currency,
                payment: cartTotal,
                lineItems: cartItems.map((item) => ({
                    itemId: item.menuItemId,
                    name: item.name,
                    quantity: item.quantity,
                    // `item.price` is the catalogue's display string ("0.01"
                    // MOCK) — must be parsed to wei BEFORE the agreement
                    // encoder, which calls `BigInt(unitPrice)` directly
                    // (agreement.ts:420). Same parseToken pattern
                    // the cart-total computation already uses at line 273.
                    unitPrice: parseToken(item.price, tokenDecimals).toString(),
                })),
                clauseFields: {
                    origin: "",
                    destination: "",
                    // Product-driven assemblies carry no fulfilment modality on
                    // the lead/root order — the empty method adds no fulfilment
                    // clause there (the handoffs live on the sub-orders).
                    fulfilmentMethod: fulfillmentMode ?? "",
                    handoffMode: fulfillmentMode ? mapFulfilmentToHandoff(fulfillmentMode) : "",
                    // The committed root order anchors figaro-merchant-process-v1
                    // whenever the merchant runs a lifecycle (order-received →
                    // … → handed-off). Delivery always needs it (the
                    // merchant→courier handoff is a merchant-process event);
                    // pickup needs it too (the buyer↔merchant handoff is the
                    // same lifecycle). Read from the assembly's root order's
                    // agreement — same shape as the proximityBands per-order
                    // IIFE below — so any assembly that authors the clause
                    // gets it propagated, not just delivery-modality ones.
                    ...(pickedAssembly?.manifest.orders[0]?.agreementHash
                        ? (() => {
                            const rootAgreement = pickedAssembly.manifest.agreements[
                                pickedAssembly.manifest.orders[0].agreementHash
                            ] as Agreement | undefined;
                            const hasMerchantProcess = !!rootAgreement?.sections.find(
                                (s) => s.clause === MERCHANT_PROCESS_CLAUSE_KEY,
                            );
                            return hasMerchantProcess ? { merchantProcessIncluded: true } : {};
                        })()
                        : (fulfillmentMode?.startsWith("deliver:") ? { merchantProcessIncluded: true } : {})),
                    // The off-chain dispute forum the assembly authored — the
                    // committed order carries the jurisdiction clause so the
                    // dispute surface can read its Layer-3 recourse.
                    ...(pickedAssembly ? assemblyJurisdictionFields(pickedAssembly.manifest) : {}),
                    // Propagate any GHG disclosure clauses the assembly's root
                    // order declared — the committed agreement must carry them
                    // (with their paired figaro-ghg-measurement-v1 clause) so
                    // the seller can file grams measurements and the buyer can
                    // size carbon offsets at runtime.
                    ...(pickedAssembly && pickedAssembly.manifest.orders[0]
                        ? (() => {
                            const ghgStandards = readAssemblyOrderGhgStandards(
                                pickedAssembly.manifest,
                                pickedAssembly.manifest.orders[0].agreementHash,
                            );
                            return ghgStandards.length > 0 ? { ghgStandards } : {};
                        })()
                        : {}),
                    // Propagate a proximity-policy clause when the assembly's
                    // ROOT order carries one — the pickup-handoff case, where
                    // the merchant↔buyer order itself is the handoff edge.
                    // Per-order scope (not multi-order readAssemblyClause): a
                    // delivery assembly has its proximity clause on the courier
                    // sub-order, which must NOT leak onto the root.
                    ...(pickedAssembly?.manifest.orders[0]?.agreementHash
                        ? (() => {
                            const rootAgreement = pickedAssembly.manifest.agreements[
                                pickedAssembly.manifest.orders[0].agreementHash
                            ] as Agreement | undefined;
                            const policy = rootAgreement?.sections.find(
                                (s) => s.clause === PROXIMITY_POLICY_CLAUSE_KEY,
                            );
                            const bands = (policy?.data as { bands?: string[] } | undefined)?.bands ?? [];
                            return bands.length > 0 ? { proximityBands: bands } : {};
                        })()
                        : {}),
                    // Geo fields aggregated from the cart's catalogue annotations.
                    // mass / volume strings are parsed by `parseMassToGrams` /
                    // `parseVolumeToMl` in `clauseFieldsToGeoSection`; class_
                    // is the SDK short code consumed by `encodeGeoContent`.
                    ...(cartMassGrams > 0 ? { mass: `${cartMassGrams} g` } : {}),
                    ...(cartVolumeMl > 0 ? { volume: `${cartVolumeMl} ml` } : {}),
                    class_: CLASS_TO_SHORT_CODE[cartClassOfService],
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

            // ── Multi-order assembly: commit the root, then walk the
            //    manifest's remaining orders in topological order ──────────
            // Generic over any topology (delivery's root→courier, the
            // kit-assembly diamond, …). Each non-root order's seller is read
            // from the seller's counterpartyBindings by the clause that
            // order carries; its clauses come from the assembly manifest; its
            // synthetic parent ids are remapped to the real on-chain order
            // hashes as they commit; the global cumulative value accumulates
            // in commit order. The Dutch-auction edge and SellerCataloguePicker
            // stay as the delivery-specific INPUT path, applied to the order
            // carrying figaro-courier-process-v1.
            multiOrderCheckout.current = true;
            await signAndPlace(prepared.commitment, prepared.commitmentMeta, "buyer");

            const manifest = pickedAssembly!.manifest;
            const processId = computeCommitmentProcessId(prepared.commitment, chainId, CONTRACTS.core);
            const rootOrder = manifest.orders[0];
            const realOrderHash = new Map<string, `0x${string}`>([
                [rootOrder.id, computeOrderHash(prepared.commitment, chainId, CONTRACTS.core)],
            ]);
            let cumulativeValue = cartTotal;

            // Topologically ordered non-root orders, each with its resolved
            // seller. Shared with the cart breakdown (planSubOrderSellers) so
            // the price the buyer sees is the price that commits.
            for (const { node, seller: boundSeller } of planSubOrderSellers(pickedAssembly!)) {
                const agreement = manifest.agreements[node.agreementHash!];
                const nodeClauses = (agreement?.sections ?? []).map((s) => s.clause);
                const parentOrderHashes = (getTopologyParentOrderHashes(agreement) ?? [])
                    .map((pid) => realOrderHash.get(pid))
                    .filter((h): h is `0x${string}` => !!h);
                const isCourierEdge = nodeClauses.includes("figaro-courier-process-v1")
                    && fulfillmentMode?.startsWith("deliver:");

                // ── Dutch-auction courier edge: deferred to an auction ──
                // It joins the process when a courier claims it; the order
                // page commits it post-claim from the stashed draft.
                if (isCourierEdge && fulfillmentMode === "deliver:dutch-auction") {
                    const daBands = (readAssemblyClause(manifest, PROXIMITY_POLICY_CLAUSE_KEY)
                        ?.data as { bands?: string[] } | undefined)?.bands ?? [];
                    stashSellerDraft(processId, {
                        buyer,
                        currency,
                        processId,
                        parentOrderHashes,
                        clauseFields: {
                            origin: sellerCatalogue?.geohash ?? "",
                            destination: deliveryLocation.geohash ?? "",
                            courierProcessIncluded: true,
                            ...assemblyJurisdictionFields(manifest),
                            ...(daBands.length > 0 ? { proximityBands: daBands } : {}),
                            ...(cartMassGrams > 0 ? { mass: `${cartMassGrams} g` } : {}),
                            ...(cartVolumeMl > 0 ? { volume: `${cartVolumeMl} ml` } : {}),
                            class_: CLASS_TO_SHORT_CODE[cartClassOfService],
                        },
                        deliveryAddress: deliveryAddress.trim() || undefined,
                    });
                    const auctionTxHash = await createAuction(
                        sellerAuctionId(processId),
                        parseToken(deliveryMaxPrice, tokenDecimals),
                        processId,
                        currency,
                    );
                    if (publicClient && auctionTxHash) {
                        await publicClient.waitForTransactionReceipt({ hash: auctionTxHash });
                    }
                    continue;
                }

                // ── Resolve this order's seller, payment, and clauses ──
                let seller: `0x${string}`;
                let payment: bigint;
                let clauseFields: ClauseFields;
                let sellerToNotify: `0x${string}` | null = null;

                if (isCourierEdge) {
                    // Delivery: the buyer chose the courier, the price, and the
                    // destination through SellerCataloguePicker.
                    if (!sellerSelection) {
                        multiOrderCheckout.current = false;
                        setCheckoutError("Choose a seller and a delivery service before placing the order.");
                        return;
                    }
                    seller = sellerSelection.seller;
                    payment = parseToken(sellerSelection.price, tokenDecimals);
                    sellerToNotify = seller;
                    const bands = (readAssemblyClause(manifest, PROXIMITY_POLICY_CLAUSE_KEY)
                        ?.data as { bands?: string[] } | undefined)?.bands ?? [];
                    const ghgStandards = readAssemblyOrderGhgStandards(manifest, node.agreementHash);
                    clauseFields = {
                        origin: sellerCatalogue?.geohash ?? "",
                        destination: deliveryLocation.geohash ?? "",
                        courierProcessIncluded: true,
                        ...assemblyJurisdictionFields(manifest),
                        ...(bands.length > 0 ? { proximityBands: bands } : {}),
                        ...(ghgStandards.length > 0 ? { ghgStandards } : {}),
                        ...(cartMassGrams > 0 ? { mass: `${cartMassGrams} g` } : {}),
                        ...(cartVolumeMl > 0 ? { volume: `${cartVolumeMl} ml` } : {}),
                        class_: CLASS_TO_SHORT_CODE[cartClassOfService],
                    };
                } else {
                    // Generic sub-order: seller resolved upstream from the
                    // seller's counterpartyBindings (shared with the cart
                    // breakdown); clauses read from the assembly manifest.
                    if (!boundSeller) {
                        multiOrderCheckout.current = false;
                        setCheckoutError("This assembly has a sub-order with no designated counterparty — the seller must bind one.");
                        return;
                    }
                    seller = boundSeller;
                    // Contributor nodes are priced LIVE from the contributor's
                    // own catalogue (rate negotiated with the lead); the lead's
                    // own nodes keep the manifest figure. Returns a bigint, so
                    // the cumulative add stays numeric.
                    payment = resolveSubOrderPayment({
                        node, seller, leadAddress: sellerAddress,
                        sellerCatalogues, tokenDecimals,
                    });
                    clauseFields = readAgreementFields(node, agreement);
                }

                cumulativeValue += payment;
                const subPrepared = await prepareOrderCommitment({
                    buyer,
                    seller,
                    currency,
                    payment,
                    processId,
                    parentOrderHashes,
                    expectedCumulativeValue: cumulativeValue,
                    clauseFields,
                });
                await signAndPlace(subPrepared.commitment, subPrepared.commitmentMeta, "buyer");
                realOrderHash.set(
                    node.id,
                    computeOrderHash(subPrepared.commitment, chainId, CONTRACTS.core),
                );

                // Delivery: hand the human-readable address to the courier.
                if (sellerToNotify && deliveryAddress.trim()) {
                    try {
                        await DEFAULT_COORDINATION_MESSAGING_SERVICE.sendHandoffAddress({
                            address: buyer,
                            recipientAddress: sellerToNotify,
                            orderId: computeOrderHash(subPrepared.commitment, chainId, CONTRACTS.core),
                            deliveryAddress: deliveryAddress.trim(),
                        });
                    } catch (cause) {
                        console.warn("Handoff address send to seller failed", cause);
                    }
                }
            }

            // All orders committed — navigate to the process page.
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
        if (cartItems.length === 0) return;
        if (hasInsufficientBalance) {
            setCheckoutError(
                `Insufficient funds. Required: ${formatToken(buyerBond, tokenDecimals)}, available: ${formatToken(balance, tokenDecimals)}`,
            );
            return;
        }
        setCheckoutError(null);
        if (needsApproval(buyerBond)) {
            try {
                pendingCheckout.current = true;
                approve(buyerBond * 10n);
            } catch {
                pendingCheckout.current = false;
                setCheckoutError("Payment authorization failed. Please try again.");
            }
        } else {
            void executeCheckout();
        }
    };

    const categories = Array.from(new Set(sellerCatalogue.menu.map((item) => item.category)));
    const placingOrder = commitStep === "signing" || commitStep === "broadcasting" || commitStep === "ready";

    return (
        <SellerBrandingModule sellerAddress={sellerAddressTyped}>
            <div data-testid="seller-detail-view" data-seller-address={sellerAddressLower} className="container mx-auto px-6 py-10 max-w-5xl space-y-8">
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
                        <SellerLogo
                            sellerAddress={sellerAddressTyped}
                            fallbackEmoji={sellerCatalogue.image}
                            fallbackName={sellerCatalogue.name}
                            size={88}
                        />
                        <div className="flex-1 min-w-0">
                            {sellerCatalogue.specialty && (
                                <p
                                    className="text-xs font-semibold text-neutral-500"
                                    style={accentTone ? { color: accentTone } : undefined}
                                >
                                    {sellerCatalogue.specialty}
                                </p>
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
                                    {sellerCatalogue.menu
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
                                <ul className="space-y-3 text-sm">
                                    {cartItems.map((item) => (
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
                                                    onClick={() => removeLine(item.menuItemId, sellerCatalogue.id)}
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
                                                        onClick={() => removeItem(item.menuItemId, sellerCatalogue.id)}
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
                                                            onChange={(e) => updateItemPrice(item.menuItemId, sellerCatalogue.id, e.target.value)}
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
                                    {kitBreakdown ? (
                                        // Each contributor's cut, priced live from their own
                                        // catalogue — the buyer sees what every seller gets.
                                        <div className="space-y-1" data-testid="cart-contributor-breakdown">
                                            {kitBreakdown.rows.map((row, i) => (
                                                <div key={i} className="flex justify-between">
                                                    <span className="text-neutral-600">{row.name}</span>
                                                    <span className="text-neutral-900 tabular-nums">
                                                        {formatToken(row.payment, tokenDecimals)}
                                                    </span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-medium">
                                                <span className="text-neutral-700">Total to all sellers</span>
                                                <span className="text-neutral-900 tabular-nums" data-testid="cart-kit-total">
                                                    {formatToken(kitBreakdown.total, tokenDecimals)}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between">
                                            <span className="text-neutral-600">Payment to seller</span>
                                            <span className="text-neutral-900 tabular-nums">
                                                {formatToken(cartTotal, tokenDecimals)}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-neutral-600">Your bond (refundable on resolve)</span>
                                        <span className="text-neutral-900 tabular-nums">
                                            {formatToken(cartTotal, tokenDecimals)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-semibold">
                                        <span className="text-black">Locked at commit</span>
                                        <span className="text-black tabular-nums">
                                            {formatToken(buyerBond, tokenDecimals)}
                                        </span>
                                    </div>
                                    {(cartMassGrams > 0 || cartVolumeMl > 0) && (
                                        <div
                                            className="flex justify-between text-[11px] text-neutral-500 pt-1.5 border-t border-neutral-200"
                                            data-testid="cart-logistics-total"
                                        >
                                            <span>Shipment</span>
                                            <span className="tabular-nums">
                                                {cartMassGrams > 0 ? formatMass(cartMassGrams, cartUnitSystem) : ""}
                                                {cartMassGrams > 0 && cartVolumeMl > 0 ? " · " : ""}
                                                {cartVolumeMl > 0 ? formatVolume(cartVolumeMl, cartUnitSystem) : ""}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {cartProductAssemblySlug ? (
                                    <div
                                        data-testid="product-assembly-note"
                                        className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600"
                                    >
                                        Fulfilled as the{" "}
                                        <span className="font-mono">{cartProductAssemblySlug}</span>{" "}
                                        assembly — multiple sellers, each settled in the same resolve.
                                    </div>
                                ) : (
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
                                )}

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
                                            Where the seller delivers — committed to the order as a geohash.
                                        </p>
                                        <textarea
                                            value={deliveryAddress}
                                            onChange={(e) => setDeliveryAddress(e.target.value)}
                                            placeholder="Street address, apt, entry notes — sent to the seller"
                                            data-testid="input-delivery-address"
                                            rows={2}
                                            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                                        />

                                        {(fulfillmentMode === "deliver:seller-assigned"
                                            || fulfillmentMode === "deliver:buyer-assigned") && (
                                            <div className="pt-1">
                                                <SellerCataloguePicker
                                                    key={fulfillmentMode}
                                                    mode={fulfillmentMode}
                                                    partnerAddresses={sellerPartnerAddresses}
                                                    sellerAddress={sellerAddressLower}
                                                    tokenSymbol={tokenSymbol}
                                                    onSelect={setSellerSelection}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <Button
                                    onClick={handlePlaceOrder}
                                    disabled={
                                        isApproving
                                        || placingOrder
                                        || cartItems.length === 0
                                        || (!fulfillmentMode && !cartProductAssemblySlug)
                                        || (fulfillmentMode?.startsWith("deliver:") && !deliveryLocation.geohash)
                                        || ((fulfillmentMode === "deliver:seller-assigned" || fulfillmentMode === "deliver:buyer-assigned") && !sellerSelection)
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
                                                : (!fulfillmentMode && !cartProductAssemblySlug)
                                                    ? "Select fulfilment to order"
                                                    : "Place order"}
                                </Button>

                                {(checkoutError || commitError) && (
                                    <p className="text-sm text-red-600" data-testid="seller-checkout-error">
                                        {checkoutError ?? commitError}
                                    </p>
                                )}
                            </>
                        )}
                    </aside>
                </div>
            </div>
        </SellerBrandingModule>
    );
}
