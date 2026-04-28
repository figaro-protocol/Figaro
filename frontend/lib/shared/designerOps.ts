/**
 * designerOps — pure draft-mutation helpers for the Designer tool.
 *
 * All operations take an Assembly + arguments and return a NEW Assembly.
 * No I/O, no React, no validation side-effects: callers run the result
 * through `validateAssembly` / `parseAssemblyDocument` if they want a
 * checked snapshot.
 *
 * The block → binding mapping: when a block is added to a slot, we bind
 * the block's *first* moduleId to that slot. Multi-module blocks (e.g.
 * the handoff bundle) can be addressed by a richer "block-to-slot plan"
 * in a later iteration.
 */

import type { Assembly, AssemblyIdentity, ModuleBinding, RoleAssembly, ViewAssembly } from "@/lib/shared/assembly";
import type { BlockCompatibility, BlockMetadata } from "@/lib/shared/blockMetadata";

const PRIORITY_STEP = 10;
const FIRST_PRIORITY = 10;

/**
 * Pick the moduleId the block contributes as its "headline" module when
 * the designer wants a single identifier for the block (e.g. activity
 * labels). Bindings themselves use every module on the block — see
 * `addBlockToSlot`.
 */
export function pickPrimaryModuleId(block: BlockMetadata): string | undefined {
    return block.modules[0]?.moduleId;
}

/**
 * Add bindings to (viewId, slot) for EVERY module on the block.
 *
 * A block can bundle several UI modules that are expected to mount
 * together (e.g. the handoff bundle ships details + key-exchange +
 * tracker). Dropping the block onto a slot binds every one of them,
 * each with auto-incremented priority, skipping any module already
 * present in that slot.
 *
 * Returns the same assembly reference (no-op) if:
 *   - the view doesn't exist
 *   - the slot is not declared on the view
 *   - the block has no modules
 *   - every module on the block is already bound in the slot
 *
 * Priority: first new binding uses max(existing in slot) + PRIORITY_STEP
 * (or FIRST_PRIORITY if the slot was empty); subsequent modules from the
 * same block step by PRIORITY_STEP each.
 */
export function addBlockToSlot(
    assembly: Assembly,
    block: BlockMetadata,
    viewId: string,
    slot: string,
): Assembly {
    const view = assembly.views.find((v) => v.viewId === viewId);
    if (!view || !view.moduleSlots.includes(slot)) return assembly;
    if (block.modules.length === 0) return assembly;

    const existingInSlot = assembly.modules.filter((m) => m.slot === slot);
    const presentModuleIds = new Set(existingInSlot.map((m) => m.moduleId));
    const newEntries = block.modules.filter((e) => !presentModuleIds.has(e.moduleId));
    if (newEntries.length === 0) return assembly;

    const basePriority = existingInSlot.length === 0
        ? FIRST_PRIORITY
        : Math.max(...existingInSlot.map((m) => m.priority)) + PRIORITY_STEP;

    const newBindings: ModuleBinding[] = newEntries.map((entry, idx) => ({
        moduleId: entry.moduleId,
        componentKind: "module",
        semanticInput: "default",
        slot,
        priority: basePriority + idx * PRIORITY_STEP,
    }));

    return { ...assembly, modules: [...assembly.modules, ...newBindings] };
}

/**
 * Remove a binding from a slot. No-op if the binding isn't present.
 */
export function removeBindingFromSlot(
    assembly: Assembly,
    moduleId: string,
    slot: string,
): Assembly {
    const next = assembly.modules.filter(
        (m) => !(m.moduleId === moduleId && m.slot === slot),
    );
    if (next.length === assembly.modules.length) return assembly;
    return { ...assembly, modules: next };
}

/**
 * Patch a binding identified by (moduleId, slot). Returns the same assembly
 * reference if the binding isn't found or if the patch produces no change.
 *
 * The patch can update `componentKind`, `semanticInput`, `priority`, and
 * `displayOptions`. `moduleId` and `slot` are the binding's identity and
 * cannot be changed here.
 */
export type BindingPatch = Partial<
    Pick<ModuleBinding, "componentKind" | "semanticInput" | "priority" | "displayOptions">
>;

/**
 * Result of a compatibility check between a block and an assembly draft.
 * `compatible: false` carries a `reason` suitable for a tooltip.
 */
export interface BlockCompatibilityResult {
    compatible: boolean;
    reason?: string;
}

