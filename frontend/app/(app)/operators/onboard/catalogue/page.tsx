import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingCatalogueForm } from "@/components/operators/OnboardingCatalogueForm";

export const metadata: Metadata = { title: "Catalogue — Operator onboarding" };

export default function OnboardingCataloguePage() {
    return (
        <OnboardingShell
            stepId="catalogue"
            title="Your catalogue"
            description={
                <p>
                    Your list of items. Each carries a name, price (in your default token), category, and an optional image. Pinned to IPFS separately from the profile in step 4 so item edits don&apos;t re-pin your identity envelope.
                </p>
            }
        >
            <OnboardingCatalogueForm />
        </OnboardingShell>
    );
}
