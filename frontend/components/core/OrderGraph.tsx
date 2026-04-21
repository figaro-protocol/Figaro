"use client";

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
import { useAccount } from "wagmi";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { useOrderStore, Order, OrderState } from "@/lib/core/store";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { SubOrderModal } from "@/components/core/SubOrderModal";
import { formatToken } from "@/lib/shared/utils";
import { Card } from "@/components/ui/Card";
import { loadAgreement } from "@/lib/core/agreementStore";
import { deriveOrderDepths, deriveOrderTopology } from "@/lib/core/orderTopology";
import { summarizeAgreement, type AgreementSummary } from "@/lib/core/orderAgreement";
import {
    useProcessDisclosureSummary,
    useOrderDisclosureTasks,
    formatActualGrams,
} from "@/lib/mechanisms/useGHGDisclosure";
import {
    DISCLOSURE_KIND_LABELS,
    GHG_NORM_REFERENCES,
} from "@/lib/mechanisms/contracts";
import type { Hex } from "viem";

// Static maps outside component — no recreation on every render (G4)
const STATE_COLORS: Record<OrderState, string> = {
    [OrderState.Active]: "bg-white border-green-500",
    [OrderState.Resolved]: "bg-white border-gray-300 opacity-60",
};

const STATE_LABELS: Record<OrderState, string> = {
    [OrderState.Active]: "Active",
    [OrderState.Resolved]: "Resolved",
};

// Non-verbal state dot — replaces the text badge inside graph nodes
const STATE_DOT: Record<OrderState, string> = {
    [OrderState.Active]: "bg-green-500",
    [OrderState.Resolved]: "bg-gray-400",
};

type WalletRole = "proposer" | "counterparty" | null;

type GraphLens = "default" | "value" | "geo" | "capital" | "ghg";

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
    walletRole: WalletRole;
    activeLens: GraphLens;
    agreementSummary: AgreementSummary | null;
};

// ── GHG disclosure graph — event-sourced from AttestationCoordinator ─────────

function GHGProcessSummary({ processId, activeLens }: { processId: string | null; activeLens: GraphLens }) {
    const { summary, loading } = useProcessDisclosureSummary(processId as Hex | undefined);
    if (activeLens !== "ghg") return null;

    if (loading) {
        return (
            <div className="mt-2 text-xs text-gray-500 italic" data-testid="ghg-process-summary">
                Loading GHG disclosure data…
            </div>
        );
    }

    if (!summary || summary.attestationCount === 0) {
        return (
            <div className="mt-2 text-xs text-gray-500 italic" data-testid="ghg-process-summary">
                No GHG disclosures filed for this process.
            </div>
        );
    }

    return (
        <div className="mt-2 space-y-2" data-testid="ghg-process-summary">
            <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-teal-700">Process GHG Summary</span>
                <span className="text-gray-500 text-xs">
                    {GHG_NORM_REFERENCES.map((r) => r.label).join(" · ")}
                </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
                <div className="bg-teal-50 rounded border border-teal-100 py-1">
                    <div className="font-bold text-teal-800">{summary.commitmentCount}</div>
                    <div className="text-teal-600">commitments</div>
                </div>
                <div className="bg-teal-50 rounded border border-teal-100 py-1">
                    <div className="font-bold text-teal-800">{summary.actualCount}</div>
                    <div className="text-teal-600">inventories</div>
                </div>
                <div className="bg-teal-50 rounded border border-teal-100 py-1">
                    <div className="font-bold text-teal-800">
                        {summary.totalActualGrams > 0n ? formatActualGrams(summary.totalActualGrams) : "—"}
                    </div>
                    <div className="text-teal-600">total CO₂e</div>
                </div>
            </div>
        </div>
    );
}

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

