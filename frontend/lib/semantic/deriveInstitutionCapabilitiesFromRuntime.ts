import { CapabilityModel, MechanismModel } from "@/lib/semantic/models";

const OPERATOR_ROLE_NONE = 0;
const OPERATOR_ROLE_MERCHANT = 1;
const OPERATOR_ROLE_DRIVER = 2;
const OPERATOR_ROLE_BOTH = 3;

function deriveOperatorRole(roleKind: string): number {
    if (roleKind === "driver") return OPERATOR_ROLE_DRIVER;
    if (roleKind === "merchant" || roleKind === "restaurant" || roleKind === "seller") {
        return OPERATOR_ROLE_MERCHANT;
    }
    return OPERATOR_ROLE_BOTH;
}

export function deriveInstitutionCapabilitiesFromRuntime(
    institutionId: string,
    roleKind: string | undefined,
    mechanisms: MechanismModel[],
    operatorProfile?: readonly [number, boolean, string, ...unknown[]],
): CapabilityModel[] {
    if (!roleKind) return [];

    const operatorRegistryMechanism = mechanisms.find((mechanism) => mechanism.id === "operator-registration");
    if (!operatorRegistryMechanism) return [];

    const currentRole = operatorProfile?.[0] ?? OPERATOR_ROLE_NONE;

    if (currentRole !== OPERATOR_ROLE_NONE) {
        return [
            {
                id: `${institutionId}:${roleKind}:update-operator-profile`,
                label: "Update Operator Profile",
                actionKind: "update-operator-profile",
                action: {
                    executionType: "transaction",
                    kind: "update-operator-profile",
                    operatorRole: currentRole,
                },
                mechanismId: operatorRegistryMechanism.id,
                scopeType: "institution",
                scopeId: institutionId,
                preconditions: ["registered-operator-wallet"],
                riskLabel: "standard",
                writeTarget: "OperatorRegistry.updateProfile",
                uiPriority: 90,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "connected operator already has an active registry profile",
                    referenceId: `${institutionId}:${roleKind}:update-operator-profile`,
                },
            },
        ];
    }

    return [
        {
            id: `${institutionId}:${roleKind}:register-operator`,
            label: "Register Operator",
            actionKind: "register-operator",
            action: {
                executionType: "transaction",
                kind: "register-operator",
                operatorRole: deriveOperatorRole(roleKind),
            },
            mechanismId: operatorRegistryMechanism.id,
            scopeType: "institution",
            scopeId: institutionId,
            preconditions: ["connected-operator-wallet"],
            riskLabel: "standard",
            writeTarget: "OperatorRegistry.register",
            uiPriority: 90,
            source: {
                truthClass: "institution-declared",
                sourceLabel: "selected role exposes the operator registration mechanism",
                referenceId: `${institutionId}:${roleKind}:register-operator`,
            },
        },
    ];
}