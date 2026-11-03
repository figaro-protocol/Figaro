import { useCallback, useState } from "react";

/**
 * The chrome every wizard-step form in `components/members/Onboarding*Form.tsx`
 * shares: submit/back labels and hrefs the caller may override, plus the
 * in-flight/error state an edit-mode caller (driving its own `onSave`) needs
 * to surface. Each form's own `*FormProps` extends this and adds its own
 * `onSave` signature (the payload differs per step).
 */
export interface OnboardingStepChromeProps {
    /** Submit-button label override. Defaults to "Next →". */
    submitLabel?: string;
    /** Back-link href override. Defaults to the step's own wizard predecessor. */
    backHref?: string;
    /** Back-link label override. Defaults to "← Back". */
    backLabel?: string;
    /** Whether the submit is currently in flight. Suppresses double-submission. */
    submitInFlight?: boolean;
    /** External error from `onSave` to render alongside the form's own validation summary. */
    externalError?: string | null;
}

/**
 * The submit tail every wizard-step form shares: in edit mode the caller's
 * `save` runs and the wizard navigation is suppressed (the caller decides when
 * and where to redirect, and surfaces a failure via `externalError`, so the
 * rejection is swallowed here to keep React's unhandled-rejection logger
 * quiet); otherwise the wizard `advance`s.
 */
export function finishStep(save: (() => Promise<void>) | undefined, advance: () => void): void {
    if (save) {
        save().catch(() => {});
        return;
    }
    advance();
}

/** A copy of `set` with `key` removed when present, added when absent. */
export function toggledSet<K>(set: ReadonlySet<K>, key: K): Set<K> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
}

/**
 * A step's draft is read into its local state once per subject (the wallet, or the
 * anonymous draft before one connects): `markHydrated()` flips `hydrated` for the
 * current subject, and a new subject starts unhydrated.
 */
export function useSubjectHydration(subject: string) {
    const [hydratedFor, setHydratedFor] = useState<string | null>(null);
    const markHydrated = useCallback(() => setHydratedFor(subject), [subject]);
    return { hydrated: hydratedFor === subject, markHydrated };
}
