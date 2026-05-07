"use client";

/**
 * OperatorEditProfile — re-uses the wizard's profile form to edit a
 * registered operator's on-chain profile metadata. Routes from the
 * `/operators` manage-list "Profile" row.
 *
 * Lifecycle:
 *   1. Fetch the wallet's current on-chain metadataURI (from the
 *      indexer's event-derived state) and the profile JSON behind
 *      it (from IPFS).
 *   2. Seed `useOnboardingState.profile` with the fetched fields so
 *      the shared `OnboardingProfileForm` hydrates pre-populated.
 *   3. Render the form with `onSave` that calls
 *      `useUpdateOperatorProfile.save(...)` — pin merged JSON,
 *      dispatch `updateProfile`.
 *   4. On success, redirect back to `/operators`.
 *
 * Wallet-not-connected and wallet-not-registered cases redirect
 * to `/operators/onboard` (mirrors the redirect-on-miss pattern at
 * `/operators` itself).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/lib/shared/useMounted";
import { useOperatorProfile } from "@/lib/mechanisms/useOperatorRegistry";
import { useOnboardingState } from "@/lib/operators/onboardingState";
import { useUpdateOperatorProfile } from "@/lib/operators/useUpdateOperatorProfile";
import { resolveContentURI } from "@/lib/shared/merchantBranding";
import { tryParseOperatorProfileDocument } from "@/lib/shared/operatorProfileMetadata";
import type { OperatorProfileMetadata } from "@/lib/shared/operatorProfileMetadata";
import { OnboardingProfileForm } from "@/components/operators/OnboardingProfileForm";
import type { OnboardingProfileDraft } from "@/lib/operators/onboardingState";

export function OperatorEditProfile() {
    const router = useRouter();
    const mounted = useMounted();
    const { address, isConnected } = useAccount();
    const { data: registryData, isLoading: registryLoading, refetch } = useOperatorProfile(address);
    const { update, loaded } = useOnboardingState(address);

    const [existingProfile, setExistingProfile] = useState<OperatorProfileMetadata | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [seeded, setSeeded] = useState(false);

    // Redirect unregistered wallets to onboarding.
    useEffect(() => {
        if (!mounted) return;
        if (!isConnected) {
            router.replace("/operators/onboard");
            return;
        }
        if (!registryLoading && !registryData) {
            router.replace("/operators/onboard");
        }
    }, [mounted, isConnected, registryLoading, registryData, router]);

    // Fetch the on-chain profile JSON.
    useEffect(() => {
        if (!registryData) return;
        const [metadataURI] = registryData;
        const url = resolveContentURI(metadataURI);
        if (!url) {
            setFetchError("Profile URI couldn't be resolved.");
            return;
        }
        let cancelled = false;
        fetch(url)
            .then((r) => r.json())
            .then((doc) => {
                if (cancelled) return;
                const parsed = tryParseOperatorProfileDocument(doc);
                if (parsed) {
                    setExistingProfile(parsed);
                } else {
                    setFetchError("Profile JSON didn't parse as an operator profile.");
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
            slug: existingProfile.slug,
            description: existingProfile.description,
            specialty: existingProfile.specialty,
            location: existingProfile.location,
            branding: existingProfile.branding,
            assets: existingProfile.assets,
            acceptedTokens: existingProfile.acceptedTokens,
            defaultTokenAddress: existingProfile.defaultTokenAddress,
        };
        update({ profile: draft });
        setSeeded(true);
    }, [seeded, loaded, existingProfile, update]);

    const updater = useUpdateOperatorProfile(existingProfile);

    // Redirect back to /operators on a confirmed update.
    useEffect(() => {
        if (updater.isSuccess) {
            // Small UX nicety: refetch the registry-side data so the
            // landing page shows the new metadataURI without a full
            // reload.
            refetch();
            router.push("/operators");
        }
    }, [updater.isSuccess, refetch, router]);

    if (!mounted || !isConnected || registryLoading || !registryData) {
        return <Card className="p-8 text-sm text-ink-faint">Loading…</Card>;
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

    if (!existingProfile || !seeded) {
        return <Card className="p-8 text-sm text-ink-faint">Loading profile…</Card>;
    }

    async function handleSave(draft: OnboardingProfileDraft): Promise<void> {
        // The draft shape lines up with the top-level
        // OperatorProfileMetadata fields it edits — pass through. The
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
            backHref="/operators"
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
