import type { ReactNode } from "react";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";

/**
 * The frame both ECDH ceremony panels (AddressDetailPanel, ContentDeliveryPanel)
 * wear: the section, and its title line beside the declaring clause's title.
 */
export function CeremonyPanelFrame({ testId, title, clauseKey, children }: {
    testId: string;
    title: string;
    clauseKey: string;
    children: ReactNode;
}) {
    const clauseTitle = getClauseSpec(clauseKey)?.title ?? clauseKey;
    return (
        <section className="rounded border border-default bg-paper p-4 space-y-3" data-testid={testId}>
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-ink-muted">{title}</p>
                <p className="text-[11px] text-ink-faint">{clauseTitle}</p>
            </div>
            {children}
        </section>
    );
}
