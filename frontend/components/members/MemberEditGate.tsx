"use client";

/**
 * MemberEditGate — renders the pre-form gate ladder computed by
 * `useMemberProfileEditor` (loading / redirecting / registry read /
 * IPFS fetch / seeding). A failed read renders nothing.
 * The `/members/edit/*` surfaces render this whenever the editor
 * hook reports a non-null `gate`.
 */

import { Card } from "@/components/ui/Card";
import type { MemberEditGateState } from "@/lib/member/useMemberProfileEditor";

export function MemberEditGate({ gate }: { gate: MemberEditGateState }) {
    if (gate.kind === "absent") return null;
    return <Card className="p-8 text-sm text-ink-muted">{gate.message}</Card>;
}
