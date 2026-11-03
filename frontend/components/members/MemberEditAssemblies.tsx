"use client";

/**
 * MemberEditAssemblies — re-uses the wizard's assemblies form to
 * edit the registered member's `assemblyBindings`. Routes from
 * the `/members` manage-list "Assemblies" row.
 *
 * One-pin save sequence: re-pin the profile JSON with the updated
 * assemblyBindings array, dispatch MembersRegistry.updateProfile.
 *
 * Removing an assembly (un-checking it in the multi-select) is
 * handled by the form's existing toggle. Whole-assemblies clearing
 * isn't a separate destructive affordance — it's implicit when the
 * user un-checks every assembly. A member with zero bindings is
 * still on-chain registered; the assemblies just don't surface to
 * assembly-scoped discovery.
 */

import { MemberEditGate } from "@/components/members/MemberEditGate";
import { useMemberProfileEditor } from "@/lib/member/useMemberProfileEditor";
import type { AssemblyBindingRecord } from "@/lib/member/memberProfileMetadata";
import { OnboardingAssembliesForm } from "@/components/members/OnboardingAssembliesForm";

export function MemberEditAssemblies() {
    const editor = useMemberProfileEditor({
        seed: (existingProfile, update) => {
            update({
                assemblies: existingProfile.assemblyBindings ?? [],
            });
        },
    });

    if (editor.gate) {
        return <MemberEditGate gate={editor.gate} />;
    }

    async function handleSave(bindings: AssemblyBindingRecord[]): Promise<void> {
        // Saving with an empty array is allowed — un-checking every assembly clears the
        // bindings array on the profile (the member stays registered, with no
        // assembly-scoped discovery). The hook's merge keeps the field present-but-empty.
        await editor.updater.save({ assemblyBindings: bindings });
    }

    return (
        <OnboardingAssembliesForm
            onSave={handleSave}
            submitLabel="Save changes"
            backHref="/members/manage"
            backLabel="← Cancel"
            submitInFlight={editor.saveInFlight}
            externalError={editor.externalError}
        />
    );
}
