import type { Metadata } from "next";
import { MemberLanding } from "@/components/members/MemberLanding";

export const metadata: Metadata = {
    title: "Members — Figaro Protocol",
    description: "Register a wallet in MembersRegistry, or manage your existing registration. What membership is lives on /join; this surface gets straight to it.",
};

// No preamble (operator rule 2026-08-06): /join owns the membership pitch;
// this page IS the doorway — the wizard for an unregistered wallet, the
// dashboard for a registered one.
export default function MembersPage() {
    return <MemberLanding />;
}
