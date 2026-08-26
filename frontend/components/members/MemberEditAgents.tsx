"use client";

/**
 * MemberEditAgents — re-uses the wizard's agents form to edit
 * the registered seller's ERC-8004 service endpoints. Routes
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

import { MemberEditGate } from "@/components/members/MemberEditGate";
import { useMemberProfileEditor } from "@/lib/member/useMemberProfileEditor";
import type { MemberAgentServices } from "@/lib/member/memberProfileMetadata";
import { OnboardingAgentsForm } from "@/components/members/OnboardingAgentsForm";

export function MemberEditAgents() {
    const editor = useMemberProfileEditor({
        errorNoun: "the agent endpoints",
        seed: (existingProfile, update) => {
            update({ services: existingProfile.services });
        },
    });

    if (editor.gate) {
        return <MemberEditGate gate={editor.gate} />;
    }

    async function handleSave(services: MemberAgentServices | undefined): Promise<void> {
        if (services === undefined) {
            // Caller blanked every field — clear the field entirely
            // from the on-chain profile rather than leaving an empty
            // object behind.
            await editor.updater.save({}, { clear: ["services"] });
        } else {
            await editor.updater.save({ services });
        }
    }

    return (
        <OnboardingAgentsForm
            onSave={handleSave}
            submitLabel="Save changes"
            backHref="/members/manage"
            backLabel="← Cancel"
            submitInFlight={editor.saveInFlight}
            externalError={editor.externalError}
        />
    );
}
