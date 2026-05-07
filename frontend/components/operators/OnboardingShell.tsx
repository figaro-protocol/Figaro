"use client";

import { ReactNode } from "react";
import { useAccount } from "wagmi";
import { OnboardingStepIndicator } from "@/components/operators/OnboardingStepIndicator";
import { useMounted } from "@/lib/shared/useMounted";
import {
    completedSteps,
    useOnboardingState,
    type OnboardingStep,
} from "@/lib/operators/onboardingState";

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
 * an optional lead paragraph, and the step body. Reads onboarding
 * state from localStorage to drive the completed-steps set.
 *
 * Wallet-not-connected case: each step decides whether to render its
 * own connect-wallet prompt (the welcome screen does not require a
 * wallet; later screens do). The shell does not gate.
 */
export function OnboardingShell({
    stepId,
    title,
    description,
    children,
}: OnboardingShellProps) {
    const mounted = useMounted();
    const { address } = useAccount();
    const { state } = useOnboardingState(address);

    // Until the client has mounted, render the step indicator with only
    // the welcome step marked complete. This matches the server render
    // (no localStorage / no wagmi) regardless of any persisted draft, so
    // hydration is stable.
    const completed = mounted ? completedSteps(state) : new Set<OnboardingStep["id"]>(["welcome"]);

    return (
        <div className="space-y-12">
            <OnboardingStepIndicator currentStepId={stepId} completedStepIds={completed} />
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
