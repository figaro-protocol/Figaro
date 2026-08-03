"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { formatToken } from "@/lib/shared/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ContentImage } from "@/components/shared/ContentImage";
import { useMounted } from "@/hooks/useMounted";
import { useOnboardingState } from "@/lib/seller/onboardingState";
import { extractErrorMessage } from "@/lib/shared/errors";
import {
    useMemberProfile,
    useRegistrationDeposit,
} from "@/lib/member/useMembersRegistry";
import { type MemberProfileMetadata } from "@/lib/member/memberProfileMetadata";
import { usePublishMemberProfile } from "@/lib/member/usePublishMemberProfile";

/**
 * Step 6 — review and publish.
 *
 * Renders the wallet's pre-publish profile in /m/<address>-style
 * chrome: name, branding, specialty, description, location, catalogue
 * items, accepted tokens, assemblies. Each section carries an "Edit"
 * link back to its wizard step. Autosave on each wizard step means
 * the seller can edit, return via the step indicator, and the review
 * re-reads from localStorage.
 *
 * Publish is one user action; three serial operations under the hood:
 * (a) pin catalogue to IPFS (cached on retry), (b) pin profile JSON
 * with the catalogue URI embedded, (c) dispatch
 * `MembersRegistry.register(profileURI)` (first-time) or
 * `updateProfile(profileURI)` (returning seller). On success the
 * router redirects to /sellers — the registered-dashboard view
 * lives there.
 */

interface DraftSummary {
    /** Profile shape before the catalogueURI is pinned. Submit fills in `catalogueURI`. */
    profileTemplate: Omit<MemberProfileMetadata, "catalogueURI">;
}

function buildDraft(state: ReturnType<typeof useOnboardingState>["state"], wallet: `0x${string}`): DraftSummary | { error: string } {
    if (!state.profile?.name) return { error: "Step 2 (Identity) is incomplete: name is required." };
    if (!state.profile.defaultTokenAddress) return { error: "Step 2 (Identity) is incomplete: pick the accepted token your catalogue is priced in." };
    const items = state.catalogue?.items ?? [];
    if (items.length === 0) return { error: "Step 3 (Catalogue) is incomplete: add at least one item before publishing." };
    // A profile without assembly bindings cannot be ordered from — the
    // register is refused, not just the step navigation (deep links and
    // stale drafts land here too). User rule 2026-06-12.
    if ((state.assemblies ?? []).length === 0) return { error: "Step 4 (Assemblies) is incomplete: bind at least one published assembly — a member profile without one cannot be ordered from." };

    const profileTemplate: Omit<MemberProfileMetadata, "catalogueURI"> = {
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
        profileClauseValues: state.profile.profileClauseValues,
        assemblyBindings: state.assemblies,
        // Absence is the paper-contract default — an empty policy pins
        // NO field, never `[]`.
        disclosurePolicy: state.disclosurePolicy && state.disclosurePolicy.length > 0
            ? state.disclosurePolicy
            : undefined,
        services: state.services,
    };

    return { profileTemplate };
}

