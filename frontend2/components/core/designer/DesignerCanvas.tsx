"use client";

/**
 * DesignerCanvas — visualization of an Assembly's structure.
 *
 * Renders the four composable layers a designer arranges:
 *   1. Identity (slug + display name + description)
 *   2. Mechanisms (the kinds the assembly composes)
 *   3. Roles (parties)
 *   4. Views × slots × bound modules (the visible-surface layout)
 *
 * Read-only by default. When `onSelectSlot` / `onRemoveBinding` are passed,
 * slots become clickable (selection ring) and bindings render a remove (×)
 * affordance. The canvas owns no state — selection + mutation live in the
 * parent (the Designer page or any host using the canvas as an editor).
 */

import type { Assembly, ModuleBinding } from "@/lib/shared/assembly";
import { useMemo, useState } from "react";
import { DESIGNER_BLOCK_DND_MIME } from "@/components/core/designer/DesignerPalette";

export interface SlotKey {
    viewId: string;
    slot: string;
}

export interface BindingKey {
    moduleId: string;
    slot: string;
}

export interface DesignerCanvasProps {
    assembly: Assembly | null;
    selectedSlotKey?: SlotKey | null;
    onSelectSlot?: (key: SlotKey) => void;
    selectedBindingKey?: BindingKey | null;
    onSelectBinding?: (key: BindingKey) => void;
    onRemoveBinding?: (moduleId: string, slot: string) => void;
    /** When provided, enables view/slot structural editing (+/× affordances). */
    onAddView?: () => void;
    onRemoveView?: (viewId: string) => void;
    onAddSlotToView?: (viewId: string) => void;
    onRemoveSlotFromView?: (viewId: string, slot: string) => void;
    onAddRole?: () => void;
    onRemoveRole?: (roleKind: string) => void;
    /**
     * Drop handler — called when a block is dropped on a slot. Wire this
     * to enable palette-to-canvas drag-and-drop. When omitted, slots are
     * not drop targets (click-to-add still works via onSelectSlot).
     */
    onAddBlock?: (blockId: string, viewId: string, slot: string) => void;
}

