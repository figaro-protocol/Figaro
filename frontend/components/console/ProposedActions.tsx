"use client";

/**
 * ProposedActions — Displays actions proposed by the SDK for the selected process.
 * Each action can be enqueued for human approval.
 */

import { useFigaro } from "@/lib/console/provider";
import type { ProposedAction } from "@figaro/core/agent";
import { describeOperatingAction } from "@/lib/console/actionPresentation";
import { AttestConfigurator } from "./AttestConfigurator";

function shortenHex(hex: string, chars = 6): string {
    if (hex.length <= chars * 2 + 2) return hex;
    return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

function formatWei(value: bigint): string {
    const eth = Number(value) / 1e18;
    if (eth === 0) return "0";
    if (eth < 0.001) return "<0.001";
    return eth.toFixed(4);
}

function ActionCard({
    action,
    onEnqueue,
}: {
    action: ProposedAction;
    onEnqueue: (configured?: ProposedAction) => void;
}) {
    const presentation = describeOperatingAction(action);
    const isAttest = action.type === "attest-as-seller" || action.type === "attest-as-buyer";

    return (
        <div className={`rounded-lg border p-3 ${presentation.toneClass}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                    <span className="text-xs font-medium uppercase tracking-wide">
                        {presentation.label}
                    </span>
                    <p className="mt-1 text-sm opacity-80">
                        {presentation.description}
                    </p>
                </div>
                {!isAttest && (
                    <button
                        onClick={() => onEnqueue()}
                        className="shrink-0 rounded bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20 transition-colors"
                    >
                        Queue
                    </button>
                )}
            </div>
            {action.type === "resolve-process" && (
                <div className="mt-2 flex gap-4 text-xs opacity-70">
                    <span>Buyer receives: {formatWei(action.totalBuyerPayout)}</span>
                    <span>Sellers receive: {formatWei(action.totalSellerPayout)}</span>
                    <span>{action.settlements.length} order{action.settlements.length !== 1 ? "s" : ""}</span>
                </div>
            )}
            {action.type === "commit-sub-order" && (
                <div className="mt-2 text-xs opacity-70">
                    Current cumulative: {formatWei(action.currentCumulativeValue)} · {shortenHex(action.currency)}
                </div>
            )}
            {isAttest && (
                <AttestConfigurator action={action} onQueue={(configured) => onEnqueue(configured)} />
            )}
        </div>
    );
}

export function ProposedActions() {
    const { proposedActions, enqueueAction, selectedProcess } = useFigaro();

    if (!selectedProcess) {
        return (
            <div className="p-4 text-sm text-zinc-500">
                Select a process to see proposed actions.
            </div>
        );
    }

    if (proposedActions.length === 0) {
        return (
            <div className="p-4 text-sm text-zinc-500">
                No actions available for this process.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 p-2">
            <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-zinc-400">
                Proposed Actions ({proposedActions.length})
            </h3>
            {proposedActions.map((action, i) => (
                <ActionCard
                    key={`${action.type}-${i}`}
                    action={action}
                    onEnqueue={(configured) => enqueueAction(configured ?? action)}
                />
            ))}
        </div>
    );
}
