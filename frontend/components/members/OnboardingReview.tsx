"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/shared/Link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import { formatToken } from "@/lib/shared/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { OnboardingLoadingCard } from "@/components/members/OnboardingStepChrome";
import { ContentImage } from "@/components/shared/ContentImage";
import { TransactionReceipt } from "@/components/shared/TransactionReceipt";
import { useMounted } from "@/hooks/useMounted";
import { onboardingStepLabel, useOnboardingState } from "@/lib/member/onboardingState";
import { sellerPageHref } from "@/lib/member/memberListing";
import { deriveProcessDesignSlug } from "@/lib/shared/assembly";
import { extractErrorMessage } from "@/lib/shared/errors";
import {
    useMemberProfile,
    useRegistrationDeposit,
    useWithdrawalCooldown,
} from "@/lib/member/useMembersRegistry";
import { type MemberProfileMetadata } from "@/lib/member/memberProfileMetadata";
import { cooldownPhrase } from "@/lib/member/cooldownPhrase";
import { usePublishMemberProfile } from "@/lib/member/usePublishMemberProfile";

/**
 * Final step — review and publish.
 *
 * Renders the wallet's pre-publish profile in member-page-style
 * chrome: name, branding, specialty, description, location, catalog
 * items, accepted tokens, assemblies. Each section carries an "Edit"
 * link back to its wizard step. Autosave on each wizard step means
 * the member can edit, return via the step indicator, and the review
 * re-reads from localStorage.
 *
 * Publish is one user action; three serial operations under the hood:
 * (a) pin catalog to IPFS, (b) pin profile JSON
 * with the catalog URI embedded, (c) dispatch
 * `MembersRegistry.register(profileURI)` (first-time) or
 * `updateProfile(profileURI)` (returning member). On success the
 * router redirects to /members — the registered-dashboard view
 * lives there.
 */

interface DraftSummary {
    /** Profile shape before the catalogURI is pinned. Submit fills in `catalogURI`. */
    profileMetadata: Omit<MemberProfileMetadata, "catalogURI">;
}

function buildDraft(state: ReturnType<typeof useOnboardingState>["state"], wallet: `0x${string}`): DraftSummary | { error: string } {
    if (!state.profile?.name) return { error: `${onboardingStepLabel("profile")} is incomplete: name is required.` };
    if (!state.profile.defaultTokenAddress) return { error: `${onboardingStepLabel("profile")} is incomplete: pick the accepted token your catalog is priced in.` };
    // Reported in wizard order, so the member is sent to the earliest step
    // that still needs them. A profile without assembly bindings cannot be
    // ordered from — the register is refused, not just the step navigation
    // (deep links and stale drafts land here too).
    if ((state.assemblies ?? []).length === 0) return { error: `${onboardingStepLabel("assemblies")} is incomplete: bind at least one published assembly — a member profile without one cannot be ordered from.` };

    const profileMetadata: Omit<MemberProfileMetadata, "catalogURI"> = {
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
        // A draft made before the wallet connected carries a placeholder
        // subject; the wallet that signs is the subject of every binding.
        processBindings: state.assemblies?.map((b) => ({
            ...b,
            subjectAddress: wallet,
            bindingId: `binding:${wallet.toLowerCase()}:${b.processDesignHash.toLowerCase()}`,
        })),
        // Absence is each optional list's no-declaration state — an
        // empty list pins NO field, never `[]`.
        buyerAssemblies: state.buyerAssemblies && state.buyerAssemblies.length > 0
            ? state.buyerAssemblies
            : undefined,
        services: state.services,
    };

    return { profileMetadata };
}

type DraftState = ReturnType<typeof useOnboardingState>["state"];

/** Whether the draft holds anything the review shows. A visitor with no wallet
 *  reads the anonymous draft, which is empty once a wallet has adopted it:
 *  an empty draft is an empty place, never an "incomplete" error. */
function draftShowsNothing(state: DraftState): boolean {
    const p = state.profile;
    const profileEmpty = !p || !(p.name || p.specialty || p.description || p.location?.geohash
        || p.location?.addressText || p.branding?.logoURI || (p.acceptedTokens ?? []).length > 0);
    return profileEmpty
        && (state.catalog?.items ?? []).length === 0
        && (state.assemblies ?? []).length === 0
        && (state.buyerAssemblies ?? []).length === 0
        && !(state.services && Object.values(state.services).some(Boolean));
}

