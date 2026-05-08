"use client";

/**
 * EditAssemblyPage — fork a reference assembly and modify it on the DAG
 * canvas. Same UI shape as /builders/designer/new (ProcessGraphCanvas +
 * AgreementDrawer + toolbar) but seeded by `assemblyToSyntheticOrders`
 * instead of a fresh blank session, so the canvas opens pre-populated
 * with the reference's canonical tree (root + sub-orders informed by
 * the assembly's roles + mechanisms).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notFound } from "next/navigation";
import { ProcessGraphCanvas } from "@/components/core/ProcessGraphCanvas";
import type { Order } from "@/lib/core/store";
import {
    collectDescendants,
    createSyntheticSubOrder,
    deriveFulfilmentMethod,
    editSyntheticAgreement,
    FULFILMENT_METHOD_LABELS,
    isRootOrder,
    mergeSyntheticParent,
    swapSyntheticFulfilmentMethod,
    type AgreementEdits,
    type CanonicalFulfilmentMethod,
    type SyntheticProcessSession,
} from "@/lib/designer/syntheticProcess";
import { CANONICAL_FULFILMENT_METHODS_LIST } from "@/lib/core/orderAgreement";
import {
    clearCurrentSession,
    saveCurrentSession,
    saveNamedDraft,
    type DesignSnapshot,
} from "@/lib/designer/syntheticDesignStore";
import { AgreementDrawer } from "../../_components/AgreementDrawer";
import { REFERENCE_ASSEMBLIES, type Assembly } from "@/lib/shared/assembly";
import { slugify } from "@/lib/shared/slug";
import { assemblyToSyntheticOrders } from "@/lib/designer/assemblyToSyntheticOrders";

interface InitialState {
    session: SyntheticProcessSession;
    orders: Order[];
    name: string;
    slug: string | null;
}

function buildInitialStateFromFork(reference: Assembly): InitialState {
    const { session, orders } = assemblyToSyntheticOrders(reference);
    return {
        session,
        orders,
        name: `Fork of ${reference.identity.name}`,
        slug: null,
    };
}

interface Props {
    params: { slug: string };
}

export function EditAssemblyClient({ params }: Props) {
    const reference = useMemo(
        () => REFERENCE_ASSEMBLIES.find((a) => a.identity.slug === params.slug),
        [params.slug],
    );

    if (!reference) notFound();

    // Build initial state once. The seed re-runs only on explicit "Reset to seed".
    const initialRef = useRef<InitialState | null>(null);
    if (initialRef.current === null) {
        initialRef.current = buildInitialStateFromFork(reference);
    }
    const initial = initialRef.current;

    const [session, setSession] = useState<SyntheticProcessSession>(() => initial.session);
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
        (childOrderId: string, method: CanonicalFulfilmentMethod) => {
            setOrders((prev) => {
                const child = prev.find((o) => o.id === childOrderId);
                if (!child) return prev;
                const updated = swapSyntheticFulfilmentMethod(child, method);
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
                if (isRootOrder(orderId, prev)) {
                    setMergeNotice("Root orders can't be deleted from the canvas. Use \"Reset to seed\" to re-fork.");
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

    const handleResetToSeed = useCallback(() => {
        if (!reference) return;
        const seeded = buildInitialStateFromFork(reference);
        setSession(seeded.session);
        setOrders(seeded.orders);
        setName(seeded.name);
        setSlug(seeded.slug);
        clearCurrentSession();
    }, [reference]);

    const handleSaveDraft = useCallback(() => {
        const proposedName = typeof window === "undefined" ? null : window.prompt("Name this draft:", name);
        if (!proposedName || !proposedName.trim()) return;
        const proposedSlug = slug ?? slugify(proposedName).slice(0, 64);
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

    const rootOrder = useMemo(
        () => orders.find((o) => isRootOrder(o.id, orders)) ?? null,
        [orders],
    );
    const rootFulfilment = rootOrder ? deriveFulfilmentMethod(rootOrder) : null;

    const savedHint = useMemo(() => {
        if (!savedAt) return null;
        if (slug) return `Saved as draft "${name}" · autosaved ${formatRelative(savedAt)}`;
        return `Autosaved ${formatRelative(savedAt)} (in-progress, not named)`;
    }, [savedAt, slug, name]);

    return (
        <div className="min-h-screen bg-canvas">
            <div
                data-testid="designer-canvas-toolbar"
                className="px-8 py-4 border-b border-default bg-paper flex items-center gap-3 flex-wrap"
            >
                <Link
                    href="/builders/designer"
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong"
                >
                    ← Assemblies
                </Link>
                <span className="text-sm font-semibold text-ink-heading truncate max-w-[260px]" title={name}>{name}</span>
                <span
                    className="text-[10px] uppercase tracking-widest text-ink-muted rounded bg-subtle px-2 py-0.5"
                    data-testid="designer-fork-badge"
                    title={`Forked from ${reference.identity.name}`}
                >
                    Forked from {reference.identity.name}
                </span>
                <span className="text-xs text-ink-muted">{stageLabel}</span>
                {rootOrder && rootFulfilment && (
                    <label className="text-xs text-ink-muted flex items-center gap-1.5">
                        <span>Root fulfilment</span>
                        <select
                            data-testid="designer-root-fulfilment"
                            value={rootFulfilment}
                            onChange={(e) =>
                                handleSwapMechanism(
                                    rootOrder.id,
                                    e.target.value as CanonicalFulfilmentMethod,
                                )
                            }
                            className="text-xs px-2 py-1 rounded border border-default bg-paper hover:border-default-strong text-ink-primary"
                        >
                            {CANONICAL_FULFILMENT_METHODS_LIST.map((method) => (
                                <option key={method} value={method}>
                                    {FULFILMENT_METHOD_LABELS[method]}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <button
                    type="button"
                    onClick={handleSaveDraft}
                    data-testid="designer-save-draft"
                    className="ml-auto text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle font-semibold"
                >
                    {slug ? "Update draft" : "Save as draft"}
                </button>
                <button
                    type="button"
                    onClick={handleResetToSeed}
                    data-testid="designer-reset-seed"
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong"
                >
                    Reset to seed
                </button>
            </div>
            {savedHint && (
                <div className="px-8 py-1.5 text-[11px] text-ink-muted bg-canvas border-b border-default" data-testid="designer-saved-hint">
                    {savedHint}
                </div>
            )}
            <div className="container mx-auto px-6 pt-8 pb-16 max-w-5xl">
                <div className="mb-6">
                    <p className="text-eyebrow uppercase text-ink-muted mb-2">
                        Forked design
                    </p>
                    <p className="text-sm text-ink-body leading-relaxed max-w-2xl">
                        Pre-populated from <strong>{reference.identity.name}</strong> ({reference.roles.length} roles · {reference.mechanisms.filter((m) => m.enabled).length} active mechanisms). The seed produced the canonical tree (root commitment + sub-orders implied by the assembly&apos;s declarations). Modify it: drag the green handle on any node to add a sub-order, click an edge pill to swap fulfilment method on a sub-order, change the root&apos;s fulfilment with the toolbar selector above, click a node to edit its baseline-graph clauses (Geo · GHG · Topology). Save as a draft (local storage); publishing to the on-chain registry is a follow-up.
                    </p>
                </div>
                <ProcessGraphCanvas
                    orders={orders}
                    title={`${reference.identity.name} (forked)`}
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
                <p className="mt-6 text-xs text-ink-muted">
                    Same affordances as <Link href="/builders/designer/new" className="underline">/new</Link>. <strong>Drag</strong> a node&apos;s green handle to empty space to add a sub-order, or onto another node to merge it as an additional parent. <strong>Click</strong> any edge pill to swap the fulfilment method. <strong>Click</strong> any node to modify its baseline-graph clauses or to delete it. The <span className="inline-block align-middle w-3 h-3 rounded-full border border-red-300 bg-white text-red-600 text-[8px] leading-[10px] text-center">×</span> in a node&apos;s top-right deletes that node and any descendants. Payment + currency are committed at runtime, not designed here.
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