/**
 * Decide whether a block can mount on the given assembly. Three checks:
 *
 *   1. `compatibility.requiresMechanisms` — every required mechanism kind
 *      must appear on the assembly's `mechanisms[].kind`.
 *   2. `compatibility.requiresCapabilities` — every required capability must
 *      appear in any mechanism's `capabilityBindings`, any role's
 *      `sampleCapabilities`, or any `capabilityPresentation[].capabilityKind`.
 *   3. `compatibility.roles` — when set (non-null), at least one role on the
 *      assembly must match. `null` means "any role".
 *
 * No assembly → optimistic-true (the palette pre-render with no draft loaded
 * still wants to show every block).
 */
export function evaluateBlockCompatibility(
    block: BlockMetadata,
    assembly: Assembly | null,
): BlockCompatibilityResult {
    if (!assembly) return { compatible: true };
    const c: BlockCompatibility = block.compatibility;

    const presentMechanismKinds = new Set(assembly.mechanisms.map((m) => m.kind));
    const missingMechanisms = c.requiresMechanisms.filter((k) => !presentMechanismKinds.has(k));
    if (missingMechanisms.length > 0) {
        return {
            compatible: false,
            reason: `Requires mechanism${missingMechanisms.length === 1 ? "" : "s"}: ${missingMechanisms.join(", ")}`,
        };
    }

    const presentCapabilities = new Set<string>();
    for (const mech of assembly.mechanisms) {
        for (const cap of mech.capabilityBindings ?? []) presentCapabilities.add(cap);
    }
    for (const role of assembly.roles) {
        for (const cap of role.sampleCapabilities ?? []) presentCapabilities.add(cap);
    }
    for (const rule of assembly.capabilityPresentation) {
        presentCapabilities.add(rule.capabilityKind);
    }
    const missingCapabilities = c.requiresCapabilities.filter((k) => !presentCapabilities.has(k));
    if (missingCapabilities.length > 0) {
        return {
            compatible: false,
            reason: `Requires capabilit${missingCapabilities.length === 1 ? "y" : "ies"}: ${missingCapabilities.join(", ")}`,
        };
    }

    if (c.roles !== null) {
        const presentRoleKinds = new Set(assembly.roles.map((r) => r.roleKind));
        const anyMatch = c.roles.some((r) => presentRoleKinds.has(r));
        if (!anyMatch) {
            return {
                compatible: false,
                reason: `Requires role: ${c.roles.join(" or ")}`,
            };
        }
    }

    return { compatible: true };
}

// ── View mutations ──────────────────────────────────────────────────────────

/**
 * Add a new view to the assembly. Returns the same reference if `viewId`
 * is already in use, empty, or contains characters outside kebab-case
 * (lowercase alphanumerics + hyphens).
 *
 * Seeds the view with the provided slots; defaults to a single `"primary"`
 * slot when none are supplied, so the view is immediately usable by
 * `addBlockToSlot`.
 */
export interface AddViewArgs {
    viewId: string;
    title: string;
    kind?: string;
    moduleSlots?: readonly string[];
}

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function addView(assembly: Assembly, args: AddViewArgs): Assembly {
    const { viewId, title, kind, moduleSlots } = args;
    if (!KEBAB_RE.test(viewId)) return assembly;
    if (assembly.views.some((v) => v.viewId === viewId)) return assembly;

    const view: ViewAssembly = {
        viewId,
        kind: kind ?? "custom",
        title: title.trim().length > 0 ? title : viewId,
        contextsAccepted: ["assembly"],
        moduleSlots: moduleSlots && moduleSlots.length > 0 ? [...moduleSlots] : ["primary"],
    };
    return { ...assembly, views: [...assembly.views, view] };
}

/**
 * Remove a view by id. Also strips every binding that lived in one of
 * the removed view's slots (the binding's `slot` matches one of the
 * view's declared slots AND no other view also declares that slot name).
 *
 * No-op (same reference) if the view isn't found.
 */
export function removeView(assembly: Assembly, viewId: string): Assembly {
    const view = assembly.views.find((v) => v.viewId === viewId);
    if (!view) return assembly;

    const remainingSlotNames = new Set<string>();
    for (const v of assembly.views) {
        if (v.viewId === viewId) continue;
        for (const s of v.moduleSlots) remainingSlotNames.add(s);
    }
    const orphanSlots = new Set(view.moduleSlots.filter((s) => !remainingSlotNames.has(s)));

    return {
        ...assembly,
        views: assembly.views.filter((v) => v.viewId !== viewId),
        modules: orphanSlots.size === 0
            ? assembly.modules
            : assembly.modules.filter((m) => !orphanSlots.has(m.slot)),
    };
}

