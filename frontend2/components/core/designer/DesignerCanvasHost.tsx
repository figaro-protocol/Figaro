"use client";

/**
 * DesignerCanvasHost — the 3-column canvas surface (palette + canvas +
 * inspector + toolbar). Works on a single assembly draft at a time.
 *
 * Used by the route-level pages:
 *   - /builders/designer/new            (initial = blank assembly)
 *   - /builders/designer/edit/[slug]    (initial = fork of a reference)
 *
 * For view-only display of an assembly, use `DesignerCanvas` directly
 * without edit callbacks — the read-only canvas route does not need
 * this host.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DesignerPalette } from "@/components/core/designer/DesignerPalette";
import {
    DesignerCanvas,
    type SlotKey,
    type BindingKey,
} from "@/components/core/designer/DesignerCanvas";
import { DesignerInspector } from "@/components/core/designer/DesignerInspector";
import { DesignerPublishDrawer } from "@/components/core/designer/DesignerPublishDrawer";
import { publishAssemblyAction } from "@/app/builders/authoring/actions";
import { getBlockMetadata, listBlockMetadata } from "@/lib/shared/blockMetadata";
import { registerAllModules } from "@/components/modules/registerAllModules";
import {
    addBlockToSlot,
    removeBindingFromSlot,
    updateBinding,
    addView,
    removeView,
    addSlotToView,
    removeSlotFromView,
    addRole,
    removeRole,
    setAssemblyIdentity,
    type BindingPatch,
    type IdentityPatch,
} from "@/lib/shared/designerOps";
import type { Assembly } from "@/lib/shared/assembly";

registerAllModules();

export interface DesignerCanvasHostProps {
    initialAssembly: Assembly;
    /** When true, identity fields (name / slug / description) are editable in the inspector. */
    identityEditable?: boolean;
}

