"use client";

import { useReadContract } from "wagmi";
import { getAddress, isAddress, parseAbi } from "viem";
import { ZERO_ADDRESS } from "@/lib/shared/evm";

const SYMBOL_ABI = parseAbi(["function symbol() view returns (string)"]);

/**
 * True iff `addr` is a 0x-prefixed 20-byte hex string. Format-only:
 * accepts lowercase, valid checksum, AND mixed-case-with-bad-
 * checksum (the last is flagged as `checksum-invalid` by
 * `addressIntegrity`, but it's still a syntactically valid 40-hex
 * address). Use `addressIntegrity` to distinguish.
 *
 * Returns a type predicate so callers can narrow `string` to
 * `` `0x${string}` `` (= viem's `Address`) inside an `if` block.
 */
export function isValidAddress(addr: string): addr is `0x${string}` {
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
