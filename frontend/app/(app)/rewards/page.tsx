import type { Metadata } from "next";
import { RewardsView } from "./_components/RewardsView";

export const metadata: Metadata = {
    title: "Rewards — Figaro",
    description:
        "The optimistic RPGF distribution: recompute a tranche's payout from public chain events, post it under a bond, challenge, finalize, claim.",
};

export default function RewardsPage() {
    return <RewardsView />;
}
