"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProcessGraphCanvas } from "@/components/core/ProcessGraphCanvas";
import type { Order } from "@/lib/core/store";
import {
    collectDescendants,
    createSyntheticRootOrder,
    createSyntheticSubOrder,
    editSyntheticAgreement,
    isRootOrder,
    mergeSyntheticParent,
    startSyntheticSession,
    swapSyntheticMechanism,
    type AgreementEdits,
    type FormationMechanism,
    type SyntheticProcessSession,
} from "@/lib/designer/syntheticProcess";
import {
    clearCurrentSession,
    loadCurrentSession,
    loadNamedDraft,
    saveCurrentSession,
    saveNamedDraft,
    type DesignSnapshot,
} from "@/lib/designer/syntheticDesignStore";
import { AgreementDrawer } from "@/components/core/designer/AgreementDrawer";

interface InitialState {
    session: SyntheticProcessSession;
    orders: Order[];
    name: string;
    slug: string | null;
}

/**
 * Decide initial canvas state on mount:
 *   1. ?draft=slug query param → load that named draft
 *   2. autosaved current session → restore
 *   3. fresh blank
 */
function buildInitialState(draftParam: string | null): InitialState {
    if (draftParam) {
        const draft = loadNamedDraft(draftParam);
        if (draft) {
            return {
                session: {
                    processId: draft.processId as `0x${string}`,
                    buyerAddress: (draft.orders[0]?.buyer ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
                    nextOrderIndex: draft.nextOrderIndex,
                    nextSellerIndex: draft.nextSellerIndex,
                },
                orders: draft.orders,
                name: draft.name,
                slug: draft.slug,
            };
        }
    }

    const restored = loadCurrentSession();
    if (restored && restored.orders.length > 0) {
        return {
            session: {
                processId: restored.processId as `0x${string}`,
                buyerAddress: (restored.orders[0]?.buyer ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
                nextOrderIndex: restored.nextOrderIndex,
                nextSellerIndex: restored.nextSellerIndex,
            },
            orders: restored.orders,
            name: restored.name,
            slug: restored.slug || null,
        };
    }

    const fresh = startSyntheticSession();
    const root = createSyntheticRootOrder(fresh);
    return { session: fresh, orders: [root.order], name: "Untitled assembly", slug: null };
}

function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

export default function NewDesignerPage() {
    const searchParams = useSearchParams();
    const draftParam = searchParams?.get("draft") ?? null;

    // Build initial state once. Subsequent draft-param changes are not honored
    // mid-session — the user navigates back to the landing to pick another draft.
    const initialRef = useRef<InitialState | null>(null);
    if (initialRef.current === null) {
        initialRef.current = buildInitialState(draftParam);
    }
    const initial = initialRef.current;

    const [session] = useState<SyntheticProcessSession>(() => initial.session);
    const [orders, setOrders] = useState<Order[]>(() => initial.orders);
    const [name, setName] = useState<string>(initial.name);
    const [slug, setSlug] = useState<string | null>(initial.slug);

    const [mergeNotice, setMergeNotice] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);

    // Autosave on every meaningful change.
    useEffect(() => {
        const snap: DesignSnapshot = {
            slug: slug ?? "",
            name,
            processId: session.processId,
            nextOrderIndex: session.nextOrderIndex,
            nextSellerIndex: session.nextSellerIndex,
            orders,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        saveCurrentSession(snap);
        setSavedAt(Date.now());
    }, [orders, name, slug, session.processId, session.nextOrderIndex, session.nextSellerIndex]);

    const handleAddSubOrder = useCallback(
        (parentOrderId: string) => {
            setOrders((prev) => {
                const parent = prev.find((o) => o.id === parentOrderId);
                if (!parent) return prev;
                const sub = createSyntheticSubOrder(session, parent);
                return [...prev, sub.order];
            });
        },
        [session],
    );

    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    const handleEditAgreement = useCallback(
        (orderId: string, edits: AgreementEdits) => {
            setOrders((prev) => {
                const target = prev.find((o) => o.id === orderId);
                if (!target) return prev;
                const updated = editSyntheticAgreement(target, edits);
                return prev.map((o) => (o.id === orderId ? updated : o));
            });
        },
        [],
    );

    const handleSwapMechanism = useCallback(
        (childOrderId: string, mechanism: FormationMechanism) => {
            setOrders((prev) => {
                const child = prev.find((o) => o.id === childOrderId);
                if (!child) return prev;
                const updated = swapSyntheticMechanism(child, mechanism);
                return prev.map((o) => (o.id === childOrderId ? updated : o));
            });
        },
        [],
    );

    const handleDeleteNode = useCallback(
        (orderId: string) => {
            setOrders((prev) => {
                const target = prev.find((o) => o.id === orderId);
                if (!target) return prev;
                // Refuse to delete a root order — leaving the canvas empty
                // strands the user. Use Reset to clear the whole design.
                if (isRootOrder(orderId, prev)) {
                    setMergeNotice("Root orders can't be deleted from the canvas. Use \"Reset to unit\" to clear the whole design.");
                    setTimeout(() => setMergeNotice(null), 4000);
                    return prev;
                }
                const toRemove = collectDescendants(orderId, prev);
                if (toRemove.size > 1) {
                    const ok = typeof window === "undefined"
                        ? true
                        : window.confirm(
                            `Delete this order and ${toRemove.size - 1} descendant${toRemove.size === 2 ? "" : "s"}?`,
                        );
                    if (!ok) return prev;
                }
                if (selectedOrderId && toRemove.has(selectedOrderId)) {
                    setSelectedOrderId(null);
                }
                return prev.filter((o) => !toRemove.has(o.id));
            });
        },
        [selectedOrderId],
    );

    const handleAddParent = useCallback(
        (childOrderId: string, parentOrderId: string) => {
            setOrders((prev) => {
                const child = prev.find((o) => o.id === childOrderId);
                if (!child) return prev;
                const result = mergeSyntheticParent(child, parentOrderId, prev);
                if (!result.ok) {
                    const messages: Record<typeof result.reason, string> = {
                        "self-loop": "A node can't be its own parent.",
                        "duplicate-parent": "That node is already a parent.",
                        "would-create-cycle": "That would create a cycle.",
                    };
                    setMergeNotice(messages[result.reason]);
                    setTimeout(() => setMergeNotice(null), 3000);
                    return prev;
                }
                setMergeNotice(null);
                return prev.map((o) => (o.id === childOrderId ? result.child : o));
            });
        },
        [],
    );

    const handleReset = useCallback(() => {
        const fresh = startSyntheticSession();
        const root = createSyntheticRootOrder(fresh);
        Object.assign(session, fresh);
        setOrders([root.order]);
        setName("Untitled assembly");
        setSlug(null);
        clearCurrentSession();
    }, [session]);

    const handleSaveDraft = useCallback(() => {
        const proposedName = typeof window === "undefined" ? null : window.prompt("Name this draft:", name);
        if (!proposedName || !proposedName.trim()) return;
        const proposedSlug = slug ?? slugify(proposedName);
        if (!proposedSlug) {
            window.alert("Could not derive a URL slug from that name.");
            return;
        }
        const snap: DesignSnapshot = {
            slug: proposedSlug,
            name: proposedName.trim(),
            processId: session.processId,
            nextOrderIndex: session.nextOrderIndex,
            nextSellerIndex: session.nextSellerIndex,
            orders,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        saveNamedDraft(snap);
        setName(snap.name);
        setSlug(snap.slug);
    }, [name, slug, orders, session]);

    const stageLabel = useMemo(() => {
        if (orders.length === 1) return "Stage 0 — the unit";
        if (orders.length === 2) return "Stage 1 — first sub-order";
        return `Stage 2+ — ${orders.length}-node DAG`;
    }, [orders.length]);

    const savedHint = useMemo(() => {
        if (!savedAt) return null;
        if (slug) return `Saved as draft "${name}" · autosaved ${formatRelative(savedAt)}`;
        return `Autosaved ${formatRelative(savedAt)} (in-progress, not named)`;
    }, [savedAt, slug, name]);

    return (
        <div className="min-h-screen bg-neutral-50">
            <div
                data-testid="designer-canvas-toolbar"
                className="px-8 py-4 border-b border-neutral-200 bg-white flex items-center gap-3 flex-wrap"
            >
                <Link
                    href="/builders/designer"
                    className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-400"
                >
                    ← Assemblies
                </Link>
                <span className="text-sm font-semibold text-black truncate max-w-[200px]" title={name}>{name}</span>
                <span className="text-xs text-neutral-500">{stageLabel}</span>
                <button
                    type="button"
                    onClick={handleSaveDraft}
                    data-testid="designer-save-draft"
                    className="ml-auto text-xs px-3 py-1.5 rounded border border-black bg-white hover:bg-neutral-100 font-semibold"
                >
                    {slug ? "Update draft" : "Save as draft"}
                </button>
                <button
                    type="button"
                    onClick={handleReset}
                    disabled={orders.length === 1 && !slug}
                    className={`text-xs px-3 py-1.5 rounded border bg-white disabled:opacity-40 disabled:cursor-not-allowed ${
                        orders.length === 0
                            ? "border-black hover:bg-neutral-100 font-semibold"
                            : "border-neutral-300 hover:border-neutral-400"
                    }`}
                >
                    {orders.length === 0 ? "Start a new unit" : "Reset to unit"}
                </button>
            </div>
            {savedHint && (
                <div className="px-8 py-1.5 text-[11px] text-neutral-500 bg-neutral-50 border-b border-neutral-200" data-testid="designer-saved-hint">
                    {savedHint}
                </div>
            )}
            <div className="container mx-auto px-6 pt-8 pb-16 max-w-5xl">
                <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
                        The bonded commitment
                    </p>
                    <p className="text-sm text-neutral-700 leading-relaxed max-w-2xl">
                        One buyer, one seller, one agreement. Four baseline graphs are inherited automatically: <strong>Value</strong>, <strong>Geo</strong>, <strong>Capital</strong>, <strong>GHG</strong>. Toggle the lens buttons to inspect each graph. The agreementHash binds the four sections into one signed contract.
                    </p>
                    <p className="text-sm text-neutral-700 leading-relaxed max-w-2xl mt-3">
                        To extend the process: grab the <span className="inline-block align-middle w-3 h-3 rounded-full bg-green-600 border-2 border-white" /> handle at the bottom of any active node and drag it into empty space. A sub-order spawns connected to the parent. Cumulative value rolls up; the new node inherits the currency.
                    </p>
                </div>
                <ProcessGraphCanvas
                    orders={orders}
                    title="Bonded commitment"
                    onAddSubOrder={handleAddSubOrder}
                    onAddParent={handleAddParent}
                    onSwapMechanism={handleSwapMechanism}
                    onSelectNode={setSelectedOrderId}
                    onDeleteNode={handleDeleteNode}
                />
                {mergeNotice && (
                    <p className="mt-3 text-xs text-amber-700" data-testid="designer-merge-notice">
                        {mergeNotice}
                    </p>
                )}
                <p className="mt-6 text-xs text-neutral-500">
                    <strong>Drag</strong> a node&apos;s green handle to empty space to add a sub-order, or onto another node to merge it as an additional parent (enables diamond / fan-in). <strong>Click</strong> any edge pill to swap the formation mechanism. <strong>Click</strong> any node to modify its baseline-graph clauses (Geo · GHG · Topology) or to delete it. The <span className="inline-block align-middle w-3 h-3 rounded-full border border-red-300 bg-white text-red-600 text-[8px] leading-[10px] text-center">×</span> in a node&apos;s top-right deletes that node and any descendants. Payment + currency are committed at runtime, not designed here.
                </p>
            </div>
            {selectedOrderId && (() => {
                const selected = orders.find((o) => o.id === selectedOrderId);
                if (!selected) return null;
                return (
                    <AgreementDrawer
                        order={selected}
                        onClose={() => setSelectedOrderId(null)}
                        onChange={(edits) => handleEditAgreement(selectedOrderId, edits)}
                        onDelete={handleDeleteNode}
                    />
                );
            })()}
        </div>
    );
}

function formatRelative(ts: number): string {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleString();
}
