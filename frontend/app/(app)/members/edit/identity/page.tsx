import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { MemberEditProfile } from "@/components/members/MemberEditProfile";

export const metadata: Metadata = withOg({
    title: "Edit profile — Figaro Protocol",
    description: "Update the on-chain member-profile metadata pointer. Re-pins the profile JSON to IPFS and calls MembersRegistry.updateProfile; the deposit is not touched.",
});

export default function EditProfilePage() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-24 max-w-2xl space-y-10">
            <div>
                <h1 className="text-heading-h1 text-ink-heading mb-4">
                    Edit profile.
                </h1>
                <p className="text-body-lead text-ink-body">
                    Update identity, branding, accepted tokens, default-pricing token, location. On save, a new profile JSON is pinned to IPFS and the on-chain metadataURI is updated via <code>updateProfile</code>. Deposit and lock period are unaffected.
                </p>
            </div>
            <MemberEditProfile />
        </section>
    );
}