/**
 * Add a slot name to an existing view. Same-reference no-op if the view
 * is missing, the slot name is not kebab-case, or the slot is already
 * declared on the view.
 */
export function addSlotToView(assembly: Assembly, viewId: string, slot: string): Assembly {
    if (!KEBAB_RE.test(slot)) return assembly;
    const view = assembly.views.find((v) => v.viewId === viewId);
    if (!view) return assembly;
    if (view.moduleSlots.includes(slot)) return assembly;

    return {
        ...assembly,
        views: assembly.views.map((v) =>
            v.viewId === viewId ? { ...v, moduleSlots: [...v.moduleSlots, slot] } : v,
        ),
    };
}

/**
 * Remove a slot from a view. Also strips bindings in that slot IF no
 * other view declares a slot with the same name. Same-reference no-op
 * if the view or slot isn't found.
 */
export function removeSlotFromView(assembly: Assembly, viewId: string, slot: string): Assembly {
    const view = assembly.views.find((v) => v.viewId === viewId);
    if (!view || !view.moduleSlots.includes(slot)) return assembly;

    const stillDeclaredElsewhere = assembly.views.some(
        (v) => v.viewId !== viewId && v.moduleSlots.includes(slot),
    );

    return {
        ...assembly,
        views: assembly.views.map((v) =>
            v.viewId === viewId ? { ...v, moduleSlots: v.moduleSlots.filter((s) => s !== slot) } : v,
        ),
        modules: stillDeclaredElsewhere
            ? assembly.modules
            : assembly.modules.filter((m) => m.slot !== slot),
    };
}

// ── Role mutations ──────────────────────────────────────────────────────────

export interface AddRoleArgs {
    roleKind: string;
    displayName: string;
}

/**
 * Append a new role to the assembly. Same-reference no-op if `roleKind`
 * is empty, not kebab-case, or already in use.
 */
export function addRole(assembly: Assembly, args: AddRoleArgs): Assembly {
    const { roleKind, displayName } = args;
    if (!KEBAB_RE.test(roleKind)) return assembly;
    if (assembly.roles.some((r) => r.roleKind === roleKind)) return assembly;

    const role: RoleAssembly = {
        roleKind,
        displayName: displayName.trim().length > 0 ? displayName : roleKind,
        visibility: "primary",
    };
    return { ...assembly, roles: [...assembly.roles, role] };
}

/**
 * Remove a role by `roleKind`. Same-reference no-op if the role isn't
 * found. Does NOT touch mechanism `recognizedRoles` lists — those may
 * legitimately reference roles registered elsewhere; data loss is left
 * to the user via the inspector.
 */
export function removeRole(assembly: Assembly, roleKind: string): Assembly {
    const next = assembly.roles.filter((r) => r.roleKind !== roleKind);
    if (next.length === assembly.roles.length) return assembly;
    return { ...assembly, roles: next };
}

// ── Identity edit ──────────────────────────────────────────────────────────

export type IdentityPatch = Partial<Pick<AssemblyIdentity, "name" | "slug" | "description">>;

/**
 * Patch the assembly's identity fields. Validates `slug` against the
 * kebab-case rule when present in the patch. Returns the same assembly
 * reference on no-op or rejection.
 *
 * Slug rename is purely a value-level change here. Callers responsible
 * for any keyed external state (e.g. a `draftBySlug` map) must rekey
 * separately — `designerOps` is pure and key-unaware.
 */
export function setAssemblyIdentity(assembly: Assembly, patch: IdentityPatch): Assembly {
    if (patch.slug !== undefined && !KEBAB_RE.test(patch.slug)) return assembly;

    const next: AssemblyIdentity = {
        ...assembly.identity,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
    };
    const isSame =
        next.name === assembly.identity.name
        && next.slug === assembly.identity.slug
        && next.description === assembly.identity.description;
    if (isSame) return assembly;
    return { ...assembly, identity: next };
}

export function updateBinding(
    assembly: Assembly,
    moduleId: string,
    slot: string,
    patch: BindingPatch,
): Assembly {
    let changed = false;
    const next = assembly.modules.map((m) => {
        if (m.moduleId !== moduleId || m.slot !== slot) return m;
        const merged: ModuleBinding = { ...m, ...patch };
        const isSame =
            merged.componentKind === m.componentKind
            && merged.semanticInput === m.semanticInput
            && merged.priority === m.priority
            && merged.displayOptions === m.displayOptions;
        if (isSame) return m;
        changed = true;
        return merged;
    });
    return changed ? { ...assembly, modules: next } : assembly;
}
