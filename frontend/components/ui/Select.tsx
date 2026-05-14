import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/shared/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    hasError?: boolean;
    errorId?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, hasError, errorId, children, ...props }, ref) => {
        return (
            <select
                aria-invalid={hasError || undefined}
                aria-describedby={errorId || undefined}
                className={cn(
                    "flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50",
                    hasError && "border-red-400 focus:ring-red-400 focus:border-red-400",
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
