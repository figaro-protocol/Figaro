import {
    BuilderMetadata,
    CapabilityPresentationRule,
    ContractRef,
    Assembly,
    AssemblyIdentity,
    MechanismAssembly,
    MechanismRiskClass,
    ModuleBinding,
    NarrativeLayer,
    RoleAssembly,
    RuntimeServiceKey,
    ServiceBinding,
    ScopeType,
    ViewAssembly,
    VisibilityDefaults,
} from "@/lib/shared/assembly";
import {
    CANONICAL_FULFILMENT_METHODS_LIST,
    type CanonicalFulfilmentMethod,
} from "@/lib/core/orderAgreement";
import {
    getBuiltInModuleDefaults,
    getBuiltInViewContextsAccepted,
    getBuiltInViewModuleSlots,
    getBuiltInViewRoute,
} from "@/lib/shared/builtInModuleDefaults";
import {
    asBoolean,
    asEnum,
    asNumber,
    asOptionalString,
    asRecord,
    asString,
    asStringArray,
} from "@/lib/shared/parseHelpers";

const MECHANISM_RISK_CLASSES = new Set<MechanismRiskClass>([
    "read-only-inherited",
    "low-risk-coordinator",
    "medium-risk-extension",
    "high-risk-economic",
]);

const VISIBILITY_VALUES = new Set<RoleAssembly["visibility"]>(["primary", "secondary", "advanced", "hidden"]);
const SCOPE_TYPES = new Set<ScopeType>(["assembly", "process", "order", "role", "mechanism"]);
const WARNING_STYLES = new Set<NonNullable<CapabilityPresentationRule["warningStyle"]>>(["none", "info", "warning", "danger"]);
const RUNTIME_SERVICE_KEYS = new Set<RuntimeServiceKey>([
    "identity",
    "catalogue",
    "discovery",
    "evidenceTransport",
    "coordinationMessaging",
    "handoffPersistence",
    "tokenConversion",
]);

function asRecordOfScalar(value: unknown, path: string): Record<string, string | number | boolean> | undefined {
    if (value === undefined) {
        return undefined;
    }

    const record = asRecord(value, path);
    for (const [key, entry] of Object.entries(record)) {
        if (!["string", "number", "boolean"].includes(typeof entry)) {
            throw new Error(`${path}.${key} must be a string, number, or boolean.`);
        }
    }

    return record as Record<string, string | number | boolean>;
}

function asRecordOfStrings(value: unknown, path: string): Record<string, string> | undefined {
    if (value === undefined) {
        return undefined;
    }

    const record = asRecord(value, path);
    for (const [key, entry] of Object.entries(record)) {
        if (typeof entry !== "string") {
            throw new Error(`${path}.${key} must be a string.`);
        }
    }

    return record as Record<string, string>;
}

function parseIdentity(value: unknown, path: string): AssemblyIdentity {
    const record = asRecord(value, path);
    return {
        id: asString(record.id, `${path}.id`),
        name: asString(record.name, `${path}.name`),
        slug: asString(record.slug, `${path}.slug`),
        description: asOptionalString(record.description, `${path}.description`),
        networkTargets: asStringArray(record.networkTargets, `${path}.networkTargets`),
        version: asString(record.version, `${path}.version`),
    };
}

function parseContracts(value: unknown, path: string): ContractRef[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => {
        const record = asRecord(entry, `${path}[${index}]`);
        return {
            key: asString(record.key, `${path}[${index}].key`),
            address: asOptionalString(record.address, `${path}[${index}].address`) as `0x${string}` | undefined,
            required: asBoolean(record.required, `${path}[${index}].required`),
            description: asOptionalString(record.description, `${path}[${index}].description`),
        };
    });
}

function parseMechanisms(value: unknown, path: string): MechanismAssembly[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => {
        const record = asRecord(entry, `${path}[${index}]`);
        return {
            mechanismId: asString(record.mechanismId, `${path}[${index}].mechanismId`),
            kind: asString(record.kind, `${path}[${index}].kind`),
            displayName: asString(record.displayName, `${path}[${index}].displayName`),
            riskClass: asEnum(record.riskClass, MECHANISM_RISK_CLASSES, `${path}[${index}].riskClass`),
            enabled: asBoolean(record.enabled, `${path}[${index}].enabled`),
            visibility: asEnum(record.visibility, VISIBILITY_VALUES, `${path}[${index}].visibility`),
            group: asOptionalString(record.group, `${path}[${index}].group`),
            recognizedRoles: record.recognizedRoles === undefined ? undefined : asStringArray(record.recognizedRoles, `${path}[${index}].recognizedRoles`),
            contractKeys: record.contractKeys === undefined ? undefined : asStringArray(record.contractKeys, `${path}[${index}].contractKeys`),
            capabilityBindings: record.capabilityBindings === undefined ? undefined : asStringArray(record.capabilityBindings, `${path}[${index}].capabilityBindings`),
            moduleBindings: asStringArray(record.moduleBindings, `${path}[${index}].moduleBindings`),
        };
    });
}

