import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/shared/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    hasError?: boolean;
    errorId?: string;
}

// The §7 form-input shape, identical to Input and Textarea — a select that
// reads as a different control than the text field beside it is the drift
// this primitive exists to prevent. Tokens per docs/DESIGN_TOKENS.md §1;
// `min-h-11` (44px) is the WCAG 2.5.5 Target Size floor.
const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, hasError, errorId, children, ...props }, ref) => {
        return (
            <select
                aria-invalid={hasError || undefined}
                aria-describedby={errorId || undefined}
                className={cn(
                    "flex min-h-11 w-full rounded-tile border border-default bg-surface px-3 py-2 text-ink-primary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:border-default-strong disabled:cursor-not-allowed disabled:opacity-50",
                    hasError && "border-error focus-visible:ring-error focus-visible:border-error",
                    className
                )}
                ref={ref}
                {...props}
            >
                {children}
            </select>
        );
    }
);
Select.displayName = "Select";

export { Select };
