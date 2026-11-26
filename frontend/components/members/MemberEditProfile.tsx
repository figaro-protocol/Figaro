"use client";

/**
 * MemberEditProfile — re-uses the wizard's profile form to edit a
 * registered member's on-chain profile metadata. Routes from the
 * `/members` manage-list "Identity" row.
 *
 * Scaffold (fetch → seed → save → redirect) lives in
 * `useMemberProfileEditor`; this surface owns the seed shape, the
 * save payload, and the form JSX.
 */

import { MemberEditStep } from "@/components/members/MemberEditGate";
import type { UseMemberProfileEditorOptions, UseMemberProfileEditorResult } from "@/lib/registries/useMemberProfileEditor";
import { OnboardingProfileForm } from "@/components/members/OnboardingProfileForm";
import type { OnboardingProfileDraft } from "@/lib/registries/onboardingState";

const seedProfile: UseMemberProfileEditorOptions["seed"] = (existingProfile, update) => {
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
};

export function MemberEditProfile() {
    return (
        <MemberEditStep seed={seedProfile}>
            {(editor, chrome) => (
                <OnboardingProfileForm {...chrome} onSave={(draft) => saveProfile(editor, draft)} />
            )}
        </MemberEditStep>
    );
}

async function saveProfile(editor: UseMemberProfileEditorResult, draft: OnboardingProfileDraft): Promise<void> {
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
