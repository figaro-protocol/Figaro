"use client";

import { Handle, Position } from "@xyflow/react";
import { Order, OrderState } from "@/lib/core/store";
import { formatToken } from "@/lib/shared/utils";
import { truncateHex } from "@/lib/shared/formatHex";
import { describeClause } from "@/lib/shared/clauseSpecSource";

// ── Visual maps ─────────────────────────────────────────────────────────────

const STATE_COLORS: Record<OrderState, string> = {
    [OrderState.Active]: "bg-white border-green-500",
    [OrderState.Resolved]: "bg-white border-gray-300 opacity-60",
};

const STATE_LABELS: Record<OrderState, string> = {
    [OrderState.Active]: "Active",
    [OrderState.Resolved]: "Resolved",
};

const STATE_DOT: Record<OrderState, string> = {
    [OrderState.Active]: "bg-green-500",
    [OrderState.Resolved]: "bg-gray-400",
};

export type OrderNodeData = Order & {
    decimals: number;
    isBuyer: boolean;
    isSeller: boolean;
    /** 1-based position in the design's order list — the single human-facing
     *  order number, shown in designer mode and matched by the drawer's
     *  header, node tabs, and add-parent picker. */
    orderNumber: number;
    /** Designer mode: when set, the node renders an × delete affordance. */
    onDelete?: (orderId: string) => void;
    /** True when the node has no parents in the topology — root orders are
     *  not deletable from the canvas (use Reset to clear the whole design). */
    isRoot: boolean;
    /** Designer-mode flag. When true the node renders the click-to-edit
     *  affordance (cursor:pointer + tooltip). */
    designerMode: boolean;
    /** Designer mode: the per-order composed clause values (clauseId → field
     *  values), so the node can render a derived summary of WHAT IT DOES
     *  without opening the drawer. Each clause is described generically via
     *  `describeClause` — no clause id is named here. */
    designerClauseValues?: Record<string, Record<string, unknown>>;
    /** Designer click-authoring: spawn a sub-order child of this node — the
     *  single add affordance (the card "+" button). */
    onAddSubOrderClick?: (parentOrderId: string) => void;
    /** Designer click-authoring: add an existing order as an additional
     *  parent of this node (the many-to-one merge / join). */
    onAddParentClick?: (childOrderId: string, parentOrderId: string) => void;
    /** Orders the add-parent picker offers — every other order not already a
     *  parent of this node. The merge handler still rejects self/duplicate/
     *  cycle with a notice. Empty/omitted for single-node designs. */
    candidateParents?: Array<{ id: string; label: string }>;
};

// ── Node renderer ───────────────────────────────────────────────────────────

