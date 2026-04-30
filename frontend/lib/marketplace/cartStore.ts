import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "./types";
import type { CanonicalFulfilmentMethod } from "@/lib/core/orderAgreement";

/**
 * Cart's fulfilment mode mirrors the canonical `figaro-fulfilment-v1` enum
 * verbatim — five values: consume-onsite, pickup, and three `deliver:*`
 * variants. Replaces the prior 2-value `pickup | delivery` shape so the
 * cart can drive both 1-node (`direct-sale`) and N-node (`local-commerce`)
 * assembly bindings. See `fulfilmentRouting.ts` for the assembly-slug map.
 */
export type FulfillmentMode = CanonicalFulfilmentMethod;

interface CartStore {
    items: CartItem[];
    deliveryMaxPrice: string;
    fulfillmentMode: FulfillmentMode;
    addItem: (item: CartItem) => void;
    removeItem: (menuItemId: string, restaurantId: string) => void;
    clearCart: () => void;
    getTotalPrice: () => string;
    getItemCount: () => number;
    setDeliveryMaxPrice: (price: string) => void;
    setFulfillmentMode: (mode: FulfillmentMode) => void;
}

export const useCartStore = create<CartStore>()(
    persist(
        (set, get) => ({
            items: [],
            deliveryMaxPrice: "0.002",
            fulfillmentMode: "deliver:seller-assigned" as FulfillmentMode,

            addItem: (newItem) =>
                set((state) => {
                    const existingIndex = state.items.findIndex(
                        (item) =>
                            item.menuItemId === newItem.menuItemId &&
                            item.restaurantId === newItem.restaurantId
                    );
                    if (existingIndex >= 0) {
                        const updated = [...state.items];
                        updated[existingIndex] = {
                            ...updated[existingIndex],
                            quantity: updated[existingIndex].quantity + newItem.quantity,
                        };
                        return { items: updated };
                    }
                    return { items: [...state.items, newItem] };
                }),

            removeItem: (menuItemId, restaurantId) =>
                set((state) => {
                    const existingIndex = state.items.findIndex(
                        (item) =>
                            item.menuItemId === menuItemId &&
                            item.restaurantId === restaurantId
                    );
                    if (existingIndex < 0) return state;
                    const updated = [...state.items];
                    if (updated[existingIndex].quantity > 1) {
                        updated[existingIndex] = {
                            ...updated[existingIndex],
                            quantity: updated[existingIndex].quantity - 1,
                        };
                    } else {
                        updated.splice(existingIndex, 1);
                    }
                    return { items: updated };
                }),

            clearCart: () => set({ items: [], deliveryMaxPrice: "0.002", fulfillmentMode: "deliver:seller-assigned" as FulfillmentMode }),

            setDeliveryMaxPrice: (price) => set({ deliveryMaxPrice: price }),

            setFulfillmentMode: (mode) => set({ fulfillmentMode: mode }),

            getTotalPrice: () => {
                const items = get().items;
                const total = items.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);
                return total.toFixed(4);
            },

            getItemCount: () => {
                const items = get().items;
                return items.reduce((sum, item) => sum + item.quantity, 0);
            },
        }),
        { name: "figaro-marketplace-cart" }
    )
);