function parseRoles(value: unknown, path: string): RoleAssembly[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => {
        const record = asRecord(entry, `${path}[${index}]`);
        return {
            roleKind: asString(record.roleKind, `${path}[${index}].roleKind`),
            displayName: asString(record.displayName, `${path}[${index}].displayName`),
            description: asOptionalString(record.description, `${path}[${index}].description`),
            visibility: asEnum(record.visibility, VISIBILITY_VALUES, `${path}[${index}].visibility`),
            defaultLandingView: asOptionalString(record.defaultLandingView, `${path}[${index}].defaultLandingView`),
            modulePriorities: record.modulePriorities === undefined ? undefined : asStringArray(record.modulePriorities, `${path}[${index}].modulePriorities`),
            sampleCapabilities: record.sampleCapabilities === undefined ? undefined : asStringArray(record.sampleCapabilities, `${path}[${index}].sampleCapabilities`),
        };
    });
}

function parseViews(value: unknown, path: string, moduleIds: string[]): ViewAssembly[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => {
        const record = asRecord(entry, `${path}[${index}]`);
        const kind = asString(record.kind, `${path}[${index}].kind`);
        const contexts = record.contextsAccepted === undefined
            ? getBuiltInViewContextsAccepted(kind) ?? (() => {
                throw new Error(`${path}[${index}].contextsAccepted must be declared for unknown view kind ${kind}.`);
            })()
            : asStringArray(record.contextsAccepted, `${path}[${index}].contextsAccepted`).map((context, contextIndex) =>
                asEnum(context, SCOPE_TYPES, `${path}[${index}].contextsAccepted[${contextIndex}]`)
            );
        const moduleSlots = record.moduleSlots === undefined
            ? getBuiltInViewModuleSlots(kind, moduleIds) ?? (() => {
                throw new Error(`${path}[${index}].moduleSlots must be declared for unknown view kind ${kind}.`);
            })()
            : asStringArray(record.moduleSlots, `${path}[${index}].moduleSlots`);

        return {
            viewId: asString(record.viewId, `${path}[${index}].viewId`),
            kind,
            title: asString(record.title, `${path}[${index}].title`),
            route: record.route === undefined
                ? getBuiltInViewRoute(kind)
                : asOptionalString(record.route, `${path}[${index}].route`),
            contextsAccepted: contexts,
            moduleSlots,
        };
    });
}

function parseModules(value: unknown, path: string): ModuleBinding[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => {
        const record = asRecord(entry, `${path}[${index}]`);
        const moduleId = asString(record.moduleId, `${path}[${index}].moduleId`);
        const defaults = getBuiltInModuleDefaults(moduleId);
        const hasSlot = record.slot !== undefined;
        const hasPriority = record.priority !== undefined;
        const componentKind = record.componentKind === undefined
            ? defaults?.componentKind
            : asString(record.componentKind, `${path}[${index}].componentKind`);
        const semanticInput = record.semanticInput === undefined
            ? defaults?.semanticInput
            : asString(record.semanticInput, `${path}[${index}].semanticInput`);
        const slot = hasSlot
            ? asString(record.slot, `${path}[${index}].slot`)
            : defaults?.slot;
        const priority = hasPriority
            ? asNumber(record.priority, `${path}[${index}].priority`)
            : defaults?.priority;

        if (!componentKind) {
            throw new Error(`${path}[${index}].componentKind must be declared for unknown module ${moduleId}.`);
        }

        if (!semanticInput) {
            throw new Error(`${path}[${index}].semanticInput must be declared for unknown module ${moduleId}.`);
        }

        if (hasSlot !== hasPriority) {
            throw new Error(`${path}[${index}] must declare both slot and priority when overriding built-in layout for ${moduleId}.`);
        }

        if (!slot) {
            throw new Error(`${path}[${index}].slot must be declared for module ${moduleId} when no built-in layout default exists.`);
        }

        if (priority === undefined) {
            throw new Error(`${path}[${index}].priority must be declared for module ${moduleId} when no built-in layout default exists.`);
        }

        return {
            moduleId,
            componentKind,
            semanticInput,
            slot,
            priority,
            displayOptions: asRecordOfScalar(record.displayOptions, `${path}[${index}].displayOptions`),
        };
    });
}

function parseServiceBindings(value: unknown, path: string): ServiceBinding[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => {
        const record = asRecord(entry, `${path}[${index}]`);
        return {
            serviceKey: asEnum(record.serviceKey, RUNTIME_SERVICE_KEYS, `${path}[${index}].serviceKey`),
            providerKey: asString(record.providerKey, `${path}[${index}].providerKey`),
        };
    });
}

