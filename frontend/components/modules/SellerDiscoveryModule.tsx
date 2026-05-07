"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import type { SellerCatalogue } from "@/lib/seller/types";
import { useRegisteredCatalogues } from "@/lib/mechanisms/useRegisteredCatalogues";
import { MerchantBrandingModule, MerchantLogo } from "@/components/modules/MerchantBrandingModule";
import { OperatorServiceDisplay } from "@/components/modules/OperatorRegistrationModule";
import { ContentImage } from "@/components/shared/ContentImage";

function TokenBadge({ symbol }: { symbol: string }) {
    return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            {symbol}
        </span>
    );
}

interface RestaurantCardInlineProps {
    restaurant: SellerCatalogue;
    onSelect: () => void;
}

function RestaurantCardInline({ restaurant, onSelect }: RestaurantCardInlineProps) {
    const sellerAddr = restaurant.address.startsWith("0x")
        ? (restaurant.address as `0x${string}`)
        : undefined;

    const tokens = restaurant.acceptedTokens;

    return (
        <MerchantBrandingModule sellerAddress={sellerAddr}>
            <div
                onClick={onSelect}
                className="bg-white border border-neutral-200 rounded-lg p-4 hover:border-blue-500 hover:bg-neutral-50 transition-all cursor-pointer group shadow-sm"
                role="button"
                tabIndex={0}
                data-testid="restaurant-card"
                aria-label={`${restaurant.name}, ${restaurant.cuisine}, ${restaurant.deliveryTime} delivery`}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect();
                    }
                }}
            >
                <div className="flex items-start gap-4 mb-3">
                    <MerchantLogo sellerAddress={sellerAddr} fallbackEmoji={restaurant.image} size={48} />
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-black group-hover:text-blue-600 transition-colors">
                            {restaurant.name}
                        </h3>
                        <p className="text-sm text-neutral-500">{restaurant.cuisine}</p>
                    </div>
                </div>
                <p className="text-sm text-neutral-600 mb-3">{restaurant.description}</p>

                {/* Token acceptance — primary signal */}
                {tokens && tokens.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3" data-testid="token-badges">
                        {tokens.map((t) => (
                            <TokenBadge key={t.address} symbol={t.symbol} />
                        ))}
                    </div>
                )}

                {/* Fulfillment modes the merchant accepts — drives the cart's
                     mode picker and the assembly the buyer's commitment routes to. */}
                {restaurant.fulfillmentModes && restaurant.fulfillmentModes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3" data-testid="fulfillment-mode-badges">
                        {restaurant.fulfillmentModes.map((mode) => (
                            <span
                                key={mode}
                                className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200"
                                data-testid={`fulfillment-mode-badge-${mode}`}
                            >
                                {mode}
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-4 text-xs">
                    <div className="text-neutral-500">⏱️ {restaurant.deliveryTime}</div>
                    <div className="text-neutral-500">Min: {restaurant.minimumOrder} ETH</div>
                </div>
                <div className="mt-3 pt-3 border-t border-neutral-200">
                    {sellerAddr && <OperatorServiceDisplay address={sellerAddr} />}
                </div>
            </div>
        </MerchantBrandingModule>
    );
}

export function SellerDiscoveryModule({ moduleId, context }: ModuleProps) {
    const { selectedRoleKind } = context;
    const { discovery } = context.services;
    const accentTone = context.skinBundle?.branding.branding.accentColor;
    const labelStyle = accentTone ? { color: accentTone } : undefined;
    const { catalogues: allRestaurants, isLoading: cataloguesLoading } = useRegisteredCatalogues({
        service: discovery,
    });

    const [searchQuery, setSearchQuery] = useState("");
    const [cuisineFilter, setCuisineFilter] = useState<string | null>(null);
    const [tokenFilter, setTokenFilter] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<"default" | "tokens" | "deliveryTime">("default");
    const [selectedRestaurant, setSelectedRestaurant] = useState<SellerCatalogue | null>(null);
    const [autoSelectAttempted, setAutoSelectAttempted] = useState(false);

    // Honor `?operator=<address>` from /discover by pre-selecting that
    // operator's card once catalogues have loaded. Only runs once per mount
    // so the user can navigate away from the auto-selected merchant.
    const searchParams = useSearchParams();
    const requestedOperator = searchParams?.get("operator")?.toLowerCase();
    useEffect(() => {
        if (autoSelectAttempted) return;
        if (cataloguesLoading) return;
        if (!requestedOperator) {
            setAutoSelectAttempted(true);
            return;
        }
        const match = allRestaurants.find(
            (r) => r.address.toLowerCase() === requestedOperator,
        );
        if (match) setSelectedRestaurant(match);
        setAutoSelectAttempted(true);
    }, [autoSelectAttempted, cataloguesLoading, requestedOperator, allRestaurants]);

    const cuisines = useMemo(
        () => Array.from(new Set(allRestaurants.map((r) => r.cuisine))).sort(),
        [allRestaurants]
    );

    // All unique token symbols across restaurants
    const allTokenSymbols = useMemo(
        () => Array.from(new Set(
            allRestaurants.flatMap((r) => r.acceptedTokens?.map((t) => t.symbol) ?? [])
        )).sort(),
        [allRestaurants]
    );

    const filteredRestaurants = useMemo(() => {
        let list = allRestaurants.filter((r) => {
            if (searchQuery && !r.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (cuisineFilter && r.cuisine !== cuisineFilter) return false;
            if (tokenFilter && !r.acceptedTokens?.some((t) => t.symbol === tokenFilter)) return false;
            return true;
        });
        if (sortBy === "tokens") {
            list = [...list].sort((a, b) => (b.acceptedTokens?.length ?? 0) - (a.acceptedTokens?.length ?? 0));
        } else if (sortBy === "deliveryTime") {
            list = [...list].sort((a, b) => {
                const aMin = parseInt(a.deliveryTime) || 0;
                const bMin = parseInt(b.deliveryTime) || 0;
                return aMin - bMin;
            });
        }
        return list;
    }, [searchQuery, cuisineFilter, tokenFilter, sortBy, allRestaurants]);

    if (selectedRoleKind !== "buyer") return null;

    // If a restaurant is selected, delegate to MenuBrowsingModule via context
    if (selectedRestaurant) {
        return (
            <div
                data-testid="seller-discovery-module"
                data-module-id={moduleId}
                data-skin={context.skinBundle?.skinId}
            >
                <MenuBrowsingInline
                    restaurant={selectedRestaurant}
                    onBack={() => setSelectedRestaurant(null)}
                    accentTone={accentTone}
                    shellLabel={context.shellPresentation.title}
                />
            </div>
        );
    }

    return (
        <div
            data-testid="seller-discovery-module"
            data-module-id={moduleId}
            data-skin={context.skinBundle?.skinId}
            className="space-y-6"
        >
            <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2" style={labelStyle}>
                    {context.shellPresentation.title}
                </p>
                <h2 className="text-2xl font-bold text-black mb-2">Order from the best restaurants</h2>
                <p className="text-neutral-600">Browse menus and place a bonded order with the merchant.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                        data-testid="restaurant-search"
                        type="text"
                        placeholder="Search restaurants…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white text-black placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
                <div className="flex gap-2 flex-wrap" data-testid="cuisine-filters">
                    <button
                        onClick={() => setCuisineFilter(null)}
                        className={`px-3 py-2 text-sm rounded-full border transition-colors min-h-[44px] ${cuisineFilter === null
                            ? "bg-black text-white border-black"
                            : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                            }`}
                        style={cuisineFilter === null && accentTone
                            ? { backgroundColor: accentTone, borderColor: accentTone }
                            : undefined}
                    >
                        All
                    </button>
                    {cuisines.map((c) => (
                        <button
                            key={c}
                            data-testid={`cuisine-filter-${c}`}
                            onClick={() => setCuisineFilter(cuisineFilter === c ? null : c)}
                            className={`px-3 py-2 text-sm rounded-full border transition-colors min-h-[44px] ${cuisineFilter === c
                                ? "bg-black text-white border-black"
                                : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                                }`}
                            style={cuisineFilter === c && accentTone
                                ? { backgroundColor: accentTone, borderColor: accentTone }
                                : undefined}
                        >
                            {c}
                        </button>
                    ))}
                </div>
                {allTokenSymbols.length > 0 && (
                    <div className="flex gap-2 flex-wrap" data-testid="token-filters">
                        <button
                            onClick={() => setTokenFilter(null)}
                            className={`px-3 py-2 text-sm rounded-full border transition-colors min-h-[44px] ${tokenFilter === null
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-blue-700 border-blue-200 hover:border-blue-400"
                                }`}
                            style={tokenFilter === null && accentTone
                                ? { backgroundColor: accentTone, borderColor: accentTone }
                                : undefined}
                        >
                            Any payment
                        </button>
                        {allTokenSymbols.map((sym) => (
                            <button
                                key={sym}
                                data-testid={`token-filter-${sym}`}
                                onClick={() => setTokenFilter(tokenFilter === sym ? null : sym)}
                                className={`px-3 py-2 text-sm rounded-full border transition-colors min-h-[44px] ${tokenFilter === sym
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white text-blue-700 border-blue-200 hover:border-blue-400"
                                    }`}
                                style={tokenFilter === sym && accentTone
                                    ? { backgroundColor: accentTone, borderColor: accentTone }
                                    : undefined}
                            >
                                {sym}
                            </button>
                        ))}
                    </div>
                )}
                <select
                    data-testid="sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "default" | "tokens" | "deliveryTime")}
                    className="px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white text-black focus:outline-none focus:ring-2 focus:ring-black min-h-[44px]"
                >
                    <option value="default">Sort by</option>
                    <option value="tokens">Most payment methods</option>
                    <option value="deliveryTime">Fastest delivery</option>
                </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRestaurants.map((r) => (
                    <RestaurantCardInline key={r.id} restaurant={r} onSelect={() => setSelectedRestaurant(r)} />
                ))}
            </div>

            {filteredRestaurants.length === 0 && (
                <div className="text-center py-12 text-neutral-500">
                    No restaurants match your search.
                </div>
            )}
        </div>
    );
}

// ── Inline menu browsing (embedded in the discovery module) ──────────────────

import { useCartStore } from "@/lib/seller/cartStore";
import type { CatalogueItem } from "@/lib/seller/types";

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

/** Renders an image from an IPFS/HTTP URI, or an emoji if the value is short text. */
function MenuBrowsingInline({
    restaurant,
    onBack,
    accentTone,
    shellLabel,
}: {
    restaurant: SellerCatalogue;
    onBack: () => void;
    accentTone?: string;
    shellLabel?: string;
}) {
    const { items, addItem, removeItem } = useCartStore();
    const cardStyle = accentTone ? { borderTopColor: accentTone, borderTopWidth: "2px" } : undefined;
    const labelStyle = accentTone ? { color: accentTone } : undefined;

    const categories = useMemo(
        () => Array.from(new Set(restaurant.menu.map((item) => item.category))),
        [restaurant.menu]
    );

    const getItemQuantity = (menuItemId: string) => {
        const cartItem = items.find(
            (item) => item.menuItemId === menuItemId && item.sellerId === restaurant.id
        );
        return cartItem?.quantity || 0;
    };

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

    return (
        <div className="space-y-6">
            <div className="bg-white border border-neutral-200 rounded-lg p-6 shadow-sm" style={cardStyle}>
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 text-sm min-h-[44px]"
                    style={labelStyle}
                    aria-label="Back to restaurants list"
                    data-testid="btn-back-to-restaurants"
                >
                    ← Back to restaurants
                </button>
                <div className="flex items-start gap-4">
                    <MerchantLogo
                        sellerAddress={restaurant.address.startsWith("0x") ? (restaurant.address as `0x${string}`) : undefined}
                        fallbackEmoji={restaurant.image}
                        size={72}
                    />
                    <div className="flex-1">
                        {shellLabel && (
                            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2" style={labelStyle}>
                                {shellLabel}
                            </p>
                        )}
                        <h2 className="text-2xl font-bold text-black mb-2">{restaurant.name}</h2>
                        <p className="text-neutral-600 mb-2">{restaurant.description}</p>
                        <div className="flex items-center gap-4 text-sm text-neutral-500">
                            <span>⏱️ {restaurant.deliveryTime}</span>
                            <span>Min order: {restaurant.minimumOrder} ETH</span>
                        </div>
                        {restaurant.acceptedTokens && restaurant.acceptedTokens.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {restaurant.acceptedTokens.map((t) => (
                                    <TokenBadge key={t.address} symbol={t.symbol} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {categories.map((category) => (
                <div key={category}>
                    <h3 className="text-lg font-semibold text-black mb-3">{category}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid={`menu-category-${category}`}>
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
                                            <ContentImage src={menuItem.image} alt={menuItem.name} className="w-12 h-12 rounded object-cover text-3xl flex items-center justify-center" />
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-black mb-1">{menuItem.name}</h4>
                                                <p className="text-sm text-neutral-500 mb-2">{menuItem.description}</p>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-blue-600 font-semibold" style={labelStyle}>{menuItem.price} ETH</span>
                                                    {quantity === 0 ? (
                                                        <button
                                                            onClick={() => handleAddItem(menuItem)}
                                                            disabled={!menuItem.available}
                                                            className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400 text-white rounded text-sm transition-colors min-h-[44px]"
                                                            style={menuItem.available && accentTone
                                                                ? { backgroundColor: accentTone, borderColor: accentTone }
                                                                : undefined}
                                                            aria-label={`Add ${menuItem.name} to cart`}
                                                            data-testid={`btn-add-${menuItem.id}`}
                                                        >
                                                            <PlusIcon className="w-3 h-3" /> Add
                                                        </button>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleRemoveItem(menuItem.id)}
                                                                className="w-7 h-7 flex items-center justify-center bg-neutral-200 hover:bg-neutral-300 text-black rounded min-h-[44px] min-w-[44px]"
                                                                aria-label="Remove one"
                                                            >
                                                                <MinusIcon className="w-3 h-3" />
                                                            </button>
                                                            <span className="w-8 text-center text-black font-semibold">{quantity}</span>
                                                            <button
                                                                onClick={() => handleAddItem(menuItem)}
                                                                className="w-7 h-7 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded min-h-[44px] min-w-[44px]"
                                                                style={accentTone ? { backgroundColor: accentTone, borderColor: accentTone } : undefined}
                                                                aria-label="Add one more"
                                                            >
                                                                <PlusIcon className="w-3 h-3" />
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
        </div>
    );
}
