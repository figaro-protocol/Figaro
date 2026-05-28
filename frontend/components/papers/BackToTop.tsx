"use client";

import { useEffect, useState } from "react";

/**
 * Fixed back-to-top control for long paper pages. Appears after the reader
 * scrolls down and smooth-scrolls to the top, where the Download PDF control
 * sits — so reaching it never costs a full-page scroll. Hidden in print.
 */
export function BackToTop() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > 600);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    if (!visible) return null;

    return (
        <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Back to top"
            className="print:hidden fixed bottom-6 right-6 z-50 rounded-full border border-default bg-canvas/90 backdrop-blur-md px-4 py-2 text-sm text-ink-body shadow-sm hover:bg-paper-200 transition-colors"
        >
            ↑ Top
        </button>
    );
}
