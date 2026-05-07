import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingProfileForm } from "@/components/operators/OnboardingProfileForm";

export const metadata: Metadata = { title: "Profile — Operator onboarding" };

export default function OnboardingProfilePage() {
    return (
        <OnboardingShell
            stepId="profile"
            title="Your profile"
            description={
                <p>
                    Your stable identity: name, description, location, branding, and the set of tokens you accept for settlement. Pinned to IPFS in step 4.
                </p>
            }
        >
            <OnboardingProfileForm />
        </OnboardingShell>
    );
}
