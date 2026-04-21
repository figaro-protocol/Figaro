import React from "react";

export default function Menu({ size, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
    return (
        <svg width={size ?? "1em"} height={size ?? "1em"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M3 12h18" />
            <path d="M3 6h18" />
            <path d="M3 18h18" />
        </svg>
    );
}
