"use client";

/**
 * DesignerPublishDrawer — overlay that surfaces publish-readiness.
 *
 * Shows:
 *   - Overall readiness status (✓ Ready / ⚠ N issues)
 *   - The list of validation issues with severity + path
 *   - The serialized assembly document, copyable to clipboard
 *
 * Collision checks (slug-already-registered, id-already-registered) are
 * suppressed here by passing an empty registered-assemblies list: this
 * drawer demonstrates the Designer, not the publication pipeline. A
 * dedicated "publish to registry" flow can layer the collision gate on top.
 */

import { useMemo, useState } from "react";
import type { Assembly } from "@/lib/shared/assembly";
import type { AssemblyValidationIssue } from "@/lib/shared/assemblyValidation";
import {
    serializeAssemblyDocument,
    validateDraftPublicationReadiness,
} from "@/lib/shared/assemblyDraft";
import type { PublishAssemblyResult } from "@/lib/shared/assemblyPublication";

export interface DesignerPublishDrawerProps {
    assembly: Assembly | null;
    open: boolean;
    onClose: () => void;
    /**
     * Server-side publish hook. When provided, the drawer renders a
     * "Publish to workspace" button that writes the serialized assembly
     * to `lib/shared/assemblies/<slug>.reference.json` and registers it
     * in `lib/shared/assembly.ts`. Returns the server's verdict.
     *
     * Wire to the `publishAssemblyAction` server action (or a mock in
     * tests). Omit to keep the drawer in read-only "preview" mode.
     */
    onPublish?: (documentJson: string) => Promise<PublishAssemblyResult>;
}

type PublishState =
    | { kind: "idle" }
    | { kind: "publishing" }
    | { kind: "result"; result: PublishAssemblyResult };

