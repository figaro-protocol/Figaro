import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingProfileForm } from "@/components/members/OnboardingProfileForm";

export const metadata: Metadata = withOg({
    title: "Identity — Member onboarding",
    description: "Your stable identity: name, description, location, branding, and the set of tokens you accept for settlement. Pinned to IPFS when you publish.",
});

export default function OnboardingProfilePage() {
    return (
        <OnboardingShell
            stepId="profile"
            title="Your identity"
            description={
                <p>
                    Your stable identity: name, description, location, branding, and the set of tokens you accept for settlement. Pinned to IPFS when you publish.
                </p>
            }
        >
            <OnboardingProfileForm />
        </OnboardingShell>
    );
}
