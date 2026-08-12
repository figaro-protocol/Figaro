import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingAgentsForm } from "@/components/members/OnboardingAgentsForm";

export const metadata: Metadata = withOg({
    title: "Agent endpoints — Seller onboarding",
    description: "Optional ERC-8004-compatible service endpoints for wallets driven by autonomous agents. Skip if your wallet is human-driven.",
});

export default function OnboardingAgentsPage() {
    return (
        <OnboardingShell
            stepId="agents"
            title="Agent endpoints"
            description={
                <p>
                    Optional. ERC-8004-compatible service endpoints for wallets driven by autonomous agents. Skip if your wallet is human-driven.
                </p>
            }
        >
            <OnboardingAgentsForm />
        </OnboardingShell>
    );
}
