"use client";

/**
 * ProseSheet — canvas-side authoring surface for the four prose fields
 * the future canvas → assembly derivation needs but cannot infer from
 * the topology:
 *
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
 * Mounted via the toolbar "Prose" button on both /new and /edit/[slug]
 * canvases. Closed by ESC, backdrop click, or the Done button.
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

export function ProseSheet({ open, onClose, orders, values, onChange }: Props) {
    const descId = useId();
    const summaryId = useId();
    const builderNotesId = useId();
    const titleId = useId();

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
            align="top"
            panelClassName="w-full max-w-2xl rounded-lg bg-paper shadow-xl my-6 max-h-[calc(100vh-3rem)] overflow-y-auto"
            panelTestId="prose-sheet"
        >
            <div className="p-6 space-y-6">
                <header className="space-y-1">
                    <h2 id={titleId} className="text-base font-semibold text-ink-heading">
                        Assembly prose
                    </h2>
                    <p className="text-xs text-ink-muted leading-relaxed">
                        Authored fields used when this design is published as an
                        assembly. Unset fields fall back to defaults — leave them
                        blank if a default is fine.
                    </p>
                </header>

                <FormField label="Description" inputId={descId}>
                    <textarea
                        id={descId}
                        rows={3}
                        className={TEXTAREA_CLASS}
                        placeholder="One- or two-sentence description of what this assembly does."
                        value={values.description ?? ""}
                        onChange={(e) => onChange({ description: e.target.value })}
                        data-testid="prose-sheet-description"
                    />
                </FormField>

                <FormField label="Narrative summary" inputId={summaryId}>
                    <textarea
                        id={summaryId}
                        rows={4}
                        className={TEXTAREA_CLASS}
                        placeholder="Longer-form summary of the assembly's purpose and shape. Read by participants exploring the runtime."
                        value={values.narrativeSummary ?? ""}
                        onChange={(e) => onChange({ narrativeSummary: e.target.value })}
                        data-testid="prose-sheet-narrative-summary"
                    />
                </FormField>

                <FormField label="Builder notes" inputId={builderNotesId}>
                    <textarea
                        id={builderNotesId}
                        rows={3}
                        className={TEXTAREA_CLASS}
                        placeholder="When to use this assembly, caveats, variations. Audience: other designers."
                        value={values.builderNotes ?? ""}
                        onChange={(e) => onChange({ builderNotes: e.target.value })}
                        data-testid="prose-sheet-builder-notes"
                    />
                </FormField>

                <section className="space-y-2" data-testid="prose-sheet-mechanisms">
                    <h3 className="text-xs font-semibold text-ink-heading uppercase tracking-wide">
                        Mechanisms ({mechanismKinds.length})
                    </h3>
                    {mechanismKinds.length === 0 ? (
                        <p className="text-xs text-ink-muted leading-relaxed">
                            No mechanisms are referenced yet. Compose drawer clauses
                            (figaro-fulfilment-v2, figaro-merchant-process-v1, etc.) to
                            see them listed here.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {mechanismKinds.map((kind) => (
                                <li
                                    key={kind}
                                    className="grid grid-cols-[7rem_1fr] items-center gap-3"
                                >
                                    <span className="text-xs font-mono text-ink-muted">
                                        {kind}
                                    </span>
                                    <Input
                                        type="text"
                                        placeholder={`(default: registry name for "${kind}")`}
                                        value={values.mechanismLabels?.[kind] ?? ""}
                                        onChange={(e) => setMechanismLabel(kind, e.target.value)}
                                        data-testid={`prose-sheet-mechanism-${kind}`}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="space-y-2" data-testid="prose-sheet-roles">
                    <h3 className="text-xs font-semibold text-ink-heading uppercase tracking-wide">
                        Roles ({roleKinds.length})
                    </h3>
                    <ul className="space-y-3">
                        {roleKinds.map((roleKind) => (
                            <li
                                key={roleKind}
                                className="space-y-2 rounded border border-default p-3"
                            >
                                <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                                    <span className="text-xs font-mono text-ink-muted">
                                        {roleKind}
                                    </span>
                                    <Input
                                        type="text"
                                        placeholder={`(default: capitalized "${roleKind}")`}
                                        value={values.roleLabels?.[roleKind]?.displayName ?? ""}
                                        onChange={(e) => setRoleDisplayName(roleKind, e.target.value)}
                                        data-testid={`prose-sheet-role-name-${roleKind}`}
                                    />
                                </div>
                                <FormField
                                    label="Sample capabilities (comma-separated kind ids)"
                                    inputId={`${titleId}-caps-${roleKind}`}
                                >
                                    <Input
                                        id={`${titleId}-caps-${roleKind}`}
                                        type="text"
                                        placeholder="(default: registry capabilities for this role)"
                                        value={capsDraft[roleKind] ?? ""}
                                        onChange={(e) =>
                                            setCapsDraft((prev) => ({ ...prev, [roleKind]: e.target.value }))
                                        }
                                        onBlur={(e) => commitRoleCapabilities(roleKind, e.target.value)}
                                        data-testid={`prose-sheet-role-caps-${roleKind}`}
                                    />
                                </FormField>
                            </li>
                        ))}
                    </ul>
                </section>

                <footer className="flex justify-end pt-2 border-t border-default">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle font-semibold"
                        data-testid="prose-sheet-done"
                    >
                        Done
                    </button>
                </footer>
            </div>
        </ModalChrome>
    );
}
