"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Fixed back-to-top control for long paper pages. Appears after the reader
 * scrolls down and smooth-scrolls to the top, where the Download PDF control
 * sits — so reaching it never costs a full-page scroll. Hidden in print.
 * A 44×44px target (WCAG 2.5.5) on the opaque `paper` surface: a fixed
 * control floats over scrolling prose, so it takes no alpha fill.
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
        <Button
            type="button"
            variant="outline"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Back to top"
            className="print:hidden fixed bottom-6 right-6 z-50 min-w-11 rounded-full border-default text-ink-body shadow-section hover:bg-subtle-hover"
        >
            ↑ Top
        </Button>
    );
}
