"use client";

/**
 * SellerLanding — single entry point for `/sellers`. Conditionally
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
    useSellerProfile,
    useRegistrationDeposit,
    useWithdrawDeposit,
} from "@/lib/seller/useSellerRegistry";
import { getSellerRegistry } from "@/lib/kernel/contracts";
import { SELLER_REGISTRY_ABI } from "@figaro/core";
import { resolveContentUri } from "@/lib/shared/ipfsService";
import { tryParseSellerProfileDocument } from "@/lib/seller/sellerProfileMetadata";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { SellerProfileMetadata } from "@/lib/seller/sellerProfileMetadata";
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
                    As a seller you register a wallet that represents your real-world asset or service. Register a wallet in <code>SellerRegistry</code> and pin a profile + catalogue to IPFS. Six steps. The deposit is 0.001 ETH on devnet, reclaimable after a one-year lock — Sybil-resistance, not a fee.
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
    const { data: profileData, isLoading: profileLoading, refetch } = useSellerProfile(address);
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

    // Connected but not registered → show the welcome flow inline.
    if (!profileData) {
        return <WelcomeView />;
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
    const [profile, setProfile] = useState<SellerProfileMetadata | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setProfile(null);
        setProfileError(null);
        const url = resolveContentUri(metadataURI);
        if (!url) {
            setProfileError("Profile URI couldn't be resolved.");
            return;
        }
        fetch(url)
            .then((r) => r.json())
            .then((doc) => {
                if (cancelled) return;
                const parsed = tryParseSellerProfileDocument(doc);
                if (parsed) {
                    setProfile(parsed);
                } else {
                    setProfileError("Profile JSON didn't parse as a seller profile.");
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
            <header className="space-y-2">
                <h1 className="text-heading-h1 text-ink-heading">
                    {profile?.name ?? "Loading profile…"}
                </h1>
                {profile?.specialty && (
                    <p className="text-sm text-ink-body">{profile.specialty}</p>
                )}
                <Link
                    href={`/s/${address}`}
                    className="inline-block text-sm text-ink-faint hover:text-ink-heading underline"
                >
                    View public profile →
                </Link>
                {profileError && (
                    <p className="text-sm text-red-600 mt-2" role="alert">{profileError}</p>
                )}
            </header>

            <ManageList
                deposit={deposit}
                registeredBlock={registeredBlock}
                onWithdrawn={onWithdrawn}
            />

            {/* Both calls stay visible (user rule 2026-06-12): the profile
                view/edit above, AND the onboarding wizard — for a registered
                wallet the wizard re-walks the steps and publishing updates
                this profile in place. */}
            <p className="text-sm text-ink-faint">
                <Link
                    href="/sellers/identity"
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
}: {
    deposit: bigint | undefined;
    registeredBlock: bigint | null;
    onWithdrawn: () => void;
}) {
    const items: Array<{ label: string; description: string; href: string | null }> = [
        { label: "Identity", description: "Name, description, tokens, location.", href: "/sellers/edit/identity" },
        { label: "Catalogue", description: "Items.", href: "/sellers/edit/catalogue" },
        { label: "Assemblies", description: "Bindings.", href: "/sellers/edit/assemblies" },
        { label: "Agents", description: "Service endpoints.", href: "/sellers/edit/agents" },
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
            />
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
    const { address } = useAccount();
    const client = usePublicClient();
    const { withdraw, isPending, isConfirming, isSuccess, hash, error } = useWithdrawDeposit();
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
        const registry = getSellerRegistry();
        if (!registry) {
            setSubmitError("SellerRegistry not configured.");
            return;
        }
        // Pre-flight simulate — surfaces a typed revert (e.g. NotRegistered)
        // before opening the wallet, so the seller doesn't waste a
        // signature on a tx that will fail. No time lock exists (K4):
        // withdraw is allowed at any time and de-surfaces the seller.
        try {
            await client.simulateContract({
                address: registry,
                abi: SELLER_REGISTRY_ABI,
                functionName: "withdraw",
                account: address,
            });
        } catch (e: unknown) {
            setSubmitError(extractErrorMessage(e, String(e)));
            return;
        }
        try {
            await withdraw();
            setConfirming(false);
        } catch (e: unknown) {
            setSubmitError(extractErrorMessage(e, String(e)));
        }
    }

    // ── Receipt state: success, awaiting seller dismissal ──
    if (receiptHash) {
        return (
            <li className="py-3 border-b border-default space-y-2 text-sm text-ink-body">
                <p>
                    <span className="font-semibold text-ink-heading">Withdrew {deposit !== undefined ? formatEther(deposit) : "…"} ETH.</span>
                    {" "}Registration cleared.
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
                    <span className="text-ink-body">Withdraw deposit</span>
                    <span className="ml-2 text-xs">De-register and reclaim {depositLabel}. Withdrawing de-lists you from discovery.</span>
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
                Returns the {deposit !== undefined ? formatEther(deposit) : "…"} ETH deposit and clears the registration. Withdrawing de-lists you from discovery — the stake is what keeps you surfaced. Catalogue and profile pins on IPFS are not affected.
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
                    {submitError ?? extractErrorMessage(error, String(error))}
                </p>
            )}
        </li>
    );
}

