import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CapabilityExecutionInput, CapabilityModel, ProcessModel, ProcessRelationModel } from "@/lib/semantic/models";
import { formatToken } from "@/lib/shared/utils";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";

interface Props {
    process: ProcessModel;
    executableCapabilityIds?: Set<string>;
    executingCapabilityId?: string | null;
    onExecuteCapability?: (capability: CapabilityModel, input?: CapabilityExecutionInput) => void | Promise<void>;
    selectedParentOrderIds?: Set<string>;
    onToggleParentSelection?: (orderId: string) => void;
    onComposeFromSelection?: (parentOrderIds: string[], currency?: `0x${string}`) => void;
    onSelectOrder?: (orderId: string) => void;
}

function shortId(value: string): string {
    return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

function compactAmount(amount: bigint, decimals: number): string {
    const formatted = formatToken(amount, decimals);
    const [whole, fraction = ""] = formatted.split(".");
    if (fraction.length === 0) return whole;
    return `${whole}.${fraction.slice(0, 3)}`;
}

function MetricPill({
    label,
    value,
    toneClass,
}: {
    label: string;
    value: string;
    toneClass: string;
}) {
    return (
        <div className={`rounded border px-2 py-1 ${toneClass}`}>
            <p className="text-xs font-semibold uppercase tracking-widest">{label}</p>
            <p className="text-xs font-mono">{value}</p>
        </div>
    );
}

function RelationBadge({ label }: { label: string }) {
    return (
        <span className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] text-neutral-700">
            {label}
        </span>
    );
}

function processCapabilityTestId(capability: CapabilityModel): string | undefined {
    if (capability.action.executionType === "transaction" && capability.action.kind === "resolve-process") {
        return "btn-resolve-process";
    }
    if (capability.action.executionType === "prototype" && capability.action.kind === "withdraw-available") {
        return "btn-withdraw-mock";
    }
    return undefined;
}



function findIncomingRelations(process: ProcessModel, childOrderId: string): ProcessRelationModel[] {
    return process.relations.filter((relation) => relation.childOrderId === childOrderId);
}

function deriveDepths(process: ProcessModel): Map<string, number> {
    const lookup = new Map(process.orders.map((order) => [order.orderId, order]));
    const depths = new Map<string, number>();
    const visiting = new Set<string>();

    const visit = (orderId: string): number => {
        const existing = depths.get(orderId);
        if (existing !== undefined) return existing;

        if (visiting.has(orderId)) {
            depths.set(orderId, 0);
            return 0;
        }

        const order = lookup.get(orderId);
        const parentOrderIds = order?.parentOrderIds.filter(
            (parentOrderId) => parentOrderId !== orderId && lookup.has(parentOrderId)
        ) ?? [];

        if (!order || parentOrderIds.length === 0) {
            depths.set(orderId, 0);
            return 0;
        }

        visiting.add(orderId);
        const depth = Math.max(...parentOrderIds.map((parentOrderId) => visit(parentOrderId))) + 1;
        visiting.delete(orderId);
        depths.set(orderId, depth);
        return depth;
    };

    process.orders.forEach((order) => {
        visit(order.orderId);
    });

    return depths;
}

