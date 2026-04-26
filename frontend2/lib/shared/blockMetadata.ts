/**
 * Block metadata — designer-surface metadata describing what a block IS,
 * what schemas it owns, what UI modules it ships with, and where it can mount.
 *
 * The runtime (`AssemblyRuntimeView`, `moduleRegistry.getModule`) is
 * unaffected by this layer. Block metadata is read only by builder/designer
 * code: the palette, the drop-to-configure form, the "validated ✓" badge.
 *
 * Co-located with module registration so adding a module without metadata
 * fails fast in development (see `assertBlockMetadataIntegrity`).
 */

import type { ModuleComponent } from "@/lib/shared/moduleRegistry";

/**
 * Palette categories.
 *
 * Five categories — extends the marketing prose's four ("contracts /
 * schemas / handoff / allocation mechanisms") with `display` (always-present
 * widgets like ProcessGraphModule) and `shell` (chrome that mounts
 * automatically and is never draggable).
 *
 *  - `mechanism` — formation mechanisms (DutchAuction, direct commit) and
 *                  domain mechanisms (Cart, JobMarket) that the designer
 *                  composes onto the FigaroCore baseline
 *  - `schema`    — attestation/agreement clause blocks (GHG disclosure,
 *                  manifest variants, role-process schemas)
 *  - `handoff`   — physical-exchange coordination (mode + ECDH + tracker)
 *  - `display`   — pure-view widgets (process graph, capital summary,
 *                  event timeline). Hidden from palette by default
 *  - `shell`     — runtime chrome (role switcher, capability rail). Never
 *                  draggable; always mounted by the runtime
 */
export type BlockCategory =
    | "mechanism"
    | "schema"
    | "handoff"
    | "display"
    | "shell";

/**
 * Block compatibility — which assemblies / roles this block makes sense in.
 * Used by the palette to grey out blocks the current draft can't host.
 */
export interface BlockCompatibility {
    /** Role kinds where this block can mount. `null` = any role. */
    roles: readonly string[] | null;
    /**
     * Required mechanism kinds in the host assembly (e.g. `["dutch-auction"]`).
     * Empty = no dependency. Palette greys out the block if the current
     * draft lacks any of these mechanisms.
     */
    requiresMechanisms: readonly string[];
    /**
     * Required capabilities in the host assembly (e.g. `["commerce.cart"]`).
     * Lets domain-coupled blocks declare soft pre-reqs without depending on
     * mechanism-kind identity.
     */
    requiresCapabilities: readonly string[];
}

/**
 * One UI module bundled with a block. A block may ship multiple modules
 * (e.g. the handoff block ships `HandoffDetailsModule`,
 * `HandoffKeyExchangeModule`, `HandoffTrackerModule`).
 */
export interface BlockModuleEntry {
    moduleId: string;
    component: ModuleComponent;
}

/**
 * Block metadata. Co-registered with the block's modules.
 *
 * The designer palette renders one entry per block. Dropping a block onto
 * the canvas may add an entry to `assembly.mechanisms[]`, may register one
 * or more `ModuleBinding`s on a role/view, and may declare schema clauses
 * in the agreement — depending on category.
 */
export interface BlockMetadata {
    /** Stable identifier — kebab-case. Unique across all blocks. */
    blockId: string;
    /** Display name for the palette. */
    displayName: string;
    /** Prose description; rendered as palette tooltip / detail panel. */
    description: string;
    /** Palette category — drives palette grouping and default visibility. */
    category: BlockCategory;
    /**
     * Schema IDs (human-readable, e.g. "figaro-handoff-v1") this block
     * contributes to an order's agreement. Empty if the block has no
     * schema content of its own.
     */
    schemaIds: readonly string[];
    /**
     * UI modules bundled with the block. Each one will be registered with
     * `moduleRegistry.registerModule` at startup.
     */
    modules: readonly BlockModuleEntry[];
    /** Compatibility constraints. */
    compatibility: BlockCompatibility;
    /** Optional palette icon name (resolved against `components/icons/`). */
    iconName?: string;
    /** Sort key within a category; lower = earlier. Default 100. */
    paletteOrder?: number;
    /**
     * If `true`, the block is excluded from the designer palette. Used for
     * shell chrome and always-present blocks. The block's modules still
     * register and render normally at runtime.
     */
    excludeFromPalette?: boolean;
    /**
     * If `true`, the block is part of the fixed baseline of every assembly
     * (FigaroCore, mandatory clauses). The designer cannot remove it.
     * Implies `excludeFromPalette: true`.
     */
    fixedBaseline?: boolean;
}

