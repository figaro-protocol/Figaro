"use client";

import { useState, useRef, useEffect } from "react";

interface TermProps {
    children: React.ReactNode;
    definition: string;
}

/**
 * Inline glossary tooltip.  Wraps jargon terms with a dotted underline;
 * shows a definition on hover (desktop) or tap (mobile).
 */
export function Term({ children, definition }: TermProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);

    // Close on outside click (mobile tap-to-open)
    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    return (
        <span
            ref={ref}
            className="relative inline-block"
            tabIndex={0}
            role="button"
            aria-describedby={open ? "term-tooltip" : undefined}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onClick={() => setOpen((v) => !v)}
        >
            <span className="border-b border-dotted border-gray-400 cursor-help">
                {children}
            </span>
            {open && (
                <span id="term-tooltip" role="tooltip" className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-black text-white text-xs rounded shadow-lg pointer-events-none">
                    {definition}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black" />
                </span>
            )}
        </span>
    );
}
