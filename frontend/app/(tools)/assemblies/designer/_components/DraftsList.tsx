"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    deleteNamedDraft,
    listNamedDrafts,
    type DraftIndexEntry,
} from "@/lib/designer/syntheticDesignStore";
import { formatRelative } from "@/lib/shared/formatTimestamp";

export function DraftsList() {
    const [drafts, setDrafts] = useState<DraftIndexEntry[] | null>(null);

    const refresh = useCallback(() => {
        setDrafts(listNamedDrafts());
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleDelete = useCallback(
        (slug: string, name: string) => {
            const ok = typeof window === "undefined"
                ? true
                : window.confirm(`Delete draft "${name}"? This cannot be undone.`);
            if (!ok) return;
            deleteNamedDraft(slug);
            refresh();
        },
        [refresh],
    );

    if (drafts === null) {
        // Render nothing during the SSR / first paint to avoid a hydration flicker.
        return null;
    }

    if (drafts.length === 0) {
        return (
            <p className="text-sm text-ink-muted" data-testid="drafts-empty">
                You don&apos;t have any saved drafts yet. Save the canvas as a draft from the designer toolbar to see it here.
            </p>
        );
    }

    return (
        <ul className="space-y-3" data-testid="drafts-list">
            {drafts.map((d) => (
                <li
                    key={d.slug}
                    className="rounded-lg border border-default bg-paper px-5 py-3 flex items-center gap-4"
                    data-testid={`draft-row-${d.slug}`}
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink-primary truncate">
                            {d.name || <span className="font-normal italic text-ink-faint">Untitled</span>}
                        </p>
                        <p className="font-mono text-[11px] text-ink-muted mt-0.5">/{d.slug}</p>
                        <p className="text-xs text-ink-muted mt-1">
                            {d.orderCount} order{d.orderCount === 1 ? "" : "s"} · last edited {formatRelative(d.updatedAt)}
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                        <Link
                            href={`/assemblies/designer/edit?slug=${encodeURIComponent(d.slug)}`}
                            className="text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle text-ink-primary text-center"
                        >
                            Edit
                        </Link>
                        <Link
                            href={`/assemblies/designer/view?slug=${encodeURIComponent(d.slug)}`}
                            className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong text-ink-body text-center"
                            data-testid={`draft-inspect-${d.slug}`}
                        >
                            Inspect
                        </Link>
                        <button
                            type="button"
                            onClick={() => handleDelete(d.slug, d.name)}
                            className="text-xs px-3 py-1.5 rounded border border-error/40 bg-paper hover:border-error text-error-fg text-center"
                            data-testid={`draft-delete-${d.slug}`}
                        >
                            Delete
                        </button>
                    </div>
                </li>
            ))}
        </ul>
    );
}

