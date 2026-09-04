import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OnboardingShell } from "@/components/members/OnboardingShell";
import { OnboardingReview } from "@/components/members/OnboardingReview";
import { sellerPageHref } from "@/lib/member/memberListing";

export const metadata: Metadata = withOg({
    title: "Review — Member onboarding",
    description: "Preview how your wallet will appear on its member page, then publish: catalogue and profile pinned to IPFS, registered on MembersRegistry in one action.",
});

export default function OnboardingReviewPage() {
    return (
        <OnboardingShell
            stepId="review"
            title="Review and publish"
            description={
                <p>
                    A preview of how your wallet will appear on its public seller page, <code data-testid="review-seller-page-route">{sellerPageHref("<address>")}</code>. Edit any section, then publish: publishing pins your catalogue to IPFS, pins the profile JSON (with the catalogue URI embedded), and calls <code>register</code> (or <code>updateProfile</code> for a returning wallet) on <code>MembersRegistry</code> &mdash; one action from your browser, signed by your wallet.
                </p>
            }
        >
            <OnboardingReview />
        </OnboardingShell>
    );
}
