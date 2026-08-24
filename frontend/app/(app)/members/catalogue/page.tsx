import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingCatalogueForm } from "@/components/members/OnboardingCatalogueForm";

export const metadata: Metadata = withOg({
    title: "Catalogue — Member onboarding",
    description: "Your list of items. Each carries a name, price in your default token, category, and an optional image. Pinned to IPFS separately from the profile.",
});

export default function OnboardingCataloguePage() {
    return (
        <OnboardingShell
            stepId="catalogue"
            title="Your catalogue"
            description={
                <p>
                    Your list of items. Each carries a name, price (in your default token), category, and an optional image. Pinned to IPFS separately from the profile so item edits don&apos;t re-pin your identity envelope.
                </p>
            }
        >
            <OnboardingCatalogueForm />
        </OnboardingShell>
    );
}
