"use client";

/**
 * DesignerPalette — read-only side rail listing composable blocks grouped
 * by category, with Layer A schema-availability signal per block.
 *
 * Each compatible block card is HTML5-draggable. The drag payload is the
 * block's `blockId` carried on the canonical MIME type
 * (`DESIGNER_BLOCK_DND_MIME`); `DesignerCanvas`'s slot drop targets read
 * the same MIME and call its `onAddBlock` callback.
 *
 * Takes `blocks` as a prop rather than reading the registry directly so the
 * component can be rendered in isolation in tests and in alternative contexts.
 * The canonical host (`app/builders/designer/page.tsx`) calls
 * `registerAllModules()` + `listBlockMetadata()` and passes the result.
 */

/** MIME type for the palette → canvas drag payload. Both ends import this. */
export const DESIGNER_BLOCK_DND_MIME = "application/x-figaro-block-id";

import { useMemo, useState } from "react";
import type { BlockMetadata, BlockCategory } from "@/lib/shared/blockMetadata";
import type { Assembly } from "@/lib/shared/assembly";
import { evaluateBlockCompatibility, type BlockCompatibilityResult } from "@/lib/shared/designerOps";
import { getSchemaSpec, getSchemaSpecLoadError } from "@/lib/shared/schemaSpecSource";

const CATEGORY_ORDER: readonly BlockCategory[] = ["mechanism", "schema", "handoff", "display"];

const CATEGORY_LABEL: Record<BlockCategory, string> = {
    mechanism: "Coordination",
    schema: "Agreement clauses",
    handoff: "Handoff & evidence",
    display: "Display surfaces",
    shell: "Baseline",
};

export interface DesignerPaletteProps {
    blocks: readonly BlockMetadata[];
    /** When provided, incompatible blocks are disabled with a reason tooltip. */
    assembly?: Assembly | null;
    selectedBlockId?: string | null;
    onSelectBlock?: (blockId: string) => void;
}

