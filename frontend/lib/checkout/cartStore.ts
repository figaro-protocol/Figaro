import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A line in the buyer's cart — items selected from a seller's catalog.
 *  Internal to the store; consumers receive it structurally via `useCartStore`
 *  (they pass object literals to `addItem`, never the named type). */
interface CartItem {
    catalogItemId: string;
    sellerId: string;
    sellerAddress: string;
    sellerName: string;
    name: string;
    price: string;
    quantity: number;
    imageURI?: string;
    /** Catalog-sourced clause values (freight class, hazmat, cold-chain,
     *  a data product's license terms, …), copied from the catalog item —
     *  the checkout fold lands them on the matching clause leaves. Keyed by
     *  clause key → field values. */
    clauseValues?: Record<string, Record<string, unknown>>;
}

interface CartStore {
    items: CartItem[];
    addItem: (item: CartItem) => void;
    /**
     * Decrement an item's quantity by 1, removing the line entirely if the
     * decrement reaches zero.
     */
    removeItem: (catalogItemId: string, sellerId: string) => void;
    /**
     * Remove a cart line entirely regardless of quantity. Used by cart-aside
     * "remove" buttons where the user wants to drop a whole line in one click
     * rather than tapping the decrement button N times.
     */
    removeLine: (catalogItemId: string, sellerId: string) => void;
    clearCart: () => void;
}

export const useCartStore = create<CartStore>()(
    persist(
        (set) => ({
            items: [],

            addItem: (newItem) =>
                set((state) => {
                    const existingIndex = state.items.findIndex(
                        (item) =>
                            item.catalogItemId === newItem.catalogItemId &&
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

            removeItem: (catalogItemId, sellerId) =>
                set((state) => {
                    const existingIndex = state.items.findIndex(
                        (item) =>
                            item.catalogItemId === catalogItemId &&
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

            removeLine: (catalogItemId, sellerId) =>
                set((state) => ({
                    items: state.items.filter(
                        (item) =>
                            !(item.catalogItemId === catalogItemId && item.sellerId === sellerId),
                    ),
                })),

            clearCart: () => set({ items: [] }),
        }),
        { name: "figaro-seller-cart" }
    )
);
