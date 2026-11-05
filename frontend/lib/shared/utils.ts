import { formatUnits, parseUnits } from "viem";
import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The theme's own scale keys (tailwind.config.ts, docs/DESIGN_TOKENS.md §2-§4),
// so a caller's `rounded-full` beats a primitive's `rounded-tile`, `px-2` beats
// `px-lg` and `text-heading-h2` merges as a size, not a color.
const twMerge = extendTailwindMerge({
    extend: {
        theme: {
            spacing: ["xs", "sm", "md", "lg", "xl", "2xl"],
            borderRadius: ["section", "invariant", "tile"],
        },
        classGroups: {
            "font-size": [{ text: ["heading-h1", "heading-h2", "heading-h3", "body-lead"] }],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
/** A token amount in the token's own units. `decimals` is the token's `decimals()` read from the chain; there is no default. */
export function formatToken(amount: bigint, decimals: number): string {
    return formatUnits(amount, decimals);
}

/** A token figure once the token's `decimals()` has been read from the chain. Until then, or when
 *  the read fails, nothing: an amount not derived from the network is not surfaced. */
export function tokenFigure(amount: bigint, decimals: number | undefined): string {
    return decimals === undefined ? "" : formatUnits(amount, decimals);
}

/** Parse a typed amount into base units. `decimals` is the token's `decimals()` read from the chain; there is no default. */
export function parseToken(amount: string, decimals: number): bigint {
    return parseUnits(amount, decimals);
}
