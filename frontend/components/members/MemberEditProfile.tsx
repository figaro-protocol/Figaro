"use client";

/**
 * MemberEditProfile — re-uses the wizard's profile form to edit a
 * registered seller's on-chain profile metadata. Routes from the
 * `/members` manage-list "Identity" row.
 *
 * Scaffold (fetch → seed → save → redirect) lives in
 * `useMemberProfileEditor`; this surface owns the seed shape, the
 * save payload, and the form JSX.
 */

import { MemberEditGate } from "@/components/members/MemberEditGate";
import { useMemberProfileEditor } from "@/lib/member/useMemberProfileEditor";
import { OnboardingProfileForm } from "@/components/members/OnboardingProfileForm";
import type { OnboardingProfileDraft } from "@/lib/member/onboardingState";

export function MemberEditProfile() {
    const editor = useMemberProfileEditor({
        seed: (existingProfile, update) => {
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
        },
    });

    if (editor.gate) {
        return <MemberEditGate gate={editor.gate} />;
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
        await editor.updater.save({
            ...draft,
            location: normalizedLocation,
        });
    }

    return (
        <OnboardingProfileForm
            onSave={handleSave}
            submitLabel="Save changes"
            backHref="/members/manage"
            backLabel="← Cancel"
            submitInFlight={editor.saveInFlight}
            externalError={editor.externalError}
        />
    );
}
