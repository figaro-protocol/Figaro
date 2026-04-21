import type { ModuleBinding, ScopeType, ViewAssembly } from "@/lib/shared/institutionAssembly";

interface BuiltInModuleDefaults {
    componentKind: string;
    semanticInput: string;
    slot?: string;
    priority?: number;
}

interface BuiltInViewDefaults {
    route?: string;
    contextsAccepted: ScopeType[];
    moduleSlots?: string[];
}

export interface AuthoredModuleBindingDocument {
    moduleId: string;
    slot?: string;
    priority?: number;
    componentKind?: string;
    semanticInput?: string;
    displayOptions?: Record<string, string | number | boolean>;
}

export interface AuthoredViewAssemblyDocument {
    viewId: string;
    kind: string;
    title: string;
    route?: string;
    contextsAccepted?: ScopeType[];
    moduleSlots?: string[];
}

const BUILT_IN_MODULE_DEFAULTS: Record<string, BuiltInModuleDefaults> = {
    'role-switcher': {
        componentKind: 'RoleSwitcher',
        semanticInput: 'RoleContext[]',
        slot: 'sidebar',
        priority: 1,
    },
    'capability-rail': {
        componentKind: 'CapabilityRail',
        semanticInput: 'CapabilityModel[]',
        slot: 'sidebar',
        priority: 2,
    },
    'mechanism-inspector': {
        componentKind: 'MechanismInspector',
        semanticInput: 'MechanismModel',
        slot: 'sidebar',
        priority: 3,
    },
    'seller-discovery': {
        componentKind: 'SellerDiscoveryPanel',
        semanticInput: 'RoleContext',
    },
    cart: {
        componentKind: 'CartPanel',
        semanticInput: 'RoleContext',
    },
    'job-market': {
        componentKind: 'JobMarketPanel',
        semanticInput: 'MechanismModel',
    },
    'catalogue-editor': {
        componentKind: 'CatalogueEditorPanel',
        semanticInput: 'RoleContext',
    },
    'auction-actions': {
        componentKind: 'AuctionActionPanel',
        semanticInput: 'MechanismModel',
    },
    'process-graph': {
        componentKind: 'ProcessGraphView',
        semanticInput: 'ProcessModel',
        slot: 'main',
        priority: 1,
    },
    'order-node': {
        componentKind: 'OrderNodePanel',
        semanticInput: 'OrderNodeModel',
        slot: 'main',
        priority: 2,
    },
    'order-actions': {
        componentKind: 'OrderActionPanel',
        semanticInput: 'CapabilityModel[]',
        slot: 'main',
        priority: 3,
    },
    'settlement-breakdown': {
        componentKind: 'SettlementBreakdownPanel',
        semanticInput: 'EconomicBreakdownModel',
        slot: 'main',
        priority: 4,
    },
    'event-timeline': {
        componentKind: 'EventTimelinePanel',
        semanticInput: 'ProcessModel',
        slot: 'main',
        priority: 6,
    },
    'process-capital-summary': {
        componentKind: 'ProcessCapitalSummaryPanel',
        semanticInput: 'ProcessModel',
        slot: 'sidebar',
        priority: 4,
    },
    'disclosure-actions': {
        componentKind: 'DisclosurePanel',
        semanticInput: 'MechanismModel',
    },
    'delivery-attestation': {
        componentKind: 'DeliveryAttestationPanel',
        semanticInput: 'MechanismModel',
    },
    'fig-token': {
        componentKind: 'FigTokenPanel',
        semanticInput: 'MechanismModel',
    },
    'coordinator-actions': {
        componentKind: 'CoordinatorActionPanel',
        semanticInput: 'MechanismModel',
        slot: 'main',
        priority: 5,
    },
    'handoff-details': {
        componentKind: 'HandoffDetailsPanel',
        semanticInput: 'MechanismModel',
    },
    'handoff-tracker': {
        componentKind: 'HandoffTrackerPanel',
        semanticInput: 'MechanismModel',
    },
    'handoff-key-exchange': {
        componentKind: 'HandoffKeyExchangePanel',
        semanticInput: 'MechanismModel',
    },
    'operator-registration-panel': {
        componentKind: 'OperatorRegistrationPanel',
        semanticInput: 'RoleContext',
    },
    'incoming-orders': {
        componentKind: 'IncomingOrdersPanel',
        semanticInput: 'RoleContext',
        slot: 'main',
        priority: 5,
    },
};

