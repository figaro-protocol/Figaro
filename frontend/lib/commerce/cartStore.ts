import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A line in the buyer's cart — items selected from a seller's catalogue. */
export interface CartItem {
    menuItemId: string;
    sellerId: string;
    sellerAddress: string;
    sellerName: string;
    name: string;
    price: string;
    quantity: number;
    imageURI?: string;
    /** Physical attributes copied from the catalogue item at add-to-cart —
     *  checkout collapses them into the order's geo section (mass/volume
     *  sums). Optional: virtual or un-annotated items omit them. */
    massGrams?: number;
    volumeMl?: number;
}

interface CartStore {
    items: CartItem[];
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
