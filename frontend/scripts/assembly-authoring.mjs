export function toIdentifierBase(slug) {
    return slug
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}

export function titleCaseIdentifier(identifier) {
    return identifier
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export function buildAssemblyDocument({ name, slug, description, assemblyClass, compositionLevel }) {
    const identifierBase = toIdentifierBase(slug);
    const viewId = `${slug}-dashboard`;

    return {
        identity: {
            id: `${slug}-reference`,
            name,
            slug,
            description,
            networkTargets: ["local-anvil", "evm-compatible"],
            version: "0.1.0",
        },
        contracts: [
            {
                key: "core",
                required: true,
                description: "Bonded process coordination substrate.",
            },
        ],
        mechanisms: [
            {
                mechanismId: "core-orders",
                kind: "core",
                displayName: `${identifierBase} Core Coordination`,
                riskClass: "read-only-inherited",
                enabled: true,
                visibility: "primary",
                contractKeys: ["core"],
                moduleBindings: [],
            },
        ],
        roles: [
            {
                roleKind: "buyer",
                displayName: "Buyer",
                visibility: "primary",
                defaultLandingView: viewId,
                sampleCapabilities: ["create-order", "resolve-process", "withdraw"],
            },
            {
                roleKind: "seller",
                displayName: "Seller",
                visibility: "primary",
                defaultLandingView: viewId,
                sampleCapabilities: ["accept-offer", "withdraw"],
            },
        ],
        views: [
            {
                viewId: "institution-overview",
                kind: "overview",
                title: "Institution Overview",
            },
            {
                viewId,
                kind: "role-dashboard",
                title: "Role Dashboard",
            },
        ],
        modules: [
            {
                moduleId: "role-switcher",
            },
            {
                moduleId: "capability-rail",
            },
            {
                moduleId: "process-graph",
            },
            {
                moduleId: "order-node",
            },
            {
                moduleId: "order-actions",
            },
            {
                moduleId: "settlement-breakdown",
            },
            {
                moduleId: "mechanism-inspector",
            },
        ],
        capabilityPresentation: [
            {
                capabilityKind: "resolve-process",
                priority: 10,
                warningStyle: "warning",
            },
            {
                capabilityKind: "withdraw",
                priority: 7,
                warningStyle: "info",
            },
        ],
        visibilityDefaults: {
            showGraphByDefault: true,
            showAdvancedMechanisms: false,
            showRiskBoundaries: true,
            showGuarantees: true,
            showEconomicBreakdowns: true,
            showBuilderMode: false,
            showAuditMode: false,
        },
        narrative: {
            institutionSummary: `${name} as a composed institution built from authored assembly metadata and shared semantic modules.`,
            builderNotes: "Generated template. Refine roles, mechanisms, and module composition before registering.",
        },
        builderMetadata: {
            assemblyClass,
            compositionLevel,
            requiresCustomModules: false,
            safetyWarnings: ["Generated template. Review contract keys, role capabilities, and view module slots before registry use."],
        },
    };
}

export function replaceStringValue(value, replacers) {
    return replacers.reduce((current, { from, to }) => current.split(from).join(to), value);
}

export function parseRenameMappings(values, flagName) {
    return (values ?? []).map((value) => {
        const [from, to, ...rest] = value.split(":");
        if (!from || !to || rest.length > 0) {
            throw new Error(`Invalid ${flagName} mapping: ${value}. Expected old:new.`);
        }

        return { from, to };
    });
}

export function applyRoleRenames(document, mappings) {
    if (!mappings.length) {
        return document;
    }

    const mappedDocument = JSON.parse(JSON.stringify(document));
    mappedDocument.roles = (mappedDocument.roles ?? []).map((role) => {
        const mapping = mappings.find((entry) => entry.from === role.roleKind);
        if (!mapping) {
            return role;
        }

        const expectedDisplay = titleCaseIdentifier(mapping.from);
        return {
            ...role,
            roleKind: mapping.to,
            displayName: role.displayName === expectedDisplay ? titleCaseIdentifier(mapping.to) : role.displayName,
        };
    });

    return mappedDocument;
}

export function applyMechanismRenames(document, mappings) {
    if (!mappings.length) {
        return document;
    }

    const mappedDocument = JSON.parse(JSON.stringify(document));
    mappedDocument.mechanisms = (mappedDocument.mechanisms ?? []).map((mechanism) => {
        const mapping = mappings.find((entry) => entry.from === mechanism.mechanismId);
        if (!mapping) {
            return mechanism;
        }

        const expectedDisplay = titleCaseIdentifier(mapping.from);
        return {
            ...mechanism,
            mechanismId: mapping.to,
            displayName: mechanism.displayName === expectedDisplay ? titleCaseIdentifier(mapping.to) : mechanism.displayName,
        };
    });

    return mappedDocument;
}

export function cloneAssemblyDocumentFromSource(sourceDocument, { name, slug, description, assemblyClass, compositionLevel, sourceSlug }) {
    const cloned = JSON.parse(JSON.stringify(sourceDocument));
    const sourceName = sourceDocument?.identity?.name;
    const sourceId = sourceDocument?.identity?.id;
    const sourceViewSlug = sourceDocument?.identity?.slug;
    const replacers = [
        ...(typeof sourceName === "string" ? [{ from: sourceName, to: name }] : []),
        ...(typeof sourceId === "string" ? [{ from: sourceId, to: `${slug}-reference` }] : []),
        ...(typeof sourceViewSlug === "string" ? [{ from: sourceViewSlug, to: slug }] : []),
    ];

    cloned.identity = {
        ...cloned.identity,
        id: `${slug}-reference`,
        name,
        slug,
        description,
    };

    cloned.roles = (cloned.roles ?? []).map((role) => ({
        ...role,
        defaultLandingView: typeof role.defaultLandingView === "string"
            ? replaceStringValue(role.defaultLandingView, replacers)
            : role.defaultLandingView,
    }));

    cloned.views = (cloned.views ?? []).map((view) => ({
        ...view,
        viewId: typeof view.viewId === "string" ? replaceStringValue(view.viewId, replacers) : view.viewId,
        route: typeof view.route === "string" ? replaceStringValue(view.route, replacers) : view.route,
        title: typeof view.title === "string" ? replaceStringValue(view.title, replacers) : view.title,
    }));

    if (cloned.narrative) {
        cloned.narrative = {
            ...cloned.narrative,
            institutionSummary: `${name} as a scaffold cloned from ${sourceSlug} and adapted through authored assembly metadata and shared semantic modules.`,
            builderNotes: `Scaffolded from ${sourceSlug}. Review copied roles, mechanisms, modules, and narratives before registering.`,
        };
    }

    cloned.builderMetadata = {
        ...cloned.builderMetadata,
        assemblyClass,
        compositionLevel,
    };

    return cloned;
}

export function buildManifestSnippet(slug) {
    const constantName = `${slug.toUpperCase().replace(/-/g, "_")}_REFERENCE_ASSEMBLY`;
    return `{ slug: ${constantName}.identity.slug, assembly: ${constantName} },`;
}

export function buildJsonImport(slug) {
    const importName = `${toIdentifierBase(slug).charAt(0).toLowerCase()}${toIdentifierBase(slug).slice(1)}Reference`;
    return {
        importName,
        line: `import ${importName} from "@/lib/shared/assemblies/${slug}.reference.json";`,
    };
}

export function buildAssemblyExport(slug) {
    const constantName = `${slug.toUpperCase().replace(/-/g, "_")}_REFERENCE_ASSEMBLY`;
    const { importName } = buildJsonImport(slug);

    return {
        constantName,
        block: `export const ${constantName} = parseInstitutionAssemblyDocument(\n    ${importName},\n    "${slug}.reference.json"\n);\n`,
    };
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findRegisteredAssemblyConstantName(source, slug) {
    const fileName = `${slug}.reference.json`;
    const exportPattern = new RegExp(
        `export const ([A-Z0-9_]+) = parseInstitutionAssemblyDocument\\(\\n\\s*\\w+,\\n\\s*"${escapeRegExp(fileName)}"`,
        "m"
    );
    const match = source.match(exportPattern);
    return match?.[1];
}

export function unregisterAssemblySource(source, slug) {
    const importPattern = new RegExp(`^import .*@/lib/shared/assemblies/${escapeRegExp(`${slug}.reference.json`)}";\\n`, "m");
    const constantName = findRegisteredAssemblyConstantName(source, slug);

    if (!constantName) {
        throw new Error(`Assembly ${slug} is not fully registered in lib/shared/institutionAssembly.ts`);
    }

    const exportPattern = new RegExp(
        `export const ${constantName} = parseInstitutionAssemblyDocument\\([\\s\\S]*?\\n\\);\\n`,
        "m"
    );
    const registryLine = `    ${constantName},`;

    if (!importPattern.test(source) || !exportPattern.test(source) || !source.includes(registryLine)) {
        throw new Error(`Assembly ${slug} is not fully registered in lib/shared/institutionAssembly.ts`);
    }

    return source
        .replace(importPattern, "")
        .replace(exportPattern, "")
        .replace(`${registryLine}\n`, "");
}