export const BUILT_IN_MODULE_IDS = Object.freeze(Object.keys(BUILT_IN_MODULE_DEFAULTS));

const BUILT_IN_VIEW_DEFAULTS: Record<string, BuiltInViewDefaults> = {
    overview: {
        route: '/',
        contextsAccepted: ['institution'],
        moduleSlots: ['capability-rail', 'mechanism-inspector'],
    },
    'role-dashboard': {
        contextsAccepted: ['role', 'process', 'order'],
        moduleSlots: ['role-switcher', 'capability-rail', 'process-graph', 'order-node'],
    },
};

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function getBuiltInModuleDefaults(moduleId: string): BuiltInModuleDefaults | undefined {
    return BUILT_IN_MODULE_DEFAULTS[moduleId];
}

export function getBuiltInViewDefaults(viewKind: string): BuiltInViewDefaults | undefined {
    return BUILT_IN_VIEW_DEFAULTS[viewKind];
}

export function getBuiltInViewRoute(viewKind: string): string | undefined {
    return getBuiltInViewDefaults(viewKind)?.route;
}

export function getBuiltInViewContextsAccepted(viewKind: string): ScopeType[] | undefined {
    const defaults = getBuiltInViewDefaults(viewKind);
    return defaults ? [...defaults.contextsAccepted] : undefined;
}

export function getBuiltInViewModuleSlots(viewKind: string, availableModuleIds: Iterable<string>): string[] | undefined {
    const defaults = getBuiltInViewDefaults(viewKind)?.moduleSlots;
    if (!defaults) {
        return undefined;
    }

    const available = new Set(availableModuleIds);
    return defaults.filter((moduleId) => available.has(moduleId));
}

export function toAuthoredModuleBindingDocument(
    module: AuthoredModuleBindingDocument & { componentKind: string; semanticInput: string }
): AuthoredModuleBindingDocument {
    const defaults = getBuiltInModuleDefaults(module.moduleId);
    const usesDefaultLayout = defaults?.slot === module.slot && defaults?.priority === module.priority;

    return {
        moduleId: module.moduleId,
        ...(defaults?.componentKind === module.componentKind ? {} : { componentKind: module.componentKind }),
        ...(defaults?.semanticInput === module.semanticInput ? {} : { semanticInput: module.semanticInput }),
        ...(usesDefaultLayout ? {} : { slot: module.slot, priority: module.priority }),
        ...(module.displayOptions === undefined ? {} : { displayOptions: module.displayOptions }),
    };
}

export function toAuthoredViewAssemblyDocument(
    view: ViewAssembly,
    modules: readonly Pick<ModuleBinding, 'moduleId'>[],
): AuthoredViewAssemblyDocument {
    const defaultRoute = getBuiltInViewRoute(view.kind);
    const defaultContextsAccepted = getBuiltInViewContextsAccepted(view.kind);
    const defaultModuleSlots = getBuiltInViewModuleSlots(
        view.kind,
        modules.map((module) => module.moduleId),
    );

    return {
        viewId: view.viewId,
        kind: view.kind,
        title: view.title,
        ...(view.route === undefined || view.route === defaultRoute ? {} : { route: view.route }),
        ...(defaultContextsAccepted && arraysEqual(view.contextsAccepted, defaultContextsAccepted)
            ? {}
            : { contextsAccepted: view.contextsAccepted }),
        ...(defaultModuleSlots && arraysEqual(view.moduleSlots, defaultModuleSlots)
            ? {}
            : { moduleSlots: view.moduleSlots }),
    };
}