// ── Registry — in-memory singleton, no admin, idempotent ────────────────────

const METADATA_BY_BLOCK_ID = new Map<string, BlockMetadata>();
const MODULE_ID_TO_BLOCK_ID = new Map<string, string>();

/**
 * Register a block's metadata. If `registerModule` is provided, also
 * registers each of the block's modules with `moduleRegistry.registerModule`
 * so the runtime can mount them. Pass `undefined` when modules are already
 * registered by another mechanism (e.g. a `MechanismPackage` registration).
 *
 * Idempotent — re-registering the same blockId replaces the prior entry
 * (useful for hot reload). Throws if two distinct blocks claim the same
 * `moduleId`, since moduleIds must be globally unique across blocks.
 */
export function registerBlock(
    metadata: BlockMetadata,
    registerModule?: (moduleId: string, component: ModuleComponent) => void,
): void {
    METADATA_BY_BLOCK_ID.set(metadata.blockId, metadata);
    for (const entry of metadata.modules) {
        const existing = MODULE_ID_TO_BLOCK_ID.get(entry.moduleId);
        if (existing !== undefined && existing !== metadata.blockId) {
            throw new Error(
                `Module "${entry.moduleId}" is claimed by both block "${existing}" and block "${metadata.blockId}". ` +
                `Module IDs must be globally unique.`,
            );
        }
        MODULE_ID_TO_BLOCK_ID.set(entry.moduleId, metadata.blockId);
        if (registerModule !== undefined) {
            registerModule(entry.moduleId, entry.component);
        }
    }
}

/** Returns the metadata for one block, or `undefined` if not registered. */
export function getBlockMetadata(blockId: string): BlockMetadata | undefined {
    return METADATA_BY_BLOCK_ID.get(blockId);
}

/** Returns all registered block metadata, in insertion order. */
export function listBlockMetadata(): readonly BlockMetadata[] {
    return Array.from(METADATA_BY_BLOCK_ID.values());
}

/** Returns metadata for the block that owns the given moduleId. */
export function getBlockForModule(moduleId: string): BlockMetadata | undefined {
    const blockId = MODULE_ID_TO_BLOCK_ID.get(moduleId);
    return blockId !== undefined ? METADATA_BY_BLOCK_ID.get(blockId) : undefined;
}

/**
 * Filter blocks by category — useful for rendering palette sections.
 * Returns blocks sorted by `paletteOrder` (default 100) then `displayName`.
 */
export function listBlocksByCategory(category: BlockCategory, opts: { includeHidden?: boolean } = {}): readonly BlockMetadata[] {
    return listBlockMetadata()
        .filter((b) => b.category === category)
        .filter((b) => opts.includeHidden || !b.excludeFromPalette)
        .sort((a, b) => (a.paletteOrder ?? 100) - (b.paletteOrder ?? 100) || a.displayName.localeCompare(b.displayName));
}

/**
 * Dev-only invariant check. Call once after all blocks have been registered.
 * Throws if any moduleId registered with `moduleRegistry.registerModule`
 * lacks a corresponding block metadata entry — catches the "easy to forget"
 * failure mode of singleton registration.
 *
 * Pass `getAllRegisteredModuleIds` to allow this module to remain free of a
 * cyclic dependency on `moduleRegistry`.
 */
export function assertBlockMetadataIntegrity(getAllRegisteredModuleIds: () => readonly string[]): void {
    if (process.env.NODE_ENV === "production") return;
    const registered = new Set(getAllRegisteredModuleIds());
    const claimed = new Set(MODULE_ID_TO_BLOCK_ID.keys());
    const orphans: string[] = [];
    for (const moduleId of registered) {
        if (!claimed.has(moduleId)) orphans.push(moduleId);
    }
    if (orphans.length > 0) {
        throw new Error(
            `Modules registered without a BlockMetadata entry: ${orphans.join(", ")}. ` +
            `Add them to a BlockMetadata.modules array and call registerBlock(...) instead of registerModule(...) directly.`,
        );
    }
}

/** Test-only — reset both registries. Not exported from the index. */
export function _resetBlockRegistry_TESTING_ONLY(): void {
    METADATA_BY_BLOCK_ID.clear();
    MODULE_ID_TO_BLOCK_ID.clear();
}