export function OnboardingReview() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { state, update, clear } = useOnboardingState(address);

    const { data: profileData } = useMemberProfile(address);
    const isRegistered = !!profileData;

    const { data: depositRaw } = useRegistrationDeposit();
    const deposit = depositRaw as bigint | undefined;

    const {
        publish,
        isPending: publishPending,
        isConfirming: publishConfirming,
        isSuccess: publishSuccess,
        error: publishWriteError,
    } = usePublishMemberProfile();

    const [pinning, setPinning] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);
    // Receipt held in local state — persists until the seller
    // dismisses ("Continue"). Clearing the wizard draft + redirecting
    // to the dashboard happens at Continue, NOT on publishSuccess —
    // otherwise the dashboard's mount races the receipt-card render
    // and the seller never sees the tx hash.
    const [receipt, setReceipt] = useState<{
        hash: `0x${string}`;
        profileURI: string;
        catalogueURI: string;
    } | null>(null);

    const draft = useMemo(() => {
        if (!address) return { error: "Connect a wallet first." } as const;
        return buildDraft(state, address);
    }, [state, address]);

    const error = "error" in draft ? draft.error : null;

    const busy = pinning || publishPending || publishConfirming;
    const onChainError = publishWriteError;

    async function handlePublish() {
        if ("error" in draft) return;
        if (!address) return;
        const items = state.catalogue?.items ?? [];

        setPinning(true);
        setPinError(null);
        try {
            const outcome = await publish({
                profileTemplate: draft.profileTemplate,
                items,
                unitSystem: state.catalogue?.unitSystem,
                wallet: address,
                cachedCatalogueURI: state.publishedCatalogueURI,
            });
            update({
                publishedCatalogueURI: outcome.catalogueURI,
                publishedProfileURI: outcome.profileURI,
            });
            setReceipt(outcome);
            setPinning(false);
        } catch (err) {
            setPinError(extractErrorMessage(err, String(err)));
            setPinning(false);
        }
    }

    function handleContinue() {
        clear();
        router.replace("/sellers");
    }

    if (!mounted) {
        return <Card className="p-6 text-sm text-ink-faint">Loading…</Card>;
    }

    if (!isConnected) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-ink-body">Connect a wallet to publish your registration.</p>
                <Link href="/sellers/identity">
                    <Button variant="outline">← Back to identity</Button>
                </Link>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-red-600" role="alert">{error}</p>
                <Link href="/sellers/identity">
                    <Button variant="outline">← Back to fill missing fields</Button>
                </Link>
            </Card>
        );
    }

    // Receipt state: publish succeeded, awaiting seller dismissal.
    // Holds the tx hash + IPFS URIs visibly until "Continue" routes
    // to the dashboard. The wizard draft is NOT cleared here — clear()
    // runs at Continue so a subsequent re-edit still has the draft to
    // hydrate from if needed (and so this render isn't racing the
    // dashboard mount).
    if (receipt) {
        return (
            <div className="space-y-6">
                <Card className="p-6 space-y-4">
                    <h2 className="text-heading-h2 text-ink-heading">
                        {isRegistered ? "Profile updated" : "Registered."}
                    </h2>
                    <p className="text-sm text-ink-body">
                        {isRegistered
                            ? "Your profile has been re-pinned to IPFS and the new metadataURI is on-chain."
                            : "Your wallet is now registered on this network. You get the deposit back when you leave the registry, after a cooldown."}
                    </p>
                    <dl className="text-xs text-ink-body space-y-2 pt-2 border-t border-default">
                        <div>
                            <dt className="text-ink-faint">Transaction</dt>
                            <dd className="font-mono break-all">{receipt.hash}</dd>
                        </div>
                        <div>
                            <dt className="text-ink-faint">Profile URI</dt>
                            <dd className="font-mono break-all">{receipt.profileURI}</dd>
                        </div>
                        <div>
                            <dt className="text-ink-faint">Catalogue URI</dt>
                            <dd className="font-mono break-all">{receipt.catalogueURI}</dd>
                        </div>
                    </dl>
                </Card>
                <div className="flex items-center justify-end gap-3">
                    {address && (
                        <Link
                            href={`/s/${address}`}
                            className="text-sm text-ink-faint hover:text-ink-heading underline"
                        >
                            View public profile →
                        </Link>
                    )}
                    <Button onClick={handleContinue}>Continue to dashboard</Button>
                </div>
            </div>
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
                        href="/sellers/identity"
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
                        href="/sellers/catalogue"
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
                        href="/sellers/identity#profile-section-accepted-tokens"
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
                        href="/sellers/assemblies"
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
                    <p className="text-sm text-ink-faint">Unbound — seller stays registered but won&apos;t surface to assembly-scoped discovery.</p>
                )}
            </Card>

            {/* Data disclosure */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Data disclosure</h2>
                    <Link
                        href="/sellers/assemblies"
                        className="text-xs text-ink-faint hover:text-ink-heading underline"
                    >
                        Edit disclosure →
                    </Link>
                </div>
                {(profile?.disclosurePolicy?.length ?? 0) > 0 ? (
                    <p className="text-sm text-ink-body" data-testid="review-disclosure-policy">
                        {profile!.disclosurePolicy!.filter((e) => e.offered).length} record
                        class{profile!.disclosurePolicy!.filter((e) => e.offered).length === 1 ? "" : "es"} offered
                        for sale or disclosure.
                    </p>
                ) : (
                    <p className="text-sm text-ink-faint">
                        None declared — the default applies: each party holds its
                        own copy of co-produced records; nothing is offered.
                    </p>
                )}
            </Card>

            {/* Agents */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Agent endpoints</h2>
                    <Link
                        href="/sellers/agents"
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
                            is unaffected.
                        </>
                    ) : (
                        <>
                            Publishing pins your catalogue to IPFS, then pins your
                            profile (with the catalogue URI embedded), then calls{" "}
                            <code>register(profileURI)</code> on the MembersRegistry,
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
                        {" "}— you get it back when you leave the registry, after a cooldown.
                        Withdrawing de-lists you from discovery; the stake is what
                        keeps you surfaced.
                    </p>
                )}
            </Card>

            {(pinError || onChainError) && (
                <p className="text-sm text-red-600" role="alert">
                    {pinError ?? onChainError?.message}
                </p>
            )}

            {(pinning || publishPending) && (
                <p className="text-sm text-ink-body">
                    {pinning
                        ? "Pinning to IPFS…"
                        : "Confirm in your wallet…"}
                </p>
            )}

            {publishConfirming && (
                <p className="text-sm text-ink-body">Waiting for confirmation…</p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-default">
                <Link
                    href="/sellers/agents"
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
