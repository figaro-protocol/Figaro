import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingDone } from "@/components/operators/OnboardingDone";

export const metadata: Metadata = { title: "Done — Operator onboarding" };

export default function OnboardingDonePage() {
    return (
        <OnboardingShell
            stepId="done"
            title="You&apos;re registered"
            description={
                <p>
                    Your operator profile is pinned and the on-chain registration has confirmed. The runtime can now route bonded orders to your wallet.
                </p>
            }
        >
            <OnboardingDone />
        </OnboardingShell>
    );
}
