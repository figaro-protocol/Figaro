"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProcessGraphCanvas } from "@/components/core/ProcessGraphCanvas";
import type { Order } from "@/lib/core/store";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { slugify } from "@/lib/shared/slug";
import {
    collectDescendants,
    createSyntheticRootOrder,
    createSyntheticSubOrder,
    editSyntheticAgreement,
    isRootOrder,
    mergeSyntheticParent,
    startSyntheticSession,
    type AgreementEdits,
    type CanonicalFulfilmentMethod,
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
import { AgreementDrawer } from "../_components/AgreementDrawer";
import { deriveOrderTopology } from "@/lib/core/orderTopology";
import { summarizeAgreement } from "@/lib/core/orderAgreement";
import { loadAgreement } from "@/lib/core/agreementStore";

interface InitialState {
    session: SyntheticProcessSession;
    orders: Order[];
    name: string;
    slug: string | null;
}

// Initial render (SSR + first client pass) always uses this fresh seed so the
// server-rendered HTML matches what the client hydrates with. localStorage is
// read in a mount-effect (tryRestoreFromStorage) — never during render.
function buildFreshInitial(): InitialState {
    const fresh = startSyntheticSession();
    const root = createSyntheticRootOrder(fresh);
    return { session: fresh, orders: [root.order], name: "Untitled assembly", slug: null };
}

function tryRestoreFromStorage(draftParam: string | null): InitialState | null {
    if (typeof window === "undefined") return null;

    if (draftParam) {
        const draft = loadNamedDraft(draftParam);
        if (draft) {
            return {
                session: {
                    processId: draft.processId as `0x${string}`,
                    buyerAddress: (draft.orders[0]?.buyer ?? ZERO_ADDRESS) as `0x${string}`,
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
                buyerAddress: (restored.orders[0]?.buyer ?? ZERO_ADDRESS) as `0x${string}`,
                nextOrderIndex: restored.nextOrderIndex,
                nextSellerIndex: restored.nextSellerIndex,
            },
            orders: restored.orders,
            name: restored.name,
            slug: restored.slug || null,
        };
    }

    return null;
}

export function NewAssemblyClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const draftParam = searchParams?.get("draft") ?? null;
    const freshParam = searchParams?.get("fresh") ?? null;

    // Build the fresh seed once. Stored drafts are hydrated below in a
    // mount-effect so server and first-client render agree.
    const initialRef = useRef<InitialState | null>(null);
    if (initialRef.current === null) {
        initialRef.current = buildFreshInitial();
    }
    const initial = initialRef.current;

    const [session] = useState<SyntheticProcessSession>(() => initial.session);
    const [orders, setOrders] = useState<Order[]>(() => initial.orders);
    const [name, setName] = useState<string>(initial.name);
    const [slug, setSlug] = useState<string | null>(initial.slug);

    const [mergeNotice, setMergeNotice] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [headerHeight, setHeaderHeight] = useState(108);

    // Lock body scroll while on /new — this is a canvas-app route, not a
    // document route. Restore on unmount so other (app) pages scroll normally.
    useEffect(() => {
        const prevBody = document.body.style.overflow;
        const prevHtml = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prevBody;
            document.documentElement.style.overflow = prevHtml;
        };
    }, []);

    // Measure the (app) Header's actual rendered height so our fixed wrapper
    // anchors exactly below it. Avoids hard-coded magic numbers that drift
    // when nav rows resize. ResizeObserver re-measures on Header changes.
    useEffect(() => {
        const header = document.querySelector("header");
        if (!header) return;
        const measure = () => setHeaderHeight(header.getBoundingClientRect().height);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(header);
        return () => ro.disconnect();
    }, []);

    // Hydrate from localStorage after mount. Server has no localStorage, so
    // reading it during render would cause an SSR/CSR text mismatch. Run once.
    // The ?fresh=1 query param (set by "Start a blank assembly") clears the
    // autosave and skips restore, then strips itself from the URL so a refresh
    // doesn't wipe in-progress work.
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
        if (freshParam) {
            clearCurrentSession();
            router.replace("/builders/designer/new", { scroll: false });
            setHydrated(true);
            return;
        }
        const restored = tryRestoreFromStorage(draftParam);
        if (restored) {
            Object.assign(session, restored.session);
            setOrders(restored.orders);
            setName(restored.name);
            setSlug(restored.slug);
        }
        setHydrated(true);
        // Mount-only; subsequent draft-param changes are not honored mid-session.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Autosave on every meaningful change — but only after hydration, so we
    // don't clobber stored drafts with the fresh seed before restore completes.
    useEffect(() => {
        if (!hydrated) return;
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
    }, [hydrated, orders, name, slug, session.processId, session.nextOrderIndex, session.nextSellerIndex]);

    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

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

    // Tracks courier sub-orders auto-spawned by the drawer's Delivery
    // selection so a subsequent switch off Delivery can remove the same one
    // without touching manually-added sub-orders.
    const autoAddedCourierByParentRef = useRef<Map<string, string>>(new Map());

    const handleDeliverySelected = useCallback(
        (parentOrderId: string) => {
            setOrders((prev) => {
                const parent = prev.find((o) => o.id === parentOrderId);
                if (!parent) return prev;
                // Skip if the parent already has a child (auto-added or
                // otherwise) — Delivery on a node with children just updates
                // modality in place.
                const hasAnyChild = prev.some((o) => {
                    const summary = summarizeAgreement(loadAgreement(o.agreementHash));
                    return summary?.topology?.parentOrderHashes.includes(parentOrderId) ?? false;
                });
                if (hasAnyChild) return prev;
                const sub = createSyntheticSubOrder(session, parent);
                autoAddedCourierByParentRef.current.set(parentOrderId, sub.order.id);
                return [...prev, sub.order];
            });
        },
        [session],
    );

    const handleDeliveryUnselected = useCallback(
        (parentOrderId: string) => {
            const trackedId = autoAddedCourierByParentRef.current.get(parentOrderId);
            if (!trackedId) return;
            setOrders((prev) => {
                const tracked = prev.find((o) => o.id === trackedId);
                if (!tracked) {
                    autoAddedCourierByParentRef.current.delete(parentOrderId);
                    return prev;
                }
                // Only auto-remove if the tracked sub-order has no descendants
                // of its own. If the user has built downstream from it, leave
                // it alone — explicit Delete is required.
                const hasDescendant = prev.some((o) => {
                    if (o.id === trackedId) return false;
                    const summary = summarizeAgreement(loadAgreement(o.agreementHash));
                    return summary?.topology?.parentOrderHashes.includes(trackedId) ?? false;
                });
                if (hasDescendant) {
                    autoAddedCourierByParentRef.current.delete(parentOrderId);
                    return prev;
                }
                autoAddedCourierByParentRef.current.delete(parentOrderId);
                if (selectedOrderId === trackedId) setSelectedOrderId(null);
                return prev.filter((o) => o.id !== trackedId);
            });
        },
        [selectedOrderId],
    );

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

    const savedHint = useMemo(() => {
        if (!savedAt) return null;
        if (slug) return `Saved as draft "${name}" · autosaved ${formatRelative(savedAt)}`;
        return `Autosaved ${formatRelative(savedAt)} (in-progress, not named)`;
    }, [savedAt, slug, name]);

    return (
        <div style={{ top: headerHeight }} className="fixed left-0 right-0 bottom-0 z-20 bg-canvas flex flex-col overflow-hidden">
            <div
                data-testid="designer-canvas-toolbar"
                className="h-[48px] shrink-0 px-6 border-b border-default bg-paper flex items-center gap-3 overflow-hidden"
            >
                <Link
                    href="/builders/designer"
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong shrink-0"
                >
                    ← Assemblies
                </Link>
                <span className="text-sm font-semibold text-ink-heading truncate max-w-[200px]" title={name}>{name}</span>
                <button
                    type="button"
                    onClick={() => setHelpOpen((v) => !v)}
                    aria-expanded={helpOpen}
                    aria-controls="designer-help-panel"
                    data-testid="designer-help-toggle"
                    className="text-xs w-7 h-7 rounded-full border border-default bg-paper hover:bg-subtle shrink-0 flex items-center justify-center font-semibold text-ink-body"
                    title="What is this?"
                >
                    ?
                </button>
                {savedHint && (
                    <span className="ml-auto text-[11px] text-ink-muted truncate" data-testid="designer-saved-hint">
                        {savedHint}
                    </span>
                )}
                <button
                    type="button"
                    onClick={handleSaveDraft}
                    data-testid="designer-save-draft"
                    className={`text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle font-semibold shrink-0 ${savedHint ? "" : "ml-auto"}`}
                >
                    {slug ? "Update draft" : "Save as draft"}
                </button>
                <button
                    type="button"
                    onClick={handleReset}
                    disabled={orders.length === 1 && !slug}
                    className={`text-xs px-3 py-1.5 rounded border bg-paper disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${
                        orders.length === 0
                            ? "border-ink-heading hover:bg-subtle font-semibold"
                            : "border-default hover:border-default-strong"
                    }`}
                >
                    {orders.length === 0 ? "Start a new unit" : "Reset to unit"}
                </button>
            </div>
            {helpOpen && (
                <div
                    id="designer-help-panel"
                    data-testid="designer-help-panel"
                    className="absolute top-[48px] left-0 right-0 z-30 bg-paper border-b border-default shadow-md max-h-[calc(100%-48px)] overflow-y-auto"
                >
                    <div className="container mx-auto max-w-3xl px-6 py-5 flex flex-col gap-3">
                        <p className="text-sm text-ink-body leading-relaxed">
                            <strong>The bonded commitment.</strong> One buyer, one seller, one agreement. Four baseline graphs are inherited automatically: <strong>Value</strong>, <strong>Geo</strong>, <strong>Capital</strong>, <strong>GHG</strong>. Toggle the lens buttons to inspect each graph. The agreementHash binds the four sections into one signed contract.
                        </p>
                        <p className="text-sm text-ink-body leading-relaxed">
                            To extend the process: grab the <span className="inline-block align-middle w-3 h-3 rounded-full bg-green-600 border-2 border-white" /> handle at the bottom of any active node and drag it into empty space. A sub-order spawns connected to the parent. Cumulative value rolls up; the new node inherits the currency.
                        </p>
                        <p className="text-sm text-ink-body leading-relaxed">
                            <strong>Drag</strong> a node&apos;s green handle to empty space to add a sub-order, or onto another node to merge it as an additional parent (enables diamond / fan-in). <strong>Click</strong> any edge pill to swap the fulfilment method (consume on-site · pickup · 3 delivery variants). <strong>Click</strong> any node to modify its baseline-graph clauses (Geo · GHG · Topology) or to delete it. The <span className="inline-block align-middle w-3 h-3 rounded-full border border-red-300 bg-white text-red-600 text-[8px] leading-[10px] text-center">×</span> in a node&apos;s top-right deletes that node and any descendants. Payment + currency are committed at runtime, not designed here.
                        </p>
                        <button
                            type="button"
                            onClick={() => setHelpOpen(false)}
                            className="self-end text-xs px-3 py-1.5 rounded border border-default bg-paper hover:bg-subtle"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
            <div className="flex-1 overflow-hidden flex flex-row">
                <div className="flex-1 overflow-hidden">
                    <div className="h-full px-6 py-4 flex flex-col">
                        <ProcessGraphCanvas
                            orders={orders}
                            title="Bonded commitment"
                            designerMode
                            onAddSubOrder={handleAddSubOrder}
                            onAddParent={handleAddParent}
                            onSelectNode={setSelectedOrderId}
                            onDeleteNode={handleDeleteNode}
                        />
                        {mergeNotice && (
                            <p className="mt-2 text-xs text-amber-700 shrink-0" data-testid="designer-merge-notice">
                                {mergeNotice}
                            </p>
                        )}
                    </div>
                </div>
                <AgreementDrawer
                    order={selectedOrderId ? (orders.find((o) => o.id === selectedOrderId) ?? null) : null}
                    onClose={() => setSelectedOrderId(null)}
                    onChange={(edits) => {
                        if (selectedOrderId) handleEditAgreement(selectedOrderId, edits);
                    }}
                    hasChildren={(() => {
                        if (!selectedOrderId) return false;
                        const topology = deriveOrderTopology(orders);
                        for (const info of topology.values()) {
                            if (info.parentOrderIds.includes(selectedOrderId)) return true;
                        }
                        return false;
                    })()}
                    onDeliverySelected={handleDeliverySelected}
                    onDeliveryUnselected={handleDeliveryUnselected}
                    embedded
                />
            </div>
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
