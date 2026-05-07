import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingPlaceholder } from "@/components/operators/OnboardingPlaceholder";

export const metadata: Metadata = { title: "Assemblies — Operator onboarding" };

export default function OnboardingAssembliesPage() {
    return (
        <OnboardingShell
            stepId="assemblies"
            title="Assemblies you participate in"
            description={
                <p>
                    Pick from the assemblies registered on this network. Per-assembly, you can declare counterparty addresses you trust (e.g. couriers you work with) and any mechanism configuration the assembly asks for.
                </p>
            }
        >
            <OnboardingPlaceholder
                description="Assembly picker (multi-select), per-assembly trusted-seller list, per-assembly mechanism config."
                prevPath="link"
                nextPath="agents"
            />
        </OnboardingShell>
    );
}
