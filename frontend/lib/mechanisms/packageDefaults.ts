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
