"use client";

/**
 * SellerLanding — single entry point for `/members`. Conditionally
 * renders one of two views based on registration state:
 *
 *   - Connected, registered → RegisteredCard (dashboard).
 *   - Anything else (anonymous OR connected-unregistered) →
 *     OnboardingWelcome inline, wrapped in OnboardingShell so the
 *     step indicator runs across the top consistently with the
 *     downstream wizard sub-routes.
 *
 * Replaces the prior two-page redirect ping-pong between /sellers
 * (dashboard) and /sellers/onboard (welcome). Wizard sub-routes
 * (/sellers/identity, /sellers/catalogue, etc.) are still
 * separate pages — only the welcome / dashboard split is collapsed
 * here.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/hooks/useMounted";
import {
    useMemberProfile,
    useRegistrationDeposit,
    useWithdrawDeposit,
    useRequestWithdrawal,
    useWithdrawalStatus,
    useWithdrawalCooldown,
} from "@/lib/member/useMembersRegistry";
import { getMembersRegistry } from "@/lib/kernel/contracts";
import { MEMBERS_REGISTRY_ABI } from "@figaro/sdk";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import { unpinSupersededProfileArtifacts } from "@/lib/member/profileErasure";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { MemberProfileMetadata } from "@/lib/member/memberProfileMetadata";
import { formatEther } from "viem";
import { OnboardingWelcome } from "@/components/sellers/OnboardingWelcome";
import { OnboardingShell } from "@/components/sellers/OnboardingShell";

function WelcomeView() {
    return (
        <OnboardingShell
            stepId="welcome"
            title="Register as a seller."
            description={
                <p>
                    As a seller you register a wallet that represents your real-world asset or service. Register a wallet in <code>MembersRegistry</code> and pin a profile + catalogue to IPFS. Six steps. The deposit is 0.001 ETH on devnet and you get it back when you leave, after a cooldown — Sybil-resistance, not a fee.
                </p>
            }
        >
            <OnboardingWelcome />
        </OnboardingShell>
    );
}

export function SellerLanding() {
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { data: profileData, isLoading: profileLoading, refetch } = useMemberProfile(address);
    const { data: deposit } = useRegistrationDeposit();

    if (!mounted) {
        return <Card className="p-8 text-sm text-ink-faint">Loading…</Card>;
    }

    // Anonymous wallet, or wallet whose registry-read is still in flight
    // → render the welcome content. The welcome screen has its own
    // connect-wallet prompt for anonymous users and a connected-wallet
    // "Begin" CTA otherwise.
    if (!isConnected || profileLoading) {
        return <WelcomeView />;
    }

    // Connected but not registered → show the welcome flow inline. A wallet
    // that has LEFT is unregistered but may still be owed its deposit, so the
    // claim surface renders here too — otherwise leaving would strand the ETH
    // behind a screen the wallet can no longer reach.
    if (!profileData) {
        return (
            <>
                <PendingDepositNotice address={address} />
                <WelcomeView />
            </>
        );
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
    const [profile, setProfile] = useState<MemberProfileMetadata | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setProfile(null);
        setProfileError(null);
        // The shared reviver-backed, size-capped, cached fetcher — NOT a
        // hand-rolled fetch+JSON.parse (audit 2026-07-23): a member profile is
        // permissionless untrusted network JSON, so it routes through the same
        // prototype-pollution-stripping path every other profile read uses.
        fetchMemberProfile(metadataURI)
            .then((parsed) => {
                if (cancelled) return;
                if (parsed) setProfile(parsed);
                else setProfileError("Couldn't load a member profile from that URI.");
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
            <header className="space-y-2">
                <h1 className="text-heading-h1 text-ink-heading">
                    {profile?.name ?? "Loading profile…"}
                </h1>
                {profile?.specialty && (
                    <p className="text-sm text-ink-body">{profile.specialty}</p>
                )}
                <Link
                    href={`/s/view?seller=${address}`}
                    className="inline-block text-sm text-ink-faint hover:text-ink-heading underline"
                >
                    View public profile →
                </Link>
                {profileError && (
                    <p className="text-sm text-red-600 mt-2" role="alert">{profileError}</p>
                )}
            </header>

            <PendingDepositNotice address={address} />

            <ManageList
                deposit={deposit}
                registeredBlock={registeredBlock}
                onWithdrawn={onWithdrawn}
                metadataURI={metadataURI}
                profile={profile}
            />

            {/* Both calls stay visible (user rule 2026-06-12): the profile
                view/edit above, AND the onboarding wizard — for a registered
                wallet the wizard re-walks the steps and publishing updates
                this profile in place. */}
            <p className="text-sm text-ink-faint">
                <Link
                    href="/members/identity"
                    className="underline hover:text-ink-heading"
                    data-testid="link-onboarding-wizard"
                >
                    Seller onboarding wizard →
                </Link>{" "}
                Re-walk the registration steps; publishing updates this profile in place.
            </p>
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
 * focus is the seller's identity at the top; the manage list is
 * a sidebar in disguise.
 */
