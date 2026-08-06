import type { Metadata } from "next";
import { OnboardingShell } from "@/components/sellers/OnboardingShell";
import { OnboardingAgentsForm } from "@/components/sellers/OnboardingAgentsForm";

export const metadata: Metadata = { title: "Agent endpoints — Seller onboarding" };

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
