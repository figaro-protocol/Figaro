"use client";

import Link from "next/link";
import { cn } from "@/lib/shared/utils";
import {
    ONBOARDING_STEPS,
    onboardingStepHref,
    type OnboardingStep,
} from "@/lib/member/onboardingState";

interface OnboardingStepIndicatorProps {
    /** id of the currently-rendered step. */
    currentStepId: OnboardingStep["id"];
}

/**
 * Horizontal step-bar shown at the top of every onboarding screen.
 *
 * Position-only rendering: a step is filled (bg-ink-heading +
 * text-paper) if it is the current step OR any step to the left of
 * the current step. Steps to the right of current render as outline
 * (border-default + text-ink-faint). No data-completion check, no
 * `optional` flag effect — the indicator is a pure progress tracker,
 * not a data-state reflection. The form's "Next" handler still gates
 * on data presence; the indicator just doesn't mirror that.
 */
export function OnboardingStepIndicator({
    currentStepId,
}: OnboardingStepIndicatorProps) {
    const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.id === currentStepId);

    return (
        <ol
            className="flex items-center gap-1.5 text-xs"
            aria-label="Onboarding progress"
        >
            {ONBOARDING_STEPS.map((step, index) => {
                const isCurrent = step.id === currentStepId;
                const isPast = index < currentIndex;
                const isVisited = isCurrent || isPast;

                const circleClasses = cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                    isVisited
                        ? "bg-ink-primary text-paper"
                        : "border border-default text-ink-faint",
                );

                // One line on EVERY viewport (maintainer rule 2026-08-06): on
                // small screens only the current step keeps its label — the
                // rest show as numbered circles.
                const labelClasses = cn(
                    "whitespace-nowrap",
                    isCurrent ? "font-semibold text-ink-heading" : "text-ink-faint hidden sm:inline",
                );

                const href = onboardingStepHref(step.id);
                const content = (
                    <span className="flex items-center gap-2">
                        <span className={circleClasses}>{step.number}</span>
                        <span className={labelClasses}>{step.label}</span>
                    </span>
                );

                return (
                    <li
                        key={step.id}
                        className="flex items-center gap-1.5"
                        aria-current={isCurrent ? "step" : undefined}
                    >
                        {isPast ? (
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
                                    "w-3 sm:w-5 h-px",
                                    isPast ? "bg-ink-heading" : "bg-default",
                                )}
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