const OrderNode = ({ data }: { data: OrderNodeData }) => {
    // Highlights the group matching activeLens; dims all other groups
    const lc = (group: GraphLens) => {
        if (data.activeLens === "default") return "";
        return data.activeLens === group
            ? `transition-opacity ${LENS_HIGHLIGHT[group]}`
            : "opacity-25 transition-opacity";
    };
    const dimAll = data.activeLens !== "default" ? "opacity-25 transition-opacity" : "";
    const geo = data.agreementSummary?.geo;
    const fulfilment = data.agreementSummary?.fulfilment;
    const handoff = data.agreementSummary?.handoff;
    const ghg = data.agreementSummary?.ghg;
    const massLabel = typeof geo?.mass === "number" ? `${geo.mass} g` : geo?.mass;
    const volumeLabel = typeof geo?.volume === "number" ? `${geo.volume} mL` : geo?.volume;
    const fulfilmentMethod = typeof fulfilment?.method === "string" ? fulfilment.method : undefined;
    const auctionMode = typeof fulfilment?.auction === "string" ? fulfilment.auction : undefined;
    const handoffMode = typeof handoff?.mode === "string" ? handoff.mode : undefined;
    const ghgStandard = typeof ghg?.standard === "string" ? ghg.standard : undefined;
    const ghgScope = typeof ghg?.scope === "number" || typeof ghg?.scope === "string" ? ghg.scope : undefined;

    return (
        <div
            data-testid={`order-node-${data.id}`}
            data-order-id={data.id.toString()}
            data-order-state={STATE_LABELS[data.state].toLowerCase()}
            className={`px-4 py-3 rounded-lg border-2 shadow-lg transition-shadow ${STATE_COLORS[data.state]} min-w-[220px] ${data.walletRole === "proposer"
                ? "ring-2 ring-offset-1 ring-blue-500"
                : data.walletRole === "counterparty"
                    ? "ring-2 ring-offset-1 ring-emerald-500"
                    : ""
                }`}
        >
            {/* Target handle at top — needed by ReactFlow to route incoming edges; hidden visually */}
            <Handle
                type="target"
                position={Position.Top}
                style={{ opacity: 0, pointerEvents: "none" }}
            />
            <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-black">
                        Order #{data.id.toString()}
                    </span>
                    {data.walletRole && (
                        <span
                            className={`w-2 h-2 rounded-full ${data.walletRole === "proposer" ? "bg-blue-500" : "bg-emerald-500"
                                }`}
                            role="img"
                            aria-label={data.walletRole === "proposer" ? "You initiated" : "You are counterparty"}
                        />
                    )}
                </span>
                {/* State dot — color only, no text. Hover for label. */}
                <span
                    className={`w-2.5 h-2.5 rounded-full ${STATE_DOT[data.state]}`}
                    role="img"
                    aria-label={STATE_LABELS[data.state]}
                />
            </div>

            <div className="space-y-1 text-xs">
                {/* Non-lens metadata — dims when any lens is active */}
                <div className={dimAll}>
                    <div className="flex justify-between">
                        <span className="text-black">Buyer:</span>
                        <span className="font-mono text-black">
                            {data.buyer ? `${data.buyer.slice(0, 6)}...${data.buyer.slice(-4)}` : "Unknown"}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-black">Seller:</span>
                        <span className="font-mono text-black">
                            {data.seller ? `${data.seller.slice(0, 6)}...${data.seller.slice(-4)}` : "Unknown"}
                        </span>
                    </div>
                </div>
                {/* Value lens — cumulative value and payment */}
                <div className={`border-t border-gray-200 pt-1 mt-2 ${lc("value")}`}>
                    <div className="flex justify-between font-semibold">
                        <span className="text-black">Cumulative:</span>
                        <span className="text-black">
                            {formatToken(data.cumulativeValue ?? 0n, data.decimals)}
                        </span>
                    </div>
                    <div className="flex justify-between font-semibold">
                        <span className="text-black">Payment:</span>
                        <span className="text-black">
                            {formatToken(data.payment ?? 0n, data.decimals)}
                        </span>
                    </div>
                </div>
                {/* Token address — non-lens metadata */}
                {data.currency && (
                    <div className={`flex justify-between ${dimAll}`} data-testid={`order-currency-${data.id}`}>
                        <span className="text-black">Token:</span>
                        <span className="font-mono text-black">
                            {`${data.currency.slice(0, 6)}…${data.currency.slice(-4)}`}
                        </span>
                    </div>
                )}
                {/* Geo lens — manifest decoding */}
                {data.agreementHash && data.agreementHash !== "0x" && (() => {
                    const hasStructured = geo?.origin || geo?.destination || massLabel || volumeLabel || geo?.classOfService || fulfilmentMethod || auctionMode || handoffMode;
                    return (
                        <div className={lc("geo")}>
                            {hasStructured ? (
                                <>
                                    {geo?.origin && (
                                        <div className="flex justify-between" data-testid={`order-location-${data.id}`}>
                                            <span className="text-black">Origin:</span>
                                            <span className="font-mono text-black">{geo.origin}</span>
                                        </div>
                                    )}
                                    {geo?.destination && (
                                        <div className="flex justify-between">
                                            <span className="text-black">Destination:</span>
                                            <span className="font-mono text-black">{geo.destination}</span>
                                        </div>
                                    )}
                                    {massLabel && (
                                        <div className="flex justify-between">
                                            <span className="text-black">Mass:</span>
                                            <span className="font-mono text-black">{massLabel}</span>
                                        </div>
                                    )}
                                    {volumeLabel && (
                                        <div className="flex justify-between">
                                            <span className="text-black">Volume:</span>
                                            <span className="font-mono text-black">{volumeLabel}</span>
                                        </div>
                                    )}
                                    {geo?.classOfService && (
                                        <div className="flex justify-between">
                                            <span className="text-black">Class:</span>
                                            <span className="font-mono text-black">{geo.classOfService}</span>
                                        </div>
                                    )}
                                    {fulfilmentMethod && (
                                        <div className="flex justify-between">
                                            <span className="text-black">Fulfilment:</span>
                                            <span className="font-mono text-black">{fulfilmentMethod}</span>
                                        </div>
                                    )}
                                    {auctionMode && (
                                        <div className="flex justify-between">
                                            <span className="text-black">Auction:</span>
                                            <span className="font-mono text-black">{auctionMode}</span>
                                        </div>
                                    )}
                                    {handoffMode && (
                                        <div className="flex justify-between">
                                            <span className="text-black">Handoff:</span>
                                            <span className="font-mono text-black">{handoffMode}</span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex justify-between" data-testid={`order-location-${data.id}`}>
                                    <span className="text-black">Agreement:</span>
                                    <span className="font-mono text-black">{`${data.agreementHash.slice(0, 10)}…${data.agreementHash.slice(-6)}`}</span>
                                </div>
                            )}
                        </div>
                    );
                })()}
                {data.activeLens === "ghg" && (ghgStandard || ghgScope !== undefined) && (
                    <div className="border-t border-teal-100 pt-1 mt-2 text-[11px] space-y-1">
                        {ghgStandard && (
                            <div className="flex justify-between">
                                <span className="font-medium text-teal-700">GHG standard</span>
                                <span className="text-gray-500">{ghgStandard}</span>
                            </div>
                        )}
                        {ghgScope !== undefined && (
                            <div className="flex justify-between">
                                <span className="font-medium text-teal-700">Scope</span>
                                <span className="text-gray-500">{String(ghgScope)}</span>
                            </div>
                        )}
                    </div>
                )}
                {/* Timestamp — non-lens metadata */}
                {(data.timestamp ?? 0) > 0 && (() => {
                    const raw = data.timestamp!;
                    // block.timestamp is Unix seconds (~1e9); Date.now() is ms (~1e12)
                    const ms = raw > 1e12 ? raw : raw * 1000;
                    return (
                        <div className={`flex justify-between ${dimAll}`} data-testid={`order-timestamp-${data.id.toString()}`}>
                            <span className="text-black">Time:</span>
                            <span className="font-mono text-black text-xs">{new Date(ms).toLocaleString()}</span>
                        </div>
                    );
                })()}
                {/* Capital lens — seller and buyer bond values */}
                {data.state === OrderState.Active && (
                    <div className={`border-t border-gray-200 pt-1 mt-2 ${lc("capital")}`}>
                        <div className="flex justify-between text-xs">
                            <span className="text-black">Seller Bond:</span>
                            <span
                                data-testid={`bond-seller-${data.id}`}
                                className="font-mono text-black"
                            >
                                {formatToken(data.sellerBond ?? 0n, data.decimals)}
                            </span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-black">Buyer Bond:</span>
                            <span
                                data-testid={`bond-buyer-${data.id}`}
                                className="font-mono text-black"
                            >
                                {formatToken(data.buyerBond ?? 0n, data.decimals)}
                            </span>
                        </div>
                    </div>
                )}
                <OrderDisclosureSection orderId={data.id} activeLens={data.activeLens} />

            </div>
            {/* Source handle at bottom — edge exits downward to child orders */}
            <Handle
                type="source"
                position={Position.Bottom}
                style={{ background: "#555", width: 8, height: 8 }}
            />
        </div>
    );
};

// Layout constants — hoisted so DoubleClickZoom can reference them
const NODE_W = 280;
const NODE_H = 220;
const H_GAP = 50;
const V_GAP = 100;

/** Each double-click increments `seq` so the effect fires even when the same
 *  node is double-clicked twice in a row. */
type DblClickTrigger = { node: Node; seq: number } | null;

/**
 * Rendered inside the ReactFlow canvas so `useReactFlow()` is in-context.
 * Zooms the viewport to fill the double-clicked order card.
 */
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

/**
 * Rendered inside the ReactFlow canvas. Re-fits the viewport whenever the
 * node count changes (e.g. when orders are injected after mount).
 * Solves the race where ReactFlow's `fitView` prop fires against an empty
 * graph on initial mount, then never re-fires when nodes are populated.
 */
function AutoFitView({ nodeCount }: { nodeCount: number }) {
    const { fitView } = useReactFlow();
    const prevCount = useRef(0);
    useEffect(() => {
        if (nodeCount > 0 && nodeCount !== prevCount.current) {
            // setTimeout lets ReactFlow's internal ResizeObserver measure
            // the newly rendered node dimensions before we call fitView.
            const id = setTimeout(() => fitView({ padding: 0.15 }), 100);
            prevCount.current = nodeCount;
            return () => clearTimeout(id);
        }
        prevCount.current = nodeCount;
    }, [nodeCount, fitView]);
    return null;
}

// Define nodeTypes outside component to prevent recreation on every render
const nodeTypes: NodeTypes = {
    order: OrderNode,
};

/** Hard limit enforced by FigaroCore (default 500). */
const MAX_ORDERS_HARD = 500;
/** Soft-warn threshold — show a caution banner when approaching the limit. */
const MAX_ORDERS_WARN = 200;

export function OrderGraph() {
    const viewedProcessId = useOrderStore((state) => state.viewedProcessId);
    const orderArray = useProcessOrders(viewedProcessId);
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const decimals = 18;

    // Double-click zoom — forwarded into DoubleClickZoom which lives inside ReactFlow canvas
    const [dblClick, setDblClick] = useState<DblClickTrigger>(null);
    const dblClickSeq = useRef(0);
    const [activeLens, setActiveLens] = useState<GraphLens>("default");

    // Sub-order modal state — opened by the "+" button on Active graph nodes
    type SubOrderTarget = { processId: string; orderId: string; currency: string } | null;
    const [subOrderModal, setSubOrderModal] = useState<SubOrderTarget>(null);
    const setSubOrderModalRef = useRef(setSubOrderModal);
    useEffect(() => { setSubOrderModalRef.current = setSubOrderModal; }, [setSubOrderModal]);

    const { address } = useAccount();
    const isE2EMock = isE2EMockSession();

    // Mock test harness is registered in app/workbench/page.tsx so it is
    // available regardless of which tab is active. OrderGraph keeps only
    // the derived-state logic below.

    useEffect(() => {
        const topology = deriveOrderTopology(orderArray);
        const depthMap = deriveOrderDepths(orderArray, topology);
        // Bucket nodes by depth, preserving insertion order within each level
        const depthBuckets = new Map<number, string[]>();
        orderArray.forEach(o => {
            const d = depthMap.get(o.id) ?? 0;
            const bucket = depthBuckets.get(d) ?? [];
            bucket.push(o.id);
            depthBuckets.set(d, bucket);
        });
        const posMap = new Map<string, { x: number; y: number }>();
        // Position nodes at positive coordinates so they fall within the
        // default ReactFlow viewport ({x:0,y:0,zoom:1}).  Earlier code
        // centred around x = 0, which placed single nodes at x = −140 —
        // outside the visible area and clipped by overflow-hidden before
        // ReactFlow's internal ResizeObserver + fitView cycle completes.
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
        // ────────────────────────────────────────────────────────────────────────

        const newNodes: Node[] = orderArray.map((order) => {
            // In the live kernel, the buyer is the proposer for these rendered commitments.
            const walletRole: WalletRole = address
                ? address.toLowerCase() === order.buyer.toLowerCase()
                    ? "proposer"
                    : address.toLowerCase() === order.seller.toLowerCase()
                        ? "counterparty"
                        : null
                : null;

            const agreementSummary = summarizeAgreement(loadAgreement(order.agreementHash as Hex));

            return {
                id: order.id,
                type: "order",
                position: posMap.get(order.id) ?? { x: 0, y: 0 },
                data: { ...order, decimals, walletRole, activeLens, agreementSummary } satisfies OrderNodeData,
            };
        });

        const newEdges: Edge[] = [];
        const knownOrderIds = new Set(orderArray.map((order) => order.id));
        orderArray.forEach((order) => {
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
    }, [orderArray, address, decimals, activeLens, setNodes, setEdges]);

    // Graph is read-only — the DAG is derived from committed agreement topology
    // artifacts when available, with a deterministic linear fallback otherwise.

    return (
        <div>
            <Card data-testid="order-graph-card" className="h-[400px] sm:h-[600px] overflow-hidden">
                {/* ReactFlow v11 renders new nodes with visibility:hidden until its internal
                    ResizeObserver measures them. In headless Chromium (Playwright) the observer
                    callback can be delayed or miss, leaving nodes permanently hidden.  Override
                    the wrapper visibility so nodes are testable & visible immediately. */}
                <style>{`.react-flow__node { visibility: visible !important; }`}</style>
                <div className="p-4 border-b border-gray-200 bg-white">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Process Graph</h2>
                            <p className="text-sm text-gray-600">
                                {orderArray.length === 0
                                    ? "Visual representation of the value-added process"
                                    : `${orderArray.length} order${orderArray.length === 1 ? "" : "s"}${viewedProcessId ? ` · ${viewedProcessId.slice(0, 10)}…` : ""}`
                                }
                            </p>
                            <GHGProcessSummary processId={viewedProcessId} activeLens={activeLens} />
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
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
                    </div>
                    {orderArray.length >= MAX_ORDERS_WARN && orderArray.length < MAX_ORDERS_HARD && (
                        <p data-testid="process-size-warning" className="text-xs text-amber-600 mt-0.5">
                            ⚠ Large process ({orderArray.length}/{MAX_ORDERS_HARD} orders) — approaching contract limit
                        </p>
                    )}
                    {orderArray.length >= MAX_ORDERS_HARD && (
                        <p data-testid="process-size-limit" className="text-xs text-red-600 mt-0.5">
                            ✕ Process limit reached ({MAX_ORDERS_HARD} orders max) — no new sub-orders allowed
                        </p>
                    )}
                </div>
                <div className="h-[calc(100%-80px)]">
                    {orderArray.length === 0 ? (
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
                            onNodeDoubleClick={(_e, node) =>
                                setDblClick({ node, seq: ++dblClickSeq.current })
                            }
                            defaultEdgeOptions={{
                                style: { stroke: "#555", strokeWidth: 2 },
                                markerEnd: { type: MarkerType.ArrowClosed, color: "#555" },
                            }}
                        >
                            <Controls />
                            <Background />
                            <DoubleClickZoom trigger={dblClick} />
                            <AutoFitView nodeCount={nodes.length} />
                            {orderArray.length > 4 && (
                                <MiniMap nodeColor={() => "#4b5563"} className="hidden sm:block" />
                            )}
                        </ReactFlow>
                    )}
                </div>

                {/* Sub-order modal — opened by "+" on an Active node, scoped to that processId */}
                {subOrderModal && (
                    <SubOrderModal
                        processId={subOrderModal.processId}
                        parentOrderId={subOrderModal.orderId}
                        defaultCurrency={subOrderModal.currency}
                        onClose={() => setSubOrderModal(null)}
                    />
                )}
            </Card>
        </div>
    );
}
