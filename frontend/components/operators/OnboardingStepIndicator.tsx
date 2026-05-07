"use client";

import Link from "next/link";
import { cn } from "@/lib/shared/utils";
import {
    ONBOARDING_STEPS,
    type OnboardingStep,
} from "@/lib/operators/onboardingState";

interface OnboardingStepIndicatorProps {
    /** id of the currently-rendered step. */
    currentStepId: OnboardingStep["id"];
    /** Set of step ids the user has completed (renders with a check-style accent). */
    completedStepIds: Set<OnboardingStep["id"]>;
}

/**
 * Horizontal step-bar shown at the top of every onboarding screen.
 * Each step is rendered as a number circle + label. Completed steps
 * link back to their screen so the user can revisit; the current step
 * is highlighted; future steps are dimmed and not linked.
 */
export function OnboardingStepIndicator({
    currentStepId,
    completedStepIds,
}: OnboardingStepIndicatorProps) {
    const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.id === currentStepId);

    return (
        <ol
            className="flex items-center gap-2 text-xs"
            aria-label="Onboarding progress"
        >
            {ONBOARDING_STEPS.map((step, index) => {
                const isCurrent = step.id === currentStepId;
                const isCompleted = completedStepIds.has(step.id);
                const isPast = index < currentIndex;
                const isReachable = isCompleted || isPast || isCurrent;

                const circleClasses = cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                    isCurrent
                        ? "bg-ink-heading text-paper"
                        : isCompleted
                            ? "bg-ink-heading text-paper"
                            : "border border-default text-ink-faint",
                );

                const labelClasses = cn(
                    "whitespace-nowrap",
                    isCurrent ? "font-semibold text-ink-heading" : "text-ink-faint",
                );

                const href = `/operators/onboard${step.path ? `/${step.path}` : ""}`;
                const content = (
                    <span className="flex items-center gap-2">
                        <span className={circleClasses}>{step.number}</span>
                        <span className={labelClasses}>{step.label}</span>
                    </span>
                );

                return (
                    <li key={step.id} className="flex items-center gap-2">
                        {isReachable && !isCurrent ? (
                            <Link href={href} className="hover:text-ink-heading transition-colors">
                                {content}
                            </Link>
                        ) : (
                            content
                        )}
                        {index < ONBOARDING_STEPS.length - 1 && (
                            <span
                                aria-hidden="true"
                                className={cn(
                                    "w-6 h-px",
                                    isCompleted || isPast ? "bg-ink-heading" : "bg-default",
                                )}
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
