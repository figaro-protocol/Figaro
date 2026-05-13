"use client";

/**
 * DesignerCanvas — the shared DAG editor used by /builders/designer/new
 * and /builders/designer/edit/[slug]. Both pages render this component
 * with different `seed` props; everything else (state, handlers,
 * autosave, drawer, prose sheet, toolbar, help panel) is identical.
 *
 * Seed kinds:
 *   - 'fresh'  — SSR-safe blank; on mount, try to restore current-session.
 *   - 'blank'  — explicit blank; clear current-session, do not restore.
 *   - 'draft'  — load a named draft from localStorage by slug.
 *   - 'fork'   — fork an existing Assembly (used by the transitional
 *                /edit/[slug] reference-assembly path; will be removed
 *                in Phase 6 when REFERENCE_ASSEMBLIES is deleted).
 *
 * SSR contract: 'fork' computes its initial state synchronously (the
 * reference is server-resolvable). 'fresh' / 'blank' / 'draft' all
 * render a blank canvas on first pass and apply the seed in a mount
 * effect — this is forced by localStorage being client-only.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
    readAgreementFields,
    startSyntheticSession,
    type AgreementEdits,
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
import { AgreementDrawer } from "./AgreementDrawer";
import { ProseSheet, type ProseSheetValues } from "./ProseSheet";
import { usePublishAssembly } from "@/lib/mechanisms/useAssemblyRegistry";
import { deriveOrderTopology } from "@/lib/core/orderTopology";
import { summarizeAgreement } from "@/lib/core/orderAgreement";
import { loadAgreement } from "@/lib/core/agreementStore";
import { assemblyToSyntheticOrders } from "@/lib/designer/assemblyToSyntheticOrders";
import type { Assembly } from "@/lib/shared/assembly";

export type DesignerSeed =
    | { kind: "fresh" }
    | { kind: "blank" }
    | { kind: "draft"; slug: string }
    | { kind: "fork"; reference: Assembly };

interface InitialState {
    session: SyntheticProcessSession;
    orders: Order[];
    name: string;
    slug: string | null;
    prose: ProseSheetValues;
}

function proseFromSnapshot(snap: DesignSnapshot): ProseSheetValues {
    return {
        description: snap.description,
        narrativeSummary: snap.narrativeSummary,
        builderNotes: snap.builderNotes,
        mechanismLabels: snap.mechanismLabels,
        roleLabels: snap.roleLabels,
    };
}

function proseFromReference(reference: Assembly): ProseSheetValues {
    const mechanismLabels: Record<string, string> = {};
    for (const mech of reference.mechanisms) {
        if (!mechanismLabels[mech.kind]) {
            mechanismLabels[mech.kind] = mech.displayName;
        }
    }
    const roleLabels: Record<string, { displayName: string; sampleCapabilities?: string[] }> = {};
    for (const role of reference.roles) {
        roleLabels[role.roleKind] = {
            displayName: role.displayName,
            sampleCapabilities: role.sampleCapabilities,
        };
    }
    return {
        description: reference.identity.description,
        narrativeSummary: reference.narrative?.assemblySummary,
        builderNotes: reference.narrative?.builderNotes,
        mechanismLabels,
        roleLabels,
    };
}

function buildBlankInitial(): InitialState {
    const fresh = startSyntheticSession();
    const root = createSyntheticRootOrder(fresh);
    return {
        session: fresh,
        orders: [root.order],
        name: "Untitled assembly",
        slug: null,
        prose: {},
    };
}

function buildForkInitial(reference: Assembly): InitialState {
    const { session, orders } = assemblyToSyntheticOrders(reference);
    return {
        session,
        orders,
        name: `Fork of ${reference.identity.name}`,
        slug: null,
        prose: proseFromReference(reference),
    };
}

function snapshotToInitial(snap: DesignSnapshot): InitialState {
    return {
        session: {
            processId: snap.processId as `0x${string}`,
            buyerAddress: (snap.orders[0]?.buyer ?? ZERO_ADDRESS) as `0x${string}`,
            nextOrderIndex: snap.nextOrderIndex,
            nextSellerIndex: snap.nextSellerIndex,
        },
        orders: snap.orders,
        name: snap.name,
        slug: snap.slug || null,
        prose: proseFromSnapshot(snap),
    };
}

export function DesignerCanvas({ seed }: { seed: DesignerSeed }) {
    const router = useRouter();

    // Initial render must match SSR. For 'fork' the reference is server-resolvable,
    // so we can compute the forked initial synchronously. For all others we start
    // blank and hydrate in a mount effect.
    const initialRef = useRef<InitialState | null>(null);
    if (initialRef.current === null) {
        initialRef.current = seed.kind === "fork"
            ? buildForkInitial(seed.reference)
            : buildBlankInitial();
    }
    const initial = initialRef.current;

    const [session] = useState<SyntheticProcessSession>(() => initial.session);
    const [orders, setOrders] = useState<Order[]>(() => initial.orders);
    const [name, setName] = useState<string>(initial.name);
    const [slug, setSlug] = useState<string | null>(initial.slug);
    const [prose, setProse] = useState<ProseSheetValues>(() => initial.prose);

    const [mergeNotice, setMergeNotice] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [proseOpen, setProseOpen] = useState(false);
    const [headerHeight, setHeaderHeight] = useState(108);
    const [seedError, setSeedError] = useState<string | null>(null);

    const handleProseChange = useCallback((patch: ProseSheetValues) => {
        setProse((prev) => ({ ...prev, ...patch }));
    }, []);

    // Lock body scroll: the canvas is an app-route, not a document route.
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

    // Anchor below the (app) Header, re-measure on header height changes.
    useEffect(() => {
        const header = document.querySelector("header");
        if (!header) return;
        const measure = () => setHeaderHeight(header.getBoundingClientRect().height);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(header);
        return () => ro.disconnect();
    }, []);

    // Apply the seed on mount. localStorage is client-only, so this can't run
    // during render. `hydrated` gates autosave to avoid clobbering stored state
    // with a blank seed before restore completes.
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
        if (seed.kind === "fork") {
            // Fork was applied synchronously during render. Mount as hydrated.
            setHydrated(true);
            return;
        }
        if (seed.kind === "blank") {
            clearCurrentSession();
            setHydrated(true);
            return;
        }
        if (seed.kind === "draft") {
            const draft = loadNamedDraft(seed.slug);
            if (!draft) {
                setSeedError(`Draft "${seed.slug}" not found in this browser's local storage.`);
                setHydrated(true);
                return;
            }
            const restored = snapshotToInitial(draft);
            Object.assign(session, restored.session);
            setOrders(restored.orders);
            setName(restored.name);
            setSlug(restored.slug);
            setProse(restored.prose);
            setHydrated(true);
            return;
        }
        // 'fresh': try to resume the autosaved current session.
        const restored = loadCurrentSession();
        if (restored && restored.orders.length > 0) {
            const init = snapshotToInitial(restored);
            Object.assign(session, init.session);
            setOrders(init.orders);
            setName(init.name);
            setSlug(init.slug);
            setProse(init.prose);
        }
        setHydrated(true);
        // Mount-only; subsequent seed changes are ignored.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Autosave after hydration.
    useEffect(() => {
        if (!hydrated) return;
        if (seedError) return;
        const snap: DesignSnapshot = {
            slug: slug ?? "",
            name,
            processId: session.processId,
            nextOrderIndex: session.nextOrderIndex,
            nextSellerIndex: session.nextSellerIndex,
            orders,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...prose,
        };
        saveCurrentSession(snap);
        setSavedAt(Date.now());
    }, [hydrated, seedError, orders, name, slug, prose, session.processId, session.nextOrderIndex, session.nextSellerIndex]);

    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    const handleAddSubOrder = useCallback(
        (parentOrderId: string) => {
            setOrders((prev) => {
                const parent = prev.find((o) => o.id === parentOrderId);
                if (!parent) return prev;
                const sub = createSyntheticSubOrder(session, parent, { roleHint: "co-seller" });
                return [...prev, sub.order];
            });
        },
        [session],
    );

    const autoAddedCourierByParentRef = useRef<Map<string, string>>(new Map());

    const handleDeliverySelected = useCallback(
        (parentOrderId: string) => {
            setOrders((prev) => {
                const parent = prev.find((o) => o.id === parentOrderId);
                if (!parent) return prev;
                const hasAnyChild = prev.some((o) => {
                    const summary = summarizeAgreement(loadAgreement(o.agreementHash));
                    return summary?.topology?.parentOrderHashes.includes(parentOrderId) ?? false;
                });
                if (hasAnyChild) return prev;
                const sub = createSyntheticSubOrder(session, parent, {
                    roleHint: "courier",
                    courierProcessIncluded: true,
                });
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

    const autoAddedOffsetByParentRef = useRef<Map<string, string>>(new Map());

    const handleOffsetSelected = useCallback(
        (parentOrderId: string) => {
            if (autoAddedOffsetByParentRef.current.has(parentOrderId)) return;
            setOrders((prev) => {
                const parent = prev.find((o) => o.id === parentOrderId);
                if (!parent) return prev;
                const sub = createSyntheticSubOrder(session, parent, { roleHint: "offset" });
                autoAddedOffsetByParentRef.current.set(parentOrderId, sub.order.id);
                return [...prev, sub.order];
            });
        },
        [session],
    );

    const handleOffsetUnselected = useCallback(
        (parentOrderId: string) => {
            const trackedId = autoAddedOffsetByParentRef.current.get(parentOrderId);
            if (!trackedId) return;
            setOrders((prev) => {
                const tracked = prev.find((o) => o.id === trackedId);
                if (!tracked) {
                    autoAddedOffsetByParentRef.current.delete(parentOrderId);
                    return prev;
                }
                const hasDescendant = prev.some((o) => {
                    if (o.id === trackedId) return false;
                    const summary = summarizeAgreement(loadAgreement(o.agreementHash));
                    return summary?.topology?.parentOrderHashes.includes(trackedId) ?? false;
                });
                if (hasDescendant) {
                    autoAddedOffsetByParentRef.current.delete(parentOrderId);
                    return prev;
                }
                autoAddedOffsetByParentRef.current.delete(parentOrderId);
                if (selectedOrderId === trackedId) setSelectedOrderId(null);
                return prev.filter((o) => o.id !== trackedId);
            });
        },
        [selectedOrderId],
    );

    const handleEditAgreement = useCallback((orderId: string, edits: AgreementEdits) => {
        setOrders((prev) => {
            const target = prev.find((o) => o.id === orderId);
            if (!target) return prev;
            const updated = editSyntheticAgreement(target, edits);
            return prev.map((o) => (o.id === orderId ? updated : o));
        });
    }, []);

    const handleDeleteNode = useCallback(
        (orderId: string) => {
            setOrders((prev) => {
                const target = prev.find((o) => o.id === orderId);
                if (!target) return prev;
                if (isRootOrder(orderId, prev)) {
                    setMergeNotice("Root orders can't be deleted from the canvas. Use \"Reset\" to clear the design.");
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

    const handleAddParent = useCallback((childOrderId: string, parentOrderId: string) => {
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
    }, []);

    const handleReset = useCallback(() => {
        // For 'fork' seed, reset re-applies the reference. For everything else,
        // reset clears to a fresh blank.
        if (seed.kind === "fork") {
            const reseed = buildForkInitial(seed.reference);
            Object.assign(session, reseed.session);
            setOrders(reseed.orders);
            setName(reseed.name);
            setSlug(reseed.slug);
            setProse(reseed.prose);
            clearCurrentSession();
            return;
        }
        const fresh = startSyntheticSession();
        const root = createSyntheticRootOrder(fresh);
        Object.assign(session, fresh);
        setOrders([root.order]);
        setName("Untitled assembly");
        setSlug(null);
        setProse({});
        clearCurrentSession();
    }, [seed, session]);

    const buildSnapshot = useCallback((): DesignSnapshot | null => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const proposedSlug = slug ?? slugify(trimmed).slice(0, 64);
        if (!proposedSlug) {
            window.alert("Could not derive a URL slug from that name.");
            return null;
        }
        return {
            slug: proposedSlug,
            name: trimmed,
            processId: session.processId,
            nextOrderIndex: session.nextOrderIndex,
            nextSellerIndex: session.nextSellerIndex,
            orders,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...prose,
        };
    }, [name, slug, orders, prose, session]);

    const handleSaveDraft = useCallback(() => {
        const snap = buildSnapshot();
        if (!snap) return;
        saveNamedDraft(snap);
        setName(snap.name);
        setSlug(snap.slug);
    }, [buildSnapshot]);

    const { publish, isPending: publishPending, isConfirming: publishConfirming } =
        usePublishAssembly();
    const publishInFlight = publishPending || publishConfirming;

    const handlePublishDraft = useCallback(async () => {
        const snap = buildSnapshot();
        if (!snap) return;
        try {
            const outcome = await publish(snap);
            window.alert(`Publish submitted.\nIPFS: ${outcome.ipfsURI}\nTx: ${outcome.hash}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            window.alert(`Publish failed: ${message}`);
        }
    }, [buildSnapshot, publish]);

    const handleExportDraft = useCallback(() => {
        const snap = buildSnapshot();
        if (!snap) return;
        const agreements: Record<string, unknown> = {};
        for (const order of snap.orders) {
            if (!order.agreementHash) continue;
            const agreement = loadAgreement(order.agreementHash);
            if (agreement) agreements[order.agreementHash] = agreement;
        }
        const payload = { ...snap, agreements };
        const json = JSON.stringify(
            payload,
            (_key, value) => (typeof value === "bigint" ? value.toString() : value),
            2,
        );
        navigator.clipboard
            .writeText(json)
            .then(() => window.alert("Design + agreements copied to clipboard."))
            .catch(() => window.alert("Clipboard copy failed. Check browser permissions."));
    }, [buildSnapshot]);

    const savedHint = useMemo(() => {
        if (!savedAt) return null;
        if (slug) return `Saved as draft "${name}" · autosaved ${formatRelative(savedAt)}`;
        return `Autosaved ${formatRelative(savedAt)} (in-progress, not named)`;
    }, [savedAt, slug, name]);

    const isForkSeed = seed.kind === "fork";
    const resetLabel = isForkSeed ? "Reset to seed" : (orders.length === 0 ? "Start a new unit" : "Reset to unit");
    const forkReferenceName = isForkSeed ? seed.reference.identity.name : null;

    if (seedError) {
        return (
            <div
                style={{ top: headerHeight }}
                className="fixed left-0 right-0 bottom-0 z-20 bg-canvas flex flex-col items-center justify-center px-6"
                data-testid="designer-seed-error"
            >
                <div className="max-w-md text-center">
                    <h1 className="text-heading-h2 text-ink-heading mb-4">Draft not found</h1>
                    <p className="text-sm text-ink-body mb-6">{seedError}</p>
                    <div className="flex gap-3 justify-center">
                        <Link
                            href="/builders/designer"
                            className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong"
                        >
                            ← Back to assemblies
                        </Link>
                        <Link
                            href="/builders/designer/new?fresh=1"
                            className="text-xs px-3 py-1.5 rounded border border-ink-heading bg-ink-heading text-paper hover:bg-ink-primary font-semibold"
                        >
                            Start a blank assembly
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

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
                {forkReferenceName && (
                    <span
                        className="text-[10px] uppercase tracking-widest text-ink-muted rounded bg-subtle px-2 py-0.5 shrink-0"
                        data-testid="designer-fork-badge"
                        title={`Forked from ${forkReferenceName}`}
                    >
                        Forked from {forkReferenceName}
                    </span>
                )}
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
                    onClick={() => setProseOpen(true)}
                    data-testid="designer-save-draft"
                    className={`text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle font-semibold shrink-0 ${savedHint ? "" : "ml-auto"}`}
                    title="Name, prose, and save"
                >
                    {slug ? "Update draft…" : "Save as draft…"}
                </button>
                <button
                    type="button"
                    onClick={handleReset}
                    data-testid="designer-reset"
                    disabled={!isForkSeed && orders.length === 1 && !slug}
                    className={`text-xs px-3 py-1.5 rounded border bg-paper disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${
                        !isForkSeed && orders.length === 0
                            ? "border-ink-heading hover:bg-subtle font-semibold"
                            : "border-default hover:border-default-strong"
                    }`}
                >
                    {resetLabel}
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
                            <strong>The bonded commitment.</strong> One buyer, one seller, one agreement. Toggle the canvas lens buttons (<strong>Value</strong>, <strong>Geo</strong>, <strong>Capital</strong>, <strong>GHG</strong>) to switch the overlay. Each node opens an agreement drawer; the drawer&apos;s articles (Identity, Order, Fulfilment, Logistics, Attestations, Emissions, Jurisdiction, Consent) compose the order&apos;s signed agreement. The agreementHash binds those clauses into one contract.
                        </p>
                        <p className="text-sm text-ink-body leading-relaxed">
                            To extend the process: grab the <span className="inline-block align-middle w-3 h-3 rounded-full border border-neutral-400 bg-white text-[8px] leading-[10px] text-center text-neutral-600">+</span> handle at the bottom of any active node and drag it into empty space. A sub-order spawns connected to the parent. Cumulative value rolls up; the new node inherits the currency.
                        </p>
                        <p className="text-sm text-ink-body leading-relaxed">
                            <strong>Drag</strong> a node&apos;s <span className="inline-block align-middle w-3 h-3 rounded-full border border-neutral-400 bg-white text-[8px] leading-[10px] text-center text-neutral-600">+</span> handle to empty space to add a sub-order, or onto another node to merge it as an additional parent (enables diamond / fan-in). <strong>Click</strong> any node to open the agreement drawer or to delete it; fulfilment, logistics, and every other clause are edited in the drawer. The <span className="inline-block align-middle w-3 h-3 rounded-full border border-red-300 bg-white text-red-600 text-[8px] leading-[10px] text-center">×</span> in a node&apos;s top-right deletes that node and any descendants. Payment + currency are committed at runtime, not designed here.
                        </p>
                        <p className="text-sm text-ink-body leading-relaxed">
                            <strong>Missing a clause or mechanism?</strong> Authoring a new schema (Tier 2) or new mechanism contract (Tier 3) lives outside the designer. See <Link href="/builders/composability" className="underline">/builders/composability</Link> for the architecture, <Link href="/schemas" className="underline">/schemas</Link> for clause authoring, or <Link href="/spec" className="underline">/spec</Link> for the on-chain contract inventory.
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
                            title={forkReferenceName ? `${forkReferenceName} (forked)` : "Bonded commitment"}
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
                    parentDeliveryActive={(() => {
                        if (!selectedOrderId) return false;
                        const topology = deriveOrderTopology(orders);
                        const info = topology.get(selectedOrderId);
                        if (!info || info.parentOrderIds.length === 0) return false;
                        for (const parentId of info.parentOrderIds) {
                            const parent = orders.find((o) => o.id === parentId);
                            if (!parent) continue;
                            const summary = summarizeAgreement(loadAgreement(parent.agreementHash));
                            if (summary?.fulfilment?.modalities?.includes("delivery")) return true;
                        }
                        return false;
                    })()}
                    hasCourierChild={(() => {
                        if (!selectedOrderId) return false;
                        const topology = deriveOrderTopology(orders);
                        for (const child of orders) {
                            const info = topology.get(child.id);
                            if (!info?.parentOrderIds.includes(selectedOrderId)) continue;
                            const childFields = readAgreementFields(child);
                            if (childFields.roleHint === "courier") return true;
                        }
                        return false;
                    })()}
                    onDeliverySelected={handleDeliverySelected}
                    onDeliveryUnselected={handleDeliveryUnselected}
                    onOffsetSelected={handleOffsetSelected}
                    onOffsetUnselected={handleOffsetUnselected}
                    embedded
                />
            </div>
            <ProseSheet
                open={proseOpen}
                onClose={() => setProseOpen(false)}
                orders={orders}
                values={prose}
                onChange={handleProseChange}
                name={name}
                onNameChange={setName}
                onSave={handleSaveDraft}
                saveLabel={slug ? "Update draft" : "Save as draft"}
                onExport={handleExportDraft}
                onPublish={handlePublishDraft}
                publishInFlight={publishInFlight}
            />
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
