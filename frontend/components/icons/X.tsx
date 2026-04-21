import React from "react";

export default function X({ size, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
    return (
        <svg width={size ?? "1em"} height={size ?? "1em"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
        </svg>
    );
}
