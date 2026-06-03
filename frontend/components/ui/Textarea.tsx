import { TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/shared/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    hasError?: boolean;
    errorId?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, hasError, errorId, ...props }, ref) => {
        return (
            <textarea
                aria-invalid={hasError || undefined}
                aria-describedby={errorId || undefined}
                className={cn(
                    "flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black text-sm placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50",
                    hasError && "border-red-400 focus:ring-red-400 focus:border-red-400",
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
