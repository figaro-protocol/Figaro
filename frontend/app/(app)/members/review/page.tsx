import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingReview } from "@/components/members/OnboardingReview";

export const metadata: Metadata = withOg({
    title: "Review — Seller onboarding",
    description: "Preview how your wallet will appear on its member page, then publish: catalogue and profile pinned to IPFS, registered on MembersRegistry in one action.",
});

export default function OnboardingReviewPage() {
    return (
        <OnboardingShell
            stepId="review"
            title="Review and publish"
            description={
                <p>
                    A preview of how your wallet will appear on its <code>/m/&lt;address&gt;</code> page. Edit any section, then publish: we pin the catalogue to IPFS, pin the profile JSON (with the catalogue URI embedded), and call <code>register</code> (or <code>updateProfile</code> for a returning wallet) on <code>MembersRegistry</code> in one user action.
                </p>
            }
        >
            <OnboardingReview />
        </OnboardingShell>
    );
}
