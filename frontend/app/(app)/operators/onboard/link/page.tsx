import type { Metadata } from "next";
import { OnboardingShell } from "@/components/operators/OnboardingShell";
import { OnboardingPlaceholder } from "@/components/operators/OnboardingPlaceholder";

export const metadata: Metadata = { title: "Link — Operator onboarding" };

export default function OnboardingLinkPage() {
    return (
        <OnboardingShell
            stepId="link"
            title="Link catalogue to profile"
            description={
                <p>
                    The catalogue&apos;s IPFS URI is embedded in your profile, then the profile is pinned. The on-chain <code>OperatorRegistry.metadataURI</code> will point to that profile document.
                </p>
            }
        >
            <OnboardingPlaceholder
                description="Pin profile referencing catalogueURI, show the resulting profile CID."
                prevPath="catalogue"
                nextPath="assemblies"
            />
        </OnboardingShell>
    );
}
