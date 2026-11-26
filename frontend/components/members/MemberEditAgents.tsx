"use client";

/**
 * MemberEditAgents — re-uses the wizard's agents form to edit
 * the registered member's ERC-8004 service endpoints. Routes
 * from the `/members` manage-list "Agents" row.
 *
 * One-pin save sequence: re-pin profile JSON with updated
 * `services` field, dispatch MembersRegistry.updateProfile.
 *
 * Per-endpoint clearing is handled in the form (blank a field to
 * remove that endpoint). Whole-services clearing is implicit when
 * every field is blank — the submit payload becomes `undefined`
 * and the merge (with `clear: ["services"]`) strips the field
 * entirely from the on-chain profile.
 *
 * Per `reference_erc8004_interop_only.md`: Figaro doesn't depend on
 * ERC-8004; these endpoints are an OPTIONAL cross-protocol
 * discoverability convention. They declare REACHABILITY, not what
 * runs the wallet — saving with no endpoints is a normal state, and
 * leaves the wallet simply unreachable for inbound coordination.
 */

import { MemberEditStep } from "@/components/members/MemberEditGate";
import type { UseMemberProfileEditorResult } from "@/lib/registries/useMemberProfileEditor";
import type { MemberAgentServices } from "@/lib/registries/memberProfileMetadata";
import { OnboardingAgentsForm } from "@/components/members/OnboardingAgentsForm";

async function saveServices(editor: UseMemberProfileEditorResult, services: MemberAgentServices | undefined): Promise<void> {
    if (services === undefined) {
        // Caller blanked every field — clear the field entirely
        // from the on-chain profile rather than leaving an empty
        // object behind.
        await editor.updater.save({}, { clear: ["services"] });
    } else {
        await editor.updater.save({ services });
    }
}

export function MemberEditAgents() {
    return (
        <MemberEditStep seed={(existingProfile, update) => update({ services: existingProfile.services })}>
            {(editor, chrome) => (
                <OnboardingAgentsForm {...chrome} onSave={(services) => saveServices(editor, services)} />
            )}
        </MemberEditStep>
    );
}
