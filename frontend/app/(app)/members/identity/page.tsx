import type { Metadata } from "next";
import { OnboardingShell } from "@/components/sellers/OnboardingShell";
import { OnboardingProfileForm } from "@/components/sellers/OnboardingProfileForm";

export const metadata: Metadata = { title: "Identity — Seller onboarding" };

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
