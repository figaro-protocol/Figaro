"use client";

/**
 * OperatorLanding — registered-only management surface for `/operators`.
 *
 * One page, one purpose: show the connected wallet's operator profile
 * and let them manage it. Three users → three URLs at the route
 * level, not three states inside one component:
 *
 *   - Anonymous → redirected to /operators/onboard (handled here on
 *     mount via router.replace).
 *   - Connected, not registered → redirected to /operators/onboard.
 *   - Connected, registered → renders the dashboard below.
 *
 * The state-aware variant lived here previously; the redirect-on-miss
 * pattern keeps each page semantically single-purpose so users can
 * bookmark, share, and navigate without the page mutating its
 * meaning under them.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/lib/shared/useMounted";
import {
    useOperatorProfile,
    useRegistrationDeposit,
    useWithdrawDeposit,
} from "@/lib/mechanisms/useOperatorRegistry";
import { resolveContentURI } from "@/lib/shared/merchantBranding";
import { tryParseOperatorProfileDocument } from "@/lib/shared/operatorProfileMetadata";
import type { OperatorProfileMetadata } from "@/lib/shared/operatorProfileMetadata";
import { formatEther } from "viem";

export function OperatorLanding() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { data: profileData, isLoading: profileLoading, refetch } = useOperatorProfile(address);
    const { data: deposit } = useRegistrationDeposit();

    // Route-level state-awareness: if the current wallet isn't registered,
    // this page has nothing to show — bounce to the onboarding entry. The
    // bounce only fires after the wallet + registry reads have settled,
    // so we don't redirect prematurely while indexer fetches are inflight.
    useEffect(() => {
        if (!mounted) return;
        if (!isConnected) {
            router.replace("/operators/onboard");
            return;
        }
        if (!profileLoading && !profileData) {
            router.replace("/operators/onboard");
        }
    }, [mounted, isConnected, profileLoading, profileData, router]);

    if (!mounted || !isConnected || (profileLoading && !profileData)) {
        return <Card className="p-8 text-sm text-ink-faint">Loading…</Card>;
    }

    if (!profileData) {
        // Redirect is in flight; render the same loading state to avoid
        // a flash of empty content.
        return <Card className="p-8 text-sm text-ink-faint">Loading…</Card>;
    }

    const [metadataURI] = profileData;
    return (
        <RegisteredCard
            address={address!}
            metadataURI={metadataURI}
            deposit={deposit}
            onWithdrawn={() => refetch()}
        />
    );
}

// ── Registered state ─────────────────────────────────────────────────────────

interface RegisteredCardProps {
    address: `0x${string}`;
    metadataURI: string;
    deposit: bigint | undefined;
    onWithdrawn: () => void;
}

function RegisteredCard({
    address,
    metadataURI,
    deposit,
    onWithdrawn,
}: RegisteredCardProps) {
    const [profile, setProfile] = useState<OperatorProfileMetadata | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setProfile(null);
        setProfileError(null);
        const url = resolveContentURI(metadataURI);
        if (!url) {
            setProfileError("Profile URI couldn't be resolved.");
            return;
        }
        fetch(url)
            .then((r) => r.json())
            .then((doc) => {
                if (cancelled) return;
                const parsed = tryParseOperatorProfileDocument(doc);
                if (parsed) {
                    setProfile(parsed);
                } else {
                    setProfileError("Profile JSON didn't parse as an operator profile.");
                }
            })
            .catch(() => {
                if (!cancelled) setProfileError("Couldn't fetch profile from IPFS.");
            });
        return () => {
            cancelled = true;
        };
    }, [metadataURI]);

    return (
        <div className="space-y-8">
            <div className="space-y-1">
                <h2 className="text-heading-h3 text-ink-heading">
                    {profile?.name ?? "Loading profile…"}
                </h2>
                {profile?.specialty && (
                    <p className="text-sm text-ink-body">{profile.specialty}</p>
                )}
                <Link
                    href={`/m/${address}`}
                    className="inline-block text-sm text-ink-faint hover:text-ink-heading underline mt-1"
                >
                    View public profile →
                </Link>
                {profileError && (
                    <p className="text-sm text-red-600 mt-2" role="alert">{profileError}</p>
                )}
            </div>

            <ManageList deposit={deposit} onWithdrawn={onWithdrawn} />
        </div>
    );
}

/**
 * Single-column muted list of management entry-points. Profile,
 * Catalogue, Assemblies, Agents are placeholders until the edit/
 * delete UI ships; Withdraw is live but de-emphasised — last row,
 * same visual weight, action revealed on click.
 *
 * "Muted that doesn't attract attention" per user direction: no
 * card chrome, low-contrast text, simple divided rows. The page's
 * focus is the operator's identity at the top; the manage list is
 * a sidebar in disguise.
 */
