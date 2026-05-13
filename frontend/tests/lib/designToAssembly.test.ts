import { describe, expect, it, beforeAll } from "vitest";
import {
    DIRECT_SALE_REFERENCE_ASSEMBLY,
    LOCAL_COMMERCE_REFERENCE_ASSEMBLY,
    FIGARO_FREELANCE_REFERENCE_ASSEMBLY,
} from "@/lib/shared/assembly";
import { assemblyToSyntheticOrders } from "@/lib/designer/assemblyToSyntheticOrders";
import { designToAssembly } from "@/lib/designer/designToAssembly";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import type { Assembly } from "@/lib/shared/assembly";
import { registerAllModules } from "@/components/modules/registerAllModules";

/**
 * Round-trip equivalence test against the vetted pair (direct-sale,
 * local-commerce) plus freelance (kept for comparison; the freelance
 * reference is known to carry kernel-layer pollution in roles[].description
 * and uses an unvetted roleKind naming, so its diffs are expected).
 *
 * For each reference: reference JSON → assemblyToSyntheticOrders → orders →
 * (mock prose drawn from the reference) → designToAssembly → derived
 * Assembly → section-by-section diff.
 */
function runRoundTrip(label: string, reference: Assembly): void {
    describe(`designToAssembly — ${label} round-trip`, () => {
        let derived: Assembly;

        beforeAll(() => {
            localStorage.clear();
            registerAllModules();
            const { orders } = assemblyToSyntheticOrders(reference);
            const snapshot: DesignSnapshot = {
                slug: reference.identity.slug,
                name: reference.identity.name,
                processId: orders[0].processId,
                nextOrderIndex: orders.length,
                nextSellerIndex: orders.length,
                orders,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                description: reference.identity.description,
                narrativeSummary: reference.narrative?.assemblySummary,
                builderNotes: reference.narrative?.builderNotes,
                mechanismLabels: Object.fromEntries(
                    reference.mechanisms.map((m) => [m.kind, m.displayName]),
                ),
                roleLabels: Object.fromEntries(
                    reference.roles.map((r) => [
                        r.roleKind,
                        {
                            displayName: r.displayName,
                            sampleCapabilities: r.sampleCapabilities,
                        },
                    ]),
                ),
            };
            derived = designToAssembly(snapshot, {
                id: reference.identity.id,
                networkTargets: reference.identity.networkTargets,
                version: reference.identity.version,
                assemblyClass: reference.builderMetadata.assemblyClass,
            });
        });

        it("identity matches", () => {
            expect(derived.identity).toEqual(reference.identity);
        });

        it("contracts match", () => {
            expect(derived.contracts).toEqual(reference.contracts);
        });

        it("mechanisms match", () => {
            expect(derived.mechanisms).toEqual(reference.mechanisms);
        });

        it("roles match", () => {
            expect(derived.roles).toEqual(reference.roles);
        });

        it("views match", () => {
            expect(derived.views).toEqual(reference.views);
        });

        it("modules match", () => {
            expect(derived.modules).toEqual(reference.modules);
        });

        it("capabilityPresentation matches", () => {
            expect(derived.capabilityPresentation).toEqual(reference.capabilityPresentation);
        });

        it("visibilityDefaults matches", () => {
            expect(derived.visibilityDefaults).toEqual(reference.visibilityDefaults);
        });

        it("narrative matches", () => {
            expect(derived.narrative).toEqual(reference.narrative);
        });

        it("builderMetadata matches", () => {
            expect(derived.builderMetadata).toEqual(reference.builderMetadata);
        });
    });
}

runRoundTrip("direct-sale (vetted)", DIRECT_SALE_REFERENCE_ASSEMBLY);
runRoundTrip("local-commerce (vetted)", LOCAL_COMMERCE_REFERENCE_ASSEMBLY);
runRoundTrip("figaro-freelance (unvetted)", FIGARO_FREELANCE_REFERENCE_ASSEMBLY);
