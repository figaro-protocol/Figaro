import { ReactNode, HTMLAttributes } from "react";
import { cn } from "@/lib/shared/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    className?: string;
}

export function Card({ children, className, ...rest }: CardProps) {
    return (
        <div
            className={cn(
                "bg-white rounded-lg border border-gray-200",
                className
            )}
            {...rest}
        >
            {children}
        </div>
    );
}
