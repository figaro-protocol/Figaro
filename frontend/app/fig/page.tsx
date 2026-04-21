"use client";

import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import {
    useFigTokenMetrics,
    useFigBalance,
} from "@/lib/mechanisms/useFigToken";

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, label }: { pct: number; label: string }) {
    return (
        <div className="mt-2">
            <div className="flex justify-between text-xs text-neutral-500 mb-1">
                <span>{label}</span>
                <span>{pct.toFixed(2)}%</span>
            </div>
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-black rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                />
            </div>
        </div>
    );
}

// Founder and DAO allocations are distributed at genesis directly to their
// wallets — there are no vesting contracts to surface on this page. The
// community airdrop is surfaced via the ClaimPanel per stage (yr 2 / yr 5 / yr 9)
// on the dedicated claim page.

export default function FigPage() {
    const tokenMetrics = useFigTokenMetrics();
    const userBalance = useFigBalance();
    void userBalance; // reserved for future FIG balance display

    const maxSupply = 1_000_000_000n * 10n ** 18n;
    const totalSupply = tokenMetrics.totalSupply;
    const pct = totalSupply > 0n
        ? Number((totalSupply * 10000n) / maxSupply) / 100
        : 0;

    return (
        <div className="min-h-screen flex flex-col bg-white">
            <Header />
            <main className="flex-1 container mx-auto px-4 sm:px-6 py-10 max-w-2xl space-y-8">
                <section>
                    <h1 className="text-2xl font-semibold text-black">FIG</h1>
                    <p className="mt-2 text-sm text-neutral-600">
                        Figaro&apos;s coordination token. 1B fixed supply, no vesting
                        for founders or DAO (both distributed at genesis), and a
                        600M community airdrop staged across years 2, 5, and 9.
                    </p>
                    <ProgressBar pct={pct} label="Circulating vs. 1B cap" />
                </section>
            </main>
            <Footer />
        </div>
    );
}
