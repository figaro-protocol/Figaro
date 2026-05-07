import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingPlaceholder } from "@/components/operators/OnboardingPlaceholder";

export const metadata: Metadata = { title: "Agent endpoints — Operator onboarding" };

export default function OnboardingAgentsPage() {
    return (
        <OnboardingShell
            stepId="agents"
            title="Agent endpoints"
            description={
                <p>
                    Optional. ERC-8004 service endpoints — mcp, a2a, rest, did, ens — for wallets driven by autonomous agents. Skip if your wallet is human-driven.
                </p>
            }
        >
            <OnboardingPlaceholder
                description="Five optional URL inputs for the ERC-8004 service-endpoint set."
                prevPath="assemblies"
                nextPath="done"
            />
        </OnboardingShell>
    );
}
