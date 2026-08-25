import { TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/shared/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    hasError?: boolean;
    errorId?: string;
}

// The §7 form-input shape, identical to Input and Select. `min-h-11` (44px)
// is the WCAG 2.5.5 Target Size floor for a rows={1} caller; every current
// caller passes rows>=2, where the row box already exceeds it.
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, hasError, errorId, ...props }, ref) => {
        return (
            <textarea
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
Textarea.displayName = "Textarea";

export { Textarea };
