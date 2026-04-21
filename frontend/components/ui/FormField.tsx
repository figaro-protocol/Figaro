import React from "react";

interface FormFieldProps {
    label: string;
    children: React.ReactNode;
    className?: string;
    inputId?: string;
    error?: string | null;
    required?: boolean;
}

export function FormField({ label, children, className, inputId, error, required }: FormFieldProps) {
    const errorId = error && inputId ? `${inputId}-error` : undefined;
    return (
        <div className={`flex flex-col${className ? ` ${className}` : ""}`}>
            <label htmlFor={inputId} className="text-xs text-black mb-1">
                {label}{required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
            </label>
            {children}
            {error && errorId && (
                <p id={errorId} className="text-xs text-red-600 mt-1" role="alert">{error}</p>
            )}
        </div>
    );
}
