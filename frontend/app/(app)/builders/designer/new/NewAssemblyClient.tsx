"use client";

/**
 * NewAssemblyClient — thin wrapper that maps /builders/designer/new query
 * params onto the shared <DesignerCanvas>. All canvas state, autosave,
 * drawer, and prose-sheet logic lives in DesignerCanvas.
 *
 * Query params:
 *   - ?draft=<slug>  — open a named draft (transitional; the canonical
 *                      entry is /builders/designer/edit/<slug>).
 *   - ?fresh=1       — clear the autosaved current-session and start blank.
 *   - (none)         — resume the autosaved current-session if present.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DesignerCanvas, type DesignerSeed } from "../_components/DesignerCanvas";

export function NewAssemblyClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const draftParam = searchParams?.get("draft") ?? null;
    const freshParam = searchParams?.get("fresh") ?? null;

    // Compute the seed once. Subsequent search-param changes (e.g., our
    // own router.replace below) don't re-seed an active session.
    const [seed] = useState<DesignerSeed>(() => {
        if (draftParam) return { kind: "draft", slug: draftParam };
        if (freshParam) return { kind: "blank" };
        return { kind: "fresh" };
    });

    // Strip the query params after consuming them so a page refresh
    // doesn't re-trigger the seed and clobber in-progress work.
    useEffect(() => {
        if (draftParam || freshParam) {
            router.replace("/builders/designer/new", { scroll: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <DesignerCanvas seed={seed} />;
}
