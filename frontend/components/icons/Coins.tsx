import React from 'react';

export default function Coins({ size, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width={size ?? "1em"} height={size ?? "1em"} {...props}>
            <ellipse cx="12" cy="7" rx="6" ry="3" strokeWidth={1.5} />
            <path d="M6 7v6c0 1.657 2.686 3 6 3s6-1.343 6-3V7" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 16v2c0 .552 2.686 2 6 2s6-1.448 6-2v-2" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
