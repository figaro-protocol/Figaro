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
import { truncateHex } from "@/lib/shared/formatHex";
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

    const [metadataURI, registeredBlock] = profileData;
    return (
        <RegisteredCard
            address={address!}
            metadataURI={metadataURI}
            registeredBlock={registeredBlock}
            deposit={deposit}
            onWithdrawn={() => refetch()}
        />
    );
}

// ── Registered state ─────────────────────────────────────────────────────────

interface RegisteredCardProps {
    address: `0x${string}`;
    metadataURI: string;
    registeredBlock: bigint | null;
    deposit: bigint | undefined;
    onWithdrawn: () => void;
}

function RegisteredCard({
    address,
    metadataURI,
    registeredBlock,
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

    const cid = extractCid(metadataURI);

    return (
        <div className="space-y-6">
            <Card className="p-8 space-y-5">
                <div className="flex items-baseline justify-between gap-4">
                    <div>
                        <h2 className="text-heading-h3 text-ink-heading">
                            {profile?.name ?? "Loading profile…"}
                        </h2>
                        {profile?.specialty && (
                            <p className="text-sm text-ink-body mt-1">{profile.specialty}</p>
                        )}
                    </div>
                    <Link
                        href={`/m/${address}`}
                        className="text-sm text-ink-faint hover:text-ink-heading underline whitespace-nowrap"
                    >
                        View public profile →
                    </Link>
                </div>

                {profileError && (
                    <p className="text-sm text-red-600" role="alert">{profileError}</p>
                )}

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
                    <DefRow label="Wallet" value={truncateHex(address, { head: 10, tail: 8 })} mono />
                    <DefRow label="Deposit" value={deposit !== undefined ? `${formatEther(deposit)} ETH` : "…"} />
                    <DefRow label="Profile CID" value={cid ? truncateHex(cid, { head: 10, tail: 6 }) : metadataURI} mono />
                    <DefRow
                        label="Registered at block"
                        value={registeredBlock !== null ? `#${registeredBlock.toString()}` : "—"}
                        mono
                    />
                </dl>
            </Card>

            <ManageGrid />

            <WithdrawFooter deposit={deposit} onWithdrawn={onWithdrawn} />
        </div>
    );
}

function ManageGrid() {
    const items: Array<{ label: string; description: string }> = [
        {
            label: "Profile",
            description: "Identity, branding, accepted tokens, location.",
        },
        {
            label: "Catalogue",
            description: "Items for sale or service offerings.",
        },
        {
            label: "Assemblies",
            description: "Which assemblies this wallet participates in.",
        },
        {
            label: "Agents",
            description: "ERC-8004 service endpoints (mcp, a2a, did, ens).",
        },
    ];
    return (
        <div className="space-y-3">
            <h3 className="text-heading-h3 text-ink-heading">Manage</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((item) => (
                    <Card
                        key={item.label}
                        className="p-5 space-y-1 opacity-60 cursor-not-allowed"
                        aria-disabled="true"
                    >
                        <div className="flex items-baseline justify-between gap-2">
                            <h4 className="text-sm font-semibold text-ink-heading">{item.label}</h4>
                            <span className="text-xs text-ink-faint">Edit coming next</span>
                        </div>
                        <p className="text-xs text-ink-body">{item.description}</p>
                    </Card>
                ))}
            </div>
        </div>
    );
}

function WithdrawFooter({
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
            <div className="pt-6 border-t border-default text-xs text-ink-faint">
                <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="underline hover:text-ink-heading transition-colors"
                >
                    Withdraw deposit and de-register
                </button>
            </div>
        );
    }

    return (
        <div className="pt-6 border-t border-default space-y-3 text-sm">
            <p className="text-ink-body">
                Returns the {deposit !== undefined ? formatEther(deposit) : "…"} ETH deposit and clears the registration. Only works after the lock period has elapsed; the contract reverts otherwise. Catalogue and profile pins on IPFS are not affected.
            </p>
            <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handleWithdraw} disabled={isProcessing}>
                    {isProcessing ? "Withdrawing…" : "Confirm withdraw"}
                </Button>
                <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={isProcessing}
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
            {(submitError || error) && (
                <p className="text-sm text-red-600" role="alert">
                    {submitError ?? (error instanceof Error ? error.message : String(error))}
                </p>
            )}
        </div>
    );
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function DefRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex flex-col">
            <dt className="text-xs uppercase tracking-wider text-ink-faint">{label}</dt>
            <dd className={`text-ink-heading ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</dd>
        </div>
    );
}

function extractCid(uri: string): string | null {
    const match = uri.match(/^ipfs:\/\/(.+)$/);
    return match ? match[1] ?? null : null;
}
