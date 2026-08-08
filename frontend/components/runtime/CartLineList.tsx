/**
 * CartLineList — the read-only cart-line rendering shared by the browse
 * page's order summary (`/s/view`) and the checkout page's read-only cart
 * echo (`/s/checkout`). Each line is a name + quantity + line total; an
 * optional trailing subtotal row sums every line the same way.
 */
export interface CartLineItemLike {
    catalogueItemId: string;
    name: string;
    price: string;
    quantity: number;
}

/** A single cart line's total: price × quantity, price parsed as a decimal
 *  string (display-precision only — checkout's bond math uses the SDK's
 *  token-decimal-aware path instead, never this helper). */
function cartLineTotal(item: CartLineItemLike): number {
    return parseFloat(item.price || "0") * item.quantity;
}

/** Sum of every line's `cartLineTotal`, for a plain display subtotal. */
function sumCartValue(items: CartLineItemLike[]): number {
    return items.reduce((sum, item) => sum + cartLineTotal(item), 0);
}

interface CartLineListProps {
    items: CartLineItemLike[];
    /** Appended after each line total when present (e.g. "USDC"). */
    tokenSymbol?: string;
    /** Bold the line-total column. Checkout's cart echo does; the browse
     *  page's order summary doesn't (its own subtotal row carries the
     *  emphasis instead). */
    emphasizePrice?: boolean;
    /** Render a bordered subtotal row beneath the lines
     *  (`data-testid="cart-subtotal"`). Only the browse page's order
     *  summary shows one; checkout's cart echo does not. */
    showSubtotal?: boolean;
}

export function CartLineList({ items, tokenSymbol, emphasizePrice = false, showSubtotal = false }: CartLineListProps) {
    return (
        <>
            <ul className="space-y-2 text-sm">
                {items.map((item) => (
                    <li
                        key={item.catalogueItemId}
                        className="flex items-baseline justify-between gap-2"
                        data-testid={`cart-line-${item.catalogueItemId}`}
                    >
                        <span className="flex-1 min-w-0 text-black font-medium truncate">
                            {item.name} <span className="text-neutral-400">× {item.quantity}</span>
                        </span>
                        <span className={`text-neutral-900 ${emphasizePrice ? "font-semibold " : ""}tabular-nums shrink-0`}>
                            {cartLineTotal(item).toFixed(4)}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                        </span>
                    </li>
                ))}
            </ul>
            {showSubtotal && (
                <div className="flex justify-between border-t border-neutral-200 pt-3 text-sm font-semibold">
                    <span className="text-black">Subtotal</span>
                    <span className="text-black tabular-nums" data-testid="cart-subtotal">
                        {sumCartValue(items).toFixed(4)}{tokenSymbol ? ` ${tokenSymbol}` : ""}
                    </span>
                </div>
            )}
        </>
    );
}
