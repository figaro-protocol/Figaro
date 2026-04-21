import React from "react";

export default function CheckCircle({ size, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
    return (
        <svg width={size ?? "1em"} height={size ?? "1em"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M9 12l2 2 4-4" />
            <circle cx="12" cy="12" r="10" />
        </svg>
    );
}
