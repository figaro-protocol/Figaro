import React from "react";

export default function Package({ size, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
    return (
        <svg width={size ?? "1em"} height={size ?? "1em"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M21 16V8a2 2 0 0 0-1-1.73L13 3" />
            <path d="M3 8v8a2 2 0 0 0 1 1.73L11 21" />
            <path d="M12 3v18" />
        </svg>
    );
}
