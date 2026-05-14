"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useMounted } from "@/lib/shared/useMounted";
import { useOperatorProfile } from "@/lib/mechanisms/useOperatorRegistry";

/**
 * Welcome screen body. Surfaces the registration prerequisites and
 * links forward to step 2 (Identity). The step indicator at the top of
 * every screen already enumerates the steps in this flow — repeating
 * them here would duplicate that information.
 *
 * Does NOT require a connected wallet — the wallet check happens on the
 * identity screen, where the wallet's address is needed to scope state.
 *
 * If the connected wallet is already registered, redirects to /operators
 * (the management surface). Onboarding is for unregistered wallets;
 * registered wallets shouldn't see the "start onboarding" CTA.
 */
export function OnboardingWelcome() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { data: profileData, isLoading } = useOperatorProfile(address);

    useEffect(() => {
        if (!mounted) return;
        if (!isConnected) return;
        if (isLoading) return;
        if (profileData) router.replace("/operators");
    }, [mounted, isConnected, isLoading, profileData, router]);

    return (
        <div className="space-y-8">
            <Card className="p-6 space-y-4">
                <h2 className="text-heading-h2 text-ink-heading">Prerequisites</h2>
                <ul className="space-y-2 text-sm text-ink-body list-disc pl-5">
                    <li>You need a connected wallet on the active network. Connect it on the next screen.</li>
                    <li>A 0.001 ETH deposit (devnet value), reclaimable after a one-year lock. The lock starts when you register; the contract reverts <code>withdraw</code> until it elapses. The deposit is Sybil-resistance, not a fee — no party can seize it.</li>
                    <li>
                        Your draft is saved to this browser&apos;s local storage as you go — you can leave the flow and return without losing
                        what you filled in. The draft is keyed by your wallet address; switching wallets switches drafts.
                    </li>
                </ul>
            </Card>

            <div className="flex items-center justify-between">
                <Link
                    href="/operators"
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    ← Back to operators
                </Link>
                <Link href="/operators/onboard/profile">
                    <Button>Begin →</Button>
                </Link>
            </div>
        </div>
    );
}
