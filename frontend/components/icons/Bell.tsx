import React from "react";

export default function Bell({ size, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
    return (
        <svg width={size ?? "1em"} height={size ?? "1em"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6 6 0 1 0-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h11z" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
    );
}
