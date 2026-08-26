"use client";

/**
 * MemberEditGate — renders the pre-form gate ladder computed by
 * `useMemberProfileEditor` (loading / redirecting / registry read /
 * IPFS fetch / seeding, plus the unrecoverable fetch-error state).
 * The `/members/edit/*` surfaces render this whenever the editor
 * hook reports a non-null `gate`.
 */

import { Card } from "@/components/ui/Card";
import type { MemberEditGateState } from "@/lib/member/useMemberProfileEditor";

export function MemberEditGate({ gate }: { gate: MemberEditGateState }) {
    if (gate.kind === "error") {
        return (
            <Card className="p-8 space-y-3">
                <p className="text-sm text-error-fg" role="alert">{gate.message}</p>
                <p className="text-xs text-ink-faint">{gate.explainer}</p>
            </Card>
        );
    }
    return <Card className="p-8 text-sm text-ink-faint">{gate.message}</Card>;
}
