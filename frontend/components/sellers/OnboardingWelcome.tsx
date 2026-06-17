"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Welcome screen body. Surfaces the registration prerequisites and
 * links forward to step 2 (Identity). The step indicator at the top of
 * every screen already enumerates the steps in this flow — repeating
 * them here would duplicate that information.
 *
 * Rendered inline by SellerLanding when the connected wallet is not
 * registered. SellerLanding owns the registered/unregistered switch;
 * this component doesn't redirect.
 */
export function OnboardingWelcome() {
    return (
        <div className="space-y-8">
            <Card className="p-6 space-y-4">
                <h2 className="text-heading-h2 text-ink-heading">What you are joining</h2>
                <div className="space-y-3 text-sm text-ink-body">
                    <p>
                        Figaro is a coordination protocol — it lets two parties who have never met transact
                        with the math, not a platform, standing behind the deal. As a seller, that math is
                        your bond: when a buyer commits to an order, you lock twice its cumulative value
                        on-chain for the duration. The bond is what lets a stranger deal with you without a
                        platform vouching for either of you — cooperation is worth more to you than
                        defection, so the buyer doesn&apos;t have to trust you, only the numbers.
                    </p>
                    <p>
                        No admin, arbitrator, or timeout can seize or release that bond. Only the buyer
                        resolves the order, and when they do, your bond returns along with your payment.{" "}
                        <Link href="/protocol" className="underline underline-offset-2 hover:text-ink-heading transition-colors">
                            How the bond works →
                        </Link>
                    </p>
                </div>
            </Card>

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

            <div className="flex items-center justify-end">
                <Link href="/sellers/identity">
                    <Button>Begin →</Button>
                </Link>
            </div>
        </div>
    );
}
