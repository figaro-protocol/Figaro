"use client";

import { ReactNode } from "react";
import { OnboardingStepIndicator } from "@/components/members/OnboardingStepIndicator";
import { type OnboardingStep } from "@/lib/member/onboardingState";

interface OnboardingShellProps {
    stepId: OnboardingStep["id"];
    title: string;
    /** Lead paragraph rendered below the title. */
    description?: ReactNode;
    /** Step body. */
    children: ReactNode;
}

/**
 * Per-step layout primitive. Renders the step indicator, a title,
 * an optional lead paragraph, and the step body.
 *
 * Wallet-not-connected case: each step decides whether to render its
 * own connect-wallet prompt (the doorway does not require a
 * wallet; later screens do). The shell does not gate.
 */
export function OnboardingShell({
    stepId,
    title,
    description,
    children,
}: OnboardingShellProps) {
    return (
        <div className="space-y-12">
            <OnboardingStepIndicator currentStepId={stepId} />
            <header className="space-y-4">
                <h1 className="text-heading-h1 text-ink-heading">{title}</h1>
                {description && (
                    <div className="text-body-lead text-ink-body">{description}</div>
                )}
            </header>
            <div>{children}</div>
        </div>
    );
}
