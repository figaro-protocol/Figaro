import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "./types";
import type { CanonicalMethod } from "@/lib/core/orderAgreement";

// The cart's selected method IS the canonical method (the modality value,
// refined by coordination for delivery) — one name, one concept; the type
// lives with its deriver in lib/core/orderAgreement.

interface CartStore {
    items: CartItem[];
    deliveryMaxPrice: string;
    /**
     * Buyer-selected method. `undefined` is the explicit
     * unset state — the buyer hasn't picked yet. The picker UIs render
     * a "Select one" placeholder option until the buyer chooses, and
     * checkout is disabled while undefined. Replaces the prior
     * preselect-default-mode behavior so the buyer is required to make
     * a deliberate choice.
     */
    method: CanonicalMethod | undefined;
    addItem: (item: CartItem) => void;
    /**
     * Decrement an item's quantity by 1, removing the line entirely if the
     * decrement reaches zero.
     */
    removeItem: (menuItemId: string, sellerId: string) => void;
    /**
     * Remove a cart line entirely regardless of quantity. Used by cart-aside
     * "remove" buttons where the user wants to drop a whole line in one click
     * rather than tapping the decrement button N times.
     */
    removeLine: (menuItemId: string, sellerId: string) => void;
    /** Set a cart line's unit price — buyer-set pricing, where the buyer
     *  names the price at checkout rather than the catalogue fixing it. */
    updateItemPrice: (menuItemId: string, sellerId: string, price: string) => void;
    clearCart: () => void;
    getTotalPrice: () => string;
    getItemCount: () => number;
    setDeliveryMaxPrice: (price: string) => void;
    setMethod: (mode: CanonicalMethod | undefined) => void;
}

export const useCartStore = create<CartStore>()(
    persist(
        (set, get) => ({
            items: [],
            deliveryMaxPrice: "0.002",
            method: undefined,

            addItem: (newItem) =>
                set((state) => {
                    const existingIndex = state.items.findIndex(
                        (item) =>
                            item.menuItemId === newItem.menuItemId &&
                            item.sellerId === newItem.sellerId
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

            removeItem: (menuItemId, sellerId) =>
                set((state) => {
                    const existingIndex = state.items.findIndex(
                        (item) =>
                            item.menuItemId === menuItemId &&
                            item.sellerId === sellerId
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

            removeLine: (menuItemId, sellerId) =>
                set((state) => ({
                    items: state.items.filter(
                        (item) =>
                            !(item.menuItemId === menuItemId && item.sellerId === sellerId),
                    ),
                })),

            updateItemPrice: (menuItemId, sellerId, price) =>
                set((state) => ({
                    items: state.items.map((item) =>
                        item.menuItemId === menuItemId && item.sellerId === sellerId
                            ? { ...item, price }
                            : item,
                    ),
                })),

            clearCart: () => set({ items: [], deliveryMaxPrice: "0.002", method: undefined }),

            setDeliveryMaxPrice: (price) => set({ deliveryMaxPrice: price }),

            setMethod: (mode) => set({ method: mode }),

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
        { name: "figaro-seller-cart" }
    )
);
