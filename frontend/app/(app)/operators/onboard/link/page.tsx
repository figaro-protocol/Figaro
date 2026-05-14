import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingLinkForm } from "@/components/operators/OnboardingLinkForm";

export const metadata: Metadata = { title: "Pin catalogue — Operator onboarding" };

export default function OnboardingLinkPage() {
    return (
        <OnboardingShell
            stepId="link"
            title="Pin your catalogue"
            description={
                <p>
                    We pin the catalogue document to IPFS and remember its URI. Step 7 pins the profile (with this URI inside) and submits the on-chain registration.
                </p>
            }
        >
            <OnboardingLinkForm />
        </OnboardingShell>
    );
}
