"use client";

import { useReadContract } from "wagmi";
import { parseAbi } from "viem";

const SYMBOL_ABI = parseAbi(["function symbol() view returns (string)"]);

export function isValidAddress(addr: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(addr);
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
