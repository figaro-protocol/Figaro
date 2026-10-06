import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingCatalogForm } from "@/components/members/OnboardingCatalogForm";

export const metadata: Metadata = withOg({
    title: "Catalog — Member onboarding",
    description: "Your list of items. Each carries a name, price in your default token, category, and an optional image. Pinned to IPFS separately from the profile.",
});

export default function OnboardingCatalogPage() {
    return (
        <OnboardingShell
            stepId="catalog"
            title="Your catalog"
            description={
                <p>
                    Your list of items. Each carries a name, price (in your default token), category, and an optional image. Pinned to IPFS separately from the profile so item edits don&apos;t re-pin your identity envelope.
                </p>
            }
        >
            <OnboardingCatalogForm />
        </OnboardingShell>
    );
}
