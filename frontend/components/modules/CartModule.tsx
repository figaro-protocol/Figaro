"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChainId } from "wagmi";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import { useCommerce, useCheckout } from "@/lib/commerce";
import { useCartStore, type FulfillmentMode } from "@/lib/seller/cartStore";
import type { CartItem } from "@/lib/seller/types";
import { ContentImage } from "@/components/shared/ContentImage";
import { broadcastSharedCommitment } from "@/lib/core/commitmentBroadcast";
import { CommitmentSharePanel } from "@/components/core/CommitmentSharePanel";
import { CONTRACTS } from "@/lib/core/contracts";
import { calculateBonds } from "@figaro/core";
import { computeCommitmentProcessId } from "@/lib/core/commitmentStore";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual } from "@/lib/shared/evm";
import { prepareOrderCommitment } from "@/lib/core/orderCommitmentPreparation";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { formatToken, parseToken } from "@/lib/shared/utils";
import { isE2EMockSession, isE2EDevnetSession } from "@/lib/shared/e2e";
import { useRegisteredCatalogues } from "@/lib/mechanisms/useRegisteredCatalogues";
import {
    FULFILMENT_MODE_LABELS,
    isDeliveryFulfilment,
    mapFulfilmentToAssemblySlug,
    mapFulfilmentToHandoff,
} from "@/lib/seller/fulfilmentRouting";
import { type CatalogueClassOfService, CLASS_PRIORITY, CLASS_TO_SHORT_CODE } from "@/lib/shared/sellerCatalogueMetadata";


const ALL_FULFILMENT_MODES: FulfillmentMode[] = [
    "consume-onsite",
    "pickup",
    "virtual",
    "deliver:buyer-assigned",
    "deliver:seller-assigned",
    "deliver:dutch-auction",
];

function MinusIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
        </svg>
    );
}

function PlusIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

function CartIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="21" r="1" />
            <circle cx="19" cy="21" r="1" />
            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
        </svg>
    );
}

function XIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
}

