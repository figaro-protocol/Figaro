"use client";

/**
 * ClauseSpecsLoader — warms the clause-spec cache for the whole (app) tier.
 *
 * Mounted once in the provider tree so that by the time any surface needs a
 * clause spec (the designer drawer, checkout's agreement build, the runtime
 * order pages), the chain → IPFS load is already in flight or done. Renders
 * nothing. Spec-consuming components still call `useClauseSpecs` themselves to
 * gate their render on `loaded` and to re-render as specs resolve — this mount
 * only guarantees the fetch starts early.
 */

import { useClauseSpecs } from "@/lib/mechanisms/useClauseSpecs";

export function ClauseSpecsLoader() {
    useClauseSpecs();
    return null;
}
