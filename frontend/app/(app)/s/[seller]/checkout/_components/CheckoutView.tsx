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
import { useCartStore } from "@/lib/seller/cartStore";
import type { CanonicalMethod } from "@/lib/core/orderAgreement";
import { useRegisteredCatalogues } from "@/lib/mechanisms/useRegisteredCatalogues";
import { planSubOrderSellers, resolveSubOrderPayment } from "@/lib/commerce/assemblySubOrderPlan";
import { executeAssemblyCheckout } from "@/lib/commerce/assemblyCheckout";
import { templateParentOrderIds } from "@/lib/designer/assemblyTemplate";
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
import { useSellerBoundAssemblies } from "@/lib/mechanisms/useAssemblyRegistry";
import { formatMass, formatVolume } from "@/lib/seller/unitConversion";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";

interface Props {
    sellerAddress: string;
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

    const { items, getTotalPrice, method, setMethod, deliveryMaxPrice, setDeliveryMaxPrice } = useCartStore();
    const { openConnectModal } = useConnectModal();

    const totalPrice = getTotalPrice();
    const totalPriceAmount = items.length > 0 && totalPrice ? parseToken(totalPrice, tokenDecimals) : 0n;
    const buyerBondAmount = totalPriceAmount > 0n
        ? calculateBonds(totalPriceAmount, totalPriceAmount).buyerBond
        : 0n;

    const { assemblies: boundAssemblies } = useSellerBoundAssemblies(sellerAddressTyped);

    // The buyer's method options ARE the seller's bound assemblies — each
    // assembly that carries a modality is one option, labelled by the
    // assembly's own name. The modality string comes from the assembly; the
    // checkout hardcodes no taxonomy.
    const methodOptions: { method: CanonicalMethod; name: string }[] = useMemo(
        () => boundAssemblies.flatMap((a) =>
            a.canonicalMethod
                ? [{ method: a.canonicalMethod as CanonicalMethod, name: a.name }]
                : [],
        ),
        [boundAssemblies],
    );

