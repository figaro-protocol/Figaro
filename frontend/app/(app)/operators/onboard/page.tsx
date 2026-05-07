import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingWelcome } from "@/components/operators/OnboardingWelcome";

export const metadata: Metadata = {
    title: "Operator onboarding — Figaro Protocol",
    description: "Step-by-step enrolment in OperatorRegistry: pin a profile + catalogue, declare assembly bindings, and post a reclaimable ETH deposit.",
};

export default function OnboardingWelcomePage() {
    return (
        <OnboardingShell
            stepId="welcome"
            title="Operator onboarding"
            description={
                <p>
                    A walkthrough that registers your wallet as an operator in <code>OperatorRegistry</code> and pins your identity + items to IPFS. Seven short screens; you can leave any time and resume from where you stopped.
                </p>
            }
        >
            <OnboardingWelcome />
        </OnboardingShell>
    );
}
