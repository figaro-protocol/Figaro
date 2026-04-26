"use client";

/**
 * DesignerNewDraftDialog — modal that creates a new blank assembly draft.
 *
 * Collects slug + name, validates the slug is kebab-case and not already
 * taken by an existing draft or reference, then hands the values to the
 * host page, which calls `buildBlankAssembly` and stores the draft.
 */

import { useEffect, useState } from "react";

export interface DesignerNewDraftDialogProps {
    open: boolean;
    existingSlugs: readonly string[];
    onCreate: (args: { slug: string; name: string }) => void;
    onClose: () => void;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function DesignerNewDraftDialog({
    open,
    existingSlugs,
    onCreate,
    onClose,
}: DesignerNewDraftDialogProps) {
    const [slug, setSlug] = useState("");
    const [name, setName] = useState("");

    useEffect(() => {
        if (!open) {
            setSlug("");
            setName("");
        }
    }, [open]);

    if (!open) return null;

    const error = validateSlug(slug, existingSlugs) ?? validateName(name);
    const canCreate = !error && slug.length > 0 && name.length > 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canCreate) return;
        onCreate({ slug, name });
    };

    return (
        <div
            data-testid="designer-new-draft-dialog"
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center"
        >
            <button
                type="button"
                aria-label="Close dialog"
                data-testid="designer-new-draft-backdrop"
                onClick={onClose}
                className="absolute inset-0 bg-black/40"
            />
            <form
                onSubmit={handleSubmit}
                className="relative w-full max-w-md bg-white rounded-lg shadow-xl border border-neutral-200 p-6"
            >
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    New draft
                </p>
                <h2 className="text-lg font-bold text-black mt-1">Create a blank assembly</h2>
                <p className="text-xs text-neutral-500 mt-2">
                    Generates a minimal assembly template. Refine mechanisms, roles, and views
                    on the canvas after creation.
                </p>

                <label className="block mt-4">
                    <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                        Name
                    </span>
                    <input
                        data-testid="new-draft-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. My Coordination"
                        className="mt-1 w-full text-sm border border-neutral-300 rounded px-2 py-1"
                    />
                </label>

                <label className="block mt-3">
                    <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                        Slug
                    </span>
                    <input
                        data-testid="new-draft-slug"
                        type="text"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="e.g. my-coordination"
                        className="mt-1 w-full text-sm border border-neutral-300 rounded px-2 py-1 font-mono"
                    />
                </label>

                {error && (
                    <p
                        data-testid="new-draft-error"
                        className="text-xs text-red-600 mt-2"
                    >
                        {error}
                    </p>
                )}

                <div className="flex items-center justify-end gap-2 mt-5">
                    <button
                        type="button"
                        data-testid="new-draft-cancel"
                        onClick={onClose}
                        className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-400"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        data-testid="new-draft-create"
                        disabled={!canCreate}
                        className="text-xs px-3 py-1.5 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Create
                    </button>
                </div>
            </form>
        </div>
    );
}

function validateSlug(slug: string, existing: readonly string[]): string | null {
    if (slug.length === 0) return null; // empty is "not yet filled", not an error
    if (!SLUG_RE.test(slug)) {
        return "Slug must be kebab-case: lowercase letters, digits, hyphens.";
    }
    if (existing.includes(slug)) {
        return `Slug "${slug}" is already in use.`;
    }
    return null;
}

function validateName(name: string): string | null {
    if (name.length === 0) return null;
    if (name.trim().length === 0) return "Name cannot be blank.";
    return null;
}
