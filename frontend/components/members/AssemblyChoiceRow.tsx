"use client";

/**
 * One assembly row in a wizard multi-select (the seller BINDS on the
 * assemblies step, the buyer SUBSCRIBES on the buyer step — same row,
 * different verb): checkbox + name + the designer's summary + slug + shape
 * line + network targets + an Inspect link into the designer's read-only view.
 *
 * The name and the summary are the designer's own words, read from the pinned
 * template; the slug is secondary, and is all a reader gets when the template
 * carries no editorial prose (or has not resolved yet) — never invented words.
 *
 * `children` renders inside the Card below the row (e.g. the seller step's
 * counterparty editors for a checked row).
 *
 * `testIdPrefix` namespaces the row/shape/inspect testids — these are
 * e2e contracts (`seller-assembly-*` / `buyer-assembly-*`); keep them
 * stable.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { AssemblyChoice } from "@/lib/protocol/assemblyChoices";
import { AssemblyShapeLine } from "@/components/assemblies/AssemblyShapeLine";

export function AssemblyChoiceRow({
    choice,
    checked,
    onToggle,
    testIdPrefix,
    children,
}: {
    choice: AssemblyChoice;
    checked: boolean;
    onToggle: () => void;
    testIdPrefix: string;
    children?: ReactNode;
}) {
    return (
        <Card
            className={`p-4 transition-colors ${checked ? "border-ink-heading" : ""}`}
            data-testid={`${testIdPrefix}-row-${choice.slug}`}
        >
            <div className="flex items-start gap-3">
                <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={onToggle}
                        className="mt-1 accent-accent"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold text-ink-heading truncate">
                                {choice.name}
                            </span>
                            <code className="text-xs text-ink-faint font-mono shrink-0">
                                {choice.slug}
                            </code>
                        </div>
                        {choice.summary && (
                            <p
                                className="text-xs text-ink-body"
                                data-testid={`${testIdPrefix}-summary-${choice.slug}`}
                            >
                                {choice.summary}
                            </p>
                        )}
                        <AssemblyShapeLine
                            choice={choice}
                            className="text-[11px]"
                            testId={`${testIdPrefix}-shape-${choice.slug}`}
                        />
                        <p className="text-xs text-ink-faint">
                            Networks: {choice.networkTargets.join(", ")}
                        </p>
                    </div>
                </label>
                <Link
                    href={`/assemblies/designer/view?slug=${encodeURIComponent(choice.slug)}`}
                    target="_blank"
                    rel="noopener"
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong text-ink-body text-center shrink-0"
                    data-testid={`${testIdPrefix}-inspect-${choice.slug}`}
                >
                    Inspect ↗
                </Link>
            </div>
            {children}
        </Card>
    );
}