export const OrderNode = ({ data }: { data: OrderNodeData }) => {
    const buyerShort = data.buyer ? truncateHex(data.buyer) : "—";
    const sellerShort = data.seller ? truncateHex(data.seller) : "—";

    // Designer mode: a derived "what this order does" summary — one chip per
    // composed clause, labelled by its own spec (the salient value, else the
    // clause title). Generic via `describeClause`; no clause id is named. Makes
    // a node self-describing without opening the drawer.
    const designerChips = data.designerMode && data.designerClauseValues
        ? Object.entries(data.designerClauseValues).map(([clauseId, vals]) => {
            const desc = describeClause(clauseId, vals as Record<string, unknown>);
            const salient = desc.fields[0]?.values;
            return { clauseId, label: salient && salient.length > 0 ? salient.join(" / ") : desc.title };
        })
        : [];

    const nodeClassName = data.designerMode
        ? `px-2 py-1.5 rounded min-w-[148px] border border-neutral-300 bg-white cursor-pointer hover:border-neutral-700`
        : `px-3 py-2 rounded-lg border-2 shadow-md transition-shadow ${STATE_COLORS[data.state]} min-w-[180px] ${
            data.isBuyer
                ? "ring-2 ring-offset-1 ring-blue-500"
                : data.isSeller
                    ? "ring-2 ring-offset-1 ring-emerald-500"
                    : ""
        }`;

    return (
        <div
            data-testid={`order-node-${data.id}`}
            data-order-id={data.id.toString()}
            data-order-state={STATE_LABELS[data.state].toLowerCase()}
            title={
                data.designerMode
                    ? "Click to edit this order's clauses"
                    : (data.timestamp ? new Date((data.timestamp > 1e12 ? data.timestamp : data.timestamp * 1000)).toLocaleString() : undefined)
            }
            className={nodeClassName}
        >
            <Handle
                type="target"
                position={Position.Top}
                style={{ opacity: 0, pointerEvents: "none" }}
            />
            <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5">
                    <span className={`${data.designerMode ? "text-[11px]" : "text-xs"} font-semibold text-black`} title={data.id}>
                        {data.designerMode
                            ? `Order ${data.orderNumber}`
                            : `Order #${data.id.toString().slice(0, 8)}`}
                    </span>
                    {!data.designerMode && (data.isBuyer || data.isSeller) && (
                        <span
                            className={`w-2 h-2 rounded-full ${data.isBuyer ? "bg-blue-500" : "bg-emerald-500"
                                }`}
                            role="img"
                            aria-label={data.isBuyer ? "You are the buyer" : "You are the seller"}
                        />
                    )}
                </span>
                <span className="flex items-center gap-1.5">
                    {!data.designerMode && (
                        <span
                            className={`w-2.5 h-2.5 rounded-full ${STATE_DOT[data.state]}`}
                            role="img"
                            aria-label={STATE_LABELS[data.state]}
                        />
                    )}
                    {data.designerMode && data.onAddSubOrderClick && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                data.onAddSubOrderClick?.(data.id);
                            }}
                            data-testid={`btn-add-suborder-${data.id}`}
                            aria-label={`Add a sub-order under order ${data.id.slice(0, 8)}`}
                            title="Add a sub-order (child) of this order"
                            className="nodrag w-4 h-4 rounded-full border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50 hover:border-neutral-500 text-[11px] leading-none flex items-center justify-center"
                        >
                            +
                        </button>
                    )}
                    {data.onDelete && !data.isRoot && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                data.onDelete?.(data.id);
                            }}
                            data-testid={`order-node-${data.id}-delete`}
                            aria-label={`Delete order ${data.id.slice(0, 8)}`}
                            title="Delete this order (and any descendants)"
                            className="nodrag w-4 h-4 rounded-full border border-red-300 bg-white text-red-600 hover:bg-red-50 hover:border-red-500 text-[11px] leading-none flex items-center justify-center"
                        >
                            ×
                        </button>
                    )}
                </span>
            </div>

            <div className="space-y-1 text-[11px]">
                {/* Compact summary — always shown */}
                <div className="flex justify-between font-semibold">
                    <span className="text-neutral-600">Pay</span>
                    <span className="text-black">{formatToken(data.payment ?? 0n, data.decimals)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-neutral-600">Cum</span>
                    <span className="text-black">{formatToken(data.cumulativeValue ?? 0n, data.decimals)}</span>
                </div>

                {/* Parties on one truncated line */}
                <div className="flex justify-between font-mono text-[10px] text-neutral-500 pt-1 border-t border-neutral-100">
                    <span title={data.buyer}>{buyerShort}</span>
                    <span className="opacity-50">→</span>
                    <span title={data.seller}>{sellerShort}</span>
                </div>

                {/* Designer mode: the node's composed terms, derived per clause —
                    so "what this order does" is legible without opening the drawer. */}
                {data.designerMode && (designerChips.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-neutral-100" data-testid={`node-clauses-${data.id}`}>
                        {designerChips.map((c) => (
                            <span
                                key={c.clauseId}
                                title={c.clauseId}
                                className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[10px] leading-tight"
                            >
                                {c.label}
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className="pt-1 text-[10px] italic text-neutral-400" data-testid={`node-clauses-empty-${data.id}`}>
                        No terms yet — click to compose
                    </p>
                ))}

            </div>
            {data.designerMode && data.onAddParentClick && data.candidateParents && data.candidateParents.length > 0 && (
                <div className="nodrag mt-1.5 pt-1.5 border-t border-neutral-100">
                    <select
                        data-testid={`select-add-parent-${data.id}`}
                        aria-label={`Add a parent to order ${data.id.slice(0, 8)}`}
                        title="Add an existing order as a parent (creates a join)"
                        defaultValue=""
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                            const parentId = e.target.value;
                            e.currentTarget.value = "";
                            if (parentId) data.onAddParentClick?.(data.id, parentId);
                        }}
                        className="nodrag w-full rounded border border-neutral-300 bg-white text-[10px] text-neutral-600 px-1 py-0.5"
                    >
                        <option value="" disabled>+ add parent…</option>
                        {data.candidateParents.map((p) => (
                            <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                    </select>
                </div>
            )}
            <Handle
                type="source"
                position={Position.Bottom}
                style={{ background: "transparent", border: "1px solid #ccc", width: 8, height: 8 }}
            />
        </div>
    );
};
