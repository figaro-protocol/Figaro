"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import {
    useDepositLockPeriod,
    useOperatorProfile,
    useRegisterOperator,
    useRegistrationDeposit,
    useUpdateProfile,
} from "@/lib/mechanisms/useOperatorRegistry";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import {
    parseOperatorProfileDocument,
    type OperatorProfileMetadata,
} from "@/lib/shared/operatorProfileMetadata";
import { truncateHex } from "@/lib/shared/formatHex";

/**
 * Step 7 — final review + publish + confirmation.
 *
 * Three states the screen renders, in order:
 *
 *  1. **Pre-publish.** The user has filled steps 2–6 and pinned the
 *     catalogue in step 4. We assemble the profile document from the
 *     wizard state, render a summary, and offer a Publish button.
 *
 *  2. **Publishing.** Pin the profile JSON to IPFS, then call
 *     `OperatorRegistry.register(profileURI)` (first-time) or
 *     `updateProfile(profileURI)` (returning operator). The register
 *     path also pays the on-chain deposit.
 *
 *  3. **Done.** The on-chain transaction has confirmed; we set
 *     `state.complete = true` and show "View my page" + "Back to
 *     operators" links.
 */

interface DraftSummary {
    profile: OperatorProfileMetadata;
    catalogueURI: string;
}

function buildDraft(state: ReturnType<typeof useOnboardingState>["state"], wallet: `0x${string}`): DraftSummary | { error: string } {
    if (!state.profile?.name) return { error: "Step 2 (Profile) is incomplete: name is required." };
    if (!state.profile?.slug) return { error: "Step 2 (Profile) is incomplete: URL handle is required." };
    if (!state.publishedCatalogueURI) return { error: "Step 4 (Link) is incomplete: pin your catalogue first." };

    const profile: OperatorProfileMetadata = {
        subjectAddress: wallet,
        name: state.profile.name,
        slug: state.profile.slug,
        description: state.profile.description,
        specialty: state.profile.specialty,
        location: state.profile.location?.geohash || state.profile.location?.addressText
            ? {
                geohash: state.profile.location?.geohash ?? "",
                addressText: state.profile.location?.addressText,
            }
            : undefined,
        branding: state.profile.branding,
        assets: state.profile.assets,
        acceptedTokens: state.profile.acceptedTokens,
        defaultTokenAddress: state.profile.defaultTokenAddress,
        assemblyBindings: state.assemblies,
        services: state.services,
        catalogueURI: state.publishedCatalogueURI,
        version: "1.0.0",
    };

    return { profile, catalogueURI: state.publishedCatalogueURI };
}

