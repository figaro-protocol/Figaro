"use client";

import { useMemo } from "react";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import { DisputeStatusPanel } from "@/components/core/DisputeStatusPanel";
import { getKlerosConfigFromEnv } from "@/lib/dispute/klerosEnv";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";

/**
 * DisputeStatusModule — view-tier wrapper around DisputeStatusPanel.
 *
 * Adapts ModuleProps (processModel, selectedRoleKind) and the Kleros env
 * config into the DisputeStatusPanel surface so the per-role view
 * dashboards can mount jurisdiction status inline. The panel itself does
 * the real work — fetching ruling state, arbitration cost, evidence
 * bundle composition; this module is the moduleSlot adapter.
 *
 * Hidden when no processModel exists (no order selected) or no Kleros
 * proxy is configured in env. The full 5-step dispute submission flow
 * remains at /dispute as a route-tier surface; this module is the
 * inline-status equivalent.
 */
export function DisputeStatusModule({ context }: ModuleProps) {
    const processId = context.processModel?.processId as `0x${string}` | undefined;
    const klerosConfig = useMemo(() => getKlerosConfigFromEnv(), []);
    const orders = useProcessOrders(processId ?? null);

    if (!processId || !klerosConfig) return null;

    const role: "buyer" | "seller" =
        context.selectedRoleKind === "buyer" ? "buyer" : "seller";

    return (
        <DisputeStatusPanel
            processId={processId}
            klerosConfig={klerosConfig}
            role={role}
            orders={orders}
        />
    );
}
