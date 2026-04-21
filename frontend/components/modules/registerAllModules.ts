import {
    BUILT_IN_MECHANISM_PACKAGES,
    registerMechanismPackage,
} from "@/lib/mechanisms/packages";
import { registerModule } from "@/lib/shared/moduleRegistry";

import { RoleSwitcherModule } from "@/components/modules/RoleSwitcherModule";
import { CapabilityRailModule } from "@/components/modules/CapabilityRailModule";
import { MechanismInspectorModule } from "@/components/modules/MechanismInspectorModule";
import { SellerDiscoveryModule } from "@/components/modules/SellerDiscoveryModule";
import { CartModule } from "@/components/modules/CartModule";
import { JobMarketModule } from "@/components/modules/JobMarketModule";
import { CatalogueEditorModule } from "@/components/modules/CatalogueEditorModule";
import { IncomingOrdersModule } from "@/components/modules/IncomingOrdersModule";

let registered = false;

export type StandaloneModuleCategory = "runtime-shell" | "assembly-composition";

interface StandaloneModuleEntry {
    moduleId: string;
    component: Parameters<typeof registerModule>[1];
    category: StandaloneModuleCategory;
}

const BUILT_IN_STANDALONE_MODULES: readonly StandaloneModuleEntry[] = [
    { moduleId: "role-switcher", component: RoleSwitcherModule, category: "runtime-shell" },
    { moduleId: "capability-rail", component: CapabilityRailModule, category: "runtime-shell" },
    { moduleId: "mechanism-inspector", component: MechanismInspectorModule, category: "runtime-shell" },
    { moduleId: "seller-discovery", component: SellerDiscoveryModule, category: "assembly-composition" },
    { moduleId: "cart", component: CartModule, category: "assembly-composition" },
    { moduleId: "job-market", component: JobMarketModule, category: "assembly-composition" },
    { moduleId: "catalogue-editor", component: CatalogueEditorModule, category: "assembly-composition" },
    { moduleId: "incoming-orders", component: IncomingOrdersModule, category: "assembly-composition" },
] as const;

export const BUILT_IN_PACKAGE_MODULE_IDS = BUILT_IN_MECHANISM_PACKAGES.flatMap((pkg) =>
    pkg.modules.map((module) => module.moduleId),
);

export const BUILT_IN_STANDALONE_MODULE_IDS = BUILT_IN_STANDALONE_MODULES.map(
    ({ moduleId }) => moduleId,
);

export const BUILT_IN_RUNTIME_SHELL_MODULE_IDS = BUILT_IN_STANDALONE_MODULES
    .filter((entry) => entry.category === "runtime-shell")
    .map(({ moduleId }) => moduleId);

export const BUILT_IN_ASSEMBLY_COMPOSITION_MODULE_IDS = BUILT_IN_STANDALONE_MODULES
    .filter((entry) => entry.category === "assembly-composition")
    .map(({ moduleId }) => moduleId);

export const BUILT_IN_MODULE_IDS = [
    ...BUILT_IN_PACKAGE_MODULE_IDS,
    ...BUILT_IN_STANDALONE_MODULE_IDS,
];

/**
 * Register all built-in mechanism modules. Call once at app startup.
 * Idempotent — safe to call multiple times.
 */
export function registerAllModules(): void {
    if (registered) return;
    registered = true;

    for (const pkg of BUILT_IN_MECHANISM_PACKAGES) {
        registerMechanismPackage(pkg);
    }

    for (const { moduleId, component } of BUILT_IN_STANDALONE_MODULES) {
        registerModule(moduleId, component);
    }
}
