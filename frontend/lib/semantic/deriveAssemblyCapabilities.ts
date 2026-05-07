import { CapabilityModel, MechanismModel } from "@/lib/semantic/models";

export function deriveAssemblyCapabilities(
    assemblyId: string,
    roleKind: string | undefined,
    mechanisms: MechanismModel[],
    /** [metadataURI, registeredBlock] from `useOperatorProfile`; undefined when
     *  the wallet has never registered (or has withdrawn since). */
    operatorProfile?: readonly [string, ...unknown[]],
): CapabilityModel[] {
    if (!roleKind) return [];

    const operatorRegistryMechanism = mechanisms.find((mechanism) => mechanism.id === "operator-registration");
    if (!operatorRegistryMechanism) return [];

    const isRegistered = !!operatorProfile;

    // A registered operator can either replace its metadataURI in place
    // (updateProfile, no deposit/lock impact) or withdraw the deposit and
    // clear the registry binding for the address.
    if (isRegistered) {
        return [
            {
                id: `${assemblyId}:${roleKind}:update-operator-profile`,
                label: "Update Operator Profile",
                actionKind: "update-operator-profile",
                action: {
                    executionType: "transaction",
                    kind: "update-operator-profile",
                },
                mechanismId: operatorRegistryMechanism.id,
                scopeType: "assembly",
                scopeId: assemblyId,
                preconditions: ["registered-operator-wallet"],
                riskLabel: "standard",
                writeTarget: "OperatorRegistry.updateProfile",
                uiPriority: 95,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "connected operator is registered; updateProfile replaces the metadataURI in place",
                    referenceId: `${assemblyId}:${roleKind}:update-operator-profile`,
                },
            },
            {
                id: `${assemblyId}:${roleKind}:withdraw-operator-deposit`,
                label: "Withdraw Operator Deposit",
                actionKind: "withdraw-operator-deposit",
                action: {
                    executionType: "transaction",
                    kind: "withdraw-operator-deposit",
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
                    sourceLabel: "connected operator is registered; withdraw clears the binding after the lock period",
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
