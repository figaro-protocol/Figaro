import React from "react";

interface FormFieldProps {
    label: string;
    children: React.ReactNode;
    className?: string;
    inputId?: string;
    error?: string | null;
    required?: boolean;
}

// Tokens per docs/DESIGN_TOKENS.md §1. `text-error` is the one status token
// measured AA-clean as a text color (5.56:1 on canvas, 6.07:1 on paper) —
// see the §1 status-token note, which rules the other three out. The
// asterisk is aria-hidden: the accessible required signal is the control's
// own `required` / `aria-required`, not this glyph.
export function FormField({ label, children, className, inputId, error, required }: FormFieldProps) {
    const errorId = error && inputId ? `${inputId}-error` : undefined;
    return (
        <div className={`flex flex-col${className ? ` ${className}` : ""}`}>
            <label htmlFor={inputId} className="text-xs text-ink-primary mb-1">
                {label}{required && <span className="text-error ml-0.5" aria-hidden="true">*</span>}
            </label>
            {children}
            {error && errorId && (
                <p id={errorId} className="text-xs text-error mt-1" role="alert">{error}</p>
            )}
        </div>
    );
}
