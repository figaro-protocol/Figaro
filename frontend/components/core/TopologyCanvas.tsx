"use client";

/**
 * TopologyCanvas — presentational renderer for a Figaro process topology.
 *
 * Lays out a bonded-process order graph over a react-flow canvas: depth
 * layout, edge construction, double-click zoom, auto-fit. The node itself
 * lives in `./topology/OrderNode`. Consumed by the assembly designer
 * (`designerMode`); a future live process view would render it read-only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
    ReactFlow,
    Node,
    Edge,
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
import type { Address } from "viem";
import { Order, OrderState } from "@/lib/core/store";
import { hexEqual } from "@/lib/shared/evm";
import { Card } from "@/components/ui/Card";
import { useProcessAgreements } from "@/hooks/core/useProcessAgreements";
import { deriveOrderDepths, deriveOrderTopology } from "@/lib/core/orderTopology";
import { truncateHex } from "@/lib/shared/formatHex";
import { OrderNode, type OrderNodeData } from "./topology/OrderNode";


// ── Layout constants ────────────────────────────────────────────────────────

const NODE_W = 156;
const NODE_H = 96;
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

// Modality is edited in the drawer, not on edges. Edges render as plain
// React Flow defaults — no per-edge pill or popover.

// The per-process order cap is CHAIN-ADAPTIVE — `maxOrdersResolvablePerProcess`
// (read from the chain's gas ceiling, e.g. ~2032 on the dev chain), enforced and
// surfaced by the designer (`maxOrders` + `atOrderCapacity`). No hardcoded limit
// lives here.

// ── Public component ────────────────────────────────────────────────────────

export interface TopologyCanvasProps {
    /** Orders to render. Empty array shows the no-orders empty state. */
    orders: Order[];
    /** Optional process id used in the header label. */
    viewedProcessId?: string | null;
    /** Connected wallet — used to highlight orders where the wallet is buyer or seller. */
    walletAddress?: Address | string;
    /** Token decimals for value formatting. Defaults to 18. */
    decimals?: number;
    /** Title text in the header. Defaults to "Process Graph". */
    title?: React.ReactNode;
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
     * many-to-one merges (e.g. the diamond fan-in pattern).
     */
    onAddParent?: (childOrderId: string, parentOrderId: string) => void;
    /**
     * Single-click on a node fires this with the order id. Designer uses it
     * to open the agreement-editor drawer.
     */
    onSelectNode?: (orderId: string) => void;
    /**
     * When set, each node renders an × delete affordance and the callback
     * fires on click. The designer uses cascade-delete semantics; a read-only
     * view leaves this unset (orders can't be deleted on chain).
     */
    onDeleteNode?: (orderId: string) => void;
    /**
     * Authoring-mode toggle. When true each node becomes click-to-edit
     * (`cursor:pointer` + tooltip), renders its + / × authoring affordances
     * (add sub-order, add parent, delete), and shows a derived chip per
     * composed clause so "what this order does" is legible without opening
     * the drawer. Omitted, the node is read-only presentation.
     */
    designerMode?: boolean;
    /** Authoring mode: per-order composed clause values (clauseId → field
     *  values), used to render each node's derived "what it does" chips. */
    clauseValuesByOrderId?: Record<string, Record<string, Record<string, unknown>>>;
}

export function TopologyCanvas({
    orders,
    viewedProcessId,
    walletAddress,
    decimals = 18,
    title = "Process Topology",
    emptySubtitle = "Visual representation of the value-added process",
    onAddSubOrder,
    onAddParent,
    onSelectNode,
    onDeleteNode,
    designerMode = false,
    clauseValuesByOrderId,
}: TopologyCanvasProps) {
    // IPFS-first agreement hydration (the shared singleton) — the canvas never
    // reads localStorage synchronously; nodes rebuild as hydration completes.
    const agreementHashes = useMemo(
        () => orders.map((o) => o.agreementHash).filter((h): h is string => Boolean(h)),
        [orders],
    );
    const agreements = useProcessAgreements(agreementHashes);
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const [dblClick, setDblClick] = useState<DblClickTrigger>(null);
    const dblClickSeq = useRef(0);

    useEffect(() => {
        const topology = deriveOrderTopology(orders, agreements);
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

        const newNodes: Node[] = orders.map((order, orderIndex) => {
            const isBuyer = walletAddress ? hexEqual(walletAddress, order.buyer) : false;
            const isSeller = walletAddress ? hexEqual(walletAddress, order.seller) : false;

            const knownParents = (topology.get(order.id)?.parentOrderHashes ?? []).filter(
                (pid) => pid !== order.id && knownOrderIds.has(pid),
            );
            const isRoot = knownParents.length === 0;
            // Add-parent picker options: every other order not already a
            // parent. Labelled "Order N" to match the drawer's node tabs.
            const candidateParents = onAddParent
                ? orders
                    .filter((o) => o.id !== order.id && !knownParents.includes(o.id))
                    .map((o) => ({ id: o.id, label: `Order ${orders.findIndex((x) => x.id === o.id) + 1}` }))
                : undefined;

            return {
                id: order.id,
                type: "order",
                position: posMap.get(order.id) ?? { x: 0, y: 0 },
                data: { ...order, decimals, isBuyer, isSeller, orderNumber: orderIndex + 1, onDelete: onDeleteNode, isRoot, designerMode, designerClauseValues: clauseValuesByOrderId?.[order.id], onAddSubOrderClick: onAddSubOrder, onAddParentClick: onAddParent, candidateParents } satisfies OrderNodeData,
            };
        });

        const newEdges: Edge[] = [];
        orders.forEach((order) => {
            const parentOrderHashes = (topology.get(order.id)?.parentOrderHashes ?? []).filter(
                (parentOrderId) => parentOrderId !== order.id && knownOrderIds.has(parentOrderId),
            );

            parentOrderHashes.forEach((parentOrderId) => {
                newEdges.push({
                    id: `${parentOrderId}-${order.id}`,
                    source: parentOrderId,
                    target: order.id,
                    animated: order.state === OrderState.Active,
                    markerEnd: { type: MarkerType.ArrowClosed, color: "#555" },
                    style: {
                        stroke: order.state === OrderState.Active ? "#16a34a" : "#555",
                        strokeWidth: 2,
                    },
                });
            });
        });

        setNodes(newNodes);
        setEdges(newEdges);
    }, [orders, agreements, walletAddress, decimals, designerMode, clauseValuesByOrderId, setNodes, setEdges, onDeleteNode]);

    return (
        <div>
            <Card data-testid="order-graph-card" className="h-[400px] sm:h-[600px] overflow-hidden">
                <style>{`.react-flow__node { visibility: visible !important; }`}</style>
                {!designerMode && (
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
                        </div>
                    </div>
                </div>
                )}
                <div className={designerMode ? "h-full" : "h-[calc(100%-80px)]"}>
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
