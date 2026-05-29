import type { Metadata } from "next";
import { OnboardingShell } from "@/components/sellers/OnboardingShell";
import { OnboardingReview } from "@/components/sellers/OnboardingReview";

export const metadata: Metadata = { title: "Review — Seller onboarding" };

export default function OnboardingReviewPage() {
    return (
        <OnboardingShell
            stepId="review"
            title="Review and publish"
            description={
                <p>
                    A preview of how your wallet will appear on its <code>/m/&lt;address&gt;</code> page. Edit any section, then publish: we pin the catalogue to IPFS, pin the profile JSON (with the catalogue URI embedded), and call <code>register</code> (or <code>updateProfile</code> for a returning wallet) on <code>SellerRegistry</code> in one user action.
                </p>
            }
        >
            <OnboardingReview />
        </OnboardingShell>
    );
}
