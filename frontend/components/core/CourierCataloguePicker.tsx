"use client";

/**
 * CourierCataloguePicker — the delivery-courier selection step at checkout.
 *
 * A local-commerce delivery is a courier order (buyer↔courier) priced from
 * the courier's own operator catalogue. Two coordination modes, one
 * mechanism — they differ only in how the courier's address is obtained:
 *
 *   - seller-assigned — the buyer picks from the merchant's partner list
 *     (`counterpartyBindings`).
 *   - buyer-assigned  — the buyer enters any operator's address.
 *
 * Either way: the address resolves the operator's catalogue, the buyer
 * selects a delivery item from its price list, and a `buyer-set` item
 * (no fixed price) surfaces a token-amount input.
 *
 * Catalogues come from `useRegisteredCatalogues` — the discovered operator
 * set. Any operator that publishes a delivery service is a registered
 * operator, so an address outside that set has no catalogue to show.
 *
 * Reports the completed selection up via `onSelect`; reports `null` while
 * the selection is incomplete.
 */

import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useRegisteredCatalogues } from "@/lib/mechanisms/useRegisteredCatalogues";
import { resolveCatalogueItemPrice } from "@/lib/shared/operatorCatalogueMetadata";
import type { CatalogueItem } from "@/lib/seller/types";
import { hexEqual } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";

export interface CourierSelection {
    courier: `0x${string}`;
    /** The chosen delivery item from the courier's operator catalogue. */
    item: CatalogueItem;
    /** The effective price — the resolved catalogue figure, or the
     *  buyer-entered amount for a `buyer-set` item. */
    price: string;
}

interface Props {
    /** Canonical fulfilment method — `deliver:seller-assigned` or
     *  `deliver:buyer-assigned`. Decides how the address is acquired. */
    mode: string;
    /** Courier addresses the merchant designated — seller-assigned only. */
    partnerAddresses: string[];
    /** The merchant — negotiated prices are keyed to it. */
    merchantAddress: string;
    /** Token symbol for price display. */
    tokenSymbol: string;
    /** Reports the completed selection, or `null` while incomplete. */
    onSelect: (selection: CourierSelection | null) => void;
}

const FIELD = "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent";

export function CourierCataloguePicker({ mode, partnerAddresses, merchantAddress, tokenSymbol, onSelect }: Props) {
    const [courierAddress, setCourierAddress] = useState("");
    const [selectedItemId, setSelectedItemId] = useState("");
    const [buyerSetPrice, setBuyerSetPrice] = useState("");

    const validCourier = isAddress(courierAddress) ? (courierAddress as `0x${string}`) : undefined;
    const { catalogues: operatorCatalogues, isLoading } = useRegisteredCatalogues();

    const courierCatalogue = useMemo(
        () => (validCourier ? operatorCatalogues.find((c) => hexEqual(c.address, validCourier)) : undefined),
        [validCourier, operatorCatalogues],
    );
    const deliveryItems = useMemo(
        () => (courierCatalogue?.menu ?? []).filter((i) => i.category === "delivery"),
        [courierCatalogue],
    );
    const selectedItem = deliveryItems.find((i) => i.id === selectedItemId);
    const resolved = useMemo(
        () => (selectedItem ? resolveCatalogueItemPrice(selectedItem, merchantAddress) : undefined),
        [selectedItem, merchantAddress],
    );
    const isBuyerSet = resolved?.policy === "buyer-set";

    // Report the completed selection up. `onSelect` is expected to be a
    // stable setter; the deps are primitives + a stable item ref.
    useEffect(() => {
        if (!validCourier || !selectedItem || !resolved) {
            onSelect(null);
            return;
        }
        const price = isBuyerSet ? buyerSetPrice : resolved.price;
        if (isBuyerSet && !(parseFloat(price) > 0)) {
            onSelect(null);
            return;
        }
        onSelect({ courier: validCourier, item: selectedItem, price });
    }, [validCourier, selectedItem, resolved, isBuyerSet, buyerSetPrice, onSelect]);

    const courierLabel = (addr: string) =>
        operatorCatalogues.find((c) => hexEqual(c.address, addr))?.name ?? truncateHex(addr);

    const resetItem = () => { setSelectedItemId(""); setBuyerSetPrice(""); };

    return (
        <div className="space-y-2" data-testid="courier-catalogue-picker">
            <label className="text-xs font-semibold text-neutral-500 block">
                {mode === "deliver:seller-assigned" ? "Choose a courier" : "Courier address"}
            </label>

            {/* Address step — partner list (seller-assigned) or free input (buyer-assigned). */}
            {mode === "deliver:seller-assigned" ? (
                <select
                    value={courierAddress}
                    onChange={(e) => { setCourierAddress(e.target.value); resetItem(); }}
                    data-testid="select-courier-partner"
                    className={FIELD}
                >
                    <option value="">Select one of the merchant&apos;s couriers…</option>
                    {partnerAddresses.map((a) => (
                        <option key={a} value={a}>{courierLabel(a)}</option>
                    ))}
                </select>
            ) : (
                <input
                    type="text"
                    value={courierAddress}
                    onChange={(e) => { setCourierAddress(e.target.value); resetItem(); }}
                    placeholder="0x… — any operator's address"
                    data-testid="input-courier-address"
                    className={FIELD}
                />
            )}

            {/* Catalogue step — the courier's delivery price list. */}
            {validCourier && isLoading && deliveryItems.length === 0 && (
                <p className="text-xs text-neutral-500">Loading the courier&apos;s catalogue…</p>
            )}
            {validCourier && !isLoading && deliveryItems.length === 0 && (
                <p className="text-xs text-neutral-500" data-testid="courier-no-delivery">
                    This operator publishes no delivery service.
                </p>
            )}
            {deliveryItems.length > 0 && (
                <div className="space-y-1 rounded border border-neutral-200 p-2" data-testid="courier-delivery-list">
                    {deliveryItems.map((item) => {
                        const r = resolveCatalogueItemPrice(item, merchantAddress);
                        return (
                            <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                    type="radio"
                                    name="courier-delivery-item"
                                    value={item.id}
                                    checked={selectedItemId === item.id}
                                    onChange={() => { setSelectedItemId(item.id); setBuyerSetPrice(""); }}
                                    data-testid={`courier-item-${item.id}`}
                                />
                                <span className="text-black">{item.name}</span>
                                <span className="text-neutral-500 ml-auto tabular-nums">
                                    {r.policy === "buyer-set"
                                        ? "you set the price"
                                        : `${r.price}${tokenSymbol ? ` ${tokenSymbol}` : ""}`}
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}

            {/* buyer-set delivery item — the buyer names the token amount. */}
            {isBuyerSet && (
                <input
                    type="text"
                    inputMode="decimal"
                    value={buyerSetPrice}
                    onChange={(e) => setBuyerSetPrice(e.target.value)}
                    placeholder="Your delivery price"
                    aria-label="Your delivery price"
                    data-testid="input-courier-buyer-price"
                    className={FIELD}
                />
            )}
        </div>
    );
}
