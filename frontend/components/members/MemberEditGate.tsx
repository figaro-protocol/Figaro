"use client";

/**
 * MemberEditGate — renders the pre-form gate ladder computed by
 * `useMemberProfileEditor` (loading / redirecting / registry read /
 * IPFS fetch / seeding). A failed read renders nothing.
 * The `/members/edit/*` surfaces render this whenever the editor
 * hook reports a non-null `gate`.
 *
 * MemberEditStep is the one shape of a `/members/edit/*` surface that
 * re-uses a wizard-step form: it runs the editor with the surface's `seed`,
 * renders the gate while the editor is not ready, and otherwise hands the
 * editor and the edit-mode chrome (submit and back labels, the in-flight
 * state, the save error) to the surface's form.
 */

import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import {
    useMemberProfileEditor,
    type MemberEditGateState,
    type UseMemberProfileEditorOptions,
    type UseMemberProfileEditorResult,
} from "@/lib/registries/useMemberProfileEditor";
import type { OnboardingStepChromeProps } from "@/components/members/OnboardingStepChrome";

export function MemberEditGate({ gate }: { gate: MemberEditGateState }) {
    if (gate.kind === "absent") return null;
    return <Card className="p-8 text-sm text-ink-muted">{gate.message}</Card>;
}

/** The chrome a wizard-step form takes in edit mode: save in place of next,
 *  cancel back to the manage list. */
type MemberEditChrome = Required<OnboardingStepChromeProps>;

function editChrome(editor: UseMemberProfileEditorResult): MemberEditChrome {
    return {
        submitLabel: "Save changes",
        backHref: "/members/manage",
        backLabel: "← Cancel",
        submitInFlight: editor.saveInFlight,
        externalError: editor.externalError,
    };
}

export function MemberEditStep({
    seed,
    children,
}: {
    seed: UseMemberProfileEditorOptions["seed"];
    children: (editor: UseMemberProfileEditorResult, chrome: MemberEditChrome) => ReactNode;
}) {
    const editor = useMemberProfileEditor({ seed });
    if (editor.gate) {
        return <MemberEditGate gate={editor.gate} />;
    }
    return <>{children(editor, editChrome(editor))}</>;
}