export function CartModule({ moduleId, context }: ModuleProps) {
    const { accentTone, cardStyle, labelStyle } = deriveModuleChrome(context);
    const { items, addItem, removeItem, clearCart, getTotalPrice, getItemCount, deliveryMaxPrice, setDeliveryMaxPrice, fulfillmentMode, setFulfillmentMode } = useCartStore();
    const [isOpen, setIsOpen] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState("");
    const [step, setStep] = useState<"cart" | "delivery" | "checkout">("cart");
    const [checkoutError, setCheckoutError] = useState<string | null>(null);

    const { address: buyer } = useCommerce();
    const currency = (CONTRACTS.mockToken || CONTRACTS.permitToken) as `0x${string}`;
    const {
        decimals: tokenDecimals,
        balance: tokenBalance,
        needsAuthorization: needsApproval,
        authorize: approve,
        authorization: { isPending: isApprovePending, isConfirming: isApproveConfirming, isSuccess: isApproveSuccess },
        signAndPlace,
        initiateAsParty,
        broadcast,
        order: { step: commitStep, error: commitError, payload },
        resetOrder: resetCommitment,
    } = useCheckout(currency);

    const itemCount = getItemCount();
    const totalPrice = getTotalPrice();
    const totalPriceAmount = items.length > 0 && totalPrice ? parseToken(totalPrice, tokenDecimals) : 0n;
    const buyerBondAmount = totalPriceAmount > 0n ? calculateBonds(totalPriceAmount, totalPriceAmount).buyerBond : 0n;
    const isDelivery = fulfillmentMode ? isDeliveryFulfilment(fulfillmentMode) : false;
    const deliveryDetailsIncomplete = isDelivery && (!deliveryAddress.trim() || Number(deliveryMaxPrice) <= 0);

    // Look up the merchant for items[0] so we can filter the picker to the
    // fulfilment modes they advertise. Falls back to all 5 canonical modes
    // when the catalogue lookup hasn't resolved yet (or the merchant has no
    // declared modes — surface everything rather than block the buyer).
    const cataloguesResult = useRegisteredCatalogues({});
    const catalogues = cataloguesResult?.catalogues ?? [];
    const merchantAddress = items[0]?.sellerAddress?.toLowerCase();
    const merchant = useMemo(
        () => merchantAddress ? catalogues.find((c) => hexEqual(c.address, merchantAddress)) : undefined,
        [merchantAddress, catalogues],
    );
    const supportedModes = useMemo<FulfillmentMode[]>(() => {
        if (!merchantAddress) return ALL_FULFILMENT_MODES;
        const declared = merchant?.fulfillmentModes ?? [];
        const canonical = declared.filter((m): m is FulfillmentMode =>
            (ALL_FULFILMENT_MODES as readonly string[]).includes(m),
        );
        return canonical.length > 0 ? canonical : ALL_FULFILMENT_MODES;
    }, [merchantAddress, merchant]);

    // Aggregate logistics across the cart (metric storage). Mass + volume
    // sum across line × quantity; class picks the highest-priority entry.
    const cartLogistics = useMemo(() => {
        let massGrams = 0;
        let volumeMl = 0;
        let cls: CatalogueClassOfService = "standard";
        for (const cartItem of items) {
            const menuItem = merchant?.menu.find((m) => m.id === cartItem.menuItemId);
            if (!menuItem) continue;
            if (menuItem.massGrams) massGrams += menuItem.massGrams * cartItem.quantity;
            if (menuItem.volumeMl) volumeMl += menuItem.volumeMl * cartItem.quantity;
            if (menuItem.classOfService && CLASS_PRIORITY[menuItem.classOfService] > CLASS_PRIORITY[cls]) {
                cls = menuItem.classOfService;
            }
        }
        return { massGrams, volumeMl, classOfService: cls };
    }, [items, merchant]);

    // If the cart's persisted fulfilment mode isn't supported by the
    // selected merchant, CLEAR it. The buyer must explicitly pick a
    // supported mode via the dropdown's "Select one" placeholder — no
    // silent snap-to-first-available.
    useEffect(() => {
        if (fulfillmentMode && !supportedModes.includes(fulfillmentMode)) {
            setFulfillmentMode(undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supportedModes]);

    // Drives post-commit routing once the cart wires it up; unused for now
    // (the kernel doesn't read it). Surfaced as a `data-` attribute so e2e
    // can assert the cart picked the right slug.
    const targetAssemblySlug = fulfillmentMode ? mapFulfilmentToAssemblySlug(fulfillmentMode) : "direct-sale";

    const balance = tokenBalance ?? 0n;
    const hasInsufficientBalance = !!buyer && tokenBalance !== undefined && balance < buyerBondAmount;
    const isApproving = isApprovePending || isApproveConfirming;
    const pendingCheckout = useRef(false);

    // Auto-chain: when approval confirms, proceed to commitment signing
    useEffect(() => {
        if (pendingCheckout.current && isApproveSuccess) {
            pendingCheckout.current = false;
            void executeCheckout();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isApproveSuccess]);

    // Post-broadcast: route the buyer to the per-order page so they have a
    // confirmation surface + live status timeline. Replaces the prior
    // "panel closes silently" UX. Watches commitStep === "done", which is
    // set when the on-chain `commit` tx succeeds (root commitments only;
    // CartModule never produces sub-orders).
    const router = useRouter();
    const chainId = useChainId();
    const redirectedForCommitment = useRef<string | null>(null);
    useEffect(() => {
        if (commitStep !== "done") return;
        if (!payload?.commitment) return;
        // Dedupe: useEffect can fire multiple times for the same "done"
        // transition (e.g., panel re-renders). Track the salt+agreementHash
        // pair we've already redirected for.
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
            setDeliveryAddress("");
            setStep("cart");
            setIsOpen(false);
            resetCommitment();
            router.push(`/orders/${processId}`);
        } catch (cause) {
            // computeCommitmentProcessId throws if domain inputs are wrong;
            // fall back to the prior close-panel behaviour without redirect.
            console.error("Failed to compute processId for redirect", cause);
            clearCart();
            setDeliveryAddress("");
            setStep("cart");
            setIsOpen(false);
            resetCommitment();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commitStep, payload, chainId]);

    const handleToggle = () => {
        setStep("cart");
        setCheckoutError(null);
        resetCommitment();
        setIsOpen(!isOpen);
    };

    const executeCheckout = async () => {
        if (!buyer) return;
        if (!fulfillmentMode) {
            setCheckoutError("Select a fulfilment mode before placing the order.");
            return;
        }
        const sellerAddress = items[0].sellerAddress as `0x${string}`;
        const paymentWei = totalPriceAmount;
        const prepared = await prepareOrderCommitment({
            buyer,
            seller: sellerAddress,
            currency,
            payment: paymentWei,
            lineItems: items.map((item) => ({
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
                // Geo fields aggregated from the cart's catalogue annotations.
                // Same shape as MerchantDetailView's commit path.
                ...(cartLogistics.massGrams > 0 ? { mass: `${cartLogistics.massGrams} g` } : {}),
                ...(cartLogistics.volumeMl > 0 ? { volume: `${cartLogistics.volumeMl} ml` } : {}),
                class_: CLASS_TO_SHORT_CODE[cartLogistics.classOfService],
            },
        });

        try {
            setCheckoutError(null);
            setStep("checkout");

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
            // Post-broadcast cleanup + redirect to /orders/<processId> is
            // owned by the commitStep === "done" useEffect above. Both paths
            // converge there.
        } catch (err: unknown) {
            const msg = extractErrorMessage(err, "Signing failed");
            setCheckoutError(msg);
        }
    };

    const handlePlaceOrder = async () => {
        if (!buyer) {
            setCheckoutError("Sign in to place your order");
            return;
        }
        if (items.length === 0) return;
        if (hasInsufficientBalance) {
            setCheckoutError(`Insufficient funds. Required: ${formatToken(buyerBondAmount, tokenDecimals)}, Available: ${formatToken(balance, tokenDecimals)}`);
            return;
        }
        setCheckoutError(null);

        if (needsApproval(buyerBondAmount)) {
            try {
                pendingCheckout.current = true;
                approve(buyerBondAmount * 10n);
            } catch {
                pendingCheckout.current = false;
                setCheckoutError("Payment authorization failed. Please try again.");
            }
        } else {
            await executeCheckout();
        }
    };

    const handleAddOne = (item: CartItem) => {
        addItem({ ...item, quantity: 1 });
    };

    return (
        <div
            data-testid="cart-module"
            data-module-id={moduleId}
            data-fulfilment-mode={fulfillmentMode}
            data-target-assembly={targetAssemblySlug}
        >
            {/* Floating cart button */}
            <button
                onClick={handleToggle}
                className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all z-50"
                style={accentTone ? { backgroundColor: accentTone, borderColor: accentTone } : undefined}
                aria-label={`Shopping cart: ${itemCount} items`}
                data-testid="cart-fab"
            >
                <CartIcon className="w-6 h-6" />
                {itemCount > 0 && (
                    <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                        {itemCount}
                    </div>
                )}
            </button>

            {/* Slide-out panel */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-50"
                    onClick={handleToggle}
                    onKeyDown={(e) => { if (e.key === 'Escape') handleToggle(); }}
                >
                    <div
                        role="dialog"
                        aria-label="Shopping cart"
                        data-testid="cart-panel"
                        className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
                        style={cardStyle}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-neutral-200 flex justify-between items-center">
                            <div>
                                <p className="text-xs font-semibold text-neutral-500 mb-2" style={labelStyle}>
                                    {context.shellPresentation.title}
                                </p>
                                <h2 className="text-2xl font-bold text-black">
                                    {step === "checkout" ? "Confirm Order" : step === "delivery" ? "Delivery Details" : "Your Cart"}
                                </h2>
                            </div>
                            <button onClick={handleToggle} className="text-neutral-500 hover:text-black" aria-label="Close cart">
                                <XIcon className="w-6 h-6" />
                            </button>
                        </div>

                        {step === "checkout" ? (
                            <div className="flex-1 overflow-y-auto p-6 space-y-5">
                                <button
                                    data-testid="btn-back-to-cart-from-checkout"
                                    onClick={() => { setStep("cart"); resetCommitment(); }}
                                    className="text-neutral-500 hover:text-black text-sm flex items-center gap-1"
                                >
                                    ← Back to cart
                                </button>

                                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-2 text-sm">
                                    <p className="text-neutral-700">
                                        <strong>Total:</strong> {formatToken(totalPriceAmount, tokenDecimals)} &nbsp;|&nbsp;
                                        <strong>Security deposit:</strong> {formatToken(buyerBondAmount, tokenDecimals)}
                                    </p>
                                    <p className="text-neutral-500">
                                        Your order is ready. Share the QR code below
                                        with the seller to confirm.
                                    </p>
                                </div>

                                <CommitmentSharePanel
                                    payload={payload}
                                    step={commitStep}
                                    onBroadcast={() => {
                                        void broadcastSharedCommitment({
                                            payload: payload!,
                                            broadcast,
                                        }).then(() => {
                                            clearCart();
                                            setDeliveryAddress("");
                                            setStep("cart");
                                            setIsOpen(false);
                                        });
                                    }}
                                />

                                {(checkoutError || commitError) && (
                                    <p className="text-red-600 text-sm" data-testid="checkout-error">
                                        {checkoutError || commitError}
                                    </p>
                                )}
                            </div>
                        ) : step === "delivery" ? (
                            <div className="flex-1 overflow-y-auto p-6 space-y-5">
                                <button
                                    data-testid="btn-back-to-cart"
                                    onClick={() => setStep("cart")}
                                    className="text-neutral-500 hover:text-black text-sm flex items-center gap-1"
                                >
                                    ← Back to cart
                                </button>
                                <h3 className="text-xl font-bold text-black">Fulfillment</h3>

                                {/* Fulfillment mode selector — driven by the merchant's declared
                                     fulfillmentModes (read from their catalogue metadata). */}
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-2">How would you like to receive your order?</label>
                                    <div className="flex flex-col gap-2" data-testid="fulfillment-mode-selector">
                                        {supportedModes.map((mode) => {
                                            const selected = fulfillmentMode === mode;
                                            return (
                                                <button
                                                    key={mode}
                                                    data-testid={`btn-mode-${mode}`}
                                                    onClick={() => setFulfillmentMode(mode)}
                                                    className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors text-left ${selected ? "bg-blue-600 text-white border-blue-600" : "bg-white text-neutral-700 border-neutral-300 hover:border-blue-400"}`}
                                                    style={selected && accentTone
                                                        ? { backgroundColor: accentTone, borderColor: accentTone }
                                                        : undefined}
                                                >
                                                    {FULFILMENT_MODE_LABELS[mode]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {isDelivery && (
                                    <>
                                        <div>
                                            <label htmlFor="cart-delivery-address" className="block text-sm font-medium text-neutral-700 mb-1">
                                                Delivery address <span className="text-red-500">*</span>
                                            </label>
                                            <textarea
                                                id="cart-delivery-address"
                                                data-testid="input-delivery-address"
                                                className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-black text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                                rows={2}
                                                placeholder="123 Main St, Apt 4B, City, State, ZIP"
                                                value={deliveryAddress}
                                                onChange={(e) => setDeliveryAddress(e.target.value)}
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="cart-delivery-max-price" className="block text-sm font-medium text-neutral-700 mb-1">
                                                Delivery budget cap <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                id="cart-delivery-max-price"
                                                data-testid="input-delivery-max-price"
                                                type="number"
                                                min="0.001"
                                                step="0.001"
                                                className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-black text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="0.002"
                                                value={deliveryMaxPrice}
                                                onChange={(e) => setDeliveryMaxPrice(e.target.value)}
                                            />
                                            <p className="text-xs text-neutral-500 mt-1">
                                                Maximum amount you&apos;re willing to pay for delivery.
                                            </p>
                                        </div>
                                    </>
                                )}

                                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-xs text-neutral-500 space-y-1">
                                    <p>
                                        <strong className="text-neutral-700">Deposit:</strong> Both sides place a refundable security deposit.
                                        If either side doesn&apos;t follow through, they forfeit their deposit.
                                    </p>
                                </div>

                                <button
                                    data-testid="btn-confirm-delivery"
                                    onClick={() => setStep("cart")}
                                    disabled={!fulfillmentMode || deliveryDetailsIncomplete}
                                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400 text-white font-semibold py-3 rounded-lg transition-colors"
                                    style={!!fulfillmentMode && !deliveryDetailsIncomplete && accentTone
                                        ? { backgroundColor: accentTone, borderColor: accentTone }
                                        : undefined}
                                >
                                    {!fulfillmentMode ? "Select a fulfilment mode" : `Confirm ${isDelivery ? "Delivery Details" : "Fulfilment"}`}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                    {items.length === 0 ? (
                                        <div className="text-center py-12">
                                            <CartIcon className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
                                            <p className="text-neutral-500">Your cart is empty</p>
                                        </div>
                                    ) : (
                                        items.map((item, idx) => (
                                            <div key={`${item.menuItemId}-${idx}`} className="bg-neutral-50 p-4 rounded-lg flex justify-between items-center" data-testid={`cart-item-${item.menuItemId}`}>
                                                <div className="flex items-center gap-3">
                                                    {item.imageURI && (
                                                        <ContentImage src={item.imageURI} alt={item.name} className="w-10 h-10 rounded object-cover text-2xl flex items-center justify-center" />
                                                    )}
                                                    <div>
                                                        <h4 className="font-medium text-black">{item.name}</h4>
                                                        <p className="text-sm text-neutral-500">{item.sellerName}</p>
                                                        <p className="text-sm text-blue-600" style={labelStyle}>{item.price} ETH</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => removeItem(item.menuItemId, item.sellerId)}
                                                        className="p-1 bg-neutral-200 rounded hover:bg-neutral-300"
                                                        aria-label="Remove one"
                                                    >
                                                        <MinusIcon className="w-4 h-4 text-black" />
                                                    </button>
                                                    <span className="text-black w-8 text-center">{item.quantity}</span>
                                                    <button
                                                        onClick={() => handleAddOne(item)}
                                                        className="p-1 bg-blue-600 rounded hover:bg-blue-700"
                                                        style={accentTone ? { backgroundColor: accentTone, borderColor: accentTone } : undefined}
                                                        aria-label="Add one more"
                                                    >
                                                        <PlusIcon className="w-4 h-4 text-white" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {items.length > 0 && (
                                    <div className="p-6 border-t border-neutral-200 space-y-4">
                                        <div className="flex justify-between items-center font-bold text-lg">
                                            <span className="text-black">Total</span>
                                            <span className="text-blue-600" style={labelStyle} data-testid="cart-total">{totalPrice} ETH</span>
                                        </div>

                                        {isDelivery && !deliveryAddress.trim() ? (
                                            <button
                                                data-testid="btn-add-delivery-details"
                                                onClick={() => setStep("delivery")}
                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
                                                style={accentTone ? { backgroundColor: accentTone, borderColor: accentTone } : undefined}
                                            >
                                                Set Fulfillment Options →
                                            </button>
                                        ) : (
                                            <button
                                                data-testid="btn-place-order-cart"
                                                onClick={handlePlaceOrder}
                                                disabled={commitStep === "signing" || isApproving || hasInsufficientBalance || !fulfillmentMode}
                                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 text-white font-semibold py-3 rounded-lg"
                                                style={commitStep !== "signing" && !isApproving && !!fulfillmentMode && accentTone
                                                    ? { backgroundColor: accentTone, borderColor: accentTone }
                                                    : undefined}
                                            >
                                                {!fulfillmentMode ? "Select fulfilment to order" : isApproving ? "Authorizing payment..." : commitStep === "signing" ? "Signing…" : "Place Order"}
                                            </button>
                                        )}

                                        <button
                                            data-testid="btn-clear-cart"
                                            onClick={() => { clearCart(); setDeliveryAddress(""); }}
                                            className="w-full text-sm text-neutral-500 hover:text-neutral-700"
                                        >
                                            Clear Cart
                                        </button>

                                        {checkoutError && (
                                            <p className="text-red-600 text-sm" data-testid="checkout-error">
                                                {checkoutError}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
