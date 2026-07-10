"use client";

/**
 * DesignerCanvas — the shared composition canvas (the TopologyCanvas of
 * orders + the per-order AgreementDrawer) used by /builders/designer/new
 * and /builders/designer/edit/[slug]. Both pages render this component
 * with different `seed` props; everything else (state, handlers,
 * autosave, drawer, toolbar) is identical.
 *
 * Toolbar surface (left → right):
 *   ← Assemblies | saved hint | Save | Review | Reset
 *
 * Buttons are weighted by the action we want to incentivize:
 *   - Publish:  filled primary    — irreversible, costs the registration deposit
 *   - Save:     outline           — frequent, recoverable; the everyday action
 *   - Reset:    subtle/text-link  — destructive but recoverable (autosave caught it)
 *
 * Seed kinds:
 *   - 'fresh'  — SSR-safe blank; on mount, try to restore current-session.
 *   - 'blank'  — explicit blank; clear current-session, do not restore.
 *   - 'draft'  — load a named draft from localStorage by slug.
 *
 * SSR contract: every kind renders a blank canvas on first pass and
 * applies the seed in a mount effect — localStorage is client-only.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TopologyCanvas } from "@/components/runtime/TopologyCanvas";
import type { Order } from "@/lib/kernel/store";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import {
    collectDescendants,
    createSyntheticRootOrder,
    createSyntheticSubOrder,
    isRootOrder,
    mergeSyntheticParent,
    startSyntheticSession,
    type SyntheticProcessSession,
} from "@/lib/designer/syntheticProcess";
import {
    clearCurrentSession,
    deleteNamedDraft,
    loadCurrentSession,
    loadNamedDraft,
    saveCurrentSession,
    saveNamedDraft,
    type DesignSnapshot,
} from "@/lib/designer/syntheticDesignStore";
import { AgreementDrawer } from "./AgreementDrawer";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { maxCommitsLandableInOneBlock, maxOrdersResolvablePerProcess } from "@/lib/shared/chainGasCeilings";
import { useChainId, usePublicClient } from "wagmi";
import { formatRelative } from "@/lib/shared/formatTimestamp";

export type DesignerSeed =
    | { kind: "fresh" }
    | { kind: "blank" }
    | { kind: "draft"; slug: string };

interface InitialState {
    session: SyntheticProcessSession;
    orders: Order[];
    name: string;
    summary: string;
    description: string;
    slug: string | null;
    clausesByOrderId: Record<string, Record<string, Record<string, unknown>>>;
    clauseVersionsByOrderId: Record<string, Record<string, number>>;
}

function buildBlankInitial(): InitialState {
    const fresh = startSyntheticSession();
    const root = createSyntheticRootOrder(fresh);
    return {
        session: fresh,
        orders: [root.order],
        // Empty editorial — the placeholder shows; naming is optional (display
        // falls back to the content-derived slug when these are blank).
        name: "",
        summary: "",
        description: "",
        slug: null,
        clausesByOrderId: {},
        clauseVersionsByOrderId: {},
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
        summary: snap.summary ?? "",
        description: snap.description ?? "",
        slug: snap.slug || null,
        clausesByOrderId: snap.clausesByOrderId ?? {},
        clauseVersionsByOrderId: snap.clauseVersionsByOrderId ?? {},
    };
}

/**
 * Spec gate. `buildBlankInitial` — and every subsequent canvas edit — builds
 * synthetic agreements whose sections are projected and hashed through the
 * chain-loaded clause specs (default fill, sentinel filtering, range checks
 * all live in the spec, never in code). Built against a half-warm cache the
 * sections come out unprojected and the hash path rejects them — so the
 * canvas honors the `useClauseSpecs` contract and gates its render on
 * `loaded`. Latched: a clause registered mid-session flips `loaded` false on
 * the registry append, which must never unmount a live canvas.
 */