function ManageList({
    deposit,
    registeredBlock,
    onWithdrawn,
    metadataURI,
    profile,
}: {
    deposit: bigint | undefined;
    registeredBlock: bigint | null;
    onWithdrawn: () => void;
    metadataURI: string;
    profile: MemberProfileMetadata | null;
}) {
    const items: Array<{ label: string; description: string; href: string | null }> = [
        { label: "Identity", description: "Name, description, tokens, location.", href: "/members/edit/identity" },
        { label: "Catalogue", description: "Items.", href: "/members/edit/catalogue" },
        { label: "Assemblies", description: "Bindings.", href: "/members/edit/assemblies" },
        { label: "Agents", description: "Service endpoints.", href: "/members/edit/agents" },
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
            <WithdrawRow
                deposit={deposit}
                onWithdrawn={onWithdrawn}
                metadataURI={metadataURI}
                profile={profile}
            />
        </ul>
    );
}

/**
 * The deposit a wallet is owed after leaving, and the claim once its cooldown
 * has elapsed. Rendered in BOTH the registered and the left state — leaving
 * de-surfaces immediately, so this is the only surface a departed wallet has.
 */
function PendingDepositNotice({ address }: { address: `0x${string}` | undefined }) {
    const { pending, releaseAt, withdrawable, refetch } = useWithdrawalStatus(address);
    const { withdraw, isPending, isConfirming, error } = useWithdrawDeposit();
    const [claimError, setClaimError] = useState<string | null>(null);
    const [claimed, setClaimed] = useState(false);

    if (claimed || !pending || pending === 0n) return null;

    // `withdrawable` is the CHAIN's answer. Do not reintroduce a
    // `Date.now() >= releaseAt` comparison here: `releaseAt` is a block
    // timestamp, the two clocks drift, and the comparison disabled a
    // legitimate claim outright (e2e 2026-07-30). `releaseAt` is still shown,
    // as human-readable context only.
    const unlockAt = releaseAt ? Number(releaseAt) * 1000 : 0;
    const busy = isPending || isConfirming;

    async function handleClaim() {
        setClaimError(null);
        try {
            await withdraw();
            setClaimed(true);
            refetch();
        } catch (e: unknown) {
            setClaimError(extractErrorMessage(e, String(e)));
        }
    }

    return (
        <Card className="p-4 mb-4 text-sm space-y-2">
            <p className="text-ink-body">
                <span className="font-semibold text-ink-heading">
                    {formatEther(pending)} ETH held for you.
                </span>{" "}
                {withdrawable
                    ? "The cooldown has passed — you can take it back now."
                    : `Released ${new Date(unlockAt).toLocaleString()}. You are already de-listed; only the ETH is still waiting.`}
            </p>
            <Button variant="outline" size="sm" onClick={handleClaim} disabled={!withdrawable || busy}>
                {busy ? "Claiming…" : "Claim deposit"}
            </Button>
            {(claimError || error) && (
                <p className="text-xs text-red-600" role="alert">
                    {claimError ?? extractErrorMessage(error, String(error))}
                </p>
            )}
        </Card>
    );
}

