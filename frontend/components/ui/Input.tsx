import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/shared/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    hasError?: boolean;
    errorId?: string;
}

// Every color, border and ring value resolves to a token in
// docs/DESIGN_TOKENS.md §1; the shape is the §7 form-input contract shared
// with Select and Textarea. `min-h-11` (44px), not a fixed height, is the
// WCAG 2.5.5 Target Size floor. The focus indicator is `focus-visible:`
// rather than `focus:` so a pointer click draws no ring — matching the
// globals.css `:focus-visible` base rule, which `focus-visible:outline-none`
// then supersedes so the outline and the ring don't double up.
const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, hasError, errorId, ...props }, ref) => {
        return (
            <input
                type={type}
                aria-invalid={hasError || undefined}
                aria-describedby={errorId || undefined}
                className={cn(
                    "flex min-h-11 w-full rounded-tile border border-default bg-surface px-3 py-2 text-ink-primary text-sm placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:border-default-strong disabled:cursor-not-allowed disabled:opacity-50",
                    hasError && "border-error focus-visible:ring-error focus-visible:border-error",
                    className
                )}
                ref={ref}
                {...props}
            />
        );
    }
);
Input.displayName = "Input";

export { Input };
