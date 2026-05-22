"use client";

/**
 * ProcessGraphCanvas — presentational DAG renderer for a Figaro process.
 *
 * Renders the four baseline graphs of a bonded process (Value, Geo,
 * Capital, GHG) over a react-flow canvas. Pure presentation: takes orders
 * as props, owns no live-state hooks. Consumers:
 *
 *   - live process-graph consumers read orders from useOrderStore +
 *     useProcessOrders and render via this canvas.
 *   - DesignerProcessCanvas (planned): feeds synthetic orders for the
 *     /builders/designer/new flow.
 *
 * The canvas owns: lens state, double-click zoom, auto-fit, depth layout,
 * node renderer, GHG-disclosure-per-order rendering, edge construction.
 */

import { useEffect, useRef, useState } from "react";
import {
    ReactFlow,
    Node,
    Edge,
    Handle,
    Position,
    MarkerType,
    useNodesState,
    useEdgesState,
    useReactFlow,
    Controls,
    Background,
    MiniMap,
    NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Address, Hex } from "viem";
import { Order, OrderState } from "@/lib/core/store";
import { hexEqual, isEmptyHex } from "@/lib/shared/evm";
import { formatToken } from "@/lib/shared/utils";
import { Card } from "@/components/ui/Card";
import { loadAgreement } from "@/lib/core/agreementStore";
import { buildAgreementsFromCache, deriveOrderDepths, deriveOrderTopology } from "@/lib/core/orderTopology";
import { summarizeAgreement, type AgreementSummary } from "@/lib/core/orderAgreement";
import {
    useOrderDisclosureTasks,
    formatActualGrams,
} from "@/lib/mechanisms/useGHGDisclosure";
import { DISCLOSURE_KIND_LABELS } from "@/lib/mechanisms/contracts";
import { truncateHex } from "@/lib/shared/formatHex";
import type { LensId } from "@/lib/shared/schemaCategories";

// ── Public types ────────────────────────────────────────────────────────────

/**
 * `LensId` is owned by `@/lib/shared/schemaCategories` (the canonical
 * taxonomy module); `GraphLens` adds the `"default"` "no overlay" state on
 * top of it. Lenses are intentionally a different taxonomy from schema
 * categories — see `LENS_TO_CATEGORIES` in that module for the explicit
 * map between them.
 */
export type GraphLens = LensId | "default";

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

const LENS_BUTTONS: { id: GraphLens; label: string; activeClass: string }[] = [
    { id: "value", label: "Value", activeClass: "bg-indigo-600 text-white" },
    { id: "geo", label: "Geo", activeClass: "bg-emerald-600 text-white" },
    { id: "capital", label: "Capital", activeClass: "bg-amber-500 text-white" },
    { id: "ghg", label: "GHG", activeClass: "bg-teal-600 text-white" },
];

const LENS_HIGHLIGHT: Record<GraphLens, string> = {
    default: "",
    value: "bg-indigo-50 rounded ring-1 ring-inset ring-indigo-200",
    geo: "bg-emerald-50 rounded ring-1 ring-inset ring-emerald-200",
    capital: "bg-amber-50 rounded ring-1 ring-inset ring-amber-200",
    ghg: "bg-teal-50 rounded ring-1 ring-inset ring-teal-200",
};

type OrderNodeData = Order & {
    decimals: number;
    isBuyer: boolean;
    isSeller: boolean;
    activeLens: GraphLens;
    agreementSummary: AgreementSummary | null;
    /** Designer mode: when set, the node renders an × delete affordance. */
    onDelete?: (orderId: string) => void;
    /** True when the node has no parents in the topology — root orders are
     *  not deletable from the canvas (use Reset to clear the whole design). */
    isRoot: boolean;
    /** Designer-mode flag. When true the node renders the click-to-edit
     *  affordance (cursor:pointer + tooltip). */
    designerMode: boolean;
    /** True when the canvas accepts drag-to-add-child / drag-to-add-parent.
     *  Read-only views (e.g. /view) leave this false so the bottom handle
     *  renders as a plain dot without the "+" affordance. */
    canAddNodes: boolean;
};