function WithdrawRow({
    deposit,
    onWithdrawn,
    metadataURI,
    profile,
}: {
    deposit: bigint | undefined;
    onWithdrawn: () => void;
    metadataURI: string;
    profile: MemberProfileMetadata | null;
}) {
    const { address } = useAccount();
    const client = usePublicClient();
    const { requestWithdrawal, isPending, isConfirming, isSuccess, hash, error } = useRequestWithdrawal();
    const { data: cooldown } = useWithdrawalCooldown();
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [receiptHash, setReceiptHash] = useState<`0x${string}` | null>(null);
    const isProcessing = isPending || isConfirming;

    // Hold the receipt visible after success — let the seller dismiss
    // it explicitly. Only then does the parent refetch (which causes the
    // dashboard → welcome transition, removing this row from the DOM).
    useEffect(() => {
        if (isSuccess && hash && !receiptHash) {
            setReceiptHash(hash);
        }
    }, [isSuccess, hash, receiptHash]);

    async function handleWithdraw() {
        setSubmitError(null);
        if (!client || !address) {
            setSubmitError("No public client / wallet — reload and retry.");
            return;
        }
        const registry = getMembersRegistry();
        if (!registry) {
            setSubmitError("MembersRegistry not configured.");
            return;
        }
        // Pre-flight simulate — surfaces a typed revert (e.g. NotRegistered)
        // before opening the wallet, so the seller doesn't waste a signature on
        // a tx that will fail.
        try {
            await client.simulateContract({
                address: registry,
                abi: MEMBERS_REGISTRY_ABI,
                functionName: "requestWithdrawal",
                account: address,
            });
        } catch (e: unknown) {
            setSubmitError(extractErrorMessage(e, String(e)));
            return;
        }
        try {
            await requestWithdrawal();
            setConfirming(false);
            // De-surfaced on-chain — complete the erasure locally NOW, at the
            // request, not at the later claim: the member has left, so nothing
            // of theirs should stay published while the cooldown runs.
            // Best-effort; never fails the request.
            await unpinSupersededProfileArtifacts({
                ipfs: DEFAULT_IPFS_SERVICE,
                priorProfileUri: metadataURI,
                priorProfile: profile,
                nextProfile: null,
            });
        } catch (e: unknown) {
            setSubmitError(extractErrorMessage(e, String(e)));
        }
    }

    // ── Receipt state: success, awaiting seller dismissal ──
    if (receiptHash) {
        return (
            <li className="py-3 border-b border-default space-y-2 text-sm text-ink-body">
                <p>
                    <span className="font-semibold text-ink-heading">You have left the registry.</span>
                    {" "}You are de-listed from discovery straight away. Your
                    {" "}{deposit !== undefined ? formatEther(deposit) : "…"} ETH
                    {" "}deposit is claimable
                    {cooldown !== undefined && cooldown > 0n
                        ? " once the cooldown has passed — come back to this page for it."
                        : " now — come back to this page for it."}
                </p>
                <p className="text-xs text-ink-faint font-mono break-all">
                    Tx: {receiptHash}
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setReceiptHash(null);
                        onWithdrawn();
                    }}
                >
                    Continue
                </Button>
            </li>
        );
    }

    if (!confirming) {
        const depositLabel = deposit !== undefined ? `${formatEther(deposit)} ETH` : "deposit";
        return (
            <li className="flex items-baseline justify-between gap-4 py-3 border-b border-default text-ink-faint">
                <div>
                    <span className="text-ink-body">Leave the registry</span>
                    <span className="ml-2 text-xs">De-lists you from discovery straight away; the {depositLabel} deposit follows after a cooldown.</span>
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
                Two steps, deliberately. This one clears your registration and de-lists you from discovery immediately — the stake is what keeps you surfaced — and you can register again at once. The {deposit !== undefined ? formatEther(deposit) : "…"} ETH deposit is released separately{cooldown !== undefined && cooldown > 0n ? ", after a cooldown" : ""}; a deposit that could be recycled the moment you left would not price anything. Your profile and catalogue pins are unpinned as part of this step.
            </p>
            <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={handleWithdraw} disabled={isProcessing}>
                    {isProcessing ? "Leaving…" : "Confirm and leave"}
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
                    {submitError ?? extractErrorMessage(error, String(error))}
                </p>
            )}
        </li>
    );
}

