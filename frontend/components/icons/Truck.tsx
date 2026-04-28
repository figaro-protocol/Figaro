import React from "react";

export default function Truck({ size, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
    return (
        <svg width={size ?? "1em"} height={size ?? "1em"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <rect x="1" y="3" width="15" height="13" rx="2" ry="2" />
            <path d="M16 8h5l-1 5" />
            <circle cx="5.5" cy="18.5" r="1.5" />
            <circle cx="18.5" cy="18.5" r="1.5" />
        </svg>
    );
}
