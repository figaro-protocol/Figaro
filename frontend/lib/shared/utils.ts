import { formatUnits, parseUnits } from "viem";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
export function formatToken(amount: bigint, decimals: number = 18): string {
    return formatUnits(amount, decimals);
}

export function parseToken(amount: string, decimals: number = 18): bigint {
    return parseUnits(amount, decimals);
}

export function getOrderColor(state: number): string {
    switch (state) {
        case 0: // Virtual
            return "gray";
        case 1: // Active
            return "yellow";
        case 2: // Resolved
            return "green";
        default:
            return "gray";
    }
}
