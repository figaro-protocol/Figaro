"use client";

import { isValidAddress } from "@/lib/shared/evm";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useTokenSymbol } from "@/hooks/useTokenSymbol";

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
    // The chain's `symbol()` answer, or nothing: a failed read is never a
    // checkmark telling the user the token is valid.
    const { data: symbol, isLoading } = useTokenSymbol(value);
    const valid = isValidAddress(value);
    const invalid = value.length > 0 && !valid;
    const showError = invalid || hasError;

    return (
        <div className="flex items-center gap-2">
            <div className="relative flex-1">
                <Input
                    type="text"
                    placeholder="0x… token address"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    hasError={showError}
                    className="font-mono"
                />
                {valid && (isLoading || symbol) && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted pointer-events-none">
                        {isLoading ? "…" : symbol}
                    </span>
                )}
            </div>
            {onRemove && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onRemove}
                    className="text-ink-muted hover:text-error-fg text-lg leading-none flex-shrink-0"
                    aria-label="Remove"
                >
                    &times;
                </Button>
            )}
        </div>
    );
}
