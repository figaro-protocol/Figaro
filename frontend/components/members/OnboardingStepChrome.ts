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