export function OnboardingDone() {
    const { address, isConnected } = useAccount();
    const { state, update } = useOnboardingState(address);

    const { data: profileData } = useOperatorProfile(address);
    const isRegistered = !!profileData;

    const { data: depositRaw } = useRegistrationDeposit();
    const { data: lockPeriodRaw } = useDepositLockPeriod();
    const deposit = depositRaw as bigint | undefined;
    const lockPeriod = lockPeriodRaw as bigint | undefined;

    const { register, isPending: regPending, isConfirming: regConfirming, isSuccess: regSuccess, error: regError } = useRegisterOperator();
    const { updateProfile, isPending: updPending, isConfirming: updConfirming, isSuccess: updSuccess, error: updError } = useUpdateProfile();

    const [pinning, setPinning] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);
    const [publishedProfileURI, setPublishedProfileURI] = useState<string | null>(state.publishedProfileURI ?? null);

    const draft = useMemo(() => {
        if (!address) return { error: "Connect a wallet first." } as const;
        return buildDraft(state, address);
    }, [state, address]);

    const error = "error" in draft ? draft.error : null;

    useEffect(() => {
        if ((regSuccess || updSuccess) && !state.complete) {
            update({ complete: true });
        }
    }, [regSuccess, updSuccess, state.complete, update]);

    const busy = pinning || regPending || regConfirming || updPending || updConfirming;
    const onChainError = regError ?? updError;

    async function handlePublish() {
        if ("error" in draft) return;
        if (!address) return;

        setPinning(true);
        setPinError(null);
        try {
            parseOperatorProfileDocument(draft.profile, "onboarding-publish");
            const { uri } = await DEFAULT_IPFS_SERVICE.publishJSON(draft.profile as unknown as Record<string, unknown>);
            setPublishedProfileURI(uri);
            update({ publishedProfileURI: uri });
            setPinning(false);

            if (isRegistered) {
                await updateProfile(uri);
            } else {
                await register(uri, deposit ?? 0n);
            }
        } catch (err) {
            setPinError(err instanceof Error ? err.message : String(err));
            setPinning(false);
        }
    }

    if (!isConnected) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">Connect a wallet to publish your registration.</p>
                <Link href="/operators/onboard/profile">
                    <Button variant="outline">← Back to profile</Button>
                </Link>
            </Card>
        );
    }

    if (state.complete) {
        return (
            <div className="space-y-8">
                <Card className="p-6 space-y-3">
                    <h2 className="text-heading-h2 text-ink-heading">You&apos;re registered</h2>
                    <p className="text-sm text-ink-body">
                        Your operator profile is pinned and the on-chain transaction has confirmed. The runtime can now route bonded orders to your wallet.
                    </p>
                    {publishedProfileURI && (
                        <p className="text-xs text-ink-faint font-mono break-all">
                            Profile URI: {publishedProfileURI}
                        </p>
                    )}
                </Card>
                <Card className="p-6 space-y-3">
                    <h2 className="text-heading-h2 text-ink-heading">What&apos;s next</h2>
                    <ul className="space-y-2 text-sm text-ink-body list-disc pl-5">
                        <li>Visit your public view page to see what your data looks like to buyers.</li>
                        <li>Return to the operators surface any time to update your profile or catalogue.</li>
                        <li>
                            The ETH deposit you posted is reclaimable via <code>withdraw</code> after the lock period elapses. The lock restarts on each fresh registration but is unaffected by <code>updateProfile</code>.
                        </li>
                    </ul>
                </Card>
                <div className="flex items-center justify-between gap-3">
                    <Link href="/operators" className="text-sm text-ink-faint hover:text-ink-heading transition-colors">
                        ← Back to operators
                    </Link>
                    {address && (
                        <Link href={`/m/${address}`}>
                            <Button>View my page →</Button>
                        </Link>
                    )}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-red-600" role="alert">{error}</p>
                <Link href="/operators/onboard/profile">
                    <Button variant="outline">← Back to fill missing fields</Button>
                </Link>
            </Card>
        );
    }

    return (
        <div className="space-y-8">
            <Card className="p-6 space-y-3">
                <h2 className="text-heading-h2 text-ink-heading">Review</h2>
                <dl className="space-y-2 text-sm text-ink-body">
                    <Row label="Operator name" value={"profile" in draft ? draft.profile.name : ""} />
                    <Row label="URL handle" value={"profile" in draft ? draft.profile.slug : ""} />
                    <Row
                        label="Catalogue URI"
                        value={"catalogueURI" in draft ? truncateHex(draft.catalogueURI, { head: 18, tail: 6 }) : ""}
                    />
                    <Row
                        label="Accepted tokens"
                        value={
                            "profile" in draft && draft.profile.acceptedTokens?.length
                                ? draft.profile.acceptedTokens.map((t) => t.symbol).join(", ")
                                : "—"
                        }
                    />
                    <Row
                        label="Assemblies"
                        value={
                            "profile" in draft && draft.profile.assemblyBindings?.length
                                ? draft.profile.assemblyBindings.map((b) => b.assemblySlug).join(", ")
                                : "none"
                        }
                    />
                    <Row
                        label="Agent endpoints"
                        value={"profile" in draft && draft.profile.services && Object.values(draft.profile.services).some(Boolean) ? "configured" : "—"}
                    />
                </dl>
            </Card>

            <Card className="p-6 space-y-3">
                <h2 className="text-heading-h2 text-ink-heading">
                    {isRegistered ? "Update your registered profile" : "Register"}
                </h2>
                <p className="text-sm text-ink-body">
                    {isRegistered ? (
                        <>
                            Your wallet is already registered. Publishing here re-pins
                            the profile JSON and calls <code>updateProfile</code> with
                            the new URI. The deposit and lock period are unaffected.
                        </>
                    ) : (
                        <>
                            Publishing pins your profile to IPFS and calls{" "}
                            <code>register(profileURI)</code> on the OperatorRegistry,
                            posting the reclaimable ETH deposit.
                        </>
                    )}
                </p>
                {!isRegistered && deposit !== undefined && (
                    <p className="text-sm text-ink-body">
                        Deposit:{" "}
                        <span className="font-semibold text-ink-heading">
                            {formatUnits(deposit, 18)} ETH
                        </span>
                        {lockPeriod !== undefined && (
                            <>
                                {" "}— lock period {Number(lockPeriod)}s before reclaim is allowed.
                            </>
                        )}
                    </p>
                )}
            </Card>

            {(pinError || onChainError) && (
                <p className="text-sm text-red-600" role="alert">
                    {pinError ?? onChainError?.message}
                </p>
            )}

            {(pinning || regPending || updPending) && (
                <p className="text-sm text-ink-body">
                    {pinning
                        ? "Pinning profile to IPFS…"
                        : "Confirm in your wallet…"}
                </p>
            )}

            {(regConfirming || updConfirming) && (
                <p className="text-sm text-ink-body">Waiting for confirmation…</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href="/operators/onboard/agents"
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    ← Back
                </Link>
                <Button
                    type="button"
                    onClick={handlePublish}
                    disabled={busy || !!error}
                >
                    {isRegistered ? "Update profile" : "Publish & register"}
                </Button>
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-faint">{label}</dt>
            <dd className="font-mono text-ink-heading text-right truncate min-w-0 flex-shrink">{value}</dd>
        </div>
    );
}
