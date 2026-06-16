"use client";

/**
 * SellerCataloguePicker — the delivery-seller selection step at checkout.
 *
 * A local-commerce delivery is its own buyer↔seller order, priced from the
 * delivery seller's own catalogue. Two coordination modes, one mechanism —
 * they differ only in how the delivery seller's address is obtained:
 *
 *   - seller-assigned — the buyer picks from the lead seller's partner list
 *     (`counterpartyBindings`).
 *   - buyer-assigned  — the buyer enters any seller's address.
 *
 * Either way: the address resolves the seller's catalogue, and the buyer
 * selects a delivery item from its published price list.
 *
 * Catalogues come from `useRegisteredCatalogues` — the discovered seller
 * set. Any seller that publishes a delivery service is a registered
 * seller, so an address outside that set has no catalogue to show.
 *
 * Reports the completed selection up via `onSelect`; reports `null` while
 * the selection is incomplete.
 */

import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useRegisteredCatalogues } from "@/lib/seller/useRegisteredCatalogues";
import type { CatalogueItemMetadata } from "@/lib/seller/sellerCatalogueMetadata";
import { hexEqual } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";

export interface SellerSelection {
    seller: `0x${string}`;
    /** The chosen delivery item from the seller's catalogue. */
    item: CatalogueItemMetadata;
    /** The effective price — the item's published catalogue figure. */
    price: string;
}

interface Props {
    /** Canonical canonical method — `deliver:seller-assigned` or
     *  `deliver:buyer-assigned`. Decides how the address is acquired. */
    mode: string;
    /** Seller addresses the lead seller designated — seller-assigned only. */
    partnerAddresses: string[];
    /** Token symbol for price display. */
    tokenSymbol: string;
    /** Reports the completed selection, or `null` while incomplete. */
    onSelect: (selection: SellerSelection | null) => void;
}

const FIELD = "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent";

export function SellerCataloguePicker({ mode, partnerAddresses, tokenSymbol, onSelect }: Props) {
    const [selectedSellerAddress, setSelectedSellerAddress] = useState("");
    const [selectedItemId, setSelectedItemId] = useState("");

    const validSeller = isAddress(selectedSellerAddress) ? (selectedSellerAddress as `0x${string}`) : undefined;
    const { catalogues: sellerCatalogues, isLoading } = useRegisteredCatalogues();

    const sellerCatalogue = useMemo(
        () => (validSeller ? sellerCatalogues.find((c) => hexEqual(c.address, validSeller)) : undefined),
        [validSeller, sellerCatalogues],
    );
    const deliveryItems = useMemo(
        () => (sellerCatalogue?.menu ?? []).filter((i) => i.category === "delivery"),
        [sellerCatalogue],
    );
    const selectedItem = deliveryItems.find((i) => i.id === selectedItemId);

    // Report the completed selection up. `onSelect` is expected to be a
    // stable setter; the deps are primitives + a stable item ref.
    useEffect(() => {
        if (!validSeller || !selectedItem) {
            onSelect(null);
            return;
        }
        onSelect({ seller: validSeller, item: selectedItem, price: selectedItem.price });
    }, [validSeller, selectedItem, onSelect]);

    const sellerLabel = (addr: string) =>
        sellerCatalogues.find((c) => hexEqual(c.address, addr))?.name ?? truncateHex(addr);

    const resetItem = () => setSelectedItemId("");

    return (
        <div className="space-y-2" data-testid="seller-catalogue-picker">
            <label className="text-xs font-semibold text-neutral-500 block">
                {mode === "deliver:seller-assigned" ? "Choose a seller" : "Seller address"}
            </label>

            {/* Address step — partner list (seller-assigned) or free input (buyer-assigned). */}
            {mode === "deliver:seller-assigned" ? (
                <select
                    value={selectedSellerAddress}
                    onChange={(e) => { setSelectedSellerAddress(e.target.value); resetItem(); }}
                    data-testid="select-seller-partner"
                    className={FIELD}
                >
                    <option value="">Select a partner seller…</option>
                    {partnerAddresses.map((a) => (
                        <option key={a} value={a}>{sellerLabel(a)}</option>
                    ))}
                </select>
            ) : (
                <input
                    type="text"
                    value={selectedSellerAddress}
                    onChange={(e) => { setSelectedSellerAddress(e.target.value); resetItem(); }}
                    placeholder="0x… — any seller's address"
                    data-testid="input-seller-address"
                    className={FIELD}
                />
            )}

            {/* Catalogue step — the seller's delivery price list. */}
            {validSeller && isLoading && deliveryItems.length === 0 && (
                <p className="text-xs text-neutral-500">Loading the seller&apos;s catalogue…</p>
            )}
            {validSeller && !isLoading && deliveryItems.length === 0 && (
                <p className="text-xs text-neutral-500" data-testid="seller-no-delivery">
                    This seller publishes no delivery service.
                </p>
            )}
            {deliveryItems.length > 0 && (
                <div className="space-y-1 rounded border border-neutral-200 p-2" data-testid="seller-delivery-list">
                    {deliveryItems.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                                type="radio"
                                name="seller-delivery-item"
                                value={item.id}
                                checked={selectedItemId === item.id}
                                onChange={() => setSelectedItemId(item.id)}
                                data-testid={`seller-item-${item.id}`}
                            />
                            <span className="text-black">{item.name}</span>
                            <span className="text-neutral-500 ml-auto tabular-nums">
                                {`${item.price}${tokenSymbol ? ` ${tokenSymbol}` : ""}`}
                            </span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
