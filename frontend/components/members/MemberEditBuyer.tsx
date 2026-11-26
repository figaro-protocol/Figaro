"use client";

/**
 * MemberEditBuyer — re-uses the wizard's buyer form to edit the
 * registered member's `buyerAssemblies` subscriptions and their
 * buyer-posture disclosure entries. Routes from the `/members`
 * manage-list "Buyer" row.
 *
 * One-pin save sequence: re-pin the profile JSON with the updated
 * fields, dispatch MembersRegistry.updateProfile. Seller-posture
 * disclosure entries ride through untouched — the form passes the
 * FULL policy list.
 */

import { MemberEditStep } from "@/components/members/MemberEditGate";
import type { UseMemberProfileEditorResult } from "@/lib/registries/useMemberProfileEditor";
import type {
    BuyerProcessSubscription,
} from "@/lib/registries/memberProfileMetadata";
import { OnboardingBuyerForm } from "@/components/members/OnboardingBuyerForm";

async function saveSubscriptions(editor: UseMemberProfileEditorResult, subscriptions: BuyerProcessSubscription[]): Promise<void> {
    // Absence is the field's no-declaration state: an emptied list CLEARS the field
    // instead of pinning `[]`, so a member who never declared round-trips unchanged.
    if (subscriptions.length > 0) await editor.updater.save({ buyerAssemblies: subscriptions });
    else await editor.updater.save({}, { clear: ["buyerAssemblies"] });
}

export function MemberEditBuyer() {
    return (
        <MemberEditStep seed={(existingProfile, update) => update({ buyerAssemblies: existingProfile.buyerAssemblies ?? [] })}>
            {(editor, chrome) => (
                <OnboardingBuyerForm {...chrome} onSave={(subscriptions) => saveSubscriptions(editor, subscriptions)} />
            )}
        </MemberEditStep>
    );
}
