import type { Metadata } from "next";
import { RewardsView } from "./_components/RewardsView";

export const metadata: Metadata = {
    title: "Rewards — Figaro",
    description:
        "The RPGF distribution: usage is counted on chain as it happens, a period's counts go final when it ends, and each author claims their pro-rata share of that period's budget.",
};

export default function RewardsPage() {
    return <RewardsView />;
}
