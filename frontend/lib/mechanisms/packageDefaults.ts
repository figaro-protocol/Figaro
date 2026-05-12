export interface MechanismPackageMetadata {
    kind: string;
    capabilityBindings?: readonly string[];
    capabilityPrefixes?: readonly string[];
    moduleIds: readonly string[];
}

export const DUTCH_AUCTION_MECHANISM_PACKAGE_METADATA: MechanismPackageMetadata = {
    kind: "auction",
    capabilityBindings: ["claim-auction"],
    moduleIds: ["auction-actions"],
};

export const CORE_MECHANISM_PACKAGE_METADATA: MechanismPackageMetadata = {
    kind: "core",
    capabilityBindings: [
        "create-order",
        "resolve-process",
        "withdraw",
        "accept-offer",
        "open-sub-order-composer",
    ],
    moduleIds: [
        "process-graph",
        "order-node",
        "order-actions",
        "settlement-breakdown",
        "event-timeline",
        "process-capital-summary",
    ],
};

export const DISCLOSURE_MECHANISM_PACKAGE_METADATA: MechanismPackageMetadata = {
    kind: "disclosure",
    capabilityBindings: [
        "submit-disclosure-commitment",
        "submit-disclosure-inventory",
    ],
    moduleIds: ["disclosure-actions"],
};

export const ATTESTATION_MECHANISM_PACKAGE_METADATA: MechanismPackageMetadata = {
    kind: "attestation",
    capabilityBindings: ["submit-courier-process-signal-with-proof"],
    moduleIds: ["delivery-attestation"],
};

const FIG_MECHANISM_PACKAGE_METADATA: MechanismPackageMetadata = {
    kind: "fig",
    capabilityBindings: [
        "claim-airdrop",
        "claim-vesting",
    ],
    moduleIds: ["fig-token"],
};

export const COORDINATOR_MECHANISM_PACKAGE_METADATA: MechanismPackageMetadata = {
    kind: "coordinator",
    capabilityBindings: [
        "submit-merchant-process-signal",
        "submit-courier-process-signal",
    ],
    capabilityPrefixes: ["declare-"],
    moduleIds: [
        "coordinator-actions",
        "handoff-details",
        "handoff-tracker",
        "handoff-key-exchange",
    ],
};

export const OPERATOR_REGISTRY_MECHANISM_PACKAGE_METADATA: MechanismPackageMetadata = {
    kind: "registry",
    capabilityBindings: [
        "register-operator",
        "withdraw-operator-deposit",
    ],
    moduleIds: ["operator-registration-panel"],
};

const BUILT_IN_MECHANISM_PACKAGE_METADATA = [
    CORE_MECHANISM_PACKAGE_METADATA,
    DUTCH_AUCTION_MECHANISM_PACKAGE_METADATA,
    DISCLOSURE_MECHANISM_PACKAGE_METADATA,
    ATTESTATION_MECHANISM_PACKAGE_METADATA,
    FIG_MECHANISM_PACKAGE_METADATA,
    COORDINATOR_MECHANISM_PACKAGE_METADATA,
    OPERATOR_REGISTRY_MECHANISM_PACKAGE_METADATA,
] as const satisfies readonly MechanismPackageMetadata[];

const MECHANISM_PACKAGE_METADATA_MAP = new Map<string, MechanismPackageMetadata>(
    BUILT_IN_MECHANISM_PACKAGE_METADATA.map((metadata) => [metadata.kind, metadata] as const),
);

function mergeUniqueBindings(
    packagedBindings: readonly string[],
    explicitBindings: readonly string[] | undefined,
): string[] {
    return [...new Set([...packagedBindings, ...(explicitBindings ?? [])])];
}

function getMechanismPackageMetadata(kind: string): MechanismPackageMetadata | undefined {
    return MECHANISM_PACKAGE_METADATA_MAP.get(kind);
}

export function getPackagedMechanismModuleBindings(kind: string): string[] {
    return [...(getMechanismPackageMetadata(kind)?.moduleIds ?? [])];
}

export function getEffectiveMechanismModuleBindings(
    mechanism: {
        kind: string;
        moduleBindings?: readonly string[];
    },
    knownModuleIds?: Iterable<string>,
): string[] {
    const packagedBindings = getPackagedMechanismModuleBindings(mechanism.kind);
    const availableModuleIds = knownModuleIds ? new Set(knownModuleIds) : undefined;
    const filteredPackagedBindings = availableModuleIds
        ? packagedBindings.filter((moduleId) => availableModuleIds.has(moduleId))
        : packagedBindings;

    return mergeUniqueBindings(filteredPackagedBindings, mechanism.moduleBindings);
}

export function getPackagedMechanismCapabilityBindings(kind: string): string[] {
    return [...(getMechanismPackageMetadata(kind)?.capabilityBindings ?? [])];
}

export function getEffectiveMechanismCapabilityBindings(mechanism: {
    kind: string;
    capabilityBindings?: readonly string[];
}): string[] {
    return mergeUniqueBindings(
        getPackagedMechanismCapabilityBindings(mechanism.kind),
        mechanism.capabilityBindings,
    );
}

export function mechanismClaimsCapability(mechanism: {
    kind: string;
    capabilityBindings?: readonly string[];
}, capabilityKind: string): boolean {
    if (getEffectiveMechanismCapabilityBindings(mechanism).includes(capabilityKind)) {
        return true;
    }

    return getMechanismPackageMetadata(mechanism.kind)?.capabilityPrefixes?.some(
        (prefix) => capabilityKind.startsWith(prefix),
    ) ?? false;
}