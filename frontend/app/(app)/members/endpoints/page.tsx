import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingEndpointsForm } from "@/components/members/OnboardingEndpointsForm";

export const metadata: Metadata = withOg({
    title: "Endpoints — Member onboarding",
    description: "Optional. The IPFS node your publications pin to, the RPC your reads go through, the relay your batched trade settles through. Stored in this browser only.",
});

export default function OnboardingEndpointsPage() {
    return (
        <OnboardingShell
            stepId="endpoints"
            title="Your endpoints"
            description={
                <p>
                    Optional. Every member runs and pays for their own infrastructure &mdash; the IPFS node your publications pin to, the RPC your reads go through, the relay your batched trade settles through. Stored in this browser only; skip to use this deployment&apos;s defaults.
                </p>
            }
        >
            <OnboardingEndpointsForm nextHref="/members/review" />
        </OnboardingShell>
    );
}
