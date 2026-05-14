import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingDone } from "@/components/operators/OnboardingDone";

export const metadata: Metadata = { title: "Done — Operator onboarding" };

export default function OnboardingDonePage() {
    return (
        <OnboardingShell
            stepId="done"
            title="Review and publish"
            description={
                <p>
                    Last step. Review the profile assembled from the previous six steps, then publish: we pin the profile JSON to IPFS and call <code>register</code> (or <code>updateProfile</code> for a returning wallet) on <code>OperatorRegistry</code>. Once the on-chain transaction confirms, your wallet is addressable as an operator.
                </p>
            }
        >
            <OnboardingDone />
        </OnboardingShell>
    );
}
