"use client";

import { useReadContract } from "wagmi";
import { getAddress, isAddress, parseAbi } from "viem";

const SYMBOL_ABI = parseAbi(["function symbol() view returns (string)"]);

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * True iff `addr` is a 0x-prefixed 20-byte hex string. Format-only:
 * accepts lowercase, valid checksum, AND mixed-case-with-bad-
 * checksum (the last is flagged as `checksum-invalid` by
 * `addressIntegrity`, but it's still a syntactically valid 40-hex
 * address). Use `addressIntegrity` to distinguish.
 */
export function isValidAddress(addr: string): boolean {
    return isAddress(addr, { strict: false });
}

export type AddressIntegrity =
    /** Empty string. */
    | "empty"
    /** Doesn't match the 0x + 40 hex pattern at all. */
    | "not-address"
    /** All-lowercase (checksum not asserted by the user). */
    | "lowercase"
    /** Mixed case AND the EIP-55 checksum is correct. */
    | "checksum-valid"
    /** Mixed case BUT the EIP-55 checksum is wrong — likely typo. */
    | "checksum-invalid"
    /** The all-zero address (passes regex but is never a real token). */
    | "zero";

export function addressIntegrity(addr: string): AddressIntegrity {
    if (!addr) return "empty";
    if (!isAddress(addr, { strict: false })) return "not-address";
    if (addr.toLowerCase() === ZERO_ADDRESS) return "zero";
    if (addr === addr.toLowerCase()) return "lowercase";
    try {
        return addr === getAddress(addr) ? "checksum-valid" : "checksum-invalid";
    } catch {
        return "checksum-invalid";
    }
}

export function useTokenSymbol(address: string) {
    const addr = isValidAddress(address) ? (address as `0x${string}`) : undefined;
    return useReadContract({
        address: addr,
        abi: SYMBOL_ABI,
        functionName: "symbol",
        query: { enabled: !!addr },
    });
}

export function TokenAddressInput({
    value,
    onChange,
    onRemove,
    hasError = false,
}: {
    value: string;
    onChange: (v: string) => void;
    onRemove?: () => void;
    /**
     * Force the red-border error state regardless of input contents.
     * Set by callers that have an external validation error attached
     * to this row (e.g. an empty row when the form requires ≥1 token).
     */
    hasError?: boolean;
}) {
    const { data: symbol, isLoading } = useTokenSymbol(value);
    const valid = isValidAddress(value);
    const invalid = value.length > 0 && !valid;
    const showError = invalid || hasError;

    return (
        <div className="flex items-center gap-2">
            <div className="relative flex-1">
                <input
                    type="text"
                    placeholder="0x… token address"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-invalid={showError || undefined}
                    className={`w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-black ${
                        showError ? "border-red-300 focus:border-red-400" : "border-gray-300"
                    }`}
                />
                {valid && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                        {isLoading ? "…" : (symbol ?? "✓")}
                    </span>
                )}
            </div>
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0"
                    aria-label="Remove"
                >
                    &times;
                </button>
            )}
        </div>
    );
}
