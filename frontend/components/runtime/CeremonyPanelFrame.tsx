import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";

/**
 * The frame the ECDH ceremony panels (AddressDetailPanel, ContentDeliveryPanel,
 * PrivateFilingsPanel) wear: the section, and its title line beside the
 * declaring clause's title where one clause declared the ceremony.
 */
export function CeremonyPanelFrame({ testId, title, clauseKey, children }: {
    testId: string;
    title: string;
    clauseKey?: string;
    children: ReactNode;
}) {
    const clauseTitle = clauseKey ? getClauseSpec(clauseKey)?.title ?? clauseKey : null;
    return (
        <section className="rounded border border-default bg-paper p-4 space-y-3" data-testid={testId}>
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-ink-muted">{title}</p>
                {clauseTitle && <p className="text-[11px] text-ink-muted">{clauseTitle}</p>}
            </div>
            {children}
        </section>
    );
}

/**
 * The request control every ceremony panel shows the receiving party: one
 * click, one wallet signature over this tab's temporary public key. Once
 * the request is sent it names the seat it waits on (`waitingLabel`).
 */
export function CeremonyRequestButton({ label, waitingLabel, requested, busy, ready, onRequest, testId }: {
    label: string;
    waitingLabel: string;
    requested: boolean;
    busy: boolean;
    /** False until the channel is ready and a wallet can sign. */
    ready: boolean;
    onRequest: () => Promise<void>;
    testId: string;
}) {
    return (
        <Button
            type="button"
            variant="outline"
            size="compact"
            onClick={() => void onRequest()}
            disabled={busy || !ready || requested}
            data-testid={testId}
            className="py-1.5 rounded border-default text-ink-body hover:bg-paper hover:border-default-strong"
        >
            {requested ? waitingLabel : busy ? "Requesting…" : label}
        </Button>
    );
}
