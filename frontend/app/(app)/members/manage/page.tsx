import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { MemberLanding } from "@/components/members/MemberLanding";

export const metadata: Metadata = withOg({
    title: "Manage membership — Figaro Protocol",
    description: "The registered member's dashboard: view and edit the profile, leave the registry, claim a released deposit. Unregistered wallets are sent straight to the wizard.",
});

// The registered member's home (maintainer rule 2026-08-06: the membership
// pitch owns /members; the wizard lives directly beneath it). Unregistered
// wallets redirect to /members/identity; a departed wallet still owed its
// deposit claims it here.
export default function ManageMembershipPage() {
    return <MemberLanding />;
}
