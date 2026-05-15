"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import { Card } from "@/components/ui/Card";
import { DisputeStatusPanel } from "@/components/core/DisputeStatusPanel";
import { getKlerosConfigFromEnv } from "@/lib/dispute/klerosEnv";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { loadAgreement } from "@/lib/core/agreementStore";
import { summarizeAgreement } from "@/lib/core/orderAgreement";
import type { Order } from "@/lib/core/store";
import { hexEqual } from "@/lib/shared/evm";

interface Layer3Summary {
    applicableLaw: string;
    forum?: string;
    language?: string;
}

/**
 * Walks the process's orders, loads each agreement, and returns the first
 * jurisdiction summary that carries a Layer-3 field (`applicableLaw`).
 *
 * Per-order jurisdiction divergence is rare but possible — when it
 * happens, the audit-bundle PDF surfaces the per-order detail. This
 * helper picks the first to display in the runtime panel.
 */
function pickLayer3Summary(orders: readonly Order[]): Layer3Summary | null {
    for (const order of orders) {
        if (!order.agreementHash) continue;
        const agreement = loadAgreement(order.agreementHash);
        const data = summarizeAgreement(agreement)?.jurisdiction;
        if (!data) continue;
        const applicableLaw = data.applicableLaw;
        if (typeof applicableLaw !== "string" || applicableLaw.length === 0) continue;
        const forum = typeof data.forum === "string" && data.forum.length > 0
            ? data.forum
            : undefined;
        const language = typeof data.language === "string" && data.language.length > 0
            ? data.language
            : undefined;
        return { applicableLaw, forum, language };
    }
    return null;
}

/**
 * DisputeStatusModule — three-layer jurisdiction display.
 *
 * Mirrors the drawer's JurisdictionArticle by composing all three layers
 * at runtime when `figaro-jurisdiction-v1` is included in the assembly:
 *
 *   Layer 1 — Bonded settlement (always-active kernel mechanism).
 *   Layer 2 — Kleros decentralized arbitration (when proxy configured).
 *   Layer 3 — State / ADR (when `applicableLaw` is set in agreement).
 *
 * Hidden when no `processModel` exists (no order selected). Otherwise
 * always renders Layer 1; Layer 2 surfaces when the Kleros env config is
 * present; Layer 3 surfaces when any order's agreement carries an
 * `applicableLaw` value.
 */
export function DisputeStatusModule({ context }: ModuleProps) {
    const processId = context.processModel?.processId as `0x${string}` | undefined;
    const klerosConfig = useMemo(() => getKlerosConfigFromEnv(), []);
    const orders = useProcessOrders(processId ?? null);
    const layer3 = useMemo(() => pickLayer3Summary(orders), [orders]);
    const { address } = useAccount();

    if (!processId) return null;

    // Kernel-derived: connected wallet is the rootBuyer of this process iff it
    // matches the root order's buyer field. Otherwise treat as seller-of-record.
    const rootOrder = orders.find((o) => o.id === processId);
    const role: "buyer" | "seller" =
        address && rootOrder && hexEqual(address, rootOrder.buyer) ? "buyer" : "seller";

    return (
        <div className="space-y-3">
            {/* Layer 1 — Bonded settlement (always-active) */}
            <Card className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">
                    Bonded settlement (Layer 1, active)
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                    Kernel-level economic protection: the buyer&apos;s 2P bond and
                    the seller&apos;s P + 2G bond remain locked until the buyer
                    resolves the process. Defecting on the agreement burns bond
                    value on both sides. Direct settlement between the parties
                    remains available at any time.
                </p>
            </Card>

            {/* Layer 2 — Kleros decentralized arbitration */}
            {klerosConfig && (
                <DisputeStatusPanel
                    processId={processId}
                    klerosConfig={klerosConfig}
                    role={role}
                    orders={orders}
                />
            )}

            {/* Layer 3 — State / ADR (only when applicableLaw is set) */}
            {layer3 && (
                <Card className="p-4" data-testid="dispute-layer3-state-adr">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        State / ADR (Layer 3, committed)
                    </h3>
                    <dl className="space-y-1 text-xs text-gray-700">
                        <div className="flex gap-2">
                            <dt className="font-medium text-gray-500 min-w-[7rem]">
                                Applicable law
                            </dt>
                            <dd data-testid="dispute-layer3-applicable-law">
                                {layer3.applicableLaw}
                            </dd>
                        </div>
                        {layer3.forum && (
                            <div className="flex gap-2">
                                <dt className="font-medium text-gray-500 min-w-[7rem]">
                                    Forum
                                </dt>
                                <dd data-testid="dispute-layer3-forum">
                                    {layer3.forum}
                                </dd>
                            </div>
                        )}
                        {layer3.language && (
                            <div className="flex gap-2">
                                <dt className="font-medium text-gray-500 min-w-[7rem]">
                                    Language
                                </dt>
                                <dd data-testid="dispute-layer3-language">
                                    {layer3.language}
                                </dd>
                            </div>
                        )}
                    </dl>
                    <p className="mt-2 text-[11px] text-gray-500 leading-tight">
                        These terms are baked into the per-order agreement and
                        surface in the audit-bundle BoL PDF as evidence for the
                        named forum. No on-chain action is dispatched at this
                        layer.
                    </p>
                </Card>
            )}
        </div>
    );
}
