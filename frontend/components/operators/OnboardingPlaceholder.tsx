"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface OnboardingPlaceholderProps {
    /** What the step will eventually do. */
    description: string;
    /** Sub-path of the previous step (so the back link works). */
    prevPath: string;
    /** Sub-path of the next step. */
    nextPath: string;
}

/**
 * Placeholder body for steps 2–6 while the per-step forms are being
 * built out. Renders a "coming soon" card and prev/next navigation so
 * the wizard skeleton is fully traversable.
 */
export function OnboardingPlaceholder({
    description,
    prevPath,
    nextPath,
}: OnboardingPlaceholderProps) {
    return (
        <div className="space-y-8">
            <Card className="p-6 space-y-3">
                <p className="text-sm text-ink-body">{description}</p>
                <p className="text-sm text-ink-faint">
                    The form for this step is under construction. Use the navigation below to walk through the wizard skeleton.
                </p>
            </Card>
            <div className="flex items-center justify-between">
                <Link
                    href={`/operators/onboard${prevPath ? `/${prevPath}` : ""}`}
                    className="text-sm text-ink-faint hover:text-ink-heading transition-colors"
                >
                    ← Back
                </Link>
                <Link href={`/operators/onboard/${nextPath}`}>
                    <Button>Next →</Button>
                </Link>
            </div>
        </div>
    );
}