    // If the cart's persisted choice isn't offered by this seller, clear it.
    useEffect(() => {
        if (
            method
            && methodOptions.length > 0
            && !methodOptions.some((o) => o.method === method)
        ) {
            setMethod(undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [methodOptions]);

    const balance = tokenBalance ?? 0n;
    const hasInsufficientBalance = !!buyer && tokenBalance !== undefined && balance < buyerBondAmount;
    const isApproving = isApprovePending || isApproveConfirming;
    const pendingCheckout = useRef(false);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    // The buyer's checkout-time counterparty choice for a sub-order the
    // adopting seller's profile leaves unbound (buyer-assigned coordination).
    const [sellerSelection, setSellerSelection] = useState<SellerSelection | null>(null);
    useEffect(() => { setSellerSelection(null); }, [method]);

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
        : boundAssemblies.find((a) => a.canonicalMethod === method);
    // Sub-orders the adopting seller's profile leaves UNBOUND take the buyer's
    // checkout-time choice (buyer-assigned coordination); the picker below
    // surfaces it. Bound sub-orders keep the profile's designation.
    const unboundSubOrders = (() => {
        if (!pickedAssembly || pickedAssembly.assemblyDoc.orders.length <= 1) return [];
        try {
            return planSubOrderSellers(pickedAssembly).filter((p) => !p.seller);
        } catch {
            return [];
        }
    })();
    const buyerChoosesCounterparty =
        method === "deliver:buyer-assigned" && unboundSubOrders.length > 0;
    // Dutch-auction coordination: the unbound sub-order is deferred — the
    // buyer names the descending auction's start price instead of a seller.
    const buyerOpensAuction =
        method === "deliver:dutch-auction" && unboundSubOrders.length > 0;
    const auctionStartPriceValid = (() => {
        try { return parseToken(deliveryMaxPrice || "0", tokenDecimals) > 0n; } catch { return false; }
    })();
    // Ready to place when a profile-bound assembly is resolved, its method
    // (only if it composes one) is chosen, and any buyer-chosen counterparty
    // selection (or auction start price) is complete.
    const orderReady = !!pickedAssembly
        && (!pickedAssembly.canonicalMethod || !!method)
        && (!buyerChoosesCounterparty || !!sellerSelection)
        && (!buyerOpensAuction || auctionStartPriceValid);
    // The root order carries the design-time clauses the buyer is bonding to.
    // Surfaced inline below so the buyer reviews the terms before signing — the
    // visible terms + the explicit place-order click replace the modal gate.
    const pickedRoot = pickedAssembly
        ? (pickedAssembly.assemblyDoc.orders.find((o) => templateParentOrderIds(o).length === 0)
            ?? pickedAssembly.assemblyDoc.orders[0])
        : undefined;
    const orderClauseIds = pickedRoot ? Object.keys(pickedRoot.clauses) : [];
    const cartTotal = cartItems.reduce(
        (sum, item) => sum + parseToken(item.price || "0", tokenDecimals) * BigInt(item.quantity),
        0n,
    );
    const buyerBond = cartTotal > 0n
        ? calculateBonds(cartTotal, cartTotal).buyerBond
        : 0n;

    // Multi-order price transparency: the buyer pays the lead's cut plus every
    // contributor's cut, each priced LIVE from that contributor's own catalogue.
    // Built from the SAME planSubOrderSellers + resolveSubOrderPayment the commit
    // walks, so the shown total equals what commits.
    const kitBreakdown = ((): { rows: Array<{ name: string; payment: bigint }>; total: bigint } | null => {
        const assembly = pickedAssembly;
        if (!assembly || assembly.assemblyDoc.orders.length <= 1) return null;
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
                        payment: resolveSubOrderPayment({ node, seller, leadAddress: lead, sellerCatalogues, tokenDecimals }),
                    };
                }
                // Unbound node under dutch coordination: deferred to the
                // auction — its price is set by the claim, not the commit.
                if (method === "deliver:dutch-auction") {
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
                        classOfService: item.classOfService,
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
                            { startPrice: deliveryMaxPrice },
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

    const placingOrder = commitStep === "signing" || commitStep === "broadcasting" || commitStep === "ready";

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

                        {/* Inline agreement terms — the clauses the buyer is
                            bonding to, read straight from the assembly. This is
                            the pre-sign review (replaces the modal gate): the
                            buyer sees the terms, then place-order signs them. */}
                        {orderClauseIds.length > 0 && (
                            <div className="space-y-1 border-t border-neutral-200 pt-3" data-testid="checkout-agreement-terms">
                                <p className="text-xs font-semibold text-neutral-500">Agreement</p>
                                <ul className="text-xs text-neutral-600 space-y-0.5">
                                    {orderClauseIds.map((clauseId) => (
                                        <li key={clauseId} data-testid={`agreement-clause-${clauseId}`}>
                                            {getClauseSpec(clauseId)?.title ?? clauseId}
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-[11px] text-neutral-400">
                                    Placing the order signs this agreement and locks your bond.
                                </p>
                            </div>
                        )}

                        {/* Which bound assembly to order from — shown only when the
                            seller offers more than one. The options + labels come
                            from the assemblies themselves; the checkout hardcodes
                            no modality. */}
                        {methodOptions.length > 0 && (
                            <div>
                                <label
                                    htmlFor="method-select"
                                    className="text-xs font-semibold text-neutral-500 mb-1 block"
                                >
                                    Method
                                </label>
                                <select
                                    id="method-select"
                                    value={method ?? ""}
                                    onChange={(e) =>
                                        setMethod(
                                            e.target.value === ""
                                                ? undefined
                                                : (e.target.value as CanonicalMethod),
                                        )
                                    }
                                    className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                                    data-testid="select-method"
                                >
                                    <option value="" data-testid="option-method-unset">
                                        Select one
                                    </option>
                                    {methodOptions.map((opt) => (
                                        <option key={opt.method} value={opt.method} data-testid={`option-method-${opt.method}`}>
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
                                mode={method!}
                                partnerAddresses={[]}
                                sellerAddress={sellerCatalogue.address}
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
                                    value={deliveryMaxPrice}
                                    onChange={(e) => setDeliveryMaxPrice(e.target.value)}
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
