"use client";

/**
 * ProseSheet — consolidated authoring + save surface for the canvas. Holds
 * the assembly's display name plus the prose fields the canvas → assembly
 * derivation cannot infer from topology:
 *
 *   - identity.displayName           (assembly-level — the draft's name)
 *   - identity.description           (assembly-level)
 *   - narrative.assemblySummary      (assembly-level)
 *   - narrative.builderNotes         (assembly-level)
 *   - mechanism.displayName          (per mechanism kind)
 *   - role.displayName               (per role kind)
 *   - role.sampleCapabilities        (per role kind, comma-separated)
 *
 * Mechanism kinds and role kinds are derived live from the current
 * orders via `deriveDesignSurface`. Each row shows the kind label and a
 * rename input; unset rows fall back to registry defaults at derivation
 * time.
 *
 * Mounted via the toolbar save button on both /new and /edit/[slug]
 * canvases. The footer's primary action invokes `onSave` (named-draft
 * persistence in the parent) and closes; Close / ESC / backdrop close
 * without saving — autosave still runs in the background regardless.
 */

import { useId, useMemo, useState } from "react";
import { ModalChrome } from "@/components/ui/ModalChrome";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import type { DesignRoleLabel } from "@/lib/designer/syntheticDesignStore";
import type { Order } from "@/lib/core/store";
import {
    getMechanismKindsForDesign,
    getRoleKindsForDesign,
} from "@/lib/designer/deriveDesignSurface";

export interface ProseSheetValues {
    description?: string;
    narrativeSummary?: string;
    builderNotes?: string;
    mechanismLabels?: Record<string, string>;
    roleLabels?: Record<string, DesignRoleLabel>;
}

interface Props {
    open: boolean;
    onClose: () => void;
    orders: readonly Order[];
    values: ProseSheetValues;
    onChange: (patch: ProseSheetValues) => void;
    name: string;
    onNameChange: (name: string) => void;
    onSave: () => void;
    saveLabel: string;
    /** Copies the in-memory DesignSnapshot + inlined per-order agreements
     *  to clipboard. Local-only; no IPFS pin, no on-chain anchor — just a
     *  clipboard hand-off so the design can be shared verbatim, drawer
     *  selections included. */
    onExport: () => void;
    /** Publish the design as an on-chain assembly via AssemblyRegistry.
     *  Pins the manifest to IPFS, then calls registerAssembly under the
     *  matching class validator. Irreversible — slug binding is permanent. */
    onPublish: () => void;
    /** True while a publish operation is in flight (IPFS pin + tx send +
     *  confirmation). Disables the Publish button to prevent double-submit. */
    publishInFlight?: boolean;
}

const TEXTAREA_CLASS =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-black placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400";

