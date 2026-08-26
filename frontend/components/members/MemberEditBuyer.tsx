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

import { MemberEditGate } from "@/components/members/MemberEditGate";
import { useMemberProfileEditor } from "@/lib/member/useMemberProfileEditor";
import type {
    BuyerAssemblySubscription,
    DisclosurePolicyEntry,
    MemberProfileMetadata,
} from "@/lib/member/memberProfileMetadata";
import { OnboardingBuyerForm } from "@/components/members/OnboardingBuyerForm";

export function MemberEditBuyer() {
    const editor = useMemberProfileEditor({
        errorNoun: "the buyer side",
        seed: (existingProfile, update) => {
            update({
                buyerAssemblies: existingProfile.buyerAssemblies ?? [],
                disclosurePolicy: existingProfile.disclosurePolicy ?? [],
            });
        },
    });

    if (editor.gate) {
        return <MemberEditGate gate={editor.gate} />;
    }

    async function handleSave(
        subscriptions: BuyerAssemblySubscription[],
        disclosurePolicy: DisclosurePolicyEntry[],
    ): Promise<void> {
        // Absence is each field's no-declaration state — an emptied list
        // CLEARS the field instead of pinning `[]`, so a member who never
        // declared round-trips unchanged.
        const patch: Partial<MemberProfileMetadata> = {};
        const clear: ("buyerAssemblies" | "disclosurePolicy")[] = [];
        if (subscriptions.length > 0) patch.buyerAssemblies = subscriptions;
        else clear.push("buyerAssemblies");
        if (disclosurePolicy.length > 0) patch.disclosurePolicy = disclosurePolicy;
        else clear.push("disclosurePolicy");
        await editor.updater.save(patch, clear.length > 0 ? { clear } : undefined);
    }

    return (
        <OnboardingBuyerForm
            onSave={handleSave}
            submitLabel="Save changes"
            backHref="/members/manage"
            backLabel="← Cancel"
            submitInFlight={editor.saveInFlight}
            externalError={editor.externalError}
        />
    );
}