// ── Per-order GHG disclosure section ────────────────────────────────────────

function OrderDisclosureSection({ orderId, activeLens }: { orderId: string; activeLens: GraphLens }) {
    const { tasks } = useOrderDisclosureTasks(activeLens === "ghg" ? orderId : undefined);
    if (activeLens !== "ghg") return null;

    if (tasks.length === 0) {
        return (
            <div className="border-t border-teal-100 pt-1 mt-2 text-[11px] text-gray-500 italic">
                No disclosures for this order
            </div>
        );
    }

    return (
        <div className="border-t border-teal-100 pt-1 mt-2 space-y-1">
            {tasks.map((t, i) => (
                <div key={`${t.orderHash}-${t.stage}-${t.blockNumber}-${i}`} className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-teal-700">
                        {DISCLOSURE_KIND_LABELS[t.stage] ?? `Stage ${t.stage}`}
                    </span>
                    <span className="text-gray-500">
                        {t.actualGrams != null ? formatActualGrams(t.actualGrams) : `blk ${t.blockNumber}`}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ── Node renderer ───────────────────────────────────────────────────────────

const OrderNode = ({ data }: { data: OrderNodeData }) => {
    const isLens = (group: GraphLens) => data.activeLens === group;
    const isDefault = data.activeLens === "default";
    const geo = data.agreementSummary?.geo;
    const fulfilment = data.agreementSummary?.fulfilment;
    const ghg = data.agreementSummary?.ghg;
    const massLabel = typeof geo?.mass === "number" ? `${geo.mass} g` : geo?.mass;
    const volumeLabel = typeof geo?.volume === "number" ? `${geo.volume} mL` : geo?.volume;
    // Single canonical method enum derived from the first offered modality +
    // coordination. When the node offers multiple, downstream surfaces (cart,
    // edge pill) collapse to the first.
    const fulfilmentMethod = fulfilment?.method ?? undefined;
    const handoffMode = fulfilment?.handoffPoints?.[0];
    const ghgStandard = typeof ghg?.standard === "string" ? ghg.standard : undefined;
    const ghgScope = typeof ghg?.scope === "number" || typeof ghg?.scope === "string" ? ghg.scope : undefined;

    const buyerShort = data.buyer ? truncateHex(data.buyer) : "—";
    const sellerShort = data.seller ? truncateHex(data.seller) : "—";
    const tokenShort = data.currency ? truncateHex(data.currency) : null;

    const nodeClassName = data.designerMode
        ? `px-3 py-2 rounded min-w-[180px] border border-neutral-300 bg-white cursor-pointer hover:border-neutral-700`
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
                    <span className="text-xs font-semibold text-black">
                        Order #{data.id.toString().slice(0, 8)}
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
                            className="w-5 h-5 rounded-full border border-red-300 bg-white text-red-600 hover:bg-red-50 hover:border-red-500 text-xs leading-none flex items-center justify-center"
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

                {/* Default view: parties on one truncated line */}
                {isDefault && (
                    <div className="flex justify-between font-mono text-[10px] text-neutral-500 pt-1 border-t border-neutral-100">
                        <span title={data.buyer}>{buyerShort}</span>
                        <span className="opacity-50">→</span>
                        <span title={data.seller}>{sellerShort}</span>
                    </div>
                )}

                {/* Value lens — full party + token detail */}
                {isLens("value") && (
                    <div className={`pt-1 border-t border-neutral-100 ${LENS_HIGHLIGHT.value} px-1 py-0.5`}>
                        <div className="flex justify-between"><span>Buyer</span><span className="font-mono">{buyerShort}</span></div>
                        <div className="flex justify-between"><span>Seller</span><span className="font-mono">{sellerShort}</span></div>
                        {tokenShort && (
                            <div className="flex justify-between" data-testid={`order-currency-${data.id}`}>
                                <span>Token</span><span className="font-mono">{tokenShort}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Capital lens — bond detail */}
                {isLens("capital") && data.state === OrderState.Active && (
                    <div className={`pt-1 border-t border-neutral-100 ${LENS_HIGHLIGHT.capital} px-1 py-0.5`}>
                        <div className="flex justify-between">
                            <span>Seller bond</span>
                            <span data-testid={`bond-seller-${data.id}`} className="font-mono">{formatToken(data.sellerBond ?? 0n, data.decimals)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Buyer bond</span>
                            <span data-testid={`bond-buyer-${data.id}`} className="font-mono">{formatToken(data.buyerBond ?? 0n, data.decimals)}</span>
                        </div>
                    </div>
                )}

                {/* Geo lens — agreement-derived clauses */}
                {isLens("geo") && !isEmptyHex(data.agreementHash) && (() => {
                    const hasStructured = geo?.origin || geo?.destination || massLabel || volumeLabel || geo?.classOfService || fulfilmentMethod || handoffMode;
                    return (
                        <div className={`pt-1 border-t border-neutral-100 ${LENS_HIGHLIGHT.geo} px-1 py-0.5`}>
                            {hasStructured ? (
                                <>
                                    {geo?.origin && (
                                        <div className="flex justify-between" data-testid={`order-location-${data.id}`}>
                                            <span>Origin</span><span className="font-mono">{geo.origin}</span>
                                        </div>
                                    )}
                                    {geo?.destination && (
                                        <div className="flex justify-between"><span>Dest</span><span className="font-mono">{geo.destination}</span></div>
                                    )}
                                    {massLabel && <div className="flex justify-between"><span>Mass</span><span className="font-mono">{massLabel}</span></div>}
                                    {volumeLabel && <div className="flex justify-between"><span>Vol</span><span className="font-mono">{volumeLabel}</span></div>}
                                    {geo?.classOfService && <div className="flex justify-between"><span>Class</span><span className="font-mono">{geo.classOfService}</span></div>}
                                    {fulfilmentMethod && <div className="flex justify-between"><span>Fulfil</span><span className="font-mono">{fulfilmentMethod}</span></div>}
                                    {handoffMode && <div className="flex justify-between"><span>Handoff</span><span className="font-mono">{handoffMode}</span></div>}
                                </>
                            ) : (
                                <div className="flex justify-between" data-testid={`order-location-${data.id}`}>
                                    <span>Agreement</span>
                                    <span className="font-mono">{truncateHex(data.agreementHash, { head: 8 })}</span>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* GHG lens — disclosure detail (process-level + per-order) */}
                {isLens("ghg") && (
                    <div className={`pt-1 border-t border-neutral-100 ${LENS_HIGHLIGHT.ghg} px-1 py-0.5`}>
                        {ghgStandard && (
                            <div className="flex justify-between"><span className="text-teal-700">Standard</span><span className="text-gray-500">{ghgStandard}</span></div>
                        )}
                        {ghgScope !== undefined && (
                            <div className="flex justify-between"><span className="text-teal-700">Scope</span><span className="text-gray-500">{String(ghgScope)}</span></div>
                        )}
                        <OrderDisclosureSection orderId={data.id} activeLens={data.activeLens} />
                    </div>
                )}
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                style={
                    data.state === OrderState.Active && data.canAddNodes
                        ? {
                            background: "white",
                            border: "1px solid #999",
                            color: "#666",
                            width: 16,
                            height: 16,
                            fontSize: 12,
                            lineHeight: "14px",
                            fontWeight: "bold",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "crosshair",
                        }
                        : { background: "transparent", border: "1px solid #ccc", width: 8, height: 8 }
                }
                title={data.state === OrderState.Active && data.canAddNodes ? "Drag to add a sub-order or another parent" : undefined}
            >
                {data.state === OrderState.Active && data.canAddNodes && <span style={{ pointerEvents: "none" }}>+</span>}
            </Handle>
        </div>
    );
};

// ── Layout constants ────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 130;
const H_GAP = 40;
const V_GAP = 70;

type DblClickTrigger = { node: Node; seq: number } | null;

function DoubleClickZoom({ trigger }: { trigger: DblClickTrigger }) {
    const { fitBounds } = useReactFlow();
    const lastSeq = useRef<number>(-1);
    useEffect(() => {
        if (!trigger || trigger.seq === lastSeq.current) return;
        lastSeq.current = trigger.seq;
        fitBounds(
            { x: trigger.node.position.x, y: trigger.node.position.y, width: NODE_W, height: NODE_H },
            { duration: 400, padding: 0.15 }
        );
    }, [trigger, fitBounds]);
    return null;
}

function AutoFitView({ nodeCount }: { nodeCount: number }) {
    const { fitView } = useReactFlow();
    const prevCount = useRef(0);
    useEffect(() => {
        if (nodeCount > 0 && nodeCount !== prevCount.current) {
            const id = setTimeout(() => fitView({ padding: 0.15 }), 100);
            prevCount.current = nodeCount;
            return () => clearTimeout(id);
        }
        prevCount.current = nodeCount;
    }, [nodeCount, fitView]);
    return null;
}

const nodeTypes: NodeTypes = {
    order: OrderNode,
};

// Fulfilment is edited in the drawer, not on edges. Edges render as plain
// React Flow defaults — no per-edge pill or popover.

/** Hard limit enforced by FigaroCore (default 500). */
const MAX_ORDERS_HARD = 500;
/** Soft-warn threshold — show a caution banner when approaching the limit. */
const MAX_ORDERS_WARN = 200;

// ── Public component ────────────────────────────────────────────────────────

export interface ProcessGraphCanvasProps {
    /** Orders to render. Empty array shows the no-orders empty state. */
    orders: Order[];
    /** Optional process id used in the header label. */
    viewedProcessId?: string | null;
    /** Connected wallet — used to highlight orders where the wallet is buyer or seller. */
    walletAddress?: Address | string;
    /** Token decimals for value formatting. Defaults to 18. */
    decimals?: number;
    /** Slot above the lens buttons. Receives the active lens so consumers
     *  can render lens-aware content (e.g. process-level GHG summary). */
    headerExtras?: (activeLens: GraphLens) => React.ReactNode;
    /** Title text in the header. Defaults to "Process Graph". */
    title?: string;
    /** Subtitle when no orders are loaded. Defaults to a generic line. */
    emptySubtitle?: string;
    /**
     * When set, dragging from a node's source handle and releasing in empty
     * canvas space calls this with the source order's id. Consumers (e.g.
     * the designer) spawn a sub-order on that signal.
     */
    onAddSubOrder?: (parentOrderId: string) => void;
    /**
     * When set, dragging from a node's source handle and releasing on an
     * existing node calls this with (childOrderId, parentOrderId). The
     * source becomes an additional parent of the target — enables
     * many-to-one merges (e.g. the diamond DAG pattern).
     */
    onAddParent?: (childOrderId: string, parentOrderId: string) => void;
    /**
     * Single-click on a node fires this with the order id. Designer uses it
     * to open the agreement-editor drawer.
     */
    onSelectNode?: (orderId: string) => void;
    /**
     * When set, each node renders an × delete affordance and the callback
     * fires on click. Designer uses cascade-delete semantics; live workspace
     * leaves this unset (orders can't be deleted on chain).
     */
    onDeleteNode?: (orderId: string) => void;
    /**
     * Designer-mode toggle. When true:
     *   - Lens-button row is hidden (the designer's AgreementDrawer is the
     *     canonical inspection surface; lenses add a second taxonomy).
     *   - Each node renders a compact strip of category status dots
     *     (empty / partial / complete per drawer category).
     *   - Node `cursor:pointer` + a tooltip signal that nodes are
     *     click-to-edit.
     * Live workspaces omit this prop and keep the lens UI.
     */
    designerMode?: boolean;
}

export function ProcessGraphCanvas({
    orders,
    viewedProcessId,
    walletAddress,
    decimals = 18,
    headerExtras,
    title = "Process Graph",
    emptySubtitle = "Visual representation of the value-added process",
    onAddSubOrder,
    onAddParent,
    onSelectNode,
    onDeleteNode,
    designerMode = false,
}: ProcessGraphCanvasProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const [dblClick, setDblClick] = useState<DblClickTrigger>(null);
    const dblClickSeq = useRef(0);
    const [activeLens, setActiveLens] = useState<GraphLens>("default");
    const connectStartIdRef = useRef<string | null>(null);

    useEffect(() => {
        const topology = deriveOrderTopology(orders, buildAgreementsFromCache(orders));
        const depthMap = deriveOrderDepths(orders, topology);
        const depthBuckets = new Map<number, string[]>();
        orders.forEach(o => {
            const d = depthMap.get(o.id) ?? 0;
            const bucket = depthBuckets.get(d) ?? [];
            bucket.push(o.id);
            depthBuckets.set(d, bucket);
        });
        const posMap = new Map<string, { x: number; y: number }>();
        const PAD = 40;
        depthBuckets.forEach((ids, depth) => {
            const singleNodeOffset = ids.length === 1 && depth > 0 ? Math.min(depth, 3) * 24 : 0;
            ids.forEach((id, i) => {
                posMap.set(id, {
                    x: PAD + i * (NODE_W + H_GAP) + singleNodeOffset,
                    y: PAD + depth * (NODE_H + V_GAP),
                });
            });
        });

        const knownOrderIds = new Set(orders.map((o) => o.id));

        const newNodes: Node[] = orders.map((order) => {
            const isBuyer = walletAddress ? hexEqual(walletAddress, order.buyer) : false;
            const isSeller = walletAddress ? hexEqual(walletAddress, order.seller) : false;

            const agreementSummary = summarizeAgreement(loadAgreement(order.agreementHash as Hex));
            const knownParents = (topology.get(order.id)?.parentOrderIds ?? []).filter(
                (pid) => pid !== order.id && knownOrderIds.has(pid),
            );
            const isRoot = knownParents.length === 0;

            return {
                id: order.id,
                type: "order",
                position: posMap.get(order.id) ?? { x: 0, y: 0 },
                data: { ...order, decimals, isBuyer, isSeller, activeLens, agreementSummary, onDelete: onDeleteNode, isRoot, designerMode, canAddNodes: onAddSubOrder !== undefined || onAddParent !== undefined } satisfies OrderNodeData,
            };
        });

        const newEdges: Edge[] = [];
        orders.forEach((order) => {
            const parentOrderIds = (topology.get(order.id)?.parentOrderIds ?? []).filter(
                (parentOrderId) => parentOrderId !== order.id && knownOrderIds.has(parentOrderId),
            );

            parentOrderIds.forEach((parentOrderId) => {
                const valueLens = activeLens === "value";
                const edgeDimmed = activeLens !== "default" && activeLens !== "value";
                newEdges.push({
                    id: `${parentOrderId}-${order.id}`,
                    source: parentOrderId,
                    target: order.id,
                    animated: order.state === OrderState.Active && !edgeDimmed,
                    markerEnd: { type: MarkerType.ArrowClosed, color: valueLens ? "#4f46e5" : "#555" },
                    style: {
                        stroke: valueLens ? "#4f46e5" : (order.state === OrderState.Active ? "#16a34a" : "#555"),
                        strokeWidth: valueLens ? 3 : 2,
                        opacity: edgeDimmed ? 0.15 : 1,
                    },
                });
            });
        });

        setNodes(newNodes);
        setEdges(newEdges);
    }, [orders, walletAddress, decimals, activeLens, designerMode, setNodes, setEdges, onDeleteNode]);

    return (
        <div>
            <Card data-testid="order-graph-card" className="h-[400px] sm:h-[600px] overflow-hidden">
                <style>{`.react-flow__node { visibility: visible !important; }`}</style>
                <div className="p-4 border-b border-gray-200 bg-white">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                            <p className="text-sm text-gray-600">
                                {orders.length === 0
                                    ? emptySubtitle
                                    : `${orders.length} order${orders.length === 1 ? "" : "s"}${viewedProcessId ? ` · ${truncateHex(viewedProcessId, { head: 10, tail: 0 })}` : ""}`
                                }
                            </p>
                            {headerExtras?.(activeLens)}
                        </div>
                        {!designerMode && (
                            <div className="flex gap-1 flex-shrink-0">
                                <button
                                    key="all"
                                    data-testid="lens-btn-all"
                                    onClick={() => setActiveLens("default")}
                                    className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${activeLens === "default" ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                        }`}
                                >
                                    All
                                </button>
                                {LENS_BUTTONS.map(({ id, label, activeClass }) => (
                                    <button
                                        key={id}
                                        data-testid={`lens-btn-${id}`}
                                        onClick={() => setActiveLens(prev => prev === id ? "default" : id)}
                                        className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${activeLens === id ? activeClass : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                            }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {orders.length >= MAX_ORDERS_WARN && orders.length < MAX_ORDERS_HARD && (
                        <p data-testid="process-size-warning" className="text-xs text-amber-600 mt-0.5">
                            ⚠ Large process ({orders.length}/{MAX_ORDERS_HARD} orders) — approaching contract limit
                        </p>
                    )}
                    {orders.length >= MAX_ORDERS_HARD && (
                        <p data-testid="process-size-limit" className="text-xs text-red-600 mt-0.5">
                            ✕ Process limit reached ({MAX_ORDERS_HARD} orders max) — no new sub-orders allowed
                        </p>
                    )}
                </div>
                <div className="h-[calc(100%-80px)]">
                    {orders.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            <div data-testid="no-orders" className="text-center">
                                <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                    <circle cx="6" cy="12" r="2.5" />
                                    <circle cx="18" cy="6" r="2.5" />
                                    <circle cx="18" cy="18" r="2.5" />
                                    <line x1="8.5" y1="11" x2="15.5" y2="7" strokeLinecap="round" />
                                    <line x1="8.5" y1="13" x2="15.5" y2="17" strokeLinecap="round" />
                                </svg>
                                <p className="text-lg font-semibold">No orders yet</p>
                                <p className="text-sm mt-2">Create your first order to get started</p>
                            </div>
                        </div>
                    ) : (
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            nodeTypes={nodeTypes}
                            fitView
                            onNodeClick={onSelectNode ? (_e, node) => onSelectNode(node.id) : undefined}
                            onNodeDoubleClick={(_e, node) =>
                                setDblClick({ node, seq: ++dblClickSeq.current })
                            }
                            onConnectStart={(onAddSubOrder || onAddParent) ? (_event, params) => {
                                connectStartIdRef.current = params.nodeId ?? null;
                            } : undefined}
                            onConnectEnd={(onAddSubOrder || onAddParent) ? (event) => {
                                const sourceId = connectStartIdRef.current;
                                connectStartIdRef.current = null;
                                if (!sourceId) return;
                                const target = event.target as HTMLElement | null;
                                // Released over the canvas pane (not over another node) → spawn sub-order.
                                if (target?.classList.contains("react-flow__pane")) {
                                    onAddSubOrder?.(sourceId);
                                    return;
                                }
                                // Released on or inside an existing node → many-to-one merge.
                                // Walk up the DOM looking for the nearest node element with [data-id] (set by ReactFlow).
                                if (onAddParent) {
                                    let el: HTMLElement | null = target;
                                    while (el && !el.dataset?.id) el = el.parentElement;
                                    const targetId = el?.dataset?.id ?? null;
                                    if (targetId && targetId !== sourceId) {
                                        onAddParent(targetId, sourceId);
                                    }
                                }
                            } : undefined}
                            defaultEdgeOptions={{
                                style: { stroke: "#555", strokeWidth: 2 },
                                markerEnd: { type: MarkerType.ArrowClosed, color: "#555" },
                            }}
                        >
                            <Controls />
                            <Background />
                            <DoubleClickZoom trigger={dblClick} />
                            <AutoFitView nodeCount={nodes.length} />
                            {orders.length > 4 && (
                                <MiniMap nodeColor={() => "#4b5563"} className="hidden sm:block" />
                            )}
                        </ReactFlow>
                    )}
                </div>
            </Card>
        </div>
    );
}
