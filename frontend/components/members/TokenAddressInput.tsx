"use client";

import { isValidAddress } from "@/lib/shared/evm";
import { useTokenSymbol } from "@/hooks/useTokenSymbol";

/**
 * Classify a `useTokenSymbol` failure so callers can show an
 * actionable message instead of the catch-all
 * "Address is not an ERC-20 (no symbol())".
 *
 * - `no-rpc`       — the RPC transport itself failed (no chain in
 *                    wallet, devnet not running, network error,
 *                    timeout, chain not configured). The address
 *                    is unverifiable, but the cause is the chain,
 *                    not the input.
 * - `no-symbol`    — the request reached the chain but the address
 *                    didn't return a string (no contract at the
 *                    address, no `symbol()` selector, or revert).
 *                    The address is genuinely not an ERC-20 on
 *                    this chain.
 *
 * Returns null when the input error is null/undefined.
 */
export function classifyTokenError(error: unknown): "no-rpc" | "no-symbol" | null {
    if (!error) return null;
    const err = error as { name?: string; message?: string; cause?: unknown };
    const name = err.name ?? "";
    const message = (err.message ?? "").toLowerCase();
    const causeName = (err.cause as { name?: string } | undefined)?.name ?? "";
    const causeMessage = ((err.cause as { message?: string } | undefined)?.message ?? "").toLowerCase();
    const allNames = `${name} ${causeName}`;
    const allMessages = `${message} ${causeMessage}`;

    if (
        allNames.includes("HttpRequestError") ||
        allNames.includes("TimeoutError") ||
        allNames.includes("RpcRequestError") ||
        allNames.includes("ChainMismatchError") ||
        allNames.includes("ChainNotConfiguredError") ||
        allMessages.includes("connection refused") ||
        allMessages.includes("econnrefused") ||
        allMessages.includes("failed to fetch") ||
        allMessages.includes("networkerror") ||
        allMessages.includes("network request failed") ||
        allMessages.includes("chain not configured") ||
        allMessages.includes("no chain")
    ) {
        return "no-rpc";
    }

    return "no-symbol";
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
                    className={`w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-default-strong ${
                        showError ? "border-error focus:border-error" : "border-default"
                    }`}
                />
                {valid && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint pointer-events-none">
                        {isLoading ? "…" : (symbol ?? "✓")}
                    </span>
                )}
            </div>
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-ink-faint hover:text-error-fg transition-colors text-lg leading-none flex-shrink-0"
                    aria-label="Remove"
                >
                    &times;
                </button>
            )}
        </div>
    );
}
