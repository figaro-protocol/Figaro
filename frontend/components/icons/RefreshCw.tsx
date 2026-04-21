import React from 'react';

export default function RefreshCw({ size, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width={size ?? "1em"} height={size ?? "1em"} {...props}>
            <path d="M21 12a9 9 0 1 0-3 6.7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 12v6h-6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
