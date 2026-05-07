"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Final-screen body. Routes the operator to their public view page
 * (`/m/<address>`) so they can see what buyers will see, and back to
 * `/operators` for the returning-operator surface (edit profile,
 * manage catalogue, etc.).
 */
export function OnboardingDone() {
    const { address } = useAccount();

    return (
        <div className="space-y-8">
            <Card className="p-6 space-y-3">
                <h2 className="text-heading-h2 text-ink-heading">What&apos;s next</h2>
                <ul className="space-y-2 text-sm text-ink-body list-disc pl-5">
                    <li>Visit your public view page to see what your data looks like to buyers.</li>
                    <li>Return to the operators surface any time to update your profile or catalogue.</li>
                    <li>
                        The ETH deposit you posted is reclaimable via <code>withdraw</code> after the lock period elapses. The lock restarts on each
                        fresh registration but is unaffected by <code>updateProfile</code>.
                    </li>
                </ul>
            </Card>
            <div className="flex items-center justify-between gap-3">
                <Link href="/operators" className="text-sm text-ink-faint hover:text-ink-heading transition-colors">
                    ← Back to operators
                </Link>
                {address ? (
                    <Link href={`/m/${address}`}>
                        <Button>View my page →</Button>
                    </Link>
                ) : (
                    <Link href="/operators">
                        <Button variant="outline">Back to operators</Button>
                    </Link>
                )}
            </div>
        </div>
    );
}
