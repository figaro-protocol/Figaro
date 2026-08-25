import React from "react";

interface FormFieldProps {
    label: string;
    children: React.ReactNode;
    className?: string;
    inputId?: string;
    error?: string | null;
    required?: boolean;
}

// Tokens per docs/DESIGN_TOKENS.md §1. Status TEXT goes through the `-fg`
// channel — `text-error-fg` (5.56:1 on canvas, 6.07:1 on paper), never the
// bare `text-error`, which is the fill/border/ring/icon value. For error
// the two hexes coincide; naming the channel is what keeps the rule one
// rule. The asterisk is aria-hidden: the accessible required signal is the
// control's own `required` / `aria-required`, not this glyph.
export function FormField({ label, children, className, inputId, error, required }: FormFieldProps) {
    const errorId = error && inputId ? `${inputId}-error` : undefined;
    return (
        <div className={`flex flex-col${className ? ` ${className}` : ""}`}>
            <label htmlFor={inputId} className="text-xs text-ink-primary mb-1">
                {label}{required && <span className="text-error-fg ml-0.5" aria-hidden="true">*</span>}
            </label>
            {children}
            {error && errorId && (
                <p id={errorId} className="text-xs text-error-fg mt-1" role="alert">{error}</p>
            )}
        </div>
    );
}
