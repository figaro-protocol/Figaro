"use client";

import { Button } from "@/components/ui/Button";

/**
 * Triggers the browser's own print path, which is how a paper page becomes a
 * PDF — no server-side PDF generation, no committed artifact. The print
 * stylesheet (globals.css) carries the watermark and pagination into the
 * output and hides the surrounding chrome (this control included).
 */
export function PrintButton() {
    return (
        <Button variant="outline" size="sm" onClick={() => window.print()}>
            Download PDF
        </Button>
    );
}