export function OnboardingReview() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { state, clear } = useOnboardingState(address);

    // The register-or-update choice rests on the chain's answer: until the
    // registration read is present, neither is offered (a failed read is
    // never "unregistered").
    const { read: registration } = useMemberProfile(address);
    const registrationKnown = registration.status === "present";
    const isRegistered = registration.status === "present" && registration.value.registered;

    const depositRead = useRegistrationDeposit();
    const deposit = depositRead.status === "present" ? depositRead.value : undefined;
    const { data: cooldownRaw } = useWithdrawalCooldown();
    const cooldown = cooldownPhrase(cooldownRaw as bigint | undefined);

    const {
        publish,
        isPending: publishPending,
        isConfirming: publishConfirming,
        isSuccess: publishSuccess,
        error: publishWriteError,
    } = usePublishMemberProfile();

    const [pinning, setPinning] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);
    // Receipt held in local state — persists until the member
    // dismisses ("Continue"). Clearing the wizard draft + redirecting
    // to the dashboard happens at Continue, NOT on publishSuccess —
    // otherwise the dashboard's mount races the receipt-card render
    // and the member never sees the tx hash.
    const [receipt, setReceipt] = useState<{
        hash: `0x${string}`;
        profileURI: string;
        catalogURI?: string;
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
        const items = state.catalog?.items ?? [];

        setPinning(true);
        setPinError(null);
        try {
            const outcome = await publish({
                profileMetadata: draft.profileMetadata,
                items,
                unitSystem: state.catalog?.unitSystem,
                wallet: address,
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
        router.replace("/members/manage");
    }

    if (!mounted) {
        return <OnboardingLoadingCard />;
    }

    // With no wallet the review reads the anonymous draft as it stands and the
    // registry's stake; only the publish needs the wallet, which signs it.
    const signer = isConnected ? address : undefined;

    if (signer && error) {
        return (
            <Card className="p-6 space-y-4">
                <p className="text-sm text-error-fg" role="alert">{error}</p>
                <Link href="/members/identity">
                    <Button variant="outline">← Back to fill missing fields</Button>
                </Link>
            </Card>
        );
    }

    // Receipt state: publish succeeded, awaiting the member's dismissal.
    // Holds the tx hash + IPFS URIs visibly until "Continue" routes
    // to the dashboard. The wizard draft is NOT cleared here — clear()
    // runs at Continue so a subsequent re-edit still has the draft to
    // hydrate from if needed (and so this render isn't racing the
    // dashboard mount).
    if (receipt) {
        return (
            <div className="space-y-6">
                <Card className="p-6">
                    <TransactionReceipt
                        className="space-y-4"
                        heading={isRegistered ? "Profile updated" : "Registered."}
                        headingAs="h2"
                        headingClassName="text-heading-h2 text-ink-heading"
                        prose={
                            isRegistered
                                ? "Your profile has been re-pinned to IPFS and the new metadataURI is on-chain."
                                : `Your wallet is now registered on this network. You get the stake back when you leave the registry, ${cooldown}.`
                        }
                        proseClassName="text-sm text-ink-body"
                        rows={[
                            { label: "Transaction", value: receipt.hash },
                            { label: "Profile URI", value: receipt.profileURI },
                            ...(receipt.catalogURI ? [{ label: "Catalog URI", value: receipt.catalogURI }] : []),
                        ]}
                    />
                </Card>
                <div className="flex items-center justify-end gap-3">
                    {address && (
                        <Link
                            href={sellerPageHref(address)}
                            className="text-sm text-ink-muted hover:text-ink-heading underline"
                        >
                            View public profile →
                        </Link>
                    )}
                    <Button onClick={handleContinue}>Continue to dashboard</Button>
                </div>
            </div>
        );
    }

    // The preview is the draft as it stands, the wallet's or the anonymous one;
    // the subject address is the signer's and is added only at publish.
    const profile = state.profile;
    const items = state.catalog?.items ?? [];
    const acceptedTokens = profile?.acceptedTokens ?? [];
    const bindings = state.assemblies ?? [];
    const subscriptions = state.buyerAssemblies ?? [];
    const hasServices = state.services && Object.values(state.services).some(Boolean);
    const showDraft = !!signer || !draftShowsNothing(state);

    return (
        <div className="space-y-8">
            {showDraft && <>
            {/* Hero: the member page's header analog */}
            <Card className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Preview · pending publish</h2>
                    <Link
                        href="/members/identity"
                        className="text-xs text-ink-muted hover:text-ink-heading underline"
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
                            <p className="text-xs text-ink-muted">
                                {profile.location?.addressText}
                                {profile.location?.geohash && (
                                    <span className="font-mono ml-2">({profile.location.geohash})</span>
                                )}
                            </p>
                        )}
                    </div>
                </div>
            </Card>

            {/* Catalog */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Catalog ({items.length} item{items.length === 1 ? "" : "s"})</h2>
                    <Link
                        href="/members/catalog"
                        className="text-xs text-ink-muted hover:text-ink-heading underline"
                    >
                        Edit catalog →
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
                    <p className="text-sm text-ink-muted">No items.</p>
                )}
            </Card>

            {/* Accepted tokens */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Accepted tokens</h2>
                    <Link
                        href="/members/identity#profile-section-accepted-tokens"
                        className="text-xs text-ink-muted hover:text-ink-heading underline"
                    >
                        Edit tokens →
                    </Link>
                </div>
                {acceptedTokens.length > 0 ? (
                    <p className="text-sm text-ink-body">
                        {acceptedTokens.map((t) => t.symbol).join(", ")}
                    </p>
                ) : (
                    <p className="text-sm text-ink-muted">No tokens accepted.</p>
                )}
            </Card>

            {/* Assemblies */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Assemblies ({bindings.length})</h2>
                    <Link
                        href="/members/assemblies"
                        className="text-xs text-ink-muted hover:text-ink-heading underline"
                    >
                        Edit assemblies →
                    </Link>
                </div>
                {bindings.length > 0 ? (
                    <ul className="space-y-1 text-sm text-ink-body">
                        {bindings.map((b) => (
                            <li key={b.bindingId} className="font-mono text-xs">{deriveProcessDesignSlug(b.processDesignHash)}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-ink-muted">Unbound — the member stays registered but won&apos;t surface to assembly-scoped discovery.</p>
                )}
            </Card>

            {/* Buyer side */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Buyer ({subscriptions.length} subscription{subscriptions.length === 1 ? "" : "s"})</h2>
                    <Link
                        href="/members/buyer"
                        className="text-xs text-ink-muted hover:text-ink-heading underline"
                    >
                        Edit buyer side →
                    </Link>
                </div>
                {subscriptions.length > 0 ? (
                    <ul className="space-y-1 text-sm text-ink-body" data-testid="review-buyer-subscriptions">
                        {subscriptions.map((s) => (
                            <li key={s.processDesignHash} className="font-mono text-xs">{s.processDesignHash}</li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-ink-muted">
                        No subscriptions — this member sells only.
                    </p>
                )}
            </Card>

            {/* Agents */}
            <Card className="p-6 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <h2 className="text-heading-h2 text-ink-heading">Agent endpoints</h2>
                    <Link
                        href="/members/agents"
                        className="text-xs text-ink-muted hover:text-ink-heading underline"
                    >
                        Edit agents →
                    </Link>
                </div>
                <p className="text-sm text-ink-body">
                    {hasServices ? "Configured." : "None declared. Nothing can route offers or calls to this wallet directly; nothing else changes."}
                </p>
            </Card>
            </>}

            {/* No wallet: whether publishing would be a first registration or an
                update is the registry's answer for a wallet, unknown until one
                connects; the stake a registration places is read with none. */}
            {!signer && deposit !== undefined && <Card className="p-6 space-y-3" data-testid="review-registration-stake">
                <h2 className="text-heading-h2 text-ink-heading">Registration stake</h2>
                <p className="text-sm text-ink-body">
                    Stake:{" "}
                    <span className="font-semibold text-ink-heading">
                        {formatToken(deposit, activeChain.nativeCurrency.decimals)} tokens of the chain&rsquo;s native token
                    </span>
                    {" "}— a first registration places it on the MembersRegistry, and the
                    member gets it back on leaving the registry, {cooldown}. An update of a
                    registered profile places none.
                </p>
            </Card>}

            {/* Publish — only once the registry has answered for the signer. */}
            {signer && registrationKnown && <Card className="p-6 space-y-3">
                <h2 className="text-heading-h2 text-ink-heading">
                    {isRegistered ? "Update your registered profile" : "Publish"}
                </h2>
                <p className="text-sm text-ink-body">
                    {isRegistered ? (
                        <>
                            Your wallet is already registered. Publishing here re-pins
                            the catalog + profile JSON to IPFS and calls{" "}
                            <code>updateProfile</code> with the new URI. The stake
                            is unaffected.
                        </>
                    ) : (
                        <>
                            Publishing pins your catalog to IPFS, then pins your
                            profile (with the catalog URI embedded), then calls{" "}
                            <code>register(profileURI)</code> on the MembersRegistry,
                            placing the reclaimable stake. One user action; three
                            serial operations.
                        </>
                    )}
                </p>
                {!isRegistered && deposit !== undefined && (
                    <p className="text-sm text-ink-body">
                        Stake:{" "}
                        <span className="font-semibold text-ink-heading">
                            {formatToken(deposit, activeChain.nativeCurrency.decimals)} tokens of the chain&rsquo;s native token
                        </span>
                        {" "}— you get it back when you leave the registry, {cooldown}.
                        Withdrawing de-lists you from discovery; the stake is what
                        keeps you surfaced.
                    </p>
                )}
            </Card>}

            {(pinError || onChainError) && (
                <p className="text-sm text-error-fg" role="alert">
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
                    href="/members/agents"
                    className="text-sm text-ink-muted hover:text-ink-heading transition-colors"
                >
                    ← Back to wizard
                </Link>
                {signer && registrationKnown && (
                    <Button
                        type="button"
                        onClick={handlePublish}
                        disabled={busy || !!error}
                        data-testid="review-confirm-publish"
                    >
                        {isRegistered ? "Update profile" : "Publish & register"}
                    </Button>
                )}
                {!signer && (
                    <div className="flex items-center gap-3">
                        <p className="text-xs text-ink-muted" data-testid="review-publish-needs-wallet">
                            The wallet that registers signs the publish: connect one to publish this draft.
                        </p>
                        <Button type="button" disabled data-testid="review-confirm-publish">
                            Publish
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
