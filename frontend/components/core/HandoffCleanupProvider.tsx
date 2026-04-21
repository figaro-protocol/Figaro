"use client";

import { useHandoffCleanup } from "@/lib/handoff/useHandoffCleanup";

/**
 * Invisible provider-level component that watches for terminal order
 * events (Resolved / Cancelled) and purges handoff encryption artifacts
 * from localStorage. Mounted once in the app Providers tree.
 */
export function HandoffCleanupProvider() {
    useHandoffCleanup();
    return null;
}
