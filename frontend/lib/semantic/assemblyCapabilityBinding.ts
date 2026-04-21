import { mechanismClaimsCapability } from "@/lib/mechanisms/packageDefaults";
import { MechanismAssembly } from "@/lib/shared/institutionAssembly";

function isDisclosureCapability(capabilityKind: string): boolean {
    return capabilityKind.includes("disclosure") || capabilityKind.includes("report");
}

/** Heuristic fallback — used only when no mechanism declares explicit capabilityBindings. */
function inferByHeuristic(capabilityKind: string, mechanisms: MechanismAssembly[]): string {
    if (capabilityKind.includes("auction")) {
        return mechanisms.find((m) => m.kind === "auction")?.mechanismId ?? "core-orders";
    }

    if (isDisclosureCapability(capabilityKind)) {
        return mechanisms.find((m) => m.kind === "disclosure")?.mechanismId
            ?? mechanisms.find((m) => m.kind === "reporting")?.mechanismId
            ?? "core-orders";
    }

    if (capabilityKind.startsWith("declare-")) {
        return mechanisms.find((m) => m.kind === "coordinator")?.mechanismId ?? "core-orders";
    }

    return mechanisms.find((m) => m.kind === "core")?.mechanismId ?? mechanisms[0]?.mechanismId ?? "unknown";
}

/**
 * Resolve a capability kind to its owning mechanism ID.
 * Prefers explicit `capabilityBindings` declared in the assembly;
 * falls back to the heuristic when no mechanism claims the capability.
 */
export function inferMechanismIdFromCapability(capabilityKind: string, mechanisms: MechanismAssembly[]): string {
    const claimed = mechanisms.find((mechanism) => mechanismClaimsCapability(mechanism, capabilityKind));
    if (claimed) return claimed.mechanismId;

    return inferByHeuristic(capabilityKind, mechanisms);
}