export function DesignerPublishDrawer({
    assembly,
    open,
    onClose,
    onPublish,
}: DesignerPublishDrawerProps) {
    const [copied, setCopied] = useState(false);
    const [publishState, setPublishState] = useState<PublishState>({ kind: "idle" });

    const { readiness, json } = useMemo(() => {
        if (!assembly) return { readiness: null, json: "" };
        return {
            readiness: validateDraftPublicationReadiness(assembly, []),
            json: serializeAssemblyDocument(assembly),
        };
    }, [assembly]);

    if (!open) return null;

    const handleCopy = async () => {
        if (!json) return;
        try {
            await navigator.clipboard.writeText(json);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // clipboard can be blocked in tests / sandboxes; the textarea still
            // shows the JSON so the user can select manually.
        }
    };

    const handlePublish = async () => {
        if (!assembly || !json || !onPublish) return;
        setPublishState({ kind: "publishing" });
        try {
            const result = await onPublish(json);
            setPublishState({ kind: "result", result });
        } catch (err) {
            setPublishState({
                kind: "result",
                result: {
                    ok: false,
                    issues: [{
                        severity: "error",
                        path: "",
                        message: err instanceof Error ? err.message : String(err),
                    }],
                },
            });
        }
    };

    const handleDownload = () => {
        if (!assembly || !json) return;
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${assembly.identity.slug}.reference.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div
            data-testid="designer-publish-drawer"
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex"
        >
            <button
                type="button"
                aria-label="Close publish drawer"
                data-testid="designer-publish-backdrop"
                onClick={onClose}
                className="absolute inset-0 bg-black/40"
            />
            <div className="ml-auto relative w-full max-w-xl h-full bg-white border-l border-neutral-200 shadow-xl flex flex-col">
                <header className="px-6 py-5 border-b border-neutral-200 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                            Publication
                        </p>
                        <h2 className="text-lg font-bold text-black mt-1">Publish readiness</h2>
                    </div>
                    <button
                        type="button"
                        data-testid="designer-publish-close"
                        onClick={onClose}
                        className="text-neutral-500 hover:text-black text-sm"
                    >
                        Close
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto">
                    {!assembly && (
                        <div data-testid="publish-empty" className="p-6 text-xs text-neutral-500">
                            No assembly loaded.
                        </div>
                    )}

                    {assembly && readiness && (
                        <>
                            <section className="px-6 py-4 border-b border-neutral-200">
                                <ReadinessBadge ok={readiness.ok} issueCount={readiness.issues.length} />
                                {readiness.issues.length > 0 && (
                                    <ul data-testid="publish-issues" className="mt-3 space-y-2">
                                        {readiness.issues.map((issue, idx) => (
                                            <IssueRow key={idx} issue={issue} />
                                        ))}
                                    </ul>
                                )}
                                {onPublish && (
                                    <div className="mt-4">
                                        <button
                                            type="button"
                                            data-testid="designer-publish-commit"
                                            onClick={handlePublish}
                                            disabled={publishState.kind === "publishing"}
                                            className="text-xs px-3 py-1.5 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {publishState.kind === "publishing"
                                                ? "Publishing…"
                                                : "Publish to workspace"}
                                        </button>
                                        <p className="text-[10px] text-neutral-500 mt-1">
                                            Writes <span className="font-mono">lib/shared/assemblies/{assembly.identity.slug}.reference.json</span> and registers it in <span className="font-mono">assembly.ts</span>.
                                        </p>
                                        {publishState.kind === "result" && (
                                            <PublishResultPanel result={publishState.result} />
                                        )}
                                    </div>
                                )}
                            </section>

                            <section className="px-6 py-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                                        Assembly document
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            data-testid="designer-publish-download"
                                            onClick={handleDownload}
                                            className="text-xs px-3 py-1 rounded border border-neutral-300 bg-white hover:border-neutral-400"
                                        >
                                            Download
                                        </button>
                                        <button
                                            type="button"
                                            data-testid="designer-publish-copy"
                                            onClick={handleCopy}
                                            className="text-xs px-3 py-1 rounded border border-neutral-300 bg-white hover:border-neutral-400"
                                        >
                                            {copied ? "Copied" : "Copy JSON"}
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    data-testid="designer-publish-json"
                                    readOnly
                                    value={json}
                                    className="w-full h-80 text-[11px] font-mono border border-neutral-200 rounded p-2 bg-neutral-50"
                                />
                            </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function ReadinessBadge({ ok, issueCount }: { ok: boolean; issueCount: number }) {
    if (ok) {
        return (
            <div
                data-testid="publish-readiness-ok"
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs"
            >
                <span>✓</span>
                <span>Ready to publish</span>
            </div>
        );
    }
    return (
        <div
            data-testid="publish-readiness-blocked"
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs"
        >
            <span>⚠</span>
            <span>{issueCount} issue{issueCount === 1 ? "" : "s"}</span>
        </div>
    );
}

function PublishResultPanel({ result }: { result: PublishAssemblyResult }) {
    if (result.ok) {
        return (
            <div
                data-testid="publish-commit-success"
                className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs"
            >
                <p className="text-green-800 font-semibold">Published.</p>
                <p className="text-neutral-600 mt-1">
                    File: <span className="font-mono">{result.outputPath}</span>
                </p>
                <p className="text-neutral-600">
                    Registry: <span className="font-mono">{result.registryPath}</span>
                </p>
                <p className="text-neutral-600">
                    Prototype:{" "}
                    <a
                        href={result.prototypePath}
                        className="font-mono underline text-blue-700"
                    >
                        {result.prototypePath}
                    </a>
                </p>
            </div>
        );
    }
    return (
        <div
            data-testid="publish-commit-failure"
            className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs"
        >
            <p className="text-red-800 font-semibold mb-1">Publish blocked.</p>
            <ul className="space-y-1">
                {result.issues.map((issue, idx) => (
                    <li key={idx}>
                        <span className="font-mono text-[10px] text-neutral-500">{issue.path}</span>{" "}
                        <span className="text-neutral-800">{issue.message}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function IssueRow({ issue }: { issue: AssemblyValidationIssue }) {
    const tone =
        issue.severity === "error"
            ? "border-red-200 bg-red-50"
            : "border-amber-200 bg-amber-50";
    return (
        <li
            data-testid={`publish-issue-${issue.severity}`}
            className={`text-xs rounded border px-3 py-2 ${tone}`}
        >
            <p className="font-mono text-[10px] text-neutral-500">{issue.path}</p>
            <p className="text-neutral-800 mt-0.5">{issue.message}</p>
        </li>
    );
}
