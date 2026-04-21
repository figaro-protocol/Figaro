import { InstitutionAssembly, RoleAssembly } from "@/lib/shared/institutionAssembly";
import { inferMechanismIdFromCapability } from "@/lib/semantic/assemblyCapabilityBinding";
import { CapabilityModel, RoleContext } from "@/lib/semantic/models";

function titleCaseCapability(kind: string): string {
    return kind
        .split("-")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
}

function labelForCapability(kind: string): string {
    switch (kind) {
        case "create-order":
            return "Create Order";
        case "resolve-process":
            return "Resolve Process";
        case "withdraw":
            return "Withdraw Available";
        case "accept-offer":
            return "Accept Offer";
        case "declare-ready-for-pickup":
            return "Declare Ready for Pickup";
        case "claim-auction":
            return "Claim Auction";
        case "declare-picked-up":
            return "Declare Picked Up";
        default:
            return titleCaseCapability(kind);
    }
}

function deriveMechanismIds(role: RoleAssembly, assembly: InstitutionAssembly): string[] {
    return [...new Set((role.sampleCapabilities ?? []).map((capabilityKind) => inferMechanismIdFromCapability(capabilityKind, assembly.mechanisms)))];
}

function deriveCapabilities(role: RoleAssembly, assembly: InstitutionAssembly): CapabilityModel[] {
    return (role.sampleCapabilities ?? []).map((capabilityKind, index) => ({
        id: `${role.roleKind}-${capabilityKind}`,
        label: labelForCapability(capabilityKind),
        actionKind: capabilityKind,
        action: {
            executionType: "prototype",
            kind: capabilityKind,
        },
        mechanismId: inferMechanismIdFromCapability(capabilityKind, assembly.mechanisms),
        scopeType: "institution",
        scopeId: assembly.identity.id,
        preconditions: ["prototype-capability"],
        riskLabel: capabilityKind.includes("auction") || capabilityKind.includes("resolve") ? "important" : "standard",
        uiPriority: 100 - index,
        prototype: true,
        source: {
            truthClass: "institution-declared",
            sourceLabel: "institution assembly sample capability",
            referenceId: `${assembly.identity.id}:${role.roleKind}:${capabilityKind}`,
        },
    }));
}

export function deriveRoleContextsFromAssembly(assembly: InstitutionAssembly): RoleContext[] {
    return assembly.roles
        .filter((role) => role.visibility !== "hidden")
        .map((role, index) => ({
            id: `${assembly.identity.id}:${role.roleKind}`,
            roleKind: role.roleKind,
            displayName: role.displayName,
            description: role.description,
            visibility: role.visibility,
            defaultLandingView: role.defaultLandingView,
            scopeType: "institution",
            scopeId: assembly.identity.id,
            mechanismId: undefined,
            mechanismIds: deriveMechanismIds(role, assembly),
            prototype: true,
            authoritySource: {
                truthClass: "institution-declared",
                sourceLabel: "institution assembly prototype role",
                referenceId: `${assembly.identity.id}:${role.roleKind}`,
            },
            activeCapabilities: deriveCapabilities(role, assembly),
            activeObligations: [],
        }));
}