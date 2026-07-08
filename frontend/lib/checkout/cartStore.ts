import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A line in the buyer's cart — items selected from a seller's catalogue.
 *  Internal to the store; consumers receive it structurally via `useCartStore`
 *  (they pass object literals to `addItem`, never the named type). */
interface CartItem {
    catalogueItemId: string;
    sellerId: string;
    sellerAddress: string;
    sellerName: string;
    name: string;
    price: string;
    quantity: number;
    imageURI?: string;
    /** Physical attributes copied from the catalogue item at add-to-cart —
     *  checkout folds them onto the order's cargo leaf (`figaro-cargo`).
     *  Optional: virtual, service, or un-annotated items omit them. Parcel
     *  dimensions (L/W/D) ride along for dimensional-weight derivation. */
    massGrams?: number;
    volumeMl?: number;
    lengthMm?: number;
    widthMm?: number;
    heightMm?: number;
    /** Catalogue-sourced clause values (freight class, hazmat, cold-chain, …),
     *  copied from the catalogue item — the checkout fold lands them on the
     *  matching clause leaves. Keyed by clauseId → field values. */
    clauseValues?: Record<string, Record<string, unknown>>;
}

interface CartStore {
    items: CartItem[];
    addItem: (item: CartItem) => void;
    /**
     * Decrement an item's quantity by 1, removing the line entirely if the
     * decrement reaches zero.
     */
    removeItem: (catalogueItemId: string, sellerId: string) => void;
    /**
     * Remove a cart line entirely regardless of quantity. Used by cart-aside
     * "remove" buttons where the user wants to drop a whole line in one click
     * rather than tapping the decrement button N times.
     */
    removeLine: (catalogueItemId: string, sellerId: string) => void;
    clearCart: () => void;
    getTotalPrice: () => string;
    getItemCount: () => number;
}

export const useCartStore = create<CartStore>()(
    persist(
        (set, get) => ({
            items: [],

            addItem: (newItem) =>
                set((state) => {
                    const existingIndex = state.items.findIndex(
                        (item) =>
                            item.catalogueItemId === newItem.catalogueItemId &&
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

            removeItem: (catalogueItemId, sellerId) =>
                set((state) => {
                    const existingIndex = state.items.findIndex(
                        (item) =>
                            item.catalogueItemId === catalogueItemId &&
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

            removeLine: (catalogueItemId, sellerId) =>
                set((state) => ({
                    items: state.items.filter(
                        (item) =>
                            !(item.catalogueItemId === catalogueItemId && item.sellerId === sellerId),
                    ),
                })),

            clearCart: () => set({ items: [] }),

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
