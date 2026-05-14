"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { formatToken } from "@/lib/shared/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ContentImage } from "@/components/shared/ContentImage";
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
 * Step 6 — review and publish.
 *
 * Renders the wallet's pre-publish profile in /m/<address>-style
 * chrome: name, branding, specialty, description, location, catalogue
 * items, accepted tokens, assemblies. Each section carries an "Edit"
 * link back to its wizard step. Autosave on each wizard step means
 * the operator can edit, return via the step indicator, and the review
 * re-reads from localStorage.
 *
 * Publish is one user action; three serial operations under the hood:
 * (a) pin catalogue to IPFS (cached on retry), (b) pin profile JSON
 * with the catalogue URI embedded, (c) dispatch
 * `OperatorRegistry.register(profileURI)` (first-time) or
 * `updateProfile(profileURI)` (returning operator). On success the
 * router redirects to /operators — the registered-dashboard view
 * lives there.
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

export function OnboardingReview() {
    const router = useRouter();
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

    const draft = useMemo(() => {
        if (!address) return { error: "Connect a wallet first." } as const;
        return buildDraft(state, address);
    }, [state, address]);

    const error = "error" in draft ? draft.error : null;

    // On publish success → mark complete and redirect to /operators.
    // The dashboard view is the canonical post-publish surface.
    useEffect(() => {
        if (regSuccess || updSuccess) {
            if (!state.complete) update({ complete: true });
            router.replace("/operators");
        }
    }, [regSuccess, updSuccess, state.complete, update, router]);

    const busy = pinning || regPending || regConfirming || updPending || updConfirming;
    const onChainError = regError ?? updError;

    async function handlePublish() {
        if ("error" in draft) return;
        if (!address) return;

        setPinning(true);
        setPinError(null);
        try {
            // (a) Pin the catalogue first if not already pinned.
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
                    <Button variant="outline">← Back to identity</Button>
                </Link>
            </Card>
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

    const profile = "profileTemplate" in draft ? draft.profileTemplate : undefined;
    const items = state.catalogue?.items ?? [];
    const acceptedTokens = profile?.acceptedTokens ?? [];
    const bindings = profile?.assemblyBindings ?? [];
    const hasServices = profile?.services && Object.values(profile.services).some(Boolean);

    return (
        <div className="space-y-8">
            {/* Hero: the /m/<address> page's header analog */}
            <Card className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Preview · pending publish</h2>
                    <Link
                        href="/operators/identity"
                        className="text-xs text-ink-faint hover:text-ink-heading underline"
                    >
                        Edit identity →
                    </Link>
                </div>
                <div className="flex items-start gap-4">
                    {profile?.branding?.logoURI ? (
                        <ContentImage
                            src={profile.branding.logoURI}
                            alt={`${profile?.name ?? ""} logo`}
                            className="w-16 h-16 rounded object-cover shrink-0"
                            fallback={
                                <div className="w-16 h-16 rounded bg-paper-200 shrink-0" aria-hidden="true" />
                            }
                        />
                    ) : (
                        <div className="w-16 h-16 rounded bg-paper-200 shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-heading-h3 text-ink-heading">{profile?.name}</p>
                        {profile?.specialty && (
                            <p className="text-sm text-ink-body">{profile.specialty}</p>
                        )}
                        {profile?.description && (
                            <p className="text-sm text-ink-body">{profile.description}</p>
                        )}
                        {(profile?.location?.geohash || profile?.location?.addressText) && (
                            <p className="text-xs text-ink-faint">
                                {profile.location?.addressText}
                                {profile.location?.geohash && (
                                    <span className="font-mono ml-2">({profile.location.geohash})</span>
                                )}
                            </p>
                        )}
                    </div>
                </div>
            </Card>

            {/* Catalogue */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Catalogue ({items.length} item{items.length === 1 ? "" : "s"})</h2>
                    <Link
                        href="/operators/catalogue"
                        className="text-xs text-ink-faint hover:text-ink-heading underline"
                    >
                        Edit catalogue →
                    </Link>
                </div>
                {items.length > 0 ? (
                    <ul className="space-y-2 text-sm text-ink-body">
                        {items.map((item) => (
                            <li key={item.id} className="flex items-baseline justify-between gap-4">
                                <span className="text-ink-heading">{item.name}</span>
                                <span className="font-mono text-xs">{item.price}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-ink-faint">No items.</p>
                )}
            </Card>

            {/* Accepted tokens */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Accepted tokens</h2>
                    <Link
                        href="/operators/identity#profile-section-accepted-tokens"
                        className="text-xs text-ink-faint hover:text-ink-heading underline"
                    >
                        Edit tokens →
                    </Link>
                </div>
                {acceptedTokens.length > 0 ? (
                    <p className="text-sm text-ink-body">
                        {acceptedTokens.map((t) => t.symbol).join(", ")}
                    </p>
                ) : (
                    <p className="text-sm text-ink-faint">No tokens accepted.</p>
                )}
            </Card>

            {/* Assemblies */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Assemblies ({bindings.length})</h2>
                    <Link
                        href="/operators/assemblies"
                        className="text-xs text-ink-faint hover:text-ink-heading underline"
                    >
                        Edit assemblies →
                    </Link>
                </div>
                {bindings.length > 0 ? (
                    <ul className="space-y-1 text-sm text-ink-body">
                        {bindings.map((b) => (
                            <li key={b.bindingId} className="font-mono text-xs">{b.assemblySlug}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-ink-faint">Unbound — operator stays registered but won&apos;t surface to assembly-scoped discovery.</p>
                )}
            </Card>

            {/* Agents */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Agent endpoints</h2>
                    <Link
                        href="/operators/agents"
                        className="text-xs text-ink-faint hover:text-ink-heading underline"
                    >
                        Edit agents →
                    </Link>
                </div>
                <p className="text-sm text-ink-body">
                    {hasServices ? "Configured." : "None. The wallet is human-driven."}
                </p>
            </Card>

            {/* Publish */}
            <Card className="p-6 space-y-3">
                <h2 className="text-heading-h2 text-ink-heading">
                    {isRegistered ? "Update your registered profile" : "Publish"}
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
                        ? "Pinning to IPFS…"
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
                    ← Back to wizard
                </Link>
                <Button
                    type="button"
                    onClick={handlePublish}
                    disabled={busy || !!error}
                    data-testid="review-confirm-publish"
                >
                    {isRegistered ? "Update profile" : "Publish & register"}
                </Button>
            </div>
        </div>
    );
}
