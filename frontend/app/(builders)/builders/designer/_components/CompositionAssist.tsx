"use client";

/**
 * CompositionAssist — the canvas's hand-off surface to the designer's OWN
 * agent (punch-list block 9: composition-assist).
 *
 * The world is the PUBLIC ecosystem seam: `figaro-assembly-designer` is a
 * prompt-defined agent any designer runs in their own agent runtime, acting
 * for their own wallet (`ecosystem-agents/figaro-assembly-designer.md`;
 * `docs/AI_AGENT_COORDINATION.md` owns the seam). This frontend is a static
 * export with zero server routes, and assistance is the designer's DELEGATE
 * — so nothing is invoked from here. The surface is a round-trip:
 *
 *   OUT — the current canvas serialized as the canonical `AssemblyTemplate`
 *         JSON (the exact artifact shape the agent composes and hashes;
 *         built by the same `buildAssemblyTemplate` walk publish uses), for
 *         the designer to hand their agent as its starting point.
 *   IN  — the agent's template pasted back, parsed + soundness-probed
 *         (`parseAssemblyTemplateJson`), then applied to the canvas as an
 *         ordinary draft. Composition stays the designer's act: the import
 *         lands as unsaved canvas state to review, edit, and publish through
 *         the normal review page — nothing auto-publishes.
 */

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { buildAssemblyTemplate, serializeAssemblyTemplate } from "@figaro/sdk";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import { parseAssemblyTemplateJson } from "@/lib/designer/assemblyTemplateToDraft";
import { ModalChrome } from "@/components/ui/ModalChrome";

interface CompositionAssistProps {
    /** The canvas's current composition, or null when there is nothing to
     *  serialize (no orders). */
    getSnapshot: () => DesignSnapshot | null;
    /** Apply an imported template to the canvas (the canvas owns the
     *  replace-confirmation and the state swap). Returns false when the
     *  designer declines the replacement — the panel then stays open with
     *  the pasted text intact. */
    onImportTemplate: (template: AssemblyTemplate) => boolean;
}

/** The current draft as pretty-printed canonical template JSON, or an
 *  explanatory fallback. Pretty-printing is display-only — the composition
 *  hash walks the parsed structure, never the string. */
function serializeDraft(snapshot: DesignSnapshot | null): { json: string | null; error: string | null } {
    if (!snapshot) return { json: null, error: "Add at least one order to the canvas first." };
    try {
        const template = buildAssemblyTemplate({
            name: snapshot.name.trim() || undefined,
            summary: snapshot.summary?.trim() || undefined,
            description: snapshot.description?.trim() || undefined,
            orders: snapshot.orders,
            clausesByOrderId: snapshot.clausesByOrderId ?? {},
            clauseVersionsByOrderId: snapshot.clauseVersionsByOrderId,
            specs: specSource(),
        });
        const { json } = serializeAssemblyTemplate(template);
        return { json: JSON.stringify(JSON.parse(json), null, 2), error: null };
    } catch (cause) {
        return { json: null, error: extractErrorMessage(cause, "Could not serialize the draft.") };
    }
}

export function CompositionAssist({ getSnapshot, onImportTemplate }: CompositionAssistProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [importText, setImportText] = useState("");
    const [importError, setImportError] = useState<string | null>(null);

    // Serialized on open (memo keyed on `open`) — the canvas can't change
    // while the modal is up, and closing drops the stale string.
    const draft = useMemo(
        () => (open ? serializeDraft(getSnapshot()) : { json: null, error: null }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [open],
    );

    const handleCopy = useCallback(() => {
        if (!draft.json) return;
        void navigator.clipboard.writeText(draft.json).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [draft.json]);

    const handleImport = useCallback(() => {
        const parsed = parseAssemblyTemplateJson(importText);
        if (!parsed.ok) {
            setImportError(parsed.error);
            return;
        }
        try {
            if (!onImportTemplate(parsed.template)) return;
            setImportError(null);
            setImportText("");
            setOpen(false);
        } catch (cause) {
            // Hydration projects every section through the chain-loaded clause
            // specs — a clause this network's ClauseRegistry doesn't carry
            // fails here, before any state is replaced.
            setImportError(extractErrorMessage(
                cause,
                "Could not hydrate the template — does it compose a clause not registered on this network?",
            ));
        }
    }, [importText, onImportTemplate]);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-testid="designer-assist-open"
                className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong shrink-0"
                title="Hand this draft to your own agent (figaro-assembly-designer) and import its composition back. Assistance runs in your runtime, with your wallet — composing stays your act."
            >
                Agent assist
            </button>
            {open && (
                <ModalChrome
                    onClose={() => setOpen(false)}
                    aria-labelledby="composition-assist-title"
                    align="top"
                    data-testid="designer-assist-backdrop"
                    panelTestId="designer-assist-panel"
                    panelClassName="bg-paper rounded-lg border border-default shadow-xl w-full max-w-2xl mx-4 my-6 p-6 space-y-5"
                >
                    <div className="flex items-start justify-between gap-4">
                        <h2 id="composition-assist-title" className="text-heading-h3 text-ink-heading">
                            Compose with your agent
                        </h2>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="Close"
                            className="text-ink-muted hover:text-ink-heading text-lg leading-none"
                        >
                            ×
                        </button>
                    </div>
                    <p className="text-sm text-ink-body leading-relaxed">
                        <code className="text-xs">figaro-assembly-designer</code> is a public ecosystem
                        agent — a prompt you run in your own agent runtime, acting for your own wallet
                        (<Link href="/agents" className="underline">how agents participate</Link>).
                        Hand it the template below as its starting point; it composes or forks and
                        returns a template. Paste that back here to continue on the canvas — you
                        review, edit, and publish. Invoked assistance is your delegate; composing
                        stays your act.
                    </p>

                    <div className="space-y-2">
                        <div className="flex items-baseline justify-between">
                            <h3 className="text-xs font-semibold text-ink-heading">
                                Your draft — the template your agent starts from
                            </h3>
                            {draft.json && (
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    data-testid="designer-assist-copy"
                                    className="text-[11px] px-2 py-1 rounded border border-default bg-paper hover:border-default-strong"
                                >
                                    {copied ? "Copied" : "Copy"}
                                </button>
                            )}
                        </div>
                        {draft.json ? (
                            <textarea
                                readOnly
                                value={draft.json}
                                rows={8}
                                aria-label="Current draft as assembly-template JSON"
                                data-testid="designer-assist-template"
                                className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-default bg-subtle text-ink-body resize-y"
                            />
                        ) : (
                            <p className="text-xs text-ink-muted" data-testid="designer-assist-template-empty">
                                {draft.error}
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-ink-heading">
                            Import your agent&apos;s template
                        </h3>
                        <textarea
                            value={importText}
                            onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
                            rows={8}
                            placeholder='Paste the AssemblyTemplate JSON your agent returned — {"agreements": [...]}'
                            aria-label="Template JSON to import"
                            data-testid="designer-assist-import-input"
                            className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-default bg-paper text-ink-body placeholder:text-ink-muted resize-y focus:outline-none focus:ring-2 focus:ring-focus"
                        />
                        {importError && (
                            <p className="text-xs text-red-600" data-testid="designer-assist-import-error">
                                {importError}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={handleImport}
                            disabled={importText.trim() === ""}
                            data-testid="designer-assist-import"
                            className="text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle text-ink-heading font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Import to canvas
                        </button>
                    </div>
                </ModalChrome>
            )}
        </>
    );
}
