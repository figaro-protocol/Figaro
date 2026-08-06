import type { Metadata } from "next";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingAssembliesForm } from "@/components/members/OnboardingAssembliesForm";

export const metadata: Metadata = { title: "Assemblies — Seller onboarding" };

export default function OnboardingAssembliesPage() {
    return (
        <OnboardingShell
            stepId="assemblies"
            title="Assemblies you participate in"
            description={
                <p>
                    Pick the assemblies registered on this network that you bind to. Per-assembly customization (trusted counterparties, mechanism configuration) is added after first registration.
                </p>
            }
        >
            <OnboardingAssembliesForm />
        </OnboardingShell>
    );
}
