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
            title="Become an operator."
            description={
                <p>
                    Register a wallet in <code>OperatorRegistry</code> and pin a profile + catalogue to IPFS. Seven short screens. The deposit is 0.001 ETH on devnet, reclaimable after a one-year lock — Sybil-resistance, not a fee. You can leave any time and resume where you stopped.
                </p>
            }
        >
            <OnboardingWelcome />
        </OnboardingShell>
    );
}