function splitCommaList(value: string): string[] {
    return value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

function joinCommaList(list: readonly string[] | undefined): string {
    return list ? list.join(", ") : "";
}

export function ProseSheet({
    open,
    onClose,
    orders,
    values,
    onChange,
    name,
    onNameChange,
    onSave,
    saveLabel,
    onExport,
    onPublish,
    publishInFlight = false,
}: Props) {
    const nameId = useId();
    const descId = useId();
    const summaryId = useId();
    const builderNotesId = useId();
    const titleId = useId();
    const canSave = name.trim().length > 0;

    const mechanismKinds = useMemo(
        () => getMechanismKindsForDesign(orders),
        [orders],
    );
    const roleKinds = useMemo(
        () => getRoleKindsForDesign(orders),
        [orders],
    );

    // Local field state for the comma-separated capabilities text input.
    // Kept here (not pushed up on every keystroke) so users can type
    // commas and spaces without losing focus / cursor position.
    const [capsDraft, setCapsDraft] = useState<Record<string, string>>(() => {
        const out: Record<string, string> = {};
        for (const roleKind of roleKinds) {
            out[roleKind] = joinCommaList(values.roleLabels?.[roleKind]?.sampleCapabilities);
        }
        return out;
    });

    if (!open) return null;

    function setMechanismLabel(kind: string, displayName: string) {
        const next: Record<string, string> = { ...(values.mechanismLabels ?? {}) };
        if (displayName.trim()) {
            next[kind] = displayName.trim();
        } else {
            delete next[kind];
        }
        onChange({ mechanismLabels: next });
    }

    function setRoleDisplayName(roleKind: string, displayName: string) {
        const next: Record<string, DesignRoleLabel> = { ...(values.roleLabels ?? {}) };
        const existing = next[roleKind];
        const trimmed = displayName.trim();
        if (trimmed) {
            next[roleKind] = { ...existing, displayName: trimmed };
        } else if (existing?.sampleCapabilities && existing.sampleCapabilities.length > 0) {
            // Keep capabilities, drop displayName.
            next[roleKind] = { displayName: "", sampleCapabilities: existing.sampleCapabilities };
        } else {
            delete next[roleKind];
        }
        onChange({ roleLabels: next });
    }

    function commitRoleCapabilities(roleKind: string, rawValue: string) {
        const list = splitCommaList(rawValue);
        const next: Record<string, DesignRoleLabel> = { ...(values.roleLabels ?? {}) };
        const existing = next[roleKind];
        if (list.length > 0) {
            next[roleKind] = {
                displayName: existing?.displayName ?? "",
                sampleCapabilities: list,
            };
        } else if (existing?.displayName) {
            next[roleKind] = { displayName: existing.displayName };
        } else {
            delete next[roleKind];
        }
        onChange({ roleLabels: next });
    }

    return (
        <ModalChrome
            onClose={onClose}
            aria-labelledby={titleId}
            align="center"
            panelClassName="w-full max-w-xl rounded-lg bg-paper shadow-xl max-h-[85vh] flex flex-col"
            panelTestId="prose-sheet"
        >
            <header className="px-4 py-3 border-b border-default shrink-0">
                <h2 id={titleId} className="text-sm font-semibold text-ink-heading">
                    Save draft
                </h2>
                <p className="text-[11px] text-ink-muted leading-tight mt-0.5">
                    Name + prose for this assembly. Unset fields fall back to
                    defaults.
                </p>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                <FormField label="Name" inputId={nameId}>
                    <Input
                        id={nameId}
                        type="text"
                        placeholder="e.g. Restaurant delivery (3-party)"
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        data-testid="prose-sheet-name"
                    />
                </FormField>

                <FormField label="Description" inputId={descId}>
                    <textarea
                        id={descId}
                        rows={2}
                        className={TEXTAREA_CLASS}
                        placeholder="One- or two-sentence description."
                        value={values.description ?? ""}
                        onChange={(e) => onChange({ description: e.target.value })}
                        data-testid="prose-sheet-description"
                    />
                </FormField>

                <FormField label="Narrative summary" inputId={summaryId}>
                    <textarea
                        id={summaryId}
                        rows={3}
                        className={TEXTAREA_CLASS}
                        placeholder="Longer-form summary read by participants."
                        value={values.narrativeSummary ?? ""}
                        onChange={(e) => onChange({ narrativeSummary: e.target.value })}
                        data-testid="prose-sheet-narrative-summary"
                    />
                </FormField>

                <FormField label="Builder notes" inputId={builderNotesId}>
                    <textarea
                        id={builderNotesId}
                        rows={2}
                        className={TEXTAREA_CLASS}
                        placeholder="When to use, caveats. Audience: other designers."
                        value={values.builderNotes ?? ""}
                        onChange={(e) => onChange({ builderNotes: e.target.value })}
                        data-testid="prose-sheet-builder-notes"
                    />
                </FormField>

                <section data-testid="prose-sheet-mechanisms">
                    <h3 className="text-[11px] font-semibold text-ink-heading uppercase tracking-wide mb-1.5">
                        Mechanisms ({mechanismKinds.length})
                    </h3>
                    {mechanismKinds.length === 0 ? (
                        <p className="text-[11px] text-ink-muted leading-tight">
                            None referenced yet. Compose drawer clauses to populate.
                        </p>
                    ) : (
                        <ul className="space-y-1.5">
                            {mechanismKinds.map((kind) => (
                                <li
                                    key={kind}
                                    className="grid grid-cols-[6rem_1fr] items-center gap-2"
                                >
                                    <span className="text-[11px] font-mono text-ink-muted">
                                        {kind}
                                    </span>
                                    <Input
                                        type="text"
                                        placeholder={`(default for "${kind}")`}
                                        value={values.mechanismLabels?.[kind] ?? ""}
                                        onChange={(e) => setMechanismLabel(kind, e.target.value)}
                                        data-testid={`prose-sheet-mechanism-${kind}`}
                                        className="h-8 text-xs"
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section data-testid="prose-sheet-roles">
                    <h3 className="text-[11px] font-semibold text-ink-heading uppercase tracking-wide mb-1.5">
                        Roles ({roleKinds.length})
                    </h3>
                    <ul className="space-y-1.5">
                        {roleKinds.map((roleKind) => (
                            <li
                                key={roleKind}
                                className="grid grid-cols-[6rem_1fr_1fr] items-center gap-2"
                            >
                                <span className="text-[11px] font-mono text-ink-muted">
                                    {roleKind}
                                </span>
                                <Input
                                    type="text"
                                    placeholder={`(default: "${roleKind}")`}
                                    value={values.roleLabels?.[roleKind]?.displayName ?? ""}
                                    onChange={(e) => setRoleDisplayName(roleKind, e.target.value)}
                                    data-testid={`prose-sheet-role-name-${roleKind}`}
                                    className="h-8 text-xs"
                                />
                                <Input
                                    type="text"
                                    placeholder="caps (comma-separated)"
                                    value={capsDraft[roleKind] ?? ""}
                                    onChange={(e) =>
                                        setCapsDraft((prev) => ({ ...prev, [roleKind]: e.target.value }))
                                    }
                                    onBlur={(e) => commitRoleCapabilities(roleKind, e.target.value)}
                                    data-testid={`prose-sheet-role-caps-${roleKind}`}
                                    className="h-8 text-xs"
                                />
                            </li>
                        ))}
                    </ul>
                </section>
            </div>

            <footer className="px-4 py-2.5 border-t border-default shrink-0 flex justify-end gap-2">
                <button
                    type="button"
                    onClick={() => {
                        onExport();
                        onClose();
                    }}
                    disabled={!canSave}
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:bg-subtle disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="prose-sheet-export"
                    title="Copy DesignSnapshot + per-order agreements to clipboard"
                >
                    Export JSON
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onPublish();
                        onClose();
                    }}
                    disabled={!canSave || publishInFlight}
                    className="text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="prose-sheet-publish"
                    title="Pin manifest to IPFS + register on-chain via AssemblyRegistry. Irreversible."
                >
                    {publishInFlight ? "Publishing…" : "Publish"}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:bg-subtle"
                    data-testid="prose-sheet-close"
                >
                    Close
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onSave();
                        onClose();
                    }}
                    disabled={!canSave}
                    className="text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="prose-sheet-save"
                >
                    {saveLabel}
                </button>
            </footer>
        </ModalChrome>
    );
}