function ManageList({
    deposit,
    onWithdrawn,
}: {
    deposit: bigint | undefined;
    onWithdrawn: () => void;
}) {
    const items: Array<{ label: string; description: string; href: string | null }> = [
        { label: "Profile", description: "Identity, tokens, location.", href: "/operators/edit/profile" },
        { label: "Catalogue", description: "Items.", href: null },
        { label: "Assemblies", description: "Bindings.", href: null },
        { label: "Agents", description: "Service endpoints.", href: null },
    ];
    return (
        <ul className="border-t border-default text-sm">
            {items.map((item) =>
                item.href ? (
                    <li key={item.label} className="border-b border-default">
                        <Link
                            href={item.href}
                            className="flex items-baseline justify-between gap-4 py-3 text-ink-faint hover:bg-paper-200 -mx-3 px-3 transition-colors"
                        >
                            <div>
                                <span className="text-ink-body">{item.label}</span>
                                <span className="ml-2 text-xs">{item.description}</span>
                            </div>
                            <span className="text-xs underline">Edit →</span>
                        </Link>
                    </li>
                ) : (
                    <li
                        key={item.label}
                        className="flex items-baseline justify-between gap-4 py-3 border-b border-default text-ink-faint"
                        aria-disabled="true"
                    >
                        <div>
                            <span className="text-ink-body">{item.label}</span>
                            <span className="ml-2 text-xs">{item.description}</span>
                        </div>
                        <span className="text-xs">Edit coming next</span>
                    </li>
                ),
            )}
            <WithdrawRow deposit={deposit} onWithdrawn={onWithdrawn} />
        </ul>
    );
}

function WithdrawRow({
    deposit,
    onWithdrawn,
}: {
    deposit: bigint | undefined;
    onWithdrawn: () => void;
}) {
    const { withdraw, isPending, isConfirming, isSuccess, error } = useWithdrawDeposit();
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const isProcessing = isPending || isConfirming;

    useEffect(() => {
        if (isSuccess) onWithdrawn();
    }, [isSuccess, onWithdrawn]);

    async function handleWithdraw() {
        setSubmitError(null);
        try {
            await withdraw();
            setConfirming(false);
        } catch (e: unknown) {
            setSubmitError(e instanceof Error ? e.message : String(e));
        }
    }

    if (!confirming) {
        return (
            <li className="flex items-baseline justify-between gap-4 py-3 border-b border-default text-ink-faint">
                <div>
                    <span className="text-ink-body">Withdraw deposit</span>
                    <span className="ml-2 text-xs">De-register and reclaim {deposit !== undefined ? `${formatEther(deposit)} ETH` : "deposit"} — only after the one-year lock has elapsed.</span>
                </div>
                <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="text-xs underline hover:text-ink-heading transition-colors"
                >
                    Begin
                </button>
            </li>
        );
    }

    return (
        <li className="py-3 border-b border-default space-y-2 text-sm text-ink-body">
            <p className="text-xs">
                Returns the {deposit !== undefined ? formatEther(deposit) : "…"} ETH deposit and clears the registration. Reverts if the one-year lock hasn&apos;t elapsed. Catalogue and profile pins on IPFS are not affected.
            </p>
            <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={handleWithdraw} disabled={isProcessing}>
                    {isProcessing ? "Withdrawing…" : "Confirm withdraw"}
                </Button>
                <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={isProcessing}
                    className="text-xs text-ink-faint hover:text-ink-heading transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
            {(submitError || error) && (
                <p className="text-xs text-red-600" role="alert">
                    {submitError ?? (error instanceof Error ? error.message : String(error))}
                </p>
            )}
        </li>
    );
}

