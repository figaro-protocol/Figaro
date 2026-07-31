"use client";

/**
 * CompositionIdentity — the canvas's live identity readout.
 *
 * The assembly's identity IS its composition: `compositionHash` = keccak256 of
 * the template's canonical composition subset, which is the AssemblyRegistry
 * key (first-write-wins, immutable), and the published slug is a pure function
 * of it. Editorial prose (name / summary / description) is excluded from the
 * subset, so renaming never forks identity.
 *
 * Why it is on the canvas rather than only on the review page: a design fill's
 * VALUE is part of the composition, so flipping one — a disclosure regime from
 * `each-own` to `open`, a pinned settlement token, a credential register — is a
 * DIFFERENT assembly, not a setting on the same one. The registry mechanics do
 * that for free (identical compositions collapse to one binding; a changed one
 * anchors beside its sibling), but without a live readout the designer sees a
 * canvas that looks unchanged. This makes the fork visible at the moment of the
 * edit.
 *
 * Derived, never stored: the same `draftToAssemblyTemplate` walk publish uses,
 * recomputed from the draft on every change. Names no clause and reads no
 * field — any composed clause moves it.
 *
 * Testids: `designer-composition-identity`, `designer-composition-slug`,
 * `designer-composition-hash`.
 */

import { useMemo } from "react";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import { snapshotCompositionIdentity } from "@/lib/designer/draftToAssemblyTemplate";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { truncateHex } from "@/lib/shared/formatHex";

export function CompositionIdentity({ snapshot }: { snapshot: DesignSnapshot | null }) {
    // The spec cache is an input to the walk (the mandatory clauses fold from
    // it), so a warm — or a clause registered mid-session — re-runs it. The
    // canvas already gates its render on `loaded`, so the error branch below
    // is for a genuinely unbuildable composition (a mis-scoped clause from an
    // imported template), not for a cold cache.
    const { version: specsVersion } = useClauseSpecs();

    const identity = useMemo(
        () => (snapshot ? snapshotCompositionIdentity(snapshot) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [snapshot, specsVersion],
    );

    // Nothing composed yet — there is no identity to state, and a placeholder
    // hash would be a fiction.
    if (!identity) return null;

    return (
        <div
            data-testid="designer-composition-identity"
            className="mt-5 pt-4 border-t border-default space-y-1"
        >
            <p className="text-xs font-semibold text-ink-heading">Composition identity</p>
            {identity.error !== null ? (
                <p className="text-[11px] text-ink-faint leading-relaxed">{identity.error}</p>
            ) : (
                <>
                    <p className="font-mono text-[11px] text-ink-body break-all" data-testid="designer-composition-slug">
                        {identity.slug}
                    </p>
                    <p
                        className="font-mono text-[10px] text-ink-faint break-all"
                        data-testid="designer-composition-hash"
                        title={identity.compositionHash}
                    >
                        {truncateHex(identity.compositionHash, { head: 10, tail: 6 })}
                    </p>
                    <p className="text-[11px] text-ink-muted leading-relaxed">
                        The AssemblyRegistry key, derived from the composed clauses and
                        their design-time values. Change any of them — including a
                        clause&rsquo;s composed value — and this becomes a different
                        assembly, anchored beside the one you started from rather than
                        replacing it. The name and descriptions are excluded, so editing
                        the prose leaves it unmoved.
                    </p>
                </>
            )}
        </div>
    );
}
