import { ComponentType } from "react";
import {
    CapabilityExecutionInput,
    ProcessModel,
    OrderNodeModel,
    CapabilityModel,
    EconomicBreakdownModel,
    MechanismModel,
    RiskBoundaryModel,
} from "@/lib/semantic/models";
import { Assembly, ModuleBinding } from "@/lib/shared/assembly";
import type {
    AssemblyBoundSubjectSummary,
    ResolvedAssemblyShellPresentation,
    ResolvedAssemblySkinBundle,
} from "@/lib/shared/runtimeResolution";
import type { RuntimeServices } from "@/lib/shared/runtimeServices";

// ── Module prop contracts ────────────────────────────────────────────────────
// Each module receives a typed prop bag determined by its slot and semanticInput.
// The workspace renderer constructs these from runtime state and passes them in.

export interface ModuleRenderContext {
    assembly: Assembly;
    services: RuntimeServices;
    selectedBoundSubject?: AssemblyBoundSubjectSummary;
    shellPresentation: ResolvedAssemblyShellPresentation;
    skinBundle?: ResolvedAssemblySkinBundle;
    processModel: ProcessModel | null;
    selectedOrder: OrderNodeModel | null;
    capabilities: CapabilityModel[];
    executableCapabilityIds: Set<string>;
    executingCapabilityId: string | null;
    mechanisms: MechanismModel[];
    riskBoundaries: Record<string, RiskBoundaryModel>;
    onExecuteCapability: (capability: CapabilityModel, input?: CapabilityExecutionInput) => void | Promise<void>;
    onSelectOrder: (orderId: string) => void;
    onComposeSubOrder: (orderId: string) => void;
    /** Token decimals for the process currency (default: 18). */
    tokenDecimals?: number;
}

export interface ModuleProps {
    moduleId: string;
    binding: ModuleBinding;
    context: ModuleRenderContext;
}

export type ModuleComponent = ComponentType<ModuleProps>;

// ── Runtime module registry ──────────────────────────────────────────────────
// Built-in modules are registered once at app startup by registerAllModules().
// The registry remains dynamic so future external packages can add modules,
// but validation logic should depend on static metadata rather than startup side effects.

const MODULE_MAP = new Map<string, ModuleComponent>();

/**
 * Register a mechanism module. Idempotent — re-registering the same ID
 * replaces the previous component (useful for hot-reload).
 */
export function registerModule(moduleId: string, component: ModuleComponent): void {
    MODULE_MAP.set(moduleId, component);
}

export function getModule(moduleId: string): ModuleComponent | undefined {
    const component = MODULE_MAP.get(moduleId);
    if (!component && process.env.NODE_ENV === "development") {
        console.warn(`[moduleRegistry] Unknown module ID: "${moduleId}" — no component registered.`);
    }
    return component;
}

/**
 * Returns all currently-registered module IDs. Used by the BlockMetadata
 * integrity check to verify every registered module has a metadata entry.
 */
export function getAllRegisteredModuleIds(): readonly string[] {
    return Array.from(MODULE_MAP.keys());
}
