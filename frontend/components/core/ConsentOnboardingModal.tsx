"use client";

/**
 * ConsentOnboardingModal — first-session welcome shown after the consent
 * ceremony lands.
 *
 * Triggered once per browser by `app/(app)/consent/page.tsx` after the user
 * signs and hits "Continue to app". A localStorage flag (`figaro-onboarding-shown`)
 * prevents re-display on subsequent sessions; a participant who clears
 * storage will see it again on next consent.
 *
 * Pattern adapted from `OnboardingBanner.tsx` (localStorage-keyed
 * one-shot). Rendered as a centered overlay rather than an inline banner
 * because the welcome content is meant to be read before the runtime is
 * touched.
 *
 * Scope: copy only. This dispatch does not build the in-app feedback form
 * referenced under "How to give feedback"; that is a follow-on. The placeholder
 * text describes what the participant should expect.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

const STORAGE_KEY = "figaro-onboarding-shown";

export interface ConsentOnboardingModalProps {
    /** Caller's dismiss handler — typically `setShowOnboarding(false)`. */
    onDismiss: () => void;
}

export function ConsentOnboardingModal({ onDismiss }: ConsentOnboardingModalProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            if (!window.localStorage.getItem(STORAGE_KEY)) {
                setVisible(true);
            } else {
                // Already seen — call the parent's dismiss so it can clean up state.
                onDismiss();
            }
        } catch {
            // localStorage unavailable — show once per render.
            setVisible(true);
        }
        // Intentional: only on mount; parent owns onDismiss identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const dismiss = () => {
        try {
            window.localStorage.setItem(STORAGE_KEY, "1");
        } catch {
            // localStorage unavailable — fall through.
        }
        setVisible(false);
        onDismiss();
    };

    if (!visible) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-onboarding-title"
            data-testid="consent-onboarding-modal"
        >
            <div className="bg-white rounded-lg border border-neutral-200 max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                <header>
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                        Welcome
                    </p>
                    <h2 id="consent-onboarding-title" className="text-xl font-bold text-black mt-1">
                        Figaro Beta
                    </h2>
                </header>

                <section className="space-y-3 text-sm text-neutral-700">
                    <div>
                        <h3 className="font-semibold text-black mb-1">What you are testing</h3>
                        <p>
                            The Figaro runtime — the user-facing surfaces (terminal,
                            operators, designer, financials, /verify, audit-bundle
                            export) — running against a development chain. No real
                            funds are at risk.
                        </p>
                    </div>

                    <div>
                        <h3 className="font-semibold text-black mb-1">Watermark and artifact custody</h3>
                        <p>
                            Every page in this beta carries your access code as a
                            small QR in the bottom-right corner. The watermark is
                            the link between you and your session — please do not
                            share screenshots that omit it. The wallet address you
                            connect is regenerable; the access code is not.
                        </p>
                    </div>

                    <div>
                        <h3 className="font-semibold text-black mb-1">Giving feedback</h3>
                        <p>
                            Report bugs, friction, and surprises through the
                            in-app feedback channel (coming soon) or directly to
                            the Operator at the address from your beta invitation.
                            Concrete examples — what you tried, what you saw,
                            what you expected — are most useful.
                        </p>
                    </div>

                    <div>
                        <h3 className="font-semibold text-black mb-1">Reaching the Operator</h3>
                        <p>
                            For questions about the beta, withdrawal, or anything
                            else, contact the Operator at the address provided in
                            your invitation. You may stop participating at any time
                            without penalty.
                        </p>
                    </div>

                    <div>
                        <h3 className="font-semibold text-black mb-1">Disputes and escalation</h3>
                        <p>
                            If you believe the Agreement has been breached or
                            something has gone seriously wrong, contact the
                            Operator first — most issues resolve directly. If a
                            dispute remains unresolved, the formal escalation per
                            §10 of the Agreement is <strong>Kleros</strong>, the
                            decentralized arbitration protocol. You may invoke
                            Kleros independently using your consent receipt PDF as
                            evidence; the receipt contains the signed message and
                            document hash needed to make a case. A project-side
                            dispute submission flow is available at{" "}
                            <a
                                href="/dispute"
                                className="underline"
                                data-testid="onboarding-dispute-link"
                            >
                                /dispute
                            </a>
                            .
                        </p>
                    </div>
                </section>

                <Button
                    onClick={dismiss}
                    data-testid="btn-onboarding-dismiss"
                    className="w-full"
                >
                    I understand — continue
                </Button>
            </div>
        </div>
    );
}
