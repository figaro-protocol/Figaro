import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingAgentsForm } from "@/components/members/OnboardingAgentsForm";

export const metadata: Metadata = withOg({
    title: "Agent endpoints — Seller onboarding",
    description: "Optional ERC-8004-compatible service endpoints — where other members route offers and calls to this wallet. Skip it and the wallet is simply unreachable for inbound coordination; nothing else changes.",
});

export default function OnboardingAgentsPage() {
    return (
        <OnboardingShell
            stepId="agents"
            title="Agent endpoints"
            description={
                <p>
                    Optional. ERC-8004-compatible service endpoints &mdash; where other members route offers and calls to this wallet. Endpoints declare reachability, not what runs the wallet: skip them and the wallet is simply unreachable for inbound coordination; nothing else changes.
                </p>
            }
        >
            <OnboardingAgentsForm />
        </OnboardingShell>
    );
}