export function DesignerCanvasHost({
    initialAssembly,
    identityEditable = true,
}: DesignerCanvasHostProps) {
    const router = useRouter();
    const blocks = useMemo(() => listBlockMetadata(), []);

    const [assembly, setAssembly] = useState<Assembly>(initialAssembly);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [selectedSlotKey, setSelectedSlotKey] = useState<SlotKey | null>(null);
    const [selectedBindingKey, setSelectedBindingKey] = useState<BindingKey | null>(null);
    const [publishOpen, setPublishOpen] = useState(false);

    const handleAdd = useCallback(() => {
        if (!selectedBlockId || !selectedSlotKey) return;
        const block = getBlockMetadata(selectedBlockId);
        if (!block) return;
        setAssembly((prev) => addBlockToSlot(prev, block, selectedSlotKey.viewId, selectedSlotKey.slot));
    }, [selectedBlockId, selectedSlotKey]);

    const handleAddBlockDrop = useCallback(
        (blockId: string, viewId: string, slot: string) => {
            const block = getBlockMetadata(blockId);
            if (!block) return;
            setAssembly((prev) => addBlockToSlot(prev, block, viewId, slot));
        },
        [],
    );

    const handleRemove = useCallback(
        (moduleId: string, slot: string) => {
            setAssembly((prev) => removeBindingFromSlot(prev, moduleId, slot));
            if (selectedBindingKey?.moduleId === moduleId && selectedBindingKey?.slot === slot) {
                setSelectedBindingKey(null);
            }
        },
        [selectedBindingKey],
    );

    const handleBindingChange = useCallback(
        (key: BindingKey, patch: BindingPatch) => {
            setAssembly((prev) => updateBinding(prev, key.moduleId, key.slot, patch));
        },
        [],
    );

    const handleAddView = useCallback(() => {
        const viewId = typeof window === "undefined"
            ? null
            : window.prompt("New view id (kebab-case):");
        if (!viewId) return;
        const title = typeof window === "undefined"
            ? viewId
            : window.prompt("View title:", viewId) ?? viewId;
        setAssembly((prev) => addView(prev, { viewId, title }));
    }, []);

    const handleRemoveView = useCallback(
        (viewId: string) => {
            const confirmed = typeof window === "undefined"
                ? true
                : window.confirm(`Remove view "${viewId}" and its bindings?`);
            if (!confirmed) return;
            setAssembly((prev) => removeView(prev, viewId));
            if (selectedSlotKey?.viewId === viewId) setSelectedSlotKey(null);
        },
        [selectedSlotKey],
    );

    const handleAddSlotToView = useCallback(
        (viewId: string) => {
            const slot = typeof window === "undefined"
                ? null
                : window.prompt(`New slot name for view "${viewId}" (kebab-case):`);
            if (!slot) return;
            setAssembly((prev) => addSlotToView(prev, viewId, slot));
        },
        [],
    );

    const handleRemoveSlotFromView = useCallback(
        (viewId: string, slot: string) => {
            setAssembly((prev) => removeSlotFromView(prev, viewId, slot));
            if (selectedSlotKey?.viewId === viewId && selectedSlotKey?.slot === slot) {
                setSelectedSlotKey(null);
            }
        },
        [selectedSlotKey],
    );

    const handleAddRole = useCallback(() => {
        const roleKind = typeof window === "undefined"
            ? null
            : window.prompt("New role kind (kebab-case):");
        if (!roleKind) return;
        const displayName = typeof window === "undefined"
            ? roleKind
            : window.prompt("Role display name:", roleKind) ?? roleKind;
        setAssembly((prev) => addRole(prev, { roleKind, displayName }));
    }, []);

    const handleRemoveRole = useCallback(
        (roleKind: string) => {
            const confirmed = typeof window === "undefined"
                ? true
                : window.confirm(`Remove role "${roleKind}"?`);
            if (!confirmed) return;
            setAssembly((prev) => removeRole(prev, roleKind));
        },
        [],
    );

    const handleIdentityChange = useCallback(
        (patch: IdentityPatch) => {
            setAssembly((prev) => setAssemblyIdentity(prev, patch));
        },
        [],
    );

    const handleBackToLanding = useCallback(() => {
        router.push("/builders/designer");
    }, [router]);

    const canAdd = Boolean(selectedBlockId && selectedSlotKey);

    return (
        <div className="flex min-h-screen bg-neutral-50" data-testid="designer-page">
            <DesignerPalette
                blocks={blocks}
                assembly={assembly}
                selectedBlockId={selectedBlockId}
                onSelectBlock={setSelectedBlockId}
            />
            <div className="flex-1 flex flex-col">
                <div
                    data-testid="designer-toolbar"
                    className="px-8 py-4 border-b border-neutral-200 bg-white flex items-center gap-3 flex-wrap"
                >
                    <button
                        type="button"
                        data-testid="designer-back-to-landing"
                        onClick={handleBackToLanding}
                        className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-400"
                    >
                        ← Assemblies
                    </button>
                    <span className="text-sm font-semibold text-black">
                        {assembly.identity.name}
                    </span>
                    <span className="font-mono text-xs text-neutral-500">
                        /{assembly.identity.slug}
                    </span>

                    <div className="flex items-center gap-2 ml-auto">
                        <span data-testid="designer-action-hint" className="text-xs text-neutral-600">
                            {!selectedBlockId && "Drag a block from the palette — or click a block, then a slot."}
                            {selectedBlockId && !selectedSlotKey && "Block selected. Click a slot on the canvas."}
                            {selectedBlockId && selectedSlotKey && (
                                <>
                                    Add <span className="font-mono">{selectedBlockId}</span> to{" "}
                                    <span className="font-mono">
                                        {selectedSlotKey.viewId}/{selectedSlotKey.slot}
                                    </span>
                                </>
                            )}
                        </span>
                        <button
                            type="button"
                            data-testid="designer-add-binding"
                            onClick={handleAdd}
                            disabled={!canAdd}
                            className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-400 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Add to slot
                        </button>
                        <button
                            type="button"
                            data-testid="designer-open-publish"
                            onClick={() => setPublishOpen(true)}
                            className="text-xs px-3 py-1.5 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:border-blue-400"
                        >
                            Publish…
                        </button>
                    </div>
                </div>
                <DesignerCanvas
                    assembly={assembly}
                    selectedSlotKey={selectedSlotKey}
                    onSelectSlot={setSelectedSlotKey}
                    selectedBindingKey={selectedBindingKey}
                    onSelectBinding={setSelectedBindingKey}
                    onRemoveBinding={handleRemove}
                    onAddView={handleAddView}
                    onRemoveView={handleRemoveView}
                    onAddSlotToView={handleAddSlotToView}
                    onRemoveSlotFromView={handleRemoveSlotFromView}
                    onAddRole={handleAddRole}
                    onRemoveRole={handleRemoveRole}
                    onAddBlock={handleAddBlockDrop}
                />
            </div>
            <DesignerInspector
                assembly={assembly}
                selectedBindingKey={selectedBindingKey}
                onChange={handleBindingChange}
                onRemove={handleRemove}
                editableIdentity={identityEditable}
                onIdentityChange={handleIdentityChange}
            />
            <DesignerPublishDrawer
                assembly={assembly}
                open={publishOpen}
                onClose={() => setPublishOpen(false)}
                onPublish={publishAssemblyAction}
            />
        </div>
    );
}
