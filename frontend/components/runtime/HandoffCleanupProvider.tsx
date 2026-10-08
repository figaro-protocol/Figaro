"use client";

import { useHandoffCleanup } from "@/lib/handoff/useHandoffCleanup";

/**
 * Invisible provider-level component that watches for the terminal order
 * event (OrderResolved; the Core has no cancel) and purges handoff encryption artifacts
 * from localStorage. Mounted once in the app Providers tree.
 */
export function HandoffCleanupProvider() {
    useHandoffCleanup();
    return null;
}