export function DesignerCanvas({ seed }: { seed: DesignerSeed }) {
    const { loaded } = useClauseSpecs();
    const everLoadedRef = useRef(false);
    if (loaded) everLoadedRef.current = true;
    if (!everLoadedRef.current) {
        return (
            <p className="text-sm text-ink-muted" data-testid="designer-specs-loading">
                Loading registered clauses…
            </p>
        );
    }
    return <DesignerCanvasInner seed={seed} />;
}

function DesignerCanvasInner({ seed }: { seed: DesignerSeed }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Initial render must match SSR — start blank and hydrate from the
    // appropriate seed in a mount effect.
    const initialRef = useRef<InitialState | null>(null);
    if (initialRef.current === null) {
        initialRef.current = buildBlankInitial();
    }
    const initial = initialRef.current;

    const [session] = useState<SyntheticProcessSession>(() => initial.session);
    const [orders, setOrders] = useState<Order[]>(() => initial.orders);
    // Per-order clause selection (the Registry checkboxes). Keyed by order id;
    // values are the clauseIds picked on that order. Feeds the assembly
    // template's per-order `clauses`, and persists into the draft snapshot.
    const [clausesByOrderId, setClausesByOrderId] = useState<
        Record<string, Record<string, Record<string, unknown>>>
    >(() => initial.clausesByOrderId);
    // clauseId → registered version picked, per order — sparse (non-1 only);
    // part of the clause's identity, carried into the template's clauseVersions.
    const [clauseVersionsByOrderId, setClauseVersionsByOrderId] = useState<
        Record<string, Record<string, number>>
    >(() => initial.clauseVersionsByOrderId);
    // Editorial metadata — the designer's own words (free-form, NOT a taxonomy).
    // Carried into the assembly template but EXCLUDED from the content hash, so
    // renaming never forks the slug. Blank = unnamed; display falls back to slug.
    const [name, setName] = useState<string>(initial.name);
    const [summary, setSummary] = useState<string>(() => initial.summary);
    const [description, setDescription] = useState<string>(() => initial.description);

    // Character limits on the editorial identity — enforced (maxLength) and shown.
    const NAME_MAX = 80;
    const SUMMARY_MAX = 140;
    const DESCRIPTION_MAX = 600;
    const chainId = useChainId();
    const publicClient = usePublicClient();
    // Chain-aware cap on assembly node count. The hard cap is the RESOLVE
    // ceiling — every order must settle in one atomic resolveProcess within a
    // block (~1,240 on a 30M-gas chain), the same ceiling the publish-time guard
    // enforces. The COMMIT ceiling is NOT a size limit but a landing rate:
    // committing N orders takes ~ceil(N / commits-per-block) blocks (multi-tx
    // checkout), surfaced as a soft signal, never a gate. null = ceilings not
    // read yet (no client cap; the publish-time guard still applies).
    const [orderCaps, setOrderCaps] = useState<{ commit: number; resolve: number } | null>(null);
    const maxOrders = orderCaps ? orderCaps.resolve : null;
    const commitBlocks = orderCaps && orderCaps.commit > 0
        ? Math.ceil(orders.length / orderCaps.commit)
        : null;
    const [slug, setSlug] = useState<string | null>(initial.slug);

    const [mergeNotice, setMergeNotice] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [seedError, setSeedError] = useState<string | null>(null);
    /** Belt-and-suspenders against double-publish: flips true the moment a
     *  publish succeeds and stays true for the rest of this canvas
     *  session. The redirect that fires on success removes the user from
     *  the canvas anyway, but if the redirect is interrupted the flag
     *  keeps the Publish button disabled. */

    // The designer is an in-flow page now (header + canvas + footer), not a
    // fixed full-screen overlay — so no body-scroll lock and no header-height
    // measuring. It fills its layout's <main> via flex.

    // Apply the seed on mount. localStorage is client-only, so this can't run
    // during render. `hydrated` gates autosave to avoid clobbering stored state
    // with a blank seed before restore completes.
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
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
            setSummary(restored.summary);
            setDescription(restored.description);
            setSlug(restored.slug);
            setClausesByOrderId(restored.clausesByOrderId);
            setClauseVersionsByOrderId(restored.clauseVersionsByOrderId);
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
            setSummary(init.summary);
            setDescription(init.description);
            setSlug(init.slug);
            setClausesByOrderId(init.clausesByOrderId);
            setClauseVersionsByOrderId(init.clauseVersionsByOrderId);
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
            summary: summary || undefined,
            description: description || undefined,
            processId: session.processId,
            nextOrderIndex: session.nextOrderIndex,
            nextSellerIndex: session.nextSellerIndex,
            orders,
            clausesByOrderId,
            clauseVersionsByOrderId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        saveCurrentSession(snap);
        setSavedAt(Date.now());
    }, [hydrated, seedError, orders, clausesByOrderId, clauseVersionsByOrderId, name, summary, description, slug, session.processId, session.nextOrderIndex, session.nextSellerIndex]);

    // Read both chain gas ceilings (each depends on the live block gas limit, so
    // it's a runtime read; recompute when the chain changes).
    useEffect(() => {
        if (!publicClient) return;
        let cancelled = false;
        Promise.all([
            maxCommitsLandableInOneBlock(publicClient),
            maxOrdersResolvablePerProcess(publicClient),
        ])
            .then(([commit, resolve]) => { if (!cancelled) setOrderCaps({ commit, resolve }); })
            .catch(() => { /* leave null → no client cap; publish-time guard still applies */ });
        return () => { cancelled = true; };
    }, [publicClient, chainId]);

    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    const toggleClause = useCallback((orderId: string, clauseId: string, next: boolean, version?: number) => {
        setClausesByOrderId((prev) => {
            const order = { ...(prev[orderId] ?? {}) };
            if (next) {
                if (!(clauseId in order)) order[clauseId] = {};
            } else {
                delete order[clauseId];
            }
            return { ...prev, [orderId]: order };
        });
        // The picked registry row's version — part of the clause's identity.
        // Sparse: only non-1 versions are recorded (mirrors the template).
        setClauseVersionsByOrderId((prev) => {
            const order = { ...(prev[orderId] ?? {}) };
            if (next && version !== undefined && version !== 1) order[clauseId] = version;
            else delete order[clauseId];
            return { ...prev, [orderId]: order };
        });
    }, []);

    const setClauseField = useCallback(
        (orderId: string, clauseId: string, field: string, value: unknown) => {
            setClausesByOrderId((prev) => {
                const order = { ...(prev[orderId] ?? {}) };
                const clause = { ...(order[clauseId] ?? {}) };
                const isEmpty =
                    value === undefined ||
                    value === null ||
                    value === "" ||
                    (Array.isArray(value) && value.length === 0);
                if (isEmpty) delete clause[field];
                else clause[field] = value;
                order[clauseId] = clause;
                return { ...prev, [orderId]: order };
            });
        },
        [],
    );

    // True when the assembly already holds the most orders this chain can
    // resolve atomically in one block. null maxOrders (ceiling not yet read, or
    // read failed) means no client-side cap — the publish-time guard still bites.
    const atOrderCapacity = maxOrders !== null && orders.length >= maxOrders;

    const handleAddSubOrder = useCallback(
        (parentOrderId: string) => {
            if (atOrderCapacity) {
                setMergeNotice(
                    `This chain settles at most ${maxOrders} orders in one atomic resolveProcess — remove a node to add another, or compose multiple processes.`,
                );
                setTimeout(() => setMergeNotice(null), 5000);
                return;
            }
            const parent = orders.find((o) => o.orderHash === parentOrderId);
            if (!parent) return;
            const sub = createSyntheticSubOrder(session, parent, orders);
            setOrders((prev) => [...prev, sub.order]);
        },
        [atOrderCapacity, maxOrders, orders, session],
    );

    const handleDeleteNode = useCallback(
        (orderId: string) => {
            setOrders((prev) => {
                const target = prev.find((o) => o.orderHash === orderId);
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
                return prev.filter((o) => !toRemove.has(o.orderHash));
            });
        },
        [selectedOrderId],
    );

    const handleAddParent = useCallback((childOrderId: string, parentOrderId: string) => {
        setOrders((prev) => {
            const child = prev.find((o) => o.orderHash === childOrderId);
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
            return prev.map((o) => (o.orderHash === childOrderId ? result.child : o));
        });
    }, []);

    const handleReset = useCallback(() => {
        // Reset clears to a fresh blank.
        const fresh = startSyntheticSession();
        const root = createSyntheticRootOrder(fresh);
        Object.assign(session, fresh);
        setOrders([root.order]);
        // Empty editorial — same as buildBlankInitial; naming is optional.
        setName("");
        setSummary("");
        setDescription("");
        setSlug(null);
        clearCurrentSession();
    }, [session]);

    /** Validation result for `buildSnapshot`. Distinguishes the failure
     *  modes so the caller can surface a specific error before opening
     *  the wallet. */
    type SnapshotResult =
        | { ok: true; snapshot: DesignSnapshot }
        | { ok: false; reason: "empty-composition" };

    const buildSnapshot = useCallback((): SnapshotResult => {
        if (orders.length === 0) return { ok: false, reason: "empty-composition" };
        // The draft gets a stable local handle (assigned once, reused on every
        // save) that keys the local draft + its /edit and /view routes. The
        // PUBLISHED slug is derived from the composition's content at publish
        // time (deriveAssemblySlug) — independent of the editorial `name`, which
        // is the designer's own words and may be blank.
        const handle = slug ?? `asm-draft-${crypto.randomUUID().slice(0, 8)}`;
        return {
            ok: true,
            snapshot: {
                slug: handle,
                name,
                summary: summary || undefined,
                description: description || undefined,
                processId: session.processId,
                nextOrderIndex: session.nextOrderIndex,
                nextSellerIndex: session.nextSellerIndex,
                orders,
                clausesByOrderId,
                clauseVersionsByOrderId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
        };
    }, [slug, name, summary, description, orders, clausesByOrderId, clauseVersionsByOrderId, session]);

    function explainSnapshotReason(_reason: "empty-composition"): string {
        return "Add at least one order before publishing.";
    }

    const handleSaveDraft = useCallback(() => {
        const result = buildSnapshot();
        if (!result.ok) {
            window.alert(explainSnapshotReason(result.reason));
            return;
        }
        // If the slug changed (rename), drop the old localStorage entry so
        // we don't leave a stale duplicate behind.
        if (slug && slug !== result.snapshot.slug) {
            deleteNamedDraft(slug);
        }
        saveNamedDraft(result.snapshot);
        setName(result.snapshot.name);
        setSlug(result.snapshot.slug);
        // Same post-action navigation as Review — land on the assemblies
        // list where the newly-saved draft appears under "Your drafts".
        // Preserve a ?e2e= mode flag so a test run stays in devnet/mock mode.
        const e2e = searchParams.get("e2e");
        router.push(e2e ? `/builders/designer?e2e=${encodeURIComponent(e2e)}` : "/builders/designer");
    }, [buildSnapshot, router, searchParams, slug]);

    // The designer "Review" button only NAVIGATES to the review page; the
    // actual publish (IPFS pin + wallet deposit + registerAssembly) happens
    // there via `review-confirm-publish`. No publish state lives here.
    const handleReview = useCallback(() => {
        // Pre-review validation: the review page resolves by slug, so the
        // snapshot must be a valid named draft. Surface the specific reason
        // before navigation if not.
        const result = buildSnapshot();
        if (!result.ok) {
            window.alert(explainSnapshotReason(result.reason));
            return;
        }
        // If the slug changed (rename), drop the old localStorage entry so
        // the review page doesn't resolve a stale snapshot.
        if (slug && slug !== result.snapshot.slug) {
            deleteNamedDraft(slug);
        }
        // Save the draft so the review page (which loads by slug) sees the
        // exact bytes that will be published. The wallet does NOT open here
        // — the review page's "Confirm publish" is the only place it opens.
        saveNamedDraft(result.snapshot);
        // Preserve a ?e2e= mode flag — the review page must stay in
        // devnet/mock mode across this canvas redirect.
        const e2e = searchParams.get("e2e");
        const reviewPath = `/builders/designer/view/${encodeURIComponent(result.snapshot.slug)}?intent=publish`;
        router.push(e2e ? `${reviewPath}&e2e=${encodeURIComponent(e2e)}` : reviewPath);
    }, [buildSnapshot, router, searchParams, slug]);

    // A draft saves as soon as there's a node to save. Publishing, though, puts
    // the assembly on the network for others to discover — so it REQUIRES the
    // editorial identity: name + short + long description. None are optional.
    // The slug stays content-derived; these are pinned alongside it and excluded
    // from the hash, so editing them never re-slugs.
    const canSaveDraft = orders.length > 0;
    const publishBlockedReason = orders.length === 0
        ? "Add at least one order to the canvas."
        : name.trim() === "" ? "Name your assembly."
        : summary.trim() === "" ? "Add a short description."
        : description.trim() === "" ? "Add a full description."
        : null;
    const canPublish = publishBlockedReason === null;

    const savedHint = useMemo(() => {
        if (!savedAt) return null;
        if (slug) return `Saved "${name || slug}" · ${formatRelative(savedAt)}`;
        return `Autosaved ${formatRelative(savedAt)} · not yet named`;
    }, [savedAt, slug, name]);

    const resetLabel = "Reset";

    if (seedError) {
        return (
            <div
                className="flex-1 min-h-0 bg-canvas flex flex-col items-center justify-center px-6"
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
        <div className="flex-1 min-h-0 bg-canvas flex flex-col overflow-hidden">
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
                {savedHint && (
                    <span className="ml-auto text-[11px] text-ink-muted truncate" data-testid="designer-saved-hint">
                        {savedHint}
                    </span>
                )}
                <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={!canSaveDraft}
                    data-testid="designer-save"
                    className={`text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle text-ink-heading font-semibold shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${savedHint ? "" : "ml-auto"}`}
                    title={slug ? "Update the saved draft" : "Save this canvas as a draft"}
                >
                    {slug ? "Update" : "Save"}
                </button>
                <button
                    type="button"
                    onClick={handleReview}
                    disabled={!canPublish}
                    data-testid="designer-review"
                    className="text-xs px-3 py-1.5 rounded border border-ink-heading bg-ink-heading text-paper hover:bg-ink-primary font-semibold shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={publishBlockedReason ?? "Review the assembly, then publish from the review page (where the deposit is locked and the slug is anchored on-chain)."}
                >
                    Review
                </button>
                <button
                    type="button"
                    onClick={handleReset}
                    data-testid="designer-reset"
                    className="text-[11px] px-2 py-1.5 rounded text-ink-muted hover:text-ink-heading hover:bg-subtle shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Clear the canvas and start over"
                >
                    {resetLabel}
                </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-row">
                {/* LEFT — assembly inspector: the REQUIRED editorial identity
                    (name + short + long description). Assembly-scoped and
                    whole-session, so it lives beside the canvas — not as a band
                    above it — and the graph keeps its full height. Required to
                    publish; pinned to IPFS but excluded from the slug hash. */}
                <aside
                    data-testid="designer-inspector"
                    className="w-[300px] shrink-0 overflow-y-auto border-r border-default bg-paper px-5 py-4"
                >
                    {/* Guidance leads the form — ink-primary (dark warm) so it
                        stands apart from the amber ink-heading field labels.
                        No background; the emphasis is colour + size + weight. */}
                    <p className="mb-4 text-sm font-medium text-ink-primary leading-relaxed">
                        Compose an assembly — a group of bonded orders representing one scenario.
                        Each order is a buyer↔seller relationship; draw the orders and their
                        connections, then click one to compose its terms. Keep each assembly
                        specific — offer variety with more assemblies, not more options.
                    </p>
                    <div data-testid="designer-editorial" className="space-y-2">
                    <label className="block">
                        <div className="flex items-baseline justify-between">
                            <span className="text-xs font-semibold text-ink-heading">Assembly Name</span>
                            <span className="text-[10px] text-ink-faint tabular-nums">{name.length}/{NAME_MAX}</span>
                        </div>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={NAME_MAX}
                            placeholder="A short, memorable name for this assembly"
                            aria-label="Assembly name"
                            data-testid="designer-name-input"
                            className="mt-1 w-full text-xs px-2 py-1.5 rounded border border-default bg-paper text-ink-heading placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus"
                        />
                    </label>
                    <label className="block">
                        <div className="flex items-baseline justify-between">
                            <span className="text-xs font-semibold text-ink-heading">Short description</span>
                            <span className="text-[10px] text-ink-faint tabular-nums">{summary.length}/{SUMMARY_MAX}</span>
                        </div>
                        <input
                            type="text"
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            maxLength={SUMMARY_MAX}
                            placeholder="One line on what this assembly is for"
                            aria-label="Assembly summary"
                            data-testid="designer-summary-input"
                            className="mt-1 w-full text-xs px-2 py-1.5 rounded border border-default bg-paper text-ink-heading placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus"
                        />
                    </label>
                    <label className="block">
                        <div className="flex items-baseline justify-between">
                            <span className="text-xs font-semibold text-ink-heading">Full description</span>
                            <span className="text-[10px] text-ink-faint tabular-nums">{description.length}/{DESCRIPTION_MAX}</span>
                        </div>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={DESCRIPTION_MAX}
                            placeholder="What the buyer receives, and how the parties coordinate"
                            aria-label="Assembly description"
                            rows={3}
                            data-testid="designer-description-input"
                            className="mt-1 w-full text-xs px-2 py-1.5 rounded border border-default bg-paper text-ink-heading placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus resize-y"
                        />
                    </label>
                    </div>

                    {/* The single order counter — consolidated from the old
                        toolbar pill and the canvas subtitle. */}
                    <div className="mt-5 pt-4 border-t border-default">
                        {maxOrders !== null && (
                            <p
                                data-testid="designer-node-capacity"
                                className={`text-[11px] tabular-nums ${atOrderCapacity ? "text-red-600 font-semibold" : "text-ink-muted"}`}
                                title={orderCaps ? `Hard cap ${maxOrders} orders — the most one atomic resolveProcess settles in a block on this chain. Committing them lands ~${orderCaps.commit}/block ≈ ${commitBlocks} block(s) at checkout.` : undefined}
                            >
                                {orders.length} / {maxOrders} orders{commitBlocks && commitBlocks > 1 ? ` · ~${commitBlocks} blocks to commit` : ""}
                            </p>
                        )}
                    </div>

                </aside>
                <div className="flex-1 overflow-hidden">
                    <div className="h-full px-6 py-4 flex flex-col">
                        <TopologyCanvas
                            orders={orders}
                            clauseValuesByOrderId={clausesByOrderId}
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
                    order={selectedOrderId ? (orders.find((o) => o.orderHash === selectedOrderId) ?? null) : null}
                    orders={orders}
                    onSelectOrder={setSelectedOrderId}
                    onClose={() => setSelectedOrderId(null)}
                    selectedClauseValues={
                        selectedOrderId ? (clausesByOrderId[selectedOrderId] ?? {}) : undefined
                    }
                    onToggleClause={(clauseId, next, version) => {
                        if (selectedOrderId) toggleClause(selectedOrderId, clauseId, next, version);
                    }}
                    onSetClauseField={(clauseId, field, value) => {
                        // No clause selection spawns a node — the designer draws nodes
                        // (grievance #3). There is no "delivery" activation; delivery is
                        // a second order the designer draws, not a modality side-effect.
                        if (selectedOrderId) setClauseField(selectedOrderId, clauseId, field, value);
                    }}
                    embedded
                />
            </div>
        </div>
    );
}