function parseCapabilityPresentation(value: unknown, path: string): CapabilityPresentationRule[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} must be an array.`);
    }

    return value.map((entry, index) => {
        const record = asRecord(entry, `${path}[${index}]`);
        return {
            capabilityKind: asString(record.capabilityKind, `${path}[${index}].capabilityKind`),
            labelOverride: asOptionalString(record.labelOverride, `${path}[${index}].labelOverride`),
            priority: record.priority === undefined ? undefined : asNumber(record.priority, `${path}[${index}].priority`),
            group: asOptionalString(record.group, `${path}[${index}].group`),
            requiresConfirmation: record.requiresConfirmation === undefined ? undefined : asBoolean(record.requiresConfirmation, `${path}[${index}].requiresConfirmation`),
            warningStyle: record.warningStyle === undefined ? undefined : asEnum(record.warningStyle, WARNING_STYLES, `${path}[${index}].warningStyle`),
        };
    });
}

function parseVisibilityDefaults(value: unknown, path: string): VisibilityDefaults {
    const record = asRecord(value, path);
    return {
        showGraphByDefault: asBoolean(record.showGraphByDefault, `${path}.showGraphByDefault`),
        showAdvancedMechanisms: asBoolean(record.showAdvancedMechanisms, `${path}.showAdvancedMechanisms`),
        showRiskBoundaries: asBoolean(record.showRiskBoundaries, `${path}.showRiskBoundaries`),
        showGuarantees: asBoolean(record.showGuarantees, `${path}.showGuarantees`),
        showEconomicBreakdowns: asBoolean(record.showEconomicBreakdowns, `${path}.showEconomicBreakdowns`),
        showBuilderMode: asBoolean(record.showBuilderMode, `${path}.showBuilderMode`),
        showAuditMode: asBoolean(record.showAuditMode, `${path}.showAuditMode`),
    };
}

function parseNarrative(value: unknown, path: string): NarrativeLayer | undefined {
    if (value === undefined) {
        return undefined;
    }

    const record = asRecord(value, path);
    return {
        assemblySummary: asOptionalString(record.assemblySummary, `${path}.assemblySummary`),
        mechanismSummaries: asRecordOfStrings(record.mechanismSummaries, `${path}.mechanismSummaries`),
        riskExplanations: asRecordOfStrings(record.riskExplanations, `${path}.riskExplanations`),
        guaranteeExplanations: asRecordOfStrings(record.guaranteeExplanations, `${path}.guaranteeExplanations`),
        builderNotes: asOptionalString(record.builderNotes, `${path}.builderNotes`),
    };
}

function parseBuilderMetadata(value: unknown, path: string): BuilderMetadata {
    const record = asRecord(value, path);
    const compositionLevel = asNumber(record.compositionLevel, `${path}.compositionLevel`);

    if (![1, 2, 3].includes(compositionLevel)) {
        throw new Error(`${path}.compositionLevel must be 1, 2, or 3.`);
    }

    return {
        assemblyClass: asString(record.assemblyClass, `${path}.assemblyClass`),
        compositionLevel: compositionLevel as BuilderMetadata["compositionLevel"],
        requiresCustomModules: asBoolean(record.requiresCustomModules, `${path}.requiresCustomModules`),
        safetyWarnings: record.safetyWarnings === undefined ? undefined : asStringArray(record.safetyWarnings, `${path}.safetyWarnings`),
    };
}

function parseDefaultRootFulfilment(value: unknown, sourceLabel: string): CanonicalFulfilmentMethod | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") {
        throw new Error(`${sourceLabel} must be a string when present, got ${typeof value}`);
    }
    if (!(CANONICAL_FULFILMENT_METHODS_LIST as readonly string[]).includes(value)) {
        throw new Error(
            `${sourceLabel} must be one of ${CANONICAL_FULFILMENT_METHODS_LIST.join(", ")}; got "${value}"`,
        );
    }
    return value as CanonicalFulfilmentMethod;
}

export function parseAssemblyDocument(value: unknown, sourceLabel = "assembly document"): Assembly {
    const record = asRecord(value, sourceLabel);
    const modules = parseModules(record.modules, `${sourceLabel}.modules`);
    return {
        identity: parseIdentity(record.identity, `${sourceLabel}.identity`),
        contracts: parseContracts(record.contracts, `${sourceLabel}.contracts`),
        serviceBindings: parseServiceBindings(record.serviceBindings, `${sourceLabel}.serviceBindings`),
        mechanisms: parseMechanisms(record.mechanisms, `${sourceLabel}.mechanisms`),
        roles: parseRoles(record.roles, `${sourceLabel}.roles`),
        views: parseViews(record.views, `${sourceLabel}.views`, modules.map((module) => module.moduleId)),
        modules,
        capabilityPresentation: parseCapabilityPresentation(record.capabilityPresentation, `${sourceLabel}.capabilityPresentation`),
        visibilityDefaults: parseVisibilityDefaults(record.visibilityDefaults, `${sourceLabel}.visibilityDefaults`),
        narrative: parseNarrative(record.narrative, `${sourceLabel}.narrative`),
        builderMetadata: parseBuilderMetadata(record.builderMetadata, `${sourceLabel}.builderMetadata`),
        defaultRootFulfilment: parseDefaultRootFulfilment(record.defaultRootFulfilment, `${sourceLabel}.defaultRootFulfilment`),
    };
}
