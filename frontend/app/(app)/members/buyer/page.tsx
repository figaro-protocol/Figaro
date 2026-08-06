import type { Metadata } from "next";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingBuyerForm } from "@/components/members/OnboardingBuyerForm";

export const metadata: Metadata = { title: "Buyer — Member onboarding" };

export default function OnboardingBuyerPage() {
    return (
        <OnboardingShell
            stepId="buyer"
            title="Assemblies you buy through"
            description={
                <p>
                    Subscribe the assemblies you buy through and choose which of
                    the records those deals co-produce you offer for sale — your
                    side of every purchase is yours to sell, on your terms.
                </p>
            }
        >
            <OnboardingBuyerForm />
        </OnboardingShell>
    );
}
