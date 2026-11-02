import { formatUnits, parseUnits } from "viem";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
/** A token amount in the token's own units. `decimals` is the token's `decimals()` read from the chain; there is no default. */
export function formatToken(amount: bigint, decimals: number): string {
    return formatUnits(amount, decimals);
}

/** A token figure once the token's `decimals()` has been read from the chain; until then the raw
 *  base-unit integer, marked as such — never a magnitude formatted on a stand-in. */
export function tokenFigure(amount: bigint, decimals: number | undefined): string {
    return decimals === undefined ? `${amount.toString()} (raw — token decimals loading)` : formatUnits(amount, decimals);
}

/** Parse a typed amount into base units. `decimals` is the token's `decimals()` read from the chain; there is no default. */
export function parseToken(amount: string, decimals: number): bigint {
    return parseUnits(amount, decimals);
}
