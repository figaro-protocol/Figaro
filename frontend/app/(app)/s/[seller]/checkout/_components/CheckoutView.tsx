"use client";

/**
 * CheckoutView — the buyer's order surface at `/s/[seller]/checkout`.
 *
 * Driven EXCLUSIVELY by the seller's bound assembly. The checkout names no
 * clause and knows no modality: it resolves the assembly from the seller's
 * profile, walks the assembly's own topology + clauses, computes the bond,
 * validates Layer A, runs the bilateral / multi-order commit, and redirects to
 * `/orders/<processId>`. Every order's clauses come straight from the assembly
 * template; every sub-order's seller is resolved generically from the assembly's
 * `counterpartyBindings`. No dutch-auction, no courier picker, no modality
 * taxonomy, no buyer-set pricing — those are the assembly's concerns, not the
 * checkout's.
 *
 * The cart is read-only here: it is the buyer's line-item selection, edited on
 * the browse page. Checkout reads it, it does not mutate it.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChainId, usePublicClient, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/Button";
import { useCommerce, useCheckout } from "@/lib/commerce";
import { useCartStore } from "@/lib/commerce/cartStore";
import { useRegisteredCatalogues } from "@/lib/seller/useRegisteredCatalogues";
import { planSubOrderSellers, resolveSubOrderPayment } from "@/lib/commerce/assemblySubOrderPlan";
import { executeAssemblyCheckout } from "@/lib/commerce/assemblyCheckout";
import { templateParentOrderHashes } from "@/lib/designer/assemblyTemplate";
import { CONTRACTS } from "@/lib/core/contracts";
import { CommitmentSharePanel } from "@/components/core/CommitmentSharePanel";
import { SellerCataloguePicker, type SellerSelection } from "@/components/core/SellerCataloguePicker";
import { useDutchAuctionActions } from "@/lib/mechanisms/useDutchAuction";
import { useTokenSymbol } from "@/components/sellers/TokenAddressInput";
import { calculateBonds } from "@figaro/core";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatToken, parseToken } from "@/lib/shared/utils";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { useSellerBoundAssemblies } from "@/lib/seller/useSellerBoundAssemblies";
import { extractRootModality } from "@/lib/designer/assemblyDiscovery";
import { formatMass, formatVolume } from "@/lib/seller/unitConversion";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";

interface Props {
    sellerAddress: string;
}

/** Compact, spec-agnostic value summary of a clause's composed fields — the
 *  leaf scalar/enum values the buyer actually chose ("delivery",
 *  "zone-wifi"), joined for inline display. Empty objects (runtime anchors
 *  like a proof clause) and booleans summarize to "" — title-only rows. */
function clauseValueSummary(fields: unknown): string {
    const leaves: string[] = [];
    const walk = (value: unknown): void => {
        if (value === null || value === undefined || value === "") return;
        if (Array.isArray(value)) { value.forEach(walk); return; }
        if (typeof value === "object") { Object.values(value as Record<string, unknown>).forEach(walk); return; }
        if (typeof value === "boolean") return;
        leaves.push(String(value));
    };
    walk(fields);
    return leaves.join(" · ");
}

