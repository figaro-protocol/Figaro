"use client";

/**
 * MemberEditAssemblies — re-uses the wizard's assemblies form to
 * edit the registered member's `processBindings`. Routes from
 * the `/members` manage-list "Assemblies" row.
 *
 * One-pin save sequence: re-pin the profile JSON with the updated
 * processBindings array, dispatch MembersRegistry.updateProfile.
 *
 * Removing an assembly (un-checking it in the multi-select) is
 * handled by the form's existing toggle. Whole-assemblies clearing
 * isn't a separate destructive affordance — it's implicit when the
 * user un-checks every assembly. A member with zero bindings is
 * still on-chain registered; the assemblies just don't surface to
 * assembly-scoped discovery.
 */

import { MemberEditStep } from "@/components/members/MemberEditGate";
import type { ProcessBindingRecord } from "@/lib/registries/memberProfileMetadata";
import { OnboardingAssembliesForm } from "@/components/members/OnboardingAssembliesForm";

export function MemberEditAssemblies() {
    return (
        <MemberEditStep seed={(existingProfile, update) => update({ assemblies: existingProfile.processBindings ?? [] })}>
            {(editor, chrome) => (
                <OnboardingAssembliesForm
                    {...chrome}
                    // Saving with an empty array is allowed — un-checking every assembly clears the
                    // bindings array on the profile (the member stays registered, with no
                    // assembly-scoped discovery). The hook's merge keeps the field present-but-empty.
                    onSave={(bindings: ProcessBindingRecord[]) => editor.updater.save({ processBindings: bindings })}
                />
            )}
        </MemberEditStep>
    );
}
