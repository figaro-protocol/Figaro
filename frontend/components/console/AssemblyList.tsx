"use client";

/**
 * AssemblyList — Sidebar showing registered assemblies and in-progress drafts.
 * Allows creating new drafts and forking existing assemblies.
 */

import { useState } from "react";
import { useBuilder } from "@/lib/console/buildProvider";

export function AssemblyList() {
    const {
        registeredAssemblies,
        drafts,
        selectedDraftSlug,
        selectDraft,
        createDraft,
        forkAssembly,
    } = useBuilder();

    const [showNewForm, setShowNewForm] = useState(false);
    const [newName, setNewName] = useState("");
    const [newSlug, setNewSlug] = useState("");

    const handleCreate = () => {
        if (!newName.trim() || !newSlug.trim()) return;
        createDraft(newName.trim(), newSlug.trim());
        setNewName("");
        setNewSlug("");
        setShowNewForm(false);
    };

    const draftEntries = [...drafts.entries()];

    return (
        <div className="flex flex-col gap-1 p-2">
            {/* ── Drafts ─────────────────────────────────────── */}
            <div className="flex items-center justify-between px-2 pb-1">
                <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Drafts ({draftEntries.length})
                </h3>
                <button
                    onClick={() => setShowNewForm(!showNewForm)}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                    {showNewForm ? "Cancel" : "+ New"}
                </button>
            </div>

            {showNewForm && (
                <div className="mx-2 mb-2 flex flex-col gap-1.5 rounded border border-zinc-700 bg-zinc-800/50 p-2">
                    <input
                        type="text"
                        placeholder="Assembly name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none"
                    />
                    <input
                        type="text"
                        placeholder="slug (kebab-case)"
                        value={newSlug}
                        onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        className="rounded bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 outline-none"
                    />
                    <button
                        onClick={handleCreate}
                        disabled={!newName.trim() || !newSlug.trim()}
                        className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600 disabled:opacity-40 transition-colors"
                    >
                        Create Draft
                    </button>
                </div>
            )}

            {draftEntries.map(([slug, draft]) => {
                const isSelected = selectedDraftSlug === slug;
                const hasErrors = draft.validation && !draft.validation.ok;
                return (
                    <button
                        key={slug}
                        onClick={() => selectDraft(slug)}
                        className={`flex items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${isSelected
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-300 hover:bg-zinc-800/50"
                            }`}
                    >
                        <div className="flex flex-col">
                            <span className="text-xs">{draft.assembly.identity.name}</span>
                            <span className="font-mono text-[10px] text-zinc-500">{slug}</span>
                        </div>
                        <span className="flex items-center gap-1.5">
                            {draft.dirty && (
                                <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-400">
                                    modified
                                </span>
                            )}
                            {hasErrors && (
                                <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] text-red-400">
                                    errors
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}

            {draftEntries.length === 0 && !showNewForm && (
                <div className="px-3 py-2 text-xs text-zinc-600">
                    No drafts. Create one or fork a registered assembly.
                </div>
            )}

            {/* ── Registered assemblies ──────────────────────── */}
            <h3 className="mt-4 px-2 pb-1 text-xs font-medium uppercase tracking-wider text-zinc-400">
                Registered ({registeredAssemblies.length})
            </h3>
            {registeredAssemblies.map((assembly) => (
                <div
                    key={assembly.identity.slug}
                    className="flex items-center justify-between rounded px-3 py-2 text-sm text-zinc-400"
                >
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-300">{assembly.identity.name}</span>
                        <span className="font-mono text-[10px] text-zinc-600">
                            {assembly.identity.slug} v{assembly.identity.version}
                        </span>
                    </div>
                    <button
                        onClick={() => forkAssembly(assembly.identity.slug)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300"
                    >
                        Fork
                    </button>
                </div>
            ))}
        </div>
    );
}
