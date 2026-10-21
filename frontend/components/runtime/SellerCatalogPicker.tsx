"use client";

/**
 * SellerCatalogPicker — the counterparty-seller selection step at checkout.
 *
 * When an order names a second seller (the order's coordination clause is what
 * makes it a coordination sub-order, never this picker), that seller is its own
 * buyer↔seller order, priced from the seller's own catalog. Two coordination
 * modes, one mechanism — they differ only in how the seller's address is
 * obtained:
 *
 *   - seller-assigned — the buyer picks from the lead seller's partner list
 *     (`partnerAddresses`).
 *   - buyer-assigned  — the buyer enters any seller's address.
 *
 * Either way: the address resolves the seller's catalog, and the buyer
 * selects an item from its published price list — only from a seller whose
 * profile binds the order's assembly (`compositionHash`): every seller in a
 * process must have bound it, so a seller that has not is never offered.
 *
 * Catalogs come from `useRegisteredCatalogs` — the discovered member
 * set. Any wallet that publishes a catalog is a registered member, so an
 * address outside that set has no catalog to show.
 *
 * Reports the completed selection up via `onSelect`; reports `null` while
 * the selection is incomplete.
 */

import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useRegisteredCatalogs } from "@/lib/member/useRegisteredCatalogs";
import type { CatalogItemMetadata } from "@/lib/member/memberCatalogMetadata";
import { hexEqual } from "@/lib/shared/evm";
import { bindsAssembly } from "@/lib/member/memberListing";
import { deriveAssemblySlug } from "@/lib/shared/assembly";

export interface SellerSelection {
    seller: `0x${string}`;
    /** The chosen item from the seller's catalog. */
    item: CatalogItemMetadata;
    /** The effective price — the item's published catalog figure. */
    price: string;
}

interface Props {
    /** Token symbol for price display. */
    tokenSymbol: string;
    /** The composition hash of the assembly the order instantiates — the
     *  picked seller's profile must bind it. */
    compositionHash: `0x${string}`;
    /** Reports the completed selection, or `null` while incomplete. */
    onSelect: (selection: SellerSelection | null) => void;
}

const FIELD = "w-full rounded border border-default bg-surface px-3 py-2 text-sm text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:border-transparent";

export function SellerCatalogPicker({ tokenSymbol, compositionHash, onSelect }: Props) {
    const [selectedSellerAddress, setSelectedSellerAddress] = useState("");
    const [selectedItemId, setSelectedItemId] = useState("");

    const validSeller = isAddress(selectedSellerAddress) ? (selectedSellerAddress as `0x${string}`) : undefined;
    const { catalogs: memberCatalogs, isLoading } = useRegisteredCatalogs();

    const memberCatalog = useMemo(
        () => (validSeller ? memberCatalogs.find((c) => hexEqual(c.address, validSeller)) : undefined),
        [validSeller, memberCatalogs],
    );
    // The seller's published catalog is the selectable set — `category` is a
    // free-form seller label, never a closed tag the picker may branch on (the
    // coordination context comes from the order's coordination clause, not from
    // an item's category string).
    const sellerHasNotBound = !!memberCatalog && !bindsAssembly(memberCatalog, compositionHash);
    const catalogItems = useMemo(
        () => (memberCatalog && !sellerHasNotBound ? memberCatalog.items : []),
        [memberCatalog, sellerHasNotBound],
    );
    const selectedItem = catalogItems.find((i) => i.id === selectedItemId);
    // A list price is quoted in the seller's own default token, never in the
    // buyer's picked denomination: label it with that token's symbol.
    const basisSymbol = useMemo(() => {
        const basis = memberCatalog?.defaultTokenAddress;
        const declared = basis
            ? memberCatalog?.acceptedTokens?.find((t) => hexEqual(t.address, basis))?.symbol
            : undefined;
        return declared ?? tokenSymbol;
    }, [memberCatalog, tokenSymbol]);

    // Report the completed selection up. `onSelect` is expected to be a
    // stable setter; the deps are primitives + a stable item ref.
    useEffect(() => {
        if (!validSeller || !selectedItem) {
            onSelect(null);
            return;
        }
        onSelect({ seller: validSeller, item: selectedItem, price: selectedItem.price });
    }, [validSeller, selectedItem, onSelect]);

    const resetItem = () => setSelectedItemId("");

    return (
        <div className="space-y-2" data-testid="seller-catalog-picker">
            <label className="text-xs font-semibold text-ink-muted block">
                Seller address
            </label>

            {/* Address step — the buyer enters any seller's address. */}
            <input
                type="text"
                value={selectedSellerAddress}
                onChange={(e) => { setSelectedSellerAddress(e.target.value); resetItem(); }}
                placeholder="0x… — any seller's address"
                data-testid="input-seller-address"
                className={FIELD}
            />

            {/* Catalog step — the seller's published price list. */}
            {validSeller && isLoading && catalogItems.length === 0 && (
                <p className="text-xs text-ink-muted">Loading the seller&apos;s catalog…</p>
            )}
            {sellerHasNotBound && (
                <p className="text-xs text-ink-muted" data-testid="seller-not-bound">
                    This seller has not bound this assembly ({deriveAssemblySlug(compositionHash)}), so it would
                    refuse the order. Pick a seller that has.
                </p>
            )}
            {validSeller && !isLoading && !sellerHasNotBound && catalogItems.length === 0 && (
                <p className="text-xs text-ink-muted" data-testid="seller-no-items">
                    This seller publishes no catalog items.
                </p>
            )}
            {catalogItems.length > 0 && (
                <div className="space-y-1 rounded border border-default p-2" data-testid="seller-catalog-list">
                    {catalogItems.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                                type="radio"
                                name="seller-catalog-item"
                                value={item.id}
                                checked={selectedItemId === item.id}
                                onChange={() => setSelectedItemId(item.id)}
                                data-testid={`seller-item-${item.id}`}
                            />
                            <span className="text-ink-primary">{item.name}</span>
                            <span className="text-ink-muted ml-auto tabular-nums">
                                {`${item.price}${basisSymbol ? ` ${basisSymbol}` : ""}`}
                            </span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
