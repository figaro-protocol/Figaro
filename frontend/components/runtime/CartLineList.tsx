import { parseToken, tokenFigure } from "@/lib/shared/utils";

/**
 * CartLineList — the read-only cart-line rendering shared by the browse
 * page's order summary (`/s/view`) and the checkout page's read-only cart
 * echo (`/s/checkout`). Each line is a name + quantity + line total; an
 * optional trailing subtotal row sums every line the same way.
 */
export interface CartLineItemLike {
    catalogItemId: string;
    name: string;
    price: string;
    quantity: number;
}

/** A line's total in the token's base units — price × quantity at the
 *  token's `decimals()`, the same arithmetic the order commits. Null until
 *  decimals are read, or for a price that is not a decimal figure. */
function cartLineAmount(item: CartLineItemLike, decimals: number | undefined): bigint | null {
    if (decimals === undefined) return null;
    try {
        return parseToken(item.price || "0", decimals) * BigInt(item.quantity);
    } catch {
        return null;
    }
}

/** A figure with its token symbol, or nothing for an unknown amount. */
function figure(amount: bigint | null, decimals: number | undefined, tokenSymbol: string | undefined): string {
    if (amount === null) return "";
    const shown = tokenFigure(amount, decimals);
    return shown && tokenSymbol ? `${shown} ${tokenSymbol}` : shown;
}

interface CartLineListProps {
    items: CartLineItemLike[];
    /** The listing token's `decimals()`, read from the chain; undefined until
     *  then, and no figure is shown. */
    decimals: number | undefined;
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

export function CartLineList({ items, decimals, tokenSymbol, emphasizePrice = false, showSubtotal = false }: CartLineListProps) {
    const amounts = items.map((item) => cartLineAmount(item, decimals));
    const subtotal = amounts.reduce<bigint | null>((sum, a) => (sum === null || a === null ? null : sum + a), 0n);
    return (
        <>
            <ul className="space-y-2 text-sm">
                {items.map((item, i) => (
                    <li
                        key={item.catalogItemId}
                        className="flex items-baseline justify-between gap-2"
                        data-testid={`cart-line-${item.catalogItemId}`}
                    >
                        <span className="flex-1 min-w-0 text-ink-primary font-medium truncate">
                            {item.name} <span className="text-ink-muted">× {item.quantity}</span>
                        </span>
                        <span className={`text-ink-primary ${emphasizePrice ? "font-semibold " : ""}tabular-nums shrink-0`}>
                            {figure(amounts[i], decimals, tokenSymbol)}
                        </span>
                    </li>
                ))}
            </ul>
            {showSubtotal && (
                <div className="flex justify-between border-t border-default pt-3 text-sm font-semibold">
                    <span className="text-ink-primary">Subtotal</span>
                    <span className="text-ink-primary tabular-nums" data-testid="cart-subtotal">
                        {figure(subtotal, decimals, tokenSymbol)}
                    </span>
                </div>
            )}
        </>
    );
}