export function CheckoutView({ sellerAddress }: Props) {
    const sellerAddressLower = sellerAddress.toLowerCase();
    const sellerAddressTyped = sellerAddressLower.startsWith("0x")
        ? (sellerAddressLower as `0x${string}`)
        : undefined;

    const chainId = useChainId();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const { createAuction } = useDutchAuctionActions();
    const { coordinationMessaging, evidenceTransport } = useRuntimeServices();
    const { catalogues: sellerCatalogues, isLoading: cataloguesLoading } = useRegisteredCatalogues();

    const sellerCatalogue = useMemo(
        () => sellerCatalogues.find((r) => hexEqual(r.address, sellerAddressLower)) ?? null,
        [sellerCatalogues, sellerAddressLower],
    );

    const { address: buyer } = useCommerce();
    // The order settles in the seller's default token. `acceptedTokens` is the
    // set the buyer may swap into (the swap-and-commit path); the default is the
    // settlement currency. Env-var fallback only for fixture / pre-clause-split
    // catalogues with no defaultTokenAddress.
    const currency = (sellerCatalogue?.defaultTokenAddress
        ?? CONTRACTS.mockToken
        ?? CONTRACTS.permitToken) as `0x${string}`;
    const { data: resolvedSymbol } = useTokenSymbol(currency);
    const tokenSymbol = resolvedSymbol
        ?? sellerCatalogue?.acceptedTokens?.find((t) => hexEqual(t.address, currency))?.symbol
        ?? "";
    const {
        decimals: tokenDecimals,
        balance: tokenBalance,
        needsAuthorization: needsApproval,
        authorize: approve,
        authorization: { isPending: isApprovePending, isConfirming: isApproveConfirming, isSuccess: isApproveSuccess },
        signCommitment,
        initiateAsParty,
        order: { step: commitStep, error: commitError, payload },
    } = useCheckout(currency);

    const { items } = useCartStore();
    const { openConnectModal } = useConnectModal();

    const { assemblies: boundAssemblies } = useSellerBoundAssemblies(sellerAddressTyped);

    // The buyer's options ARE the seller's bound assemblies — each is one
    // option, labelled by the assembly's own name and keyed by its slug.
    // Coordination variants (seller-assigned / buyer-assigned / dutch-auction)
    // are DISTINCT assemblies, so picking the assembly picks the coordination;
    // the checkout hardcodes no taxonomy.
    const assemblyOptions: { slug: string; name: string }[] = useMemo(
        () => boundAssemblies.map((a) => ({ slug: a.slug, name: a.name })),
        [boundAssemblies],
    );
    // The buyer's chosen assembly slug, when the seller offers more than one.
    const [selectedSlug, setSelectedSlug] = useState<string | undefined>(undefined);
    // Auction start price for dutch-auction coordination — checkout-phase
    // input, like the cart line items.
    const [auctionStartPrice, setAuctionStartPrice] = useState("");

    // Clear a stale choice the seller no longer offers; auto-select the sole
    // option (a one-option dropdown is noise — the static line shows it).
    useEffect(() => {
        if (selectedSlug && !assemblyOptions.some((o) => o.slug === selectedSlug)) {
            setSelectedSlug(undefined);
        }
        if (assemblyOptions.length === 1 && selectedSlug !== assemblyOptions[0].slug) {
            setSelectedSlug(assemblyOptions[0].slug);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assemblyOptions]);

    const balance = tokenBalance ?? 0n;
    const isApproving = isApprovePending || isApproveConfirming;
    const pendingCheckout = useRef(false);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    // The buyer's checkout-time counterparty choice for a sub-order the
    // adopting seller's profile leaves unbound (buyer-assigned coordination).
    const [sellerSelection, setSellerSelection] = useState<SellerSelection | null>(null);
    useEffect(() => { setSellerSelection(null); }, [selectedSlug]);

    // Auto-chain: when approval confirms, proceed to commit signing.
    useEffect(() => {
        if (pendingCheckout.current && isApproveSuccess) {
            pendingCheckout.current = false;
            void executeCheckout();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isApproveSuccess]);

    // No post-place redirect: in the bilateral relay the buyer signs + shares,
    // then stays on the share panel; each order commits when its seller
    // counter-signs in their inbox. The buyer is never the broadcaster here.

    if (cataloguesLoading) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl">
                <p className="text-xs font-semibold text-neutral-500 mb-3">Checkout</p>
                <h1 className="text-3xl font-bold text-black">Loading…</h1>
            </div>
        );
    }

    if (!sellerCatalogue) {
        return (
            <div className="container mx-auto px-6 py-16 max-w-3xl space-y-4">
                <p className="text-xs font-semibold text-neutral-500 mb-3">Seller not found</p>
                <h1 className="text-3xl font-bold text-black">No seller registered for {truncateHex(sellerAddressLower, { head: 10, tail: 0 })}</h1>
                <Link href="/discover" className="inline-block underline text-sm text-black hover:text-neutral-600">
                    ← Back to discover
                </Link>
            </div>
        );
    }

    // Filter cart to items from THIS merchant only — the buyer's line-item input,
    // read-only here (edited on the browse page).
    const cartItems = items.filter((it) => it.sellerId === sellerCatalogue.id);
    // The assembly the buyer is ordering from attaches to the seller PROFILE. One
    // bound assembly -> use it; several -> the chosen modality disambiguates which.
    // Every order commits against a published assembly — there is no fallback.
    const pickedAssembly = boundAssemblies.length === 1
        ? boundAssemblies[0]
        : boundAssemblies.find((a) => a.slug === selectedSlug);
    // The picked assembly's coordination posture, read from its root order BY
    // FIELD NAME (never a clause id). buyer-assigned / dutch-auction / undefined
    // (seller-assigned or no delivery) decide which checkout-phase input shows.
    const coordination = pickedAssembly
        ? extractRootModality(pickedAssembly.assemblyTemplate).coordination
        : undefined;
    // Sub-orders the adopting seller's profile leaves UNBOUND take the buyer's
    // checkout-time choice (buyer-assigned coordination); the picker below
    // surfaces it. Bound sub-orders keep the profile's designation.
    const unboundSubOrders = (() => {
        if (!pickedAssembly || pickedAssembly.assemblyTemplate.orders.length <= 1) return [];
        try {
            return planSubOrderSellers(pickedAssembly).filter((p) => !p.seller);
        } catch {
            return [];
        }
    })();
    const buyerChoosesCounterparty =
        coordination === "buyer-assigned" && unboundSubOrders.length > 0;
    // Dutch-auction coordination: the unbound sub-order is deferred — the
    // buyer names the descending auction's start price instead of a seller.
    const buyerOpensAuction =
        coordination === "dutch-auction" && unboundSubOrders.length > 0;
    const auctionStartPriceValid = (() => {
        try { return parseToken(auctionStartPrice || "0", tokenDecimals) > 0n; } catch { return false; }
    })();
    // Ready to place when a profile-bound assembly is resolved (chosen, when the
    // seller offers more than one) and any buyer-chosen counterparty selection
    // (or auction start price) is complete.
    const orderReady = !!pickedAssembly
        && (!buyerChoosesCounterparty || !!sellerSelection)
        && (!buyerOpensAuction || auctionStartPriceValid);
    // The root order carries the design-time clauses the buyer is bonding to.
    // Surfaced inline below so the buyer reviews the terms before signing — the
    // visible terms + the explicit place-order click replace the modal gate.
    const pickedRoot = pickedAssembly
        ? (pickedAssembly.assemblyTemplate.orders.find((o) => templateParentOrderHashes(o).length === 0)
            ?? pickedAssembly.assemblyTemplate.orders[0])
        : undefined;
    const cartTotal = cartItems.reduce(
        (sum, item) => sum + parseToken(item.price || "0", tokenDecimals) * BigInt(item.quantity),
        0n,
    );

    // Multi-order price transparency: the buyer pays the lead's cut plus every
    // contributor's cut, each priced LIVE from that contributor's own catalogue.
    // Built from the SAME planSubOrderSellers + resolveSubOrderPayment the commit
    // walks, so the shown total equals what commits.
    const kitBreakdown = ((): { rows: Array<{ name: string; payment: bigint }>; total: bigint } | null => {
        const assembly = pickedAssembly;
        if (!assembly || assembly.assemblyTemplate.orders.length <= 1) return null;
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
            ...plan.map(({ node, seller }) => {
                if (seller) {
                    return {
                        name: nameOf(seller),
                        payment: resolveSubOrderPayment({ node, seller, sellerCatalogues, tokenDecimals }),
                    };
                }
                // Unbound node under dutch coordination: deferred to the
                // auction — its price is set by the claim, not the commit.
                if (buyerOpensAuction) {
                    return { name: "(dutch auction)", payment: 0n };
                }
                // Unbound node: the buyer's checkout-time choice fills it — the
                // shown figure is the SAME selection the commit will use.
                return sellerSelection
                    ? { name: nameOf(sellerSelection.seller), payment: parseToken(sellerSelection.price, tokenDecimals) }
                    : { name: "(choose below)", payment: 0n };
            }),
        ];
        return { rows, total: rows.reduce((s, r) => s + r.payment, 0n) };
    })();

    // The buyer commits EVERY order in the plan (buyer == rootBuyer on each
    // — the kernel star shape): 2× payment locked per order, payment to that
    // order's seller + an equal refundable bond. Aggregate over the WHOLE
    // plan — a root-only figure under-reports every multi-order checkout.
    const planTotal = kitBreakdown ? kitBreakdown.total : cartTotal;
    const lockedTotal = planTotal > 0n ? calculateBonds(planTotal, planTotal).buyerBond : 0n;
    const hasInsufficientBalance = !!buyer && tokenBalance !== undefined && balance < lockedTotal;

    // Every order in the assembly — root + sub-orders — surfaced for review:
    // the buyer signs and bonds ALL of them. Each clause renders its COMPOSED
    // values (the terms the buyer is agreeing to), spec-driven. Structural
    // clauses (`block.structural`, e.g. the topology manifest) are
    // protocol-composed, not buyer-chosen terms; they stay out of the review.
    const agreementGroups = ((): Array<{ key: string; label: string; clauses: Array<{ clauseId: string; values: string }> }> => {
        if (!pickedAssembly) return [];
        const orders = pickedAssembly.assemblyTemplate.orders;
        const lead = sellerCatalogue.address as `0x${string}`;
        const nameOf = (addr: `0x${string}`) =>
            sellerCatalogues.find((c) => hexEqual(c.address, addr))?.name ?? truncateHex(addr);
        let plan: ReturnType<typeof planSubOrderSellers> = [];
        if (orders.length > 1) {
            try { plan = planSubOrderSellers(pickedAssembly); } catch { plan = []; }
        }
        const sellerOf = new Map(plan.map(({ node, seller }) => [node.id, seller]));
        return orders.map((order, i) => {
            const isRoot = templateParentOrderHashes(order).length === 0;
            const assigned = isRoot ? lead : sellerOf.get(order.id);
            return {
                key: String(order.id ?? i),
                label: assigned ? nameOf(assigned) : "(to be assigned)",
                clauses: Object.entries(order.clauses)
                    .filter(([clauseId]) => !getClauseSpec(clauseId)?.block?.structural)
                    .map(([clauseId, fields]) => ({ clauseId, values: clauseValueSummary(fields) })),
            };
        });
    })();

    const cartUnitSystem = sellerCatalogue.unitSystem ?? "metric";
    const cartMassGrams = cartItems.reduce((sum, cartItem) => {
        const menuItem = sellerCatalogue.items.find((m) => m.id === cartItem.menuItemId);
        if (!menuItem?.massGrams) return sum;
        return sum + menuItem.massGrams * cartItem.quantity;
    }, 0);
    const cartVolumeMl = cartItems.reduce((sum, cartItem) => {
        const menuItem = sellerCatalogue.items.find((m) => m.id === cartItem.menuItemId);
        if (!menuItem?.volumeMl) return sum;
        return sum + menuItem.volumeMl * cartItem.quantity;
    }, 0);

    const executeCheckout = async () => {
        if (!buyer) {
            setCheckoutError("Connect your wallet to place an order.");
            return;
        }
        if (cartItems.length === 0) return;
        if (!orderReady) {
            setCheckoutError("Choose how you'd like to order before placing it.");
            return;
        }
        const leadSellerAddress = sellerCatalogue.address as `0x${string}`;
        // Every order commits against a published, profile-bound assembly — no
        // synthesized fallback. `orderReady` already guarantees this; assert it
        // for the type. The kernel sees a linear commit chain; the parent edges
        // are off-chain topology reconstructed from the assembly.
        if (!pickedAssembly) {
            setCheckoutError("This seller has no published assembly to order from.");
            return;
        }
        // `pickedRoot` (computed in render scope) carries the design-time clause
        // choices, spread verbatim — the checkout names no clause.
        if (!pickedRoot) {
            setCheckoutError("This assembly has no root order.");
            return;
        }
        try {
            setCheckoutError(null);
            // The whole commit algorithm — root prepare/validate, the bilateral
            // single-order relay, or the multi-order walk (sub-orders signed +
            // relayed to their bound sellers, root through the buyer-share-panel
            // last) — lives in lib/commerce/assemblyCheckout. The surface keeps
            // guards and error display only.
            await executeAssemblyCheckout(
                {
                    buyer,
                    leadSellerAddress,
                    currency,
                    payment: cartTotal,
                    lineItems: cartItems.map((item) => ({
                        itemId: item.menuItemId,
                        name: item.name,
                        quantity: item.quantity,
                        unitPrice: parseToken(item.price, tokenDecimals).toString(),
                        massGrams: item.massGrams,
                        volumeMl: item.volumeMl,
                    })),
                    assembly: pickedAssembly,
                    sellerCatalogues,
                    tokenDecimals,
                    subOrderSelections: buyerChoosesCounterparty && sellerSelection
                        ? Object.fromEntries(unboundSubOrders.map(({ node }) => [
                            node.id,
                            { seller: sellerSelection.seller, price: sellerSelection.price },
                        ]))
                        : undefined,
                    subOrderAuctions: buyerOpensAuction
                        ? Object.fromEntries(unboundSubOrders.map(({ node }) => [
                            node.id,
                            { startPrice: auctionStartPrice },
                        ]))
                        : undefined,
                },
                {
                    chainId,
                    signCommitment,
                    initiateAsParty,
                    walletClient,
                    coordinationMessaging,
                    evidenceTransport,
                    openSellerAuction: async ({ auctionId, startPrice, processId, currency: auctionCurrency }) => {
                        const hash = await createAuction(auctionId, startPrice, processId, auctionCurrency);
                        if (publicClient && hash) {
                            await publicClient.waitForTransactionReceipt({ hash });
                        }
                    },
                },
            );
        } catch (cause: unknown) {
            const msg = extractErrorMessage(cause, "Signing failed");
            setCheckoutError(msg);
        }
    };

    const handlePlaceOrder = () => {
        if (!buyer) {
            openConnectModal?.();
            return;
        }
        if (cartItems.length === 0) return;
        if (hasInsufficientBalance) {
            setCheckoutError(
                `Insufficient funds. Required: ${formatToken(lockedTotal, tokenDecimals)}, available: ${formatToken(balance, tokenDecimals)}`,
            );
            return;
        }
        setCheckoutError(null);
        if (needsApproval(lockedTotal)) {
            try {
                pendingCheckout.current = true;
                approve(lockedTotal * 10n);
            } catch {
                pendingCheckout.current = false;
                setCheckoutError("Payment authorization failed. Please try again.");
            }
        } else {
            void executeCheckout();
        }
    };

    // Place-order accepts a NEW order only from a clean slate. Every
    // in-flight state (signing → awaiting-counter → ready → broadcasting)
    // AND the completed one (done) keep the button disabled — re-clicking
    // would sign a SECOND commitment for the same cart. A fresh order
    // starts from the browse page (new cart, fresh mount); `error`
    // re-enables for retry.
    const placingOrder = commitStep !== "idle" && commitStep !== "error";

    return (
        <div data-testid="checkout-view" data-seller-address={sellerAddressLower} className="container mx-auto px-6 py-10 max-w-2xl space-y-6">
            <div>
                <Link href={`/s/${sellerAddressLower}`} className="text-sm text-neutral-500 hover:text-black">
                    ← Back to {sellerCatalogue.name}
                </Link>
            </div>

            <header className="space-y-1">
                <p className="text-xs font-semibold text-neutral-500">Checkout</p>
                <h1 className="text-2xl font-bold text-black">Order from {sellerCatalogue.name}</h1>
            </header>

            <section
                className="rounded-lg border border-neutral-200 bg-white p-5 space-y-4"
                data-testid="checkout-cart"
            >
                {cartItems.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                        Your cart is empty.{" "}
                        <Link href={`/s/${sellerAddressLower}`} className="underline text-black hover:text-neutral-600">
                            Browse {sellerCatalogue.name}&apos;s catalogue
                        </Link>{" "}
                        to add items.
                    </p>
                ) : (
                    <>
                        {/* Read-only line items — the buyer's selection, edited on browse. */}
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
                                    <span className="text-neutral-900 font-semibold tabular-nums shrink-0">
                                        {(parseFloat(item.price || "0") * item.quantity).toFixed(4)}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <div className="border-t border-neutral-200 pt-3 space-y-1.5 text-sm">
                            {kitBreakdown ? (
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
                                <span className="text-neutral-900 tabular-nums" data-testid="checkout-bond-refundable">
                                    {formatToken(planTotal, tokenDecimals)}
                                </span>
                            </div>
                            <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-semibold">
                                <span className="text-black">Locked at commit</span>
                                <span className="text-black tabular-nums" data-testid="checkout-locked-total">
                                    {formatToken(lockedTotal, tokenDecimals)}
                                </span>
                            </div>
                            <p className="text-[11px] text-neutral-500 pt-1.5 leading-relaxed" data-testid="checkout-bond-rationale">
                                Both you and the seller lock a bond against this deal, so cooperation is the
                                seller&apos;s only profitable move — no arbitrator, no timeout, no admin. You
                                alone resolve it; your bond returns when you do, and you pay only the price above.
                            </p>
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

                        {/* Inline agreement terms — the clauses the buyer is
                            bonding to, read straight from the assembly. This is
                            the pre-sign review (replaces the modal gate): the
                            buyer sees the terms, then place-order signs them. */}
                        {agreementGroups.length > 0 && (
                            <div className="space-y-2 border-t border-neutral-200 pt-3" data-testid="checkout-agreement-terms">
                                <p className="text-xs font-semibold text-neutral-500">Agreement</p>
                                {agreementGroups.map((group) => (
                                    <div key={group.key} className="space-y-0.5" data-testid={`agreement-order-${group.key}`}>
                                        {agreementGroups.length > 1 && (
                                            <p className="text-[11px] font-medium text-neutral-500">{group.label}</p>
                                        )}
                                        <ul className="text-xs text-neutral-600 space-y-0.5">
                                            {group.clauses.map(({ clauseId, values }) => (
                                                <li key={clauseId} data-testid={`agreement-clause-${clauseId}`}>
                                                    {getClauseSpec(clauseId)?.title ?? clauseId}
                                                    {values && <span className="text-neutral-900"> — {values}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                                <p className="text-[11px] text-neutral-400">
                                    Placing the order signs {agreementGroups.length > 1 ? "these agreements" : "this agreement"} and locks your bond.
                                </p>
                            </div>
                        )}

                        {/* Which bound assembly to order from — shown only when the
                            seller offers more than one. The options + labels come
                            from the assemblies themselves; the checkout hardcodes
                            no modality. */}
                        {assemblyOptions.length === 1 && (
                            <div>
                                <p className="text-xs font-semibold text-neutral-500 mb-1">Method</p>
                                <p
                                    className="text-sm text-black"
                                    data-testid="method-static"
                                    data-method={assemblyOptions[0].slug}
                                >
                                    {assemblyOptions[0].name}
                                </p>
                            </div>
                        )}
                        {assemblyOptions.length > 1 && (
                            <div>
                                <label
                                    htmlFor="method-select"
                                    className="text-xs font-semibold text-neutral-500 mb-1 block"
                                >
                                    Method
                                </label>
                                <select
                                    id="method-select"
                                    value={selectedSlug ?? ""}
                                    onChange={(e) =>
                                        setSelectedSlug(e.target.value === "" ? undefined : e.target.value)
                                    }
                                    className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                                    data-testid="select-method"
                                >
                                    <option value="" data-testid="option-method-unset">
                                        Select one
                                    </option>
                                    {assemblyOptions.map((opt) => (
                                        <option key={opt.slug} value={opt.slug} data-testid={`option-method-${opt.slug}`}>
                                            {opt.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Buyer-assigned coordination: the profile leaves the
                            delivery sub-order unbound — the buyer chooses the
                            counterparty here, priced from that seller's own
                            catalogue. Checkout-phase data, like the cart. */}
                        {buyerChoosesCounterparty && (
                            <SellerCataloguePicker
                                mode="buyer-assigned"
                                partnerAddresses={[]}
                                tokenSymbol={tokenSymbol}
                                onSelect={setSellerSelection}
                            />
                        )}

                        {/* Dutch-auction coordination: the sub-order defers to a
                            descending-price auction — the buyer names its start
                            price; a seller claims it on the order page. */}
                        {buyerOpensAuction && (
                            <div>
                                <label
                                    htmlFor="delivery-max-price"
                                    className="text-xs font-semibold text-neutral-500 mb-1 block"
                                >
                                    Auction start price{tokenSymbol ? ` (${tokenSymbol})` : ""}
                                </label>
                                <input
                                    id="delivery-max-price"
                                    type="text"
                                    inputMode="decimal"
                                    value={auctionStartPrice}
                                    onChange={(e) => setAuctionStartPrice(e.target.value)}
                                    placeholder="Descending start price"
                                    data-testid="input-delivery-max-price"
                                    className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                                />
                            </div>
                        )}

                        <Button
                            onClick={handlePlaceOrder}
                            disabled={
                                isApproving
                                || placingOrder
                                || cartItems.length === 0
                                || !orderReady
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
                                        : !orderReady
                                            ? "Select an option to order"
                                            : "Place order"}
                        </Button>

                        {(checkoutError || commitError) && (
                            <p className="text-sm text-red-600" data-testid="seller-checkout-error">
                                {checkoutError ?? commitError}
                            </p>
                        )}

                        {commitStep === "awaiting-counter" && payload && (
                            <div className="pt-2" data-testid="buyer-share-panel">
                                <CommitmentSharePanel
                                    payload={payload}
                                    step={commitStep}
                                    tokenDecimals={tokenDecimals}
                                />
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}
