import { ReactNode, HTMLAttributes } from "react";
import { cn } from "@/lib/shared/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    className?: string;
}

// The §7 section-card surface, tokens per docs/DESIGN_TOKENS.md §1/§4 —
// the same three values globals.css `.card` / `.section-card` @apply, so the
// component and the class name cannot render two different cards. Padding
// and shadow stay caller-owned: call sites run p-4 through p-8 and none of
// them wants the class's fixed `shadow-section p-xl`.
export function Card({ children, className, ...rest }: CardProps) {
    return (
        <div
            className={cn(
                "bg-paper rounded-section border border-default",
                className
            )}
            {...rest}
        >
            {children}
        </div>
    );
}
