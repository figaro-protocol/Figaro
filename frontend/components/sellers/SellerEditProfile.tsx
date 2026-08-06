"use client";

/**
 * SellerEditProfile — re-uses the wizard's profile form to edit a
 * registered seller's on-chain profile metadata. Routes from the
 * `/members` manage-list "Identity" row.
 *
 * Lifecycle:
 *   1. Fetch the wallet's current on-chain metadataURI (from the
 *      indexer's event-derived state) and the profile JSON behind
 *      it (from IPFS).
 *   2. Seed `useOnboardingState.profile` with the fetched fields so
 *      the shared `OnboardingProfileForm` hydrates pre-populated.
 *   3. Render the form with `onSave` that calls
 *      `useUpdateMemberProfile.save(...)` — pin merged JSON,
 *      dispatch `updateProfile`.
 *   4. On success, redirect back to `/members`.
 *
 * Wallet-not-connected and wallet-not-registered cases redirect
 * to `/members` (mirrors the redirect-on-miss pattern at
 * `/members` itself).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/hooks/useMounted";
import { useMemberProfile } from "@/lib/member/useMembersRegistry";
import { useOnboardingState } from "@/lib/seller/onboardingState";
import { useUpdateMemberProfile } from "@/lib/member/useUpdateMemberProfile";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import type { MemberProfileMetadata } from "@/lib/member/memberProfileMetadata";
import { OnboardingProfileForm } from "@/components/sellers/OnboardingProfileForm";
import type { OnboardingProfileDraft } from "@/lib/seller/onboardingState";

export function SellerEditProfile() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { data: registryData, isLoading: registryLoading } = useMemberProfile(address);
    const { update, loaded } = useOnboardingState(address);

    const [existingProfile, setExistingProfile] = useState<MemberProfileMetadata | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [seeded, setSeeded] = useState(false);

    const updater = useUpdateMemberProfile(existingProfile, registryData?.[0] ?? null);
    const saveInFlight = updater.isPending || updater.isConfirming;

    // Redirect unregistered wallets to onboarding — but only on SETTLED
    // state (`!registryLoading && !registryData` = a completed scan found
    // nothing; isLoading starts true in useMemberProfile), and never
    // mid-save: the redirect unmounts the form and kills the in-flight
    // pin/tx (2026-07-09 e2e flake).
    useEffect(() => {
        if (!mounted || saveInFlight) return;
        if (!isConnected) {
            router.replace("/members");
            return;
        }
        if (!registryLoading && !registryData) {
            router.replace("/members");
        }
    }, [mounted, saveInFlight, isConnected, registryLoading, registryData, router]);

    // Fetch the on-chain profile JSON.
    useEffect(() => {
        if (!registryData) return;
        const [metadataURI] = registryData;
        let cancelled = false;
        // The ONE cached profile read path (lib/seller/profileFetcher).
        fetchMemberProfile(metadataURI)
            .then((parsed) => {
                if (cancelled) return;
                if (parsed) {
                    setExistingProfile(parsed);
                } else {
                    setFetchError("Couldn't fetch or parse the member profile.");
                }
            })
            .catch(() => {
                if (!cancelled) setFetchError("Couldn't fetch profile from IPFS.");
            });
        return () => {
            cancelled = true;
        };
    }, [registryData]);

    // Seed the wizard's localStorage-backed state with the fetched
    // profile so OnboardingProfileForm hydrates pre-populated. The
    // form's hydration gate (useOnboardingState `loaded` flag) is
    // honored — we wait for `loaded` before writing.
    useEffect(() => {
        if (seeded) return;
        if (!loaded) return;
        if (!existingProfile) return;
        const draft: OnboardingProfileDraft = {
            name: existingProfile.name,
            description: existingProfile.description,
            specialty: existingProfile.specialty,
            location: existingProfile.location,
            branding: existingProfile.branding,
            assets: existingProfile.assets,
            acceptedTokens: existingProfile.acceptedTokens,
            defaultTokenAddress: existingProfile.defaultTokenAddress,
            profileClauseValues: existingProfile.profileClauseValues,
        };
        update({ profile: draft });
        setSeeded(true);
    }, [seeded, loaded, existingProfile, update]);

    // Redirect back to /sellers on a confirmed update. No refetch here:
    // `useMemberProfile` is per-call-site local state, so refetching this
    // component's instance can't refresh /sellers (which has its own) —
    // and the synchronous re-render + re-fetch it kicked raced the
    // router.push navigation. /sellers reads fresh on mount regardless.
    useEffect(() => {
        if (updater.isSuccess) {
            router.push("/members");
        }
    }, [updater.isSuccess, router]);

    if (!mounted) {
        return <Card className="p-8 text-sm text-ink-faint">Loading…</Card>;
    }
    if (!isConnected) {
        return <Card className="p-8 text-sm text-ink-faint">Redirecting…</Card>;
    }
    if (registryLoading || !registryData) {
        return <Card className="p-8 text-sm text-ink-faint">Reading registry…</Card>;
    }

    if (fetchError) {
        return (
            <Card className="p-8 space-y-3">
                <p className="text-sm text-red-600" role="alert">{fetchError}</p>
                <p className="text-xs text-ink-faint">
                    Couldn&apos;t load the existing profile, so editing it isn&apos;t safe — saving without the existing fields would clobber them.
                </p>
            </Card>
        );
    }

    if (!existingProfile) {
        return <Card className="p-8 text-sm text-ink-faint">Fetching profile from IPFS…</Card>;
    }
    if (!seeded) {
        return <Card className="p-8 text-sm text-ink-faint">Setting up editor…</Card>;
    }

    async function handleSave(draft: OnboardingProfileDraft): Promise<void> {
        // The draft shape lines up with the top-level
        // MemberProfileMetadata fields it edits — pass through. The
        // only structural difference is `location.geohash`: the draft
        // marks it optional, the on-chain shape requires a string.
        // Default to "" so the merge doesn't widen the on-chain type.
        const normalizedLocation = draft.location
            ? {
                geohash: draft.location.geohash ?? "",
                addressText: draft.location.addressText,
            }
            : undefined;
        await updater.save({
            ...draft,
            location: normalizedLocation,
        });
    }

    return (
        <OnboardingProfileForm
            onSave={handleSave}
            submitLabel="Save changes"
            backHref="/members"
            backLabel="← Cancel"
            submitInFlight={updater.isPending || updater.isConfirming}
            externalError={
                updater.error
                    ? (updater.error.message ?? String(updater.error))
                    : null
            }
        />
    );
}
