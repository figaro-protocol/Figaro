import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingPlaceholder } from "@/components/operators/OnboardingPlaceholder";

export const metadata: Metadata = { title: "Catalogue — Operator onboarding" };

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
            <OnboardingPlaceholder
                description="Item rows with add / edit / delete, image upload, and localStorage persistence."
                prevPath="profile"
                nextPath="link"
            />
        </OnboardingShell>
    );
}
