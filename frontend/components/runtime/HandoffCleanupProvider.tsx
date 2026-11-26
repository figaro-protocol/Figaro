"use client";

import { useHandoffCleanup } from "@/lib/data/handoff/useHandoffCleanup";

/**
 * Invisible provider-level component that watches for the terminal order
 * event (OrderResolved; the Core has no cancel) and purges handoff encryption artifacts
 * from localStorage. Mounted once in the app Providers tree.
 */
// lint-allow-duplicate-symbol: the component that mounts useHandoffCleanup once for the app
export function HandoffCleanupProvider() {
    useHandoffCleanup();
    return null;
}
