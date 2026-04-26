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

export function deriveAssemblyCapabilities(
    assemblyId: string,
    roleKind: string | undefined,
    mechanisms: MechanismModel[],
    /** [role, metadataURI, registeredBlock] from `useOperatorProfile`. */
    operatorProfile?: readonly [number, string, ...unknown[]],
): CapabilityModel[] {
    if (!roleKind) return [];

    const operatorRegistryMechanism = mechanisms.find((mechanism) => mechanism.id === "operator-registration");
    if (!operatorRegistryMechanism) return [];

    const currentRole = operatorProfile?.[0] ?? OPERATOR_ROLE_NONE;

    // Web2-strip (2026-04-26): when an operator is already registered, the
    // only on-chain action available is `withdraw` (which clears the dedup
    // guard and frees the address to re-register with new role/metadata).
    // Profile-edit / deactivate / reactivate were removed — they were web2
    // CRUD lifecycle on top of an event-sourced primitive.
    if (currentRole !== OPERATOR_ROLE_NONE) {
        return [
            {
                id: `${assemblyId}:${roleKind}:withdraw-operator-deposit`,
                label: "Withdraw Operator Deposit",
                actionKind: "withdraw-operator-deposit",
                action: {
                    executionType: "transaction",
                    kind: "withdraw-operator-deposit",
                    operatorRole: currentRole,
                },
                mechanismId: operatorRegistryMechanism.id,
                scopeType: "assembly",
                scopeId: assemblyId,
                preconditions: ["registered-operator-wallet"],
                riskLabel: "standard",
                writeTarget: "OperatorRegistry.withdraw",
                uiPriority: 90,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "connected operator is registered; withdraw frees the address to re-register",
                    referenceId: `${assemblyId}:${roleKind}:withdraw-operator-deposit`,
                },
            },
        ];
    }

    return [
        {
            id: `${assemblyId}:${roleKind}:register-operator`,
            label: "Register Operator",
            actionKind: "register-operator",
            action: {
                executionType: "transaction",
                kind: "register-operator",
                operatorRole: deriveOperatorRole(roleKind),
            },
            mechanismId: operatorRegistryMechanism.id,
            scopeType: "assembly",
            scopeId: assemblyId,
            preconditions: ["connected-operator-wallet"],
            riskLabel: "standard",
            writeTarget: "OperatorRegistry.register",
            uiPriority: 90,
            source: {
                truthClass: "assembly-declared",
                sourceLabel: "selected role exposes the operator registration mechanism",
                referenceId: `${assemblyId}:${roleKind}:register-operator`,
            },
        },
    ];
}