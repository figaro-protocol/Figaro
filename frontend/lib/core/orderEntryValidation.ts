import { parseToken } from "@/lib/shared/utils";

interface ClauseLocationFields {
    origin?: string;
    destination?: string;
}

interface ParsePositiveTokenInputOptions {
    invalidMessage?: string;
    nonPositiveMessage?: string;
}

function hasExcessFractionalPrecision(value: string, tokenDecimals: number): boolean {
    const fractional = value.trim().split(".")[1];
    if (!fractional) {
        return false;
    }

    return fractional.replace(/0+$/, "").length > tokenDecimals;
}

export function hasRequiredClauseLocations(fields: ClauseLocationFields): boolean {
    return !!fields.origin?.trim() && !!fields.destination?.trim();
}

export function parsePositiveTokenInput(
    value: string,
    tokenDecimals: number,
    options: ParsePositiveTokenInputOptions = {},
): { amount: bigint | null; error: string | null } {
    if (hasExcessFractionalPrecision(value, tokenDecimals)) {
        return {
            amount: null,
            error: options.invalidMessage ?? "Payment amount exceeds token decimal precision for this token",
        };
    }

    try {
        const amount = parseToken(value, tokenDecimals);
        if (amount <= 0n) {
            return {
                amount: null,
                error: options.nonPositiveMessage ?? "Payment must be positive",
            };
        }

        return { amount, error: null };
    } catch {
        return {
            amount: null,
            error: options.invalidMessage ?? "Payment amount exceeds token decimal precision for this token",
        };
    }
}