export function DesignerPalette({ blocks, assembly, selectedBlockId, onSelectBlock }: DesignerPaletteProps) {
    const [selectedCategories, setSelectedCategories] = useState<ReadonlySet<string>>(new Set());

    // Union of schema-categories across all blocks' loaded specs. Drives the
    // filter chip row. Recomputed only on `blocks` change — schema specs are
    // module-level cached, so cost is bounded by block count × schemas/block.
    const availableCategories = useMemo(() => {
        const set = new Set<string>();
        for (const block of blocks) {
            if (block.excludeFromPalette) continue;
            for (const schemaId of block.schemaIds) {
                const spec = getSchemaSpec(schemaId);
                if (!spec?.categories) continue;
                for (const c of spec.categories) set.add(c);
            }
        }
        return Array.from(set).sort();
    }, [blocks]);

    const visibleByCategory = useMemo(() => {
        const map = new Map<BlockCategory, BlockMetadata[]>();
        for (const category of CATEGORY_ORDER) map.set(category, []);
        const filterActive = selectedCategories.size > 0;
        for (const block of blocks) {
            if (block.excludeFromPalette) continue;
            if (filterActive && !blockMatchesCategoryFilter(block, selectedCategories)) continue;
            const bucket = map.get(block.category);
            if (bucket) bucket.push(block);
        }
        for (const bucket of map.values()) {
            bucket.sort((a, b) =>
                (a.paletteOrder ?? 100) - (b.paletteOrder ?? 100)
                || a.displayName.localeCompare(b.displayName),
            );
        }
        return map;
    }, [blocks, selectedCategories]);

    const toggleCategory = (category: string) => {
        setSelectedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category);
            else next.add(category);
            return next;
        });
    };

    const clearFilter = () => setSelectedCategories(new Set());

    return (
        <aside
            data-testid="designer-palette"
            className="w-80 shrink-0 border-r border-neutral-200 bg-white overflow-y-auto"
        >
            <div className="px-6 py-5 border-b border-neutral-200 sticky top-0 bg-white">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Palette
                </p>
                <h2 className="text-lg font-bold text-black mt-1">Blocks</h2>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                    Drag a block onto a slot on the canvas. A block bundles a UI module, its coordination mechanism, and any agreement clauses it requires.
                </p>
            </div>

            {availableCategories.length > 0 && (
                <div
                    data-testid="palette-category-filter"
                    className="px-6 py-3 border-b border-neutral-100 bg-neutral-50"
                >
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                            Filter by topic
                        </p>
                        {selectedCategories.size > 0 && (
                            <button
                                type="button"
                                data-testid="palette-category-filter-clear"
                                onClick={clearFilter}
                                className="text-[10px] text-neutral-500 hover:text-black underline-offset-2 hover:underline"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {availableCategories.map((category) => {
                            const active = selectedCategories.has(category);
                            return (
                                <button
                                    key={category}
                                    type="button"
                                    data-testid={`palette-category-chip-${category}`}
                                    data-active={active || undefined}
                                    onClick={() => toggleCategory(category)}
                                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                                        active
                                            ? "border-blue-500 bg-blue-500 text-white"
                                            : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
                                    }`}
                                >
                                    {category}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {CATEGORY_ORDER.map((category) => {
                const bucket = visibleByCategory.get(category) ?? [];
                if (bucket.length === 0) return null;
                return (
                    <section
                        key={category}
                        data-testid={`palette-category-${category}`}
                        className="px-6 py-4 border-b border-neutral-100"
                    >
                        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                            {CATEGORY_LABEL[category]}
                        </p>
                        <div className="space-y-2">
                            {bucket.map((block) => (
                                <BlockCard
                                    key={block.blockId}
                                    block={block}
                                    compatibility={evaluateBlockCompatibility(block, assembly ?? null)}
                                    selected={block.blockId === selectedBlockId}
                                    onSelect={onSelectBlock}
                                />
                            ))}
                        </div>
                    </section>
                );
            })}
        </aside>
    );
}

interface BlockCardProps {
    block: BlockMetadata;
    compatibility: BlockCompatibilityResult;
    selected?: boolean;
    onSelect?: (blockId: string) => void;
}

function BlockCard({ block, compatibility, selected, onSelect }: BlockCardProps) {
    const schemaStatus = useMemo(() => evaluateSchemaStatus(block.schemaIds), [block.schemaIds]);
    const disabled = !compatibility.compatible;

    return (
        <button
            type="button"
            data-testid={`palette-block-${block.blockId}`}
            data-block-category={block.category}
            data-block-incompatible={disabled || undefined}
            disabled={disabled}
            draggable={!disabled}
            onDragStart={(e) => {
                if (disabled) return;
                e.dataTransfer.setData(DESIGNER_BLOCK_DND_MIME, block.blockId);
                e.dataTransfer.effectAllowed = "copy";
            }}
            title={disabled ? compatibility.reason : undefined}
            onClick={() => onSelect?.(block.blockId)}
            className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                disabled
                    ? "border-neutral-200 bg-neutral-50 opacity-50 cursor-not-allowed"
                    : selected
                        ? "border-blue-500 bg-blue-50"
                        : "border-neutral-200 bg-white hover:border-neutral-400 cursor-grab active:cursor-grabbing"
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-black truncate">{block.displayName}</span>
                {schemaStatus.tone === "ok" && block.schemaIds.length > 0 && (
                    <span
                        data-testid={`palette-block-${block.blockId}-schema-ok`}
                        className="text-xs text-green-600 shrink-0"
                        title={`${block.schemaIds.length} schema${block.schemaIds.length === 1 ? "" : "s"} loaded`}
                    >
                        ✓
                    </span>
                )}
                {schemaStatus.tone === "warn" && (
                    <span
                        data-testid={`palette-block-${block.blockId}-schema-warn`}
                        className="text-xs text-amber-600 shrink-0"
                        title={schemaStatus.message}
                    >
                        ⚠
                    </span>
                )}
            </div>
            <p className="text-xs text-neutral-600 mt-1 line-clamp-2 leading-relaxed">{block.description}</p>
            {disabled && compatibility.reason && (
                <p
                    data-testid={`palette-block-${block.blockId}-incompat-reason`}
                    className="text-xs text-amber-700 mt-1.5"
                >
                    {compatibility.reason}
                </p>
            )}
            {block.schemaIds.length > 0 && (
                <p
                    className="font-mono text-[10px] text-neutral-400 mt-2 truncate"
                    title={block.schemaIds.join(", ")}
                >
                    {block.schemaIds.join(", ")}
                </p>
            )}
        </button>
    );
}

interface SchemaStatus {
    tone: "ok" | "warn" | "none";
    message: string;
}

function blockMatchesCategoryFilter(
    block: BlockMetadata,
    selected: ReadonlySet<string>,
): boolean {
    for (const schemaId of block.schemaIds) {
        const spec = getSchemaSpec(schemaId);
        if (!spec?.categories) continue;
        for (const c of spec.categories) {
            if (selected.has(c)) return true;
        }
    }
    return false;
}

function evaluateSchemaStatus(schemaIds: readonly string[]): SchemaStatus {
    if (schemaIds.length === 0) return { tone: "none", message: "" };
    const missing: string[] = [];
    const errored: string[] = [];
    for (const id of schemaIds) {
        const spec = getSchemaSpec(id);
        if (!spec) {
            const err = getSchemaSpecLoadError(id);
            if (err) errored.push(`${id}: ${err}`);
            else missing.push(id);
        }
    }
    if (errored.length > 0) return { tone: "warn", message: errored.join("; ") };
    if (missing.length > 0) return { tone: "warn", message: `Spec not loaded: ${missing.join(", ")}` };
    return { tone: "ok", message: `All ${schemaIds.length} schema spec(s) loaded` };
}
