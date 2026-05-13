"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    deleteNamedDraft,
    listNamedDrafts,
    type DraftIndexEntry,
} from "@/lib/designer/syntheticDesignStore";

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
            <p className="text-sm text-neutral-500" data-testid="drafts-empty">
                You don&apos;t have any saved drafts yet. Save the canvas as a draft from the designer toolbar to see it here.
            </p>
        );
    }

    return (
        <ul className="space-y-3" data-testid="drafts-list">
            {drafts.map((d) => (
                <li
                    key={d.slug}
                    className="rounded-lg border border-neutral-200 bg-white px-5 py-3 flex items-center gap-4"
                    data-testid={`draft-row-${d.slug}`}
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-black truncate">{d.name}</p>
                        <p className="font-mono text-[11px] text-neutral-500 mt-0.5">/{d.slug}</p>
                        <p className="text-xs text-neutral-500 mt-1">
                            {d.orderCount} order{d.orderCount === 1 ? "" : "s"} · last edited {formatRelative(d.updatedAt)}
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                        <Link
                            href={`/builders/designer/edit/${encodeURIComponent(d.slug)}`}
                            className="text-xs px-3 py-1.5 rounded border border-black bg-white hover:bg-neutral-100 text-black text-center"
                        >
                            Edit
                        </Link>
                        <Link
                            href={`/builders/designer/view/${encodeURIComponent(d.slug)}`}
                            className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-500 text-neutral-700 text-center"
                            data-testid={`draft-inspect-${d.slug}`}
                        >
                            Inspect
                        </Link>
                        <button
                            type="button"
                            onClick={() => handleDelete(d.slug, d.name)}
                            className="text-xs px-3 py-1.5 rounded border border-red-300 bg-white hover:border-red-500 text-red-700 text-center"
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

function formatRelative(ts: number): string {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString();
}