export function ProcessTopologyPanel({
    process,
    executableCapabilityIds,
    executingCapabilityId,
    onExecuteCapability,
    selectedParentOrderIds,
    onToggleParentSelection,
    onComposeFromSelection,
    onSelectOrder,
}: Props) {
    const depths = deriveDepths(process);
    const columns = new Map<number, typeof process.orders>();
    const { decimals } = useTokenDecimals(process.currency);
    const activeOrderCount = process.orders.filter((order) => order.state === "Active").length;
    const selectedOrders = selectedParentOrderIds
        ? process.orders.filter((order) => selectedParentOrderIds.has(order.orderId))
        : [];
    const selectedCurrencies = new Set(selectedOrders.map((order) => order.currency).filter(Boolean));
    const selectionHasCurrencyMismatch = selectedCurrencies.size > 1;
    const selectionCanCompose = !!onComposeFromSelection && selectedOrders.length > 1 && !selectionHasCurrencyMismatch;

    process.orders.forEach((order) => {
        const depth = depths.get(order.orderId) ?? 0;
        const column = columns.get(depth) ?? [];
        column.push(order);
        columns.set(depth, column);
    });

    const orderedColumns = [...columns.entries()].sort((left, right) => left[0] - right[0]);

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                    <p className="text-sm font-semibold text-black">Process Topology</p>
                    <p className="text-xs text-neutral-500">Live parent-child order structure derived from order events.</p>
                </div>
                <div className="flex items-center gap-2">
                    {onComposeFromSelection && selectedParentOrderIds && selectedParentOrderIds.size > 1 && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!selectionCanCompose}
                            onClick={() => {
                                const sharedCurrency = selectedOrders[0]?.currency;
                                onComposeFromSelection(selectedOrders.map((order) => order.orderId), sharedCurrency);
                            }}
                        >
                            Compose from Selection ({selectedParentOrderIds.size})
                        </Button>
                    )}
                    {process.capabilities.map((capability) => (
                        <Button
                            key={capability.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            data-testid={processCapabilityTestId(capability)}
                            disabled={!executableCapabilityIds?.has(capability.id) || !!executingCapabilityId}
                            onClick={() => onExecuteCapability?.(capability)}
                        >
                            {executingCapabilityId === capability.id
                                ? "Processing..."
                                : capability.action.executionType === "transaction" && capability.action.kind === "resolve-process"
                                    ? `${capability.label} (${activeOrderCount} active)`
                                    : capability.label}
                        </Button>
                    ))}
                    <span className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700">
                        Root #{process.rootOrderId || "-"}
                    </span>
                </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-[1fr,auto] md:items-start">
                <div className="flex flex-wrap gap-2">
                    <MetricPill label="Value" value="payment commitment" toneClass="border-sky-200 bg-sky-50 text-sky-800" />
                    <MetricPill label="Capital" value="locked bond" toneClass="border-amber-200 bg-amber-50 text-amber-800" />
                    <MetricPill label="Flow" value="downstream reference" toneClass="border-emerald-200 bg-emerald-50 text-emerald-800" />
                </div>
                {process.economicSummary && (
                    <div className="flex flex-wrap gap-2 md:justify-end">
                        {process.economicSummary.lockedBond && (
                            <MetricPill
                                label="Process Bond"
                                value={compactAmount(process.economicSummary.lockedBond.amount, decimals)}
                                toneClass="border-amber-200 bg-amber-50 text-amber-800"
                            />
                        )}
                        {process.economicSummary.settledAvailable && (
                            <MetricPill
                                label="Withdrawable"
                                value={compactAmount(process.economicSummary.settledAvailable.amount, decimals)}
                                toneClass="border-neutral-300 bg-white text-neutral-800"
                            />
                        )}
                    </div>
                )}
            </div>

            {selectedParentOrderIds && selectedParentOrderIds.size > 0 && (
                <div className={`mb-4 rounded border p-3 text-sm ${selectionHasCurrencyMismatch ? "border-red-200 bg-red-50 text-red-700" : "border-neutral-200 bg-neutral-50 text-neutral-700"}`}>
                    <p className="font-semibold mb-1">Selection Summary</p>
                    <p>
                        {selectedParentOrderIds.size} parent node{selectedParentOrderIds.size === 1 ? "" : "s"} selected.
                        {selectionHasCurrencyMismatch
                            ? " Selected parents do not share a single currency, so multi-parent composition is disabled."
                            : selectedParentOrderIds.size > 1
                                ? " Selected parents share a compatible currency and can be composed into one descendant order."
                                : " Select at least one more parent to open a multi-parent composition."}
                    </p>
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                {orderedColumns.map(([depth, orders]) => (
                    <div key={depth} className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Level {depth}</p>
                        {orders.map((order) => (
                            <div
                                key={order.orderId}
                                data-testid={`topo-node-${order.orderId}`}
                                data-order-state={order.state.toLowerCase()}
                                className={`rounded border p-3 cursor-pointer ${selectedParentOrderIds?.has(order.orderId) ? "border-black bg-white" : "border-neutral-200 bg-neutral-50 hover:border-neutral-400"}`}
                                onClick={() => onSelectOrder?.(order.orderId)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-black">Order #{order.orderId}</p>
                                        <p className="text-xs text-neutral-500">{order.state}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {onToggleParentSelection && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => onToggleParentSelection(order.orderId)}
                                            >
                                                {selectedParentOrderIds?.has(order.orderId) ? "Selected" : "Select Parent"}
                                            </Button>
                                        )}
                                        <span className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700">
                                            {order.capabilities.length} actions
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-3 space-y-2 text-xs text-neutral-600">
                                    <p>Parents: {order.parentOrderIds.length > 0 ? order.parentOrderIds.map(shortId).join(", ") : "root order"}</p>
                                    <p>Payment: {formatToken(order.payment, decimals)}</p>
                                </div>
                                {order.parentOrderIds.length > 0 && (
                                    <div className="mt-3 rounded border border-neutral-200 bg-white p-2">
                                        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Edge Semantics</p>
                                        <div className="space-y-2">
                                            {findIncomingRelations(process, order.orderId).map((relation) => (
                                                <div key={relation.id} className="rounded border border-neutral-200 bg-neutral-50 p-2">
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        <RelationBadge label={`#${shortId(relation.parentOrderId)} -> #${shortId(relation.childOrderId)}`} />
                                                        {relation.labels.map((label) => (
                                                            <RelationBadge key={`${relation.id}-${label}`} label={label} />
                                                        ))}
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <MetricPill
                                                            label="Shared Ref"
                                                            value={compactAmount(relation.referencedValue.amount, decimals)}
                                                            toneClass="border-sky-200 bg-sky-50 text-sky-800"
                                                        />
                                                        {relation.allocatedReferenceValue && (
                                                            <MetricPill
                                                                label="Display Split"
                                                                value={compactAmount(relation.allocatedReferenceValue.amount, decimals)}
                                                                toneClass="border-violet-200 bg-violet-50 text-violet-800"
                                                            />
                                                        )}
                                                    </div>
                                                    <p className="mt-2 text-[11px] text-neutral-500">
                                                        {relation.source.sourceLabel}
                                                        {relation.allocatedReferenceValue ? ` ${relation.allocatedReferenceValue.source.sourceLabel}.` : ""}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <MetricPill
                                        label="Value"
                                        value={compactAmount(order.payment, decimals)}
                                        toneClass="border-sky-200 bg-sky-50 text-sky-800"
                                    />
                                    {order.settlementBreakdown?.lockedBond && (
                                        <MetricPill
                                            label="Capital"
                                            value={compactAmount(order.settlementBreakdown.lockedBond.amount, decimals)}
                                            toneClass="border-amber-200 bg-amber-50 text-amber-800"
                                        />
                                    )}
                                    {order.settlementBreakdown?.downstreamReferencedAmount && (
                                        <MetricPill
                                            label="Flow"
                                            value={compactAmount(order.settlementBreakdown.downstreamReferencedAmount.amount, decimals)}
                                            toneClass="border-emerald-200 bg-emerald-50 text-emerald-800"
                                        />
                                    )}
                                </div>
                                {order.capabilities.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {order.capabilities.map((capability) => (
                                            <Button
                                                key={capability.id}
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={!executableCapabilityIds?.has(capability.id) || !!executingCapabilityId}
                                                onClick={() => onExecuteCapability?.(capability)}
                                            >
                                                {executingCapabilityId === capability.id ? "Processing..." : capability.label}
                                            </Button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </Card >
    );
}