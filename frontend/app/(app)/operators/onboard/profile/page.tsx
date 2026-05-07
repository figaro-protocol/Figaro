import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingPlaceholder } from "@/components/operators/OnboardingPlaceholder";

export const metadata: Metadata = { title: "Profile — Operator onboarding" };

export default function OnboardingProfilePage() {
    return (
        <OnboardingShell
            stepId="profile"
            title="Your profile"
            description={
                <p>
                    Your stable identity: name, description, location, branding (logo, CSS, images), accepted tokens, and the default-pricing token. Pinned to IPFS.
                </p>
            }
        >
            <OnboardingPlaceholder
                description="Profile-form fields, with localStorage persistence and required-field validation."
                prevPath=""
                nextPath="catalogue"
            />
        </OnboardingShell>
    );
}
