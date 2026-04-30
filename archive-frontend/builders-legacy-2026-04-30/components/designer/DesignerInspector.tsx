"use client";

/**
 * DesignerInspector — right rail. Shows the selected binding's properties
 * with plain-language labels + an Advanced disclosure for raw field access.
 *
 * Owns no state — every change calls `onChange` with the patch and the
 * parent applies it to the assembly draft.
 */

import { useState } from "react";
import type { Assembly, ModuleBinding } from "@/lib/shared/assembly";
import type { BindingKey } from "@/components/core/designer/DesignerCanvas";
import type { BindingPatch, IdentityPatch } from "@/lib/shared/designerOps";
import { getBlockForModule } from "@/lib/shared/blockMetadata";

export interface DesignerInspectorProps {
    assembly: Assembly | null;
    selectedBindingKey: BindingKey | null;
    onChange: (key: BindingKey, patch: BindingPatch) => void;
    onRemove: (moduleId: string, slot: string) => void;
    /**
     * When true, the inspector renders an editable identity panel
     * (name / slug / description) whenever no binding is selected.
     * Wire to `false` for reference assemblies (immutable identity);
     * `true` for blank user drafts.
     */
    editableIdentity?: boolean;
    onIdentityChange?: (patch: IdentityPatch) => void;
}

export function DesignerInspector({
    assembly,
    selectedBindingKey,
    onChange,
    onRemove,
    editableIdentity,
    onIdentityChange,
}: DesignerInspectorProps) {
    const binding = findBinding(assembly, selectedBindingKey);
    const block = binding ? getBlockForModule(binding.moduleId) : undefined;
    const showIdentityEditor = !binding && editableIdentity && assembly && onIdentityChange;
    const [advancedOpen, setAdvancedOpen] = useState(false);

    return (
        <aside
            data-testid="designer-inspector"
            className="w-80 shrink-0 border-l border-neutral-200 bg-white overflow-y-auto"
        >
            <div className="px-6 py-5 border-b border-neutral-200 sticky top-0 bg-white">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Inspector
                </p>
                <h2 className="text-lg font-bold text-black mt-1">Properties</h2>
            </div>

            {!binding && !showIdentityEditor && (
                <div data-testid="inspector-empty" className="px-6 py-6 text-xs text-neutral-600 leading-relaxed">
                    Select a block on the canvas to edit its properties. Blocks that have been added to slots show up with a blue ring when selected.
                </div>
            )}

            {!binding && showIdentityEditor && (
                <div data-testid="inspector-identity" className="px-6 py-5 space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                        Draft identity
                    </p>
                    <Field
                        label="Name"
                        description="Display name for this assembly."
                        testId="inspector-identity-name"
                        value={assembly.identity.name}
                        onChange={(v) => onIdentityChange({ name: v })}
                    />
                    <Field
                        label="Slug"
                        description="URL-safe identifier. Kebab-case; invalid slugs are silently rejected."
                        testId="inspector-identity-slug"
                        value={assembly.identity.slug}
                        onChange={(v) => onIdentityChange({ slug: v })}
                        mono
                    />
                    <Field
                        label="Description"
                        description="One or two sentences describing what this assembly coordinates."
                        testId="inspector-identity-description"
                        value={assembly.identity.description ?? ""}
                        onChange={(v) => onIdentityChange({ description: v })}
                    />
                </div>
            )}

            {binding && (
                <div data-testid="inspector-form" className="px-6 py-5 space-y-5">
                    <div>
                        <p className="text-xs text-neutral-500 mb-1">Block</p>
                        <p className="text-sm font-semibold text-black">{block?.displayName ?? binding.moduleId}</p>
                        {block?.description && (
                            <p className="text-xs text-neutral-600 mt-1 leading-relaxed">{block.description}</p>
                        )}
                    </div>

                    <div>
                        <p className="text-xs text-neutral-500 mb-1">Slot</p>
                        <p className="text-sm text-neutral-800">{binding.slot.replace(/-/g, " ")}</p>
                    </div>

                    <NumberField
                        label="Priority"
                        description="When more than one block is in the same slot, lower numbers render first."
                        testId="inspector-priority"
                        value={binding.priority}
                        onChange={(v) => onChange(selectedBindingKey!, { priority: v })}
                    />

                    <details
                        className="rounded border border-neutral-200 bg-neutral-50 p-3"
                        open={advancedOpen}
                        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
                    >
                        <summary className="text-xs font-semibold text-neutral-700 cursor-pointer select-none">
                            Advanced
                        </summary>
                        <div className="mt-3 space-y-3">
                            <p className="text-xs text-neutral-600 leading-relaxed">
                                Low-level binding fields. Change these only if you know what a module expects — incorrect values break rendering without a build-time error.
                            </p>
                            <Field
                                label="Component kind"
                                description="The module variant to render (module-specific)."
                                testId="inspector-componentKind"
                                value={binding.componentKind}
                                onChange={(v) => onChange(selectedBindingKey!, { componentKind: v })}
                                mono
                            />
                            <Field
                                label="Semantic input"
                                description="The data-binding key the module consumes."
                                testId="inspector-semanticInput"
                                value={binding.semanticInput}
                                onChange={(v) => onChange(selectedBindingKey!, { semanticInput: v })}
                                mono
                            />
                            <p className="text-[11px] text-neutral-500 font-mono break-all pt-2 border-t border-neutral-200">
                                moduleId: {binding.moduleId}
                            </p>
                        </div>
                    </details>

                    <button
                        type="button"
                        data-testid="inspector-remove"
                        onClick={() => onRemove(binding.moduleId, binding.slot)}
                        className="w-full text-xs px-3 py-2 rounded border border-red-200 bg-white text-red-600 hover:border-red-400"
                    >
                        Remove binding
                    </button>
                </div>
            )}
        </aside>
    );
}

function findBinding(
    assembly: Assembly | null,
    key: BindingKey | null,
): ModuleBinding | undefined {
    if (!assembly || !key) return undefined;
    return assembly.modules.find((m) => m.moduleId === key.moduleId && m.slot === key.slot);
}

function Field({
    label,
    description,
    testId,
    value,
    onChange,
    mono,
}: {
    label: string;
    description?: string;
    testId: string;
    value: string;
    onChange: (v: string) => void;
    mono?: boolean;
}) {
    return (
        <label className="block">
            <span className="text-xs font-semibold text-neutral-700">{label}</span>
            {description && (
                <span className="block text-xs text-neutral-500 leading-relaxed mt-0.5">{description}</span>
            )}
            <input
                data-testid={testId}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`mt-1.5 w-full text-sm border border-neutral-300 rounded px-2 py-1.5 ${mono ? "font-mono" : ""}`}
            />
        </label>
    );
}

function NumberField({
    label,
    description,
    testId,
    value,
    onChange,
}: {
    label: string;
    description?: string;
    testId: string;
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <label className="block">
            <span className="text-xs font-semibold text-neutral-700">{label}</span>
            {description && (
                <span className="block text-xs text-neutral-500 leading-relaxed mt-0.5">{description}</span>
            )}
            <input
                data-testid={testId}
                type="number"
                value={value}
                onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isNaN(n)) onChange(n);
                }}
                className="mt-1.5 w-full text-sm border border-neutral-300 rounded px-2 py-1.5"
            />
        </label>
    );
}