export function DesignerCanvas({
    assembly,
    selectedSlotKey,
    onSelectSlot,
    selectedBindingKey,
    onSelectBinding,
    onRemoveBinding,
    onAddView,
    onRemoveView,
    onAddSlotToView,
    onRemoveSlotFromView,
    onAddRole,
    onRemoveRole,
    onAddBlock,
}: DesignerCanvasProps) {
    const bindingsBySlot = useMemo(() => groupBindingsBySlot(assembly?.modules ?? []), [assembly]);
    const [dragOverSlotKey, setDragOverSlotKey] = useState<string | null>(null);

    if (!assembly) {
        return (
            <div data-testid="designer-canvas-empty" className="flex-1 p-8 text-sm text-neutral-500">
                No assembly loaded. Pick a reference assembly or start a blank draft.
            </div>
        );
    }

    return (
        <section
            data-testid="designer-canvas"
            data-assembly-slug={assembly.identity.slug}
            className="flex-1 overflow-y-auto p-8 space-y-8"
        >
            {/* Identity */}
            <header data-testid="canvas-identity">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1">
                    Assembly draft
                </p>
                <h1 className="text-2xl font-bold text-black">{assembly.identity.name}</h1>
                <p className="font-mono text-xs text-neutral-500 mt-1">/{assembly.identity.slug}</p>
                {assembly.identity.description && (
                    <p className="text-sm text-neutral-700 mt-3 max-w-2xl">{assembly.identity.description}</p>
                )}
                <div className="mt-4 rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700 max-w-2xl">
                    An assembly declares the roles, coordination mechanisms, and display views that compose a Figaro process. Add blocks to slots below. Baseline blocks (the core process shell) are fixed; everything else is yours.
                </div>
            </header>

            {/* Roles */}
            <section data-testid="canvas-roles">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                    Roles
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                    {assembly.roles.map((role) => (
                        <div
                            key={role.roleKind}
                            data-testid={`canvas-role-${role.roleKind}`}
                            className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs flex items-center gap-1.5"
                        >
                            <span className="font-semibold text-black">{role.displayName}</span>
                            <span className="text-neutral-400 font-mono">{role.roleKind}</span>
                            {onRemoveRole && (
                                <button
                                    type="button"
                                    data-testid={`canvas-role-${role.roleKind}-remove`}
                                    onClick={() => onRemoveRole(role.roleKind)}
                                    aria-label={`Remove role ${role.roleKind}`}
                                    className="text-neutral-400 hover:text-red-600 leading-none ml-0.5"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                    {onAddRole && (
                        <button
                            type="button"
                            data-testid="canvas-add-role"
                            onClick={onAddRole}
                            className="text-xs px-3 py-1 rounded-full border border-dashed border-neutral-300 bg-white hover:border-neutral-400 text-neutral-600"
                        >
                            + Add role
                        </button>
                    )}
                </div>
            </section>

            {/* Mechanisms */}
            <section data-testid="canvas-mechanisms">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                    Mechanisms
                </p>
                <div className="space-y-2">
                    {assembly.mechanisms.map((mech) => (
                        <details
                            key={mech.mechanismId}
                            data-testid={`canvas-mechanism-${mech.mechanismId}`}
                            className="rounded border border-neutral-200 bg-white px-3 py-2 group"
                        >
                            <summary className="flex items-baseline justify-between gap-3 cursor-pointer list-none">
                                <span className="text-sm font-semibold text-black">{mech.displayName}</span>
                                <span className="text-xs text-neutral-500 capitalize">{mech.kind}</span>
                            </summary>
                            <div className="mt-2 pt-2 border-t border-neutral-100 space-y-1 text-xs text-neutral-600">
                                <p><span className="text-neutral-500">Risk class:</span> {mech.riskClass}</p>
                                <p><span className="text-neutral-500">Visibility:</span> {mech.visibility}</p>
                                {mech.moduleBindings.length > 0 && (
                                    <p>
                                        <span className="text-neutral-500">Modules:</span>{" "}
                                        <span className="font-mono">{mech.moduleBindings.join(", ")}</span>
                                    </p>
                                )}
                            </div>
                        </details>
                    ))}
                </div>
            </section>

            {/* Views × slots × bound modules */}
            <section data-testid="canvas-views">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                    Views &amp; module bindings
                </p>
                <div className="space-y-4">
                    {assembly.views.map((view) => (
                        <div
                            key={view.viewId}
                            data-testid={`canvas-view-${view.viewId}`}
                            className="rounded-lg border border-neutral-200 bg-white p-4"
                        >
                            <div className="flex items-baseline justify-between gap-3 mb-3">
                                <div>
                                    <span className="text-sm font-semibold text-black">{view.title}</span>
                                    <span className="text-xs text-neutral-500 ml-2 capitalize">{view.kind.replace(/-/g, " ")}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {onAddSlotToView && (
                                        <button
                                            type="button"
                                            data-testid={`canvas-view-${view.viewId}-add-slot`}
                                            onClick={() => onAddSlotToView(view.viewId)}
                                            className="text-[10px] px-2 py-0.5 rounded border border-neutral-300 bg-white hover:border-neutral-400"
                                        >
                                            + Slot
                                        </button>
                                    )}
                                    {onRemoveView && (
                                        <button
                                            type="button"
                                            data-testid={`canvas-view-${view.viewId}-remove`}
                                            onClick={() => onRemoveView(view.viewId)}
                                            aria-label={`Remove view ${view.viewId}`}
                                            className="text-neutral-400 hover:text-red-600 text-xs leading-none px-1"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                {view.moduleSlots.map((slot) => {
                                    const bindings = bindingsBySlot.get(slot) ?? [];
                                    const slotKey = `${view.viewId}:${slot}`;
                                    const isSelected =
                                        selectedSlotKey?.viewId === view.viewId
                                        && selectedSlotKey?.slot === slot;
                                    const isDropTarget = onAddBlock !== undefined;
                                    const isDragOver = isDropTarget && dragOverSlotKey === slotKey;
                                    const slotClassName = [
                                        "border-l-2 pl-3 py-2 rounded-r transition-colors",
                                        isDragOver
                                            ? "border-blue-500 bg-blue-100 ring-2 ring-blue-300"
                                            : isSelected
                                                ? "border-blue-500 bg-blue-50"
                                                : "border-neutral-200",
                                        onSelectSlot ? "cursor-pointer hover:border-neutral-400" : "",
                                    ].filter(Boolean).join(" ");
                                    const dragHandlers = isDropTarget ? {
                                        onDragOver: (e: React.DragEvent) => {
                                            if (!e.dataTransfer.types.includes(DESIGNER_BLOCK_DND_MIME)) return;
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = "copy";
                                            if (dragOverSlotKey !== slotKey) setDragOverSlotKey(slotKey);
                                        },
                                        onDragLeave: () => {
                                            if (dragOverSlotKey === slotKey) setDragOverSlotKey(null);
                                        },
                                        onDrop: (e: React.DragEvent) => {
                                            e.preventDefault();
                                            setDragOverSlotKey(null);
                                            const blockId = e.dataTransfer.getData(DESIGNER_BLOCK_DND_MIME);
                                            if (blockId) onAddBlock(blockId, view.viewId, slot);
                                        },
                                    } : {};
                                    return (
                                        <div
                                            key={slot}
                                            data-testid={`canvas-slot-${view.viewId}-${slot}`}
                                            data-selected={isSelected || undefined}
                                            data-drop-over={isDragOver || undefined}
                                            className={slotClassName}
                                            onClick={onSelectSlot ? () => onSelectSlot({ viewId: view.viewId, slot }) : undefined}
                                            role={onSelectSlot ? "button" : undefined}
                                            tabIndex={onSelectSlot ? 0 : undefined}
                                            {...dragHandlers}
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <p className="text-xs font-semibold text-neutral-700">
                                                    {slot.replace(/-/g, " ")}
                                                </p>
                                                {onRemoveSlotFromView && (
                                                    <button
                                                        type="button"
                                                        data-testid={`canvas-slot-${view.viewId}-${slot}-remove`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onRemoveSlotFromView(view.viewId, slot);
                                                        }}
                                                        aria-label={`Remove slot ${slot} from ${view.viewId}`}
                                                        className="text-neutral-400 hover:text-red-600 text-xs leading-none px-1"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                            {bindings.length === 0 ? (
                                                isDropTarget ? (
                                                    <div className="rounded border border-dashed border-neutral-300 px-3 py-3 text-xs text-neutral-500 text-center">
                                                        Drag a block here, or click to select this slot
                                                    </div>
                                                ) : (
                                                    <p className="text-xs italic text-neutral-400">No blocks in this slot.</p>
                                                )
                                            ) : (
                                                <div className="space-y-1">
                                                    {bindings.map((binding) => {
                                                        const isBindingSelected =
                                                            selectedBindingKey?.moduleId === binding.moduleId
                                                            && selectedBindingKey?.slot === slot;
                                                        const bindingClassName = [
                                                            "flex items-baseline justify-between gap-3 rounded border px-2 py-1.5 transition-colors",
                                                            isBindingSelected
                                                                ? "border-blue-500 bg-blue-50"
                                                                : "border-neutral-200 bg-neutral-50",
                                                            onSelectBinding ? "cursor-pointer hover:border-neutral-400" : "",
                                                        ].filter(Boolean).join(" ");
                                                        return (
                                                            <div
                                                                key={`${binding.moduleId}-${binding.priority}`}
                                                                data-testid={`canvas-binding-${binding.moduleId}`}
                                                                data-selected={isBindingSelected || undefined}
                                                                className={bindingClassName}
                                                                onClick={onSelectBinding ? (e) => {
                                                                    e.stopPropagation();
                                                                    onSelectBinding({ moduleId: binding.moduleId, slot });
                                                                } : undefined}
                                                                role={onSelectBinding ? "button" : undefined}
                                                                tabIndex={onSelectBinding ? 0 : undefined}
                                                            >
                                                                <span className="text-xs font-mono text-black">
                                                                    {binding.moduleId}
                                                                </span>
                                                                <span className="text-xs text-neutral-500 ml-auto">
                                                                    #{binding.priority}
                                                                </span>
                                                                {onRemoveBinding && (
                                                                    <button
                                                                        type="button"
                                                                        data-testid={`canvas-binding-${binding.moduleId}-remove`}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onRemoveBinding(binding.moduleId, slot);
                                                                        }}
                                                                        className="text-neutral-400 hover:text-red-600 text-sm leading-none px-1"
                                                                        aria-label={`Remove ${binding.moduleId} from ${slot}`}
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {onAddView && (
                        <button
                            type="button"
                            data-testid="canvas-add-view"
                            onClick={onAddView}
                            className="w-full text-xs px-3 py-2 rounded border border-dashed border-neutral-300 bg-white hover:border-neutral-400 text-neutral-600"
                        >
                            + Add view
                        </button>
                    )}
                </div>
            </section>
        </section>
    );
}

function groupBindingsBySlot(bindings: readonly ModuleBinding[]): Map<string, ModuleBinding[]> {
    const map = new Map<string, ModuleBinding[]>();
    for (const binding of bindings) {
        const bucket = map.get(binding.slot);
        if (bucket) bucket.push(binding);
        else map.set(binding.slot, [binding]);
    }
    for (const bucket of map.values()) {
        bucket.sort((a, b) => a.priority - b.priority);
    }
    return map;
}
