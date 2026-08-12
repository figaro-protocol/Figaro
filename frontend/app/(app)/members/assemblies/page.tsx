import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingAssembliesForm } from "@/components/members/OnboardingAssembliesForm";

export const metadata: Metadata = withOg({
    title: "Assemblies — Seller onboarding",
    description: "Pick the assemblies registered on this network that you bind to. Per-assembly customization is added after first registration.",
});

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
