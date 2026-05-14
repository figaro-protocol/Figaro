"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatToken } from "@/lib/shared/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/lib/shared/useMounted";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import { extractErrorMessage } from "@/lib/shared/errors";
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
import { publishMerchantCatalogue } from "@/lib/shared/cataloguePublisher";
import type { SellerCatalogueMetadata } from "@/lib/shared/sellerCatalogueMetadata";

/**
 * Step 6 — final review + publish + confirmation.
 *
 * Three states the screen renders, in order:
 *
 *  1. **Pre-publish.** The operator has filled identity + catalogue +
 *     (optionally) assemblies + agents. We assemble a draft view of the
 *     profile document and offer a Publish button.
 *
 *  2. **Publishing.** Three serial operations under one user action:
 *     (a) pin the catalogue document to IPFS (cached on retry via
 *     `publishedCatalogueURI`), (b) pin the profile JSON (with the
 *     catalogue URI embedded), (c) dispatch
 *     `OperatorRegistry.register(profileURI)` (first-time) or
 *     `updateProfile(profileURI)` (returning operator). The register
 *     path also pays the on-chain deposit.
 *
 *  3. **Done.** The on-chain transaction has confirmed; we set
 *     `state.complete = true` and show "View my page" + "Back to
 *     operators" links.
 */

interface DraftSummary {
    /** Profile shape before the catalogueURI is pinned. Submit fills in `catalogueURI`. */
    profileTemplate: Omit<OperatorProfileMetadata, "catalogueURI">;
}

/**
 * Render an on-chain `DEPOSIT_LOCK_PERIOD` (bigint seconds) as a
 * human-readable duration. The deployed value is one year on-chain
 * today, but we derive the rendering at runtime so a redeployed
 * contract with a different value still displays cleanly.
 */
function formatLockPeriod(seconds: bigint): string {
    const total = Number(seconds);
    const days = Math.floor(total / 86400);
    if (days >= 365) {
        const years = Math.floor(days / 365);
        return years === 1 ? "one-year" : `${years}-year`;
    }
    if (days >= 1) return days === 1 ? "one-day" : `${days}-day`;
    return `${total}-second`;
}

function buildDraft(state: ReturnType<typeof useOnboardingState>["state"], wallet: `0x${string}`): DraftSummary | { error: string } {
    if (!state.profile?.name) return { error: "Step 2 (Identity) is incomplete: name is required." };
    const items = state.catalogue?.items ?? [];
    if (items.length === 0) return { error: "Step 3 (Catalogue) is incomplete: add at least one item before publishing." };

    const profileTemplate: Omit<OperatorProfileMetadata, "catalogueURI"> = {
        subjectAddress: wallet,
        name: state.profile.name,
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
        version: "1.0.0",
    };

    return { profileTemplate };
}

export function OnboardingDone() {
    const mounted = useMounted();
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
            // (a) Pin the catalogue first if not already pinned. Cache the URI
            // in state so a partial failure (pin succeeded, register reverted)
            // doesn't force a re-pin on retry.
            let catalogueURI = state.publishedCatalogueURI;
            if (!catalogueURI) {
                const items = state.catalogue?.items ?? [];
                const catalogue: SellerCatalogueMetadata = {
                    subjectAddress: address,
                    menu: items,
                    version: "1.0.0",
                    unitSystem: state.catalogue?.unitSystem,
                };
                const cataloguePin = await publishMerchantCatalogue(catalogue);
                catalogueURI = cataloguePin.uri;
                update({ publishedCatalogueURI: catalogueURI });
            }

            // (b) Pin the profile JSON with the catalogue URI embedded.
            const profile: OperatorProfileMetadata = {
                ...draft.profileTemplate,
                catalogueURI,
            };
            parseOperatorProfileDocument(profile, "onboarding-publish");
            const { uri: profileURI } = await DEFAULT_IPFS_SERVICE.publishJSON(profile as unknown as Record<string, unknown>);
            setPublishedProfileURI(profileURI);
            update({ publishedProfileURI: profileURI });
            setPinning(false);

            // (c) Dispatch the on-chain register / updateProfile.
            if (isRegistered) {
                await updateProfile(profileURI);
            } else {
                await register(profileURI, deposit ?? 0n);
            }
        } catch (err) {
            setPinError(extractErrorMessage(err, String(err)));
            setPinning(false);
        }
    }

    if (!mounted) {
        return <Card className="p-6 text-sm text-ink-faint">Loading…</Card>;
    }

    if (!isConnected) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">Connect a wallet to publish your registration.</p>
                <Link href="/operators/identity">
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
                <Link href="/operators/identity">
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
                    <Row label="Operator name" value={"profileTemplate" in draft ? draft.profileTemplate.name : ""} />
                    <Row
                        label="Catalogue items"
                        value={`${state.catalogue?.items?.length ?? 0} item${(state.catalogue?.items?.length ?? 0) === 1 ? "" : "s"}`}
                    />
                    <Row
                        label="Accepted tokens"
                        value={
                            "profileTemplate" in draft && draft.profileTemplate.acceptedTokens?.length
                                ? draft.profileTemplate.acceptedTokens.map((t) => t.symbol).join(", ")
                                : "—"
                        }
                    />
                    <Row
                        label="Assemblies"
                        value={
                            "profileTemplate" in draft && draft.profileTemplate.assemblyBindings?.length
                                ? draft.profileTemplate.assemblyBindings.map((b) => b.assemblySlug).join(", ")
                                : "none"
                        }
                    />
                    <Row
                        label="Agent endpoints"
                        value={"profileTemplate" in draft && draft.profileTemplate.services && Object.values(draft.profileTemplate.services).some(Boolean) ? "configured" : "—"}
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
                            the catalogue + profile JSON to IPFS and calls{" "}
                            <code>updateProfile</code> with the new URI. The deposit
                            and lock period are unaffected.
                        </>
                    ) : (
                        <>
                            Publishing pins your catalogue to IPFS, then pins your
                            profile (with the catalogue URI embedded), then calls{" "}
                            <code>register(profileURI)</code> on the OperatorRegistry,
                            posting the reclaimable ETH deposit. One user action; three
                            serial operations.
                        </>
                    )}
                </p>
                {!isRegistered && deposit !== undefined && (
                    <p className="text-sm text-ink-body">
                        Deposit:{" "}
                        <span className="font-semibold text-ink-heading">
                            {formatToken(deposit)} ETH
                        </span>
                        {lockPeriod !== undefined && (
                            <>
                                {" "}— reclaimable via <code>withdraw</code> after a {formatLockPeriod(lockPeriod)} lock. The lock starts on register; unaffected by <code>updateProfile</code>.
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
                    href="/operators/agents"
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
