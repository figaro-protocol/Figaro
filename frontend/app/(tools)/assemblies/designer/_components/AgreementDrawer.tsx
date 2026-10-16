"use client";

/**
 * AgreementDrawer — order inspector + live agreement and clause registries.
 *
 * Three panels:
 *   - identity (Parties) — buyer / seller / topology position, read from the order
 *     + topology.
 *   - agreements — every LIVE registration on `AgreementRegistry`, read from
 *     the chain, each labeled by its pinned document's name with its key
 *     shown: the designer binds one to this agreement as is (a reusable
 *     unit), or unbinds it.
 *   - registry — every clause registered on `ClauseRegistry`, read live from
 *     the chain, grouped by `groupClausesByArticle()` (the single clause
 *     classification, shared with the /clauses inventory — grouping + order come
 *     from the spec's `block.design.article`, never a hardcoded list), a checkbox
 *     per clause.
 *
 * Clause composition happens on this registry surface, never through
 * per-article editing tabs or hardcoded option enums / sentinels / spec-card
 * field controls.
 *
 * Rendering modes:
 *   - `embedded` (default false): fixed-overlay positioning used by /edit.
 *   - `embedded: true`: inline flex-column block; the page handles placement.
 */

import { useEffect, useMemo, useState } from "react";
import type { Order } from "@/lib/kernel/store";
import {
    fetchRegisteredAgreement,
    getRegisteredAgreement,
    useRegisteredAgreementsVersion,
    usePublishedAgreements,
} from "@/lib/protocol/useAgreementRegistry";
import { useAllRegisteredClauses, type RegisteredClauseEvent } from "@/lib/protocol/useClauseRegistry";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { groupClausesByArticle, getClauseSpec, clauseNestsUnder, clauseIsMandatory, clauseIsAssemblyScoped, clauseDesignFills, isLiveRegistration } from "@/lib/shared/clauseSpecSource";
import { truncateHex } from "@/lib/shared/formatHex";
import { ClausesByArticle } from "@/components/runtime/ClausesByArticle";
import { FieldControl } from "@/components/runtime/FieldControl";

interface Props {
    /** Currently-selected order. May be null in `embedded` mode (renders an
        empty state). */
    order: Order | null;
    onClose: () => void;
    /** Inline flex-column block (no fixed positioning) when true. */
    embedded?: boolean;
    /** Tabs stay navigable but every control is disabled — used by /view. */
    readOnly?: boolean;
    /** Every order in the design — drives the per-node tab row. */
    orders?: Order[];
    /** Switch to another node's agreement. Paired with `orders`. */
    onSelectOrder?: (orderId: string) => void;
    /** clause key → composed clause map for the current order. A key's
     *  presence = selected; values exist only for clauses declaring
     *  `block.design.fills` (the designer's tailoring — consent's affix);
     *  every other clause carries `{}`, its fields fill at checkout. */
    selectedClauseValues?: Record<string, Record<string, unknown>>;
    /** Toggle a clause (one key) on/off for the current order. */
    onToggleClause?: (clauseKey: string, next: boolean) => void;
    /** Set one field named in a selected clause's `design.fills` (the only
     *  fields the drawer renders editors for). */
    onSetClauseField?: (clauseKey: string, field: string, value: unknown) => void;
    /** The registered agreement this agreement binds (`AgreementRegistry`
     *  key), when it binds one. */
    boundAgreementKey?: `0x${string}`;
    /** Bind a registered agreement to this agreement, or unbind (`null`). */
    onBindAgreement?: (agreementKey: `0x${string}` | null) => void;
    /** Register this order's agreement on its own — pin, stake and
     *  register it on `AgreementRegistry` now, without publishing an
     *  assembly — and bind the agreement to the registered key. Resolves to
     *  the key; rejects with the reason the registration did not happen. */
    onRegisterAgreement?: () => Promise<`0x${string}`>;
}

export function AgreementDrawer({
    order,
    onClose,
    embedded = false,
    readOnly = false,
    orders,
    onSelectOrder,
    selectedClauseValues,
    onToggleClause,
    onSetClauseField,
    boundAgreementKey,
    onBindAgreement,
    onRegisterAgreement,
}: Props) {
    const [openSection, setOpenSection] = useState<string | null>(null);
    const [minimized, setMinimized] = useState(false);
    const [headerHeight, setHeaderHeight] = useState(108);

    useEffect(() => {
        if (embedded) return;
        const header = document.querySelector("header");
        if (!header) return;
        const measure = () => setHeaderHeight(header.getBoundingClientRect().height);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(header);
        return () => ro.disconnect();
    }, [embedded]);



    // Auto-open Parties on each new order.
    useEffect(() => {
        if (order) setOpenSection("identity");
    }, [order?.orderHash]);

    if (!order) {
        if (!embedded) return null;
        return (
            <aside
                data-testid="agreement-drawer"
                data-empty="true"
                className="w-[360px] shrink-0 bg-paper border-l border-default flex flex-col items-center justify-center text-center px-6"
            >
                <div className="text-ink-faint text-4xl mb-3" aria-hidden>←</div>
                <p className="text-sm font-semibold text-ink-body mb-1">
                    Select a node to edit
                </p>
                <p className="text-xs text-ink-muted leading-relaxed max-w-[260px]">
                    Click any node on the canvas to inspect its parties and the
                    clauses available on the network.
                </p>
            </aside>
        );
    }

    const orderIndex = orders ? orders.findIndex((o) => o.orderHash === order.orderHash) : -1;
    const orderNumber = orderIndex >= 0 ? orderIndex + 1 : 1;
    // Topology is first-class on the order (the topology clause's data), read
    // directly — never recovered from the agreement. Forking a live assembly
    // reconstructs these onto the order via fetchAgreement in the fork flow.
    const parentOrderHashes = order.parentOrderHashes ?? [];

    const presentArticles: readonly string[] = ["identity", "agreements", "registry"];

    function selectSection(section: string) {
        // Always open the clicked tab — never toggle it closed. Clicking an
        // already-open tab keeps its content visible (hiding it on a second
        // click is the bad UX we removed).
        setOpenSection(section);
    }

    return (
        <aside
            data-testid="agreement-drawer"
            data-minimized={minimized}
            data-embedded={embedded}
            style={
                embedded
                    ? { width: minimized ? 48 : 360 }
                    : { top: headerHeight, height: `calc(100vh - ${headerHeight}px)`, width: minimized ? 48 : 380 }
            }
            className={
                embedded
                    ? "shrink-0 bg-paper border-l border-default overflow-hidden flex flex-col transition-[width] duration-150"
                    : "fixed right-0 bg-paper border-l border-t border-default shadow-xl z-30 overflow-hidden flex flex-col rounded-tl-lg transition-[width] duration-150"
            }
        >
            {minimized && (
                <div className="flex flex-col items-center py-3 gap-2">
                    <button
                        type="button"
                        onClick={() => setMinimized(false)}
                        aria-label="Expand drawer"
                        data-testid="drawer-expand"
                        title="Expand"
                        className="w-8 h-8 rounded border border-default hover:border-default-strong bg-paper text-ink-body text-xs"
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close drawer"
                        title="Close"
                        className="w-8 h-8 rounded border border-default hover:border-error bg-paper text-ink-body text-xs"
                    >
                        ✕
                    </button>
                    <div className="border-t border-default w-6 my-1" />
                    {presentArticles.map((article) => (
                        <button
                            key={article}
                            type="button"
                            onClick={() => { setMinimized(false); setOpenSection(article); }}
                            title={article}
                            data-testid={`drawer-rail-${article}`}
                            className="w-full text-[10px] text-ink-muted hover:text-ink-primary px-1 py-1"
                        >
                            {article.slice(0, 3)}
                        </button>
                    ))}
                </div>
            )}
            {!minimized && (<>
            <div className="px-5 py-3 border-b border-default flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs text-ink-muted">Agreement</p>
                    <p
                        className="text-sm font-semibold text-ink-primary mt-0.5 truncate"
                        data-testid="drawer-selected-order-id"
                        title={order.orderHash}
                    >
                        Order {orderNumber}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setMinimized(true)}
                        aria-label="Minimize drawer"
                        data-testid="drawer-minimize"
                        title="Minimize"
                        className="text-xs text-ink-muted hover:text-ink-primary px-1"
                    >
                        ›
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close drawer"
                        data-testid="drawer-close"
                        className="text-xs text-ink-muted hover:text-ink-primary px-1"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {orders && orders.length > 1 && onSelectOrder && (
                <div
                    data-testid="drawer-node-tabs"
                    className="flex flex-row gap-1 px-3 py-2 border-b border-default overflow-x-auto"
                >
                    {orders.map((node, index) => {
                        const isActive = node.orderHash === order.orderHash;
                        return (
                            <button
                                key={node.orderHash}
                                type="button"
                                onClick={() => onSelectOrder(node.orderHash)}
                                data-testid={`drawer-node-tab-${node.orderHash}`}
                                aria-pressed={isActive}
                                title={node.orderHash}
                                className={`shrink-0 rounded border px-3 py-1 text-xs ${
                                    isActive
                                        ? "border-ink-primary bg-ink-primary text-paper"
                                        : "border-default bg-paper text-ink-body hover:border-default-strong"
                                }`}
                            >
                                Order {index + 1}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="flex-1 flex flex-row overflow-hidden">
                <nav
                    data-testid="drawer-articles-nav"
                    className="w-[112px] shrink-0 border-r border-default overflow-y-auto"
                >
                    {presentArticles.map((article) => {
                        const isOpen = openSection === article;
                        return (
                            <button
                                key={article}
                                type="button"
                                onClick={() => selectSection(article)}
                                data-testid={`drawer-tab-${article}`}
                                aria-pressed={isOpen}
                                className={`w-full text-left text-xs px-4 py-2.5 ${
                                    isOpen
                                        ? "bg-subtle text-ink-primary font-semibold"
                                        : "text-ink-body hover:bg-subtle"
                                }`}
                            >
                                {article}
                            </button>
                        );
                    })}
                </nav>
                <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
                    <fieldset
                        disabled={readOnly}
                        data-testid="drawer-article-body"
                        data-readonly={readOnly || undefined}
                        className="contents"
                    >
                    {openSection === "identity" && (
                        <section data-testid="drawer-section-identity">
                            <div className="space-y-5">
                                <div>
                                    <span className="text-xs text-ink-muted">Buyer</span>
                                    <p className="font-mono text-xs text-ink-body break-all mt-0.5" data-testid="drawer-identity-buyer">
                                        {order.buyer}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-xs text-ink-muted">Seller</span>
                                    <p className="font-mono text-xs text-ink-body break-all mt-0.5" data-testid="drawer-identity-seller">
                                        {order.seller}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-xs text-ink-muted">Position</span>
                                    {parentOrderHashes && parentOrderHashes.length > 0 ? (
                                        <ul
                                            className="font-mono text-[10px] text-ink-body space-y-1 break-all mt-0.5"
                                            data-testid="drawer-identity-parents"
                                        >
                                            {parentOrderHashes.map((p) => (
                                                <li key={p}>{p}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p
                                            className="text-xs text-ink-body mt-0.5"
                                            data-testid="drawer-identity-root"
                                        >
                                            Root order.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {openSection === "agreements" && (
                        <RegisteredAgreementsPanel
                            boundAgreementKey={boundAgreementKey}
                            onBindAgreement={onBindAgreement}
                            onRegisterAgreement={onRegisterAgreement}
                            composedClauseCount={Object.keys(selectedClauseValues ?? {}).length}
                            readOnly={readOnly}
                        />
                    )}

                    {openSection === "registry" && (
                        <ClauseRegistryPanel
                            selectedClauseValues={selectedClauseValues}
                            onToggleClause={onToggleClause}
                            onSetClauseField={onSetClauseField}
                        />
                    )}

                    </fieldset>
                </div>
            </div>
            </>)}
        </aside>
    );
}

/**
 * The agreement-registry content of the drawer: the agreement's bound
 * agreement (its pinned document's name and its key), and every LIVE
 * registration on `AgreementRegistry` to bind as is — one row per
 * registration, labeled by its pinned document's name (the key alone while
 * the document is unread or unnamed). A withdrawn stake de-surfaces here; an
 * agreement already bound keeps reading whatever its stake.
 */
function RegisteredAgreementsPanel({
    boundAgreementKey,
    onBindAgreement,
    onRegisterAgreement,
    composedClauseCount,
    readOnly,
}: {
    boundAgreementKey?: `0x${string}`;
    onBindAgreement?: (agreementKey: `0x${string}` | null) => void;
    onRegisterAgreement?: () => Promise<`0x${string}`>;
    /** How many clauses the order composes — the register action needs one. */
    composedClauseCount: number;
    readOnly: boolean;
}) {
    const [registering, setRegistering] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const { data: liveAgreements, refetch: refetchAgreements } = usePublishedAgreements(undefined);
    // Re-renders as each document is read and verified (the labels read the
    // session cache).
    useRegisteredAgreementsVersion();
    useEffect(() => {
        for (const row of liveAgreements ?? []) void fetchRegisteredAgreement(row.agreementKey, row.contentURI);
        if (boundAgreementKey) void fetchRegisteredAgreement(boundAgreementKey);
    }, [liveAgreements, boundAgreementKey]);
    const label = (agreementKey: `0x${string}`): string => {
        const doc = getRegisteredAgreement(agreementKey);
        const key = truncateHex(agreementKey, { head: 10, tail: 4 });
        return doc?.name ? `${doc.name} · ${key}` : key;
    };
    const boundDoc = boundAgreementKey ? getRegisteredAgreement(boundAgreementKey) : undefined;
    return (
        <section data-testid="drawer-section-agreements" className="space-y-4">
            <div data-testid="drawer-bound-agreement">
                <p className="text-xs text-ink-muted mb-1">This agreement&rsquo;s agreement</p>
                {boundAgreementKey ? (
                    <div className="space-y-1">
                        <p
                            className="font-mono text-[11px] text-ink-body break-all"
                            data-testid="drawer-bound-agreement-key"
                            title={boundAgreementKey}
                        >
                            {label(boundAgreementKey)}
                        </p>
                        {boundDoc && (
                            <ul className="text-[11px] text-ink-muted space-y-0.5" data-testid="drawer-bound-agreement-clauses">
                                {Object.keys(boundDoc.clauses).map((clauseKey) => (
                                    <li key={clauseKey}>
                                        {getClauseSpec(clauseKey)?.title ?? truncateHex(clauseKey, { head: 10, tail: 0 })}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {!readOnly && onBindAgreement && (
                            <button
                                type="button"
                                onClick={() => onBindAgreement(null)}
                                data-testid="drawer-unbind-agreement"
                                className="text-xs underline text-ink-muted hover:text-ink-primary"
                            >
                                Unbind &mdash; compose this order&rsquo;s clauses instead
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-xs text-ink-body" data-testid="drawer-composed-agreement">
                            A new agreement, composed from the clauses on the registry tab. Publishing
                            registers it on the <code className="font-mono">AgreementRegistry</code> first,
                            or register it now on its own: one stake, reusable in any assembly.
                        </p>
                        {!readOnly && onRegisterAgreement && (
                            <button
                                type="button"
                                disabled={registering || composedClauseCount === 0}
                                onClick={() => {
                                    setRegistering(true);
                                    setRegisterError(null);
                                    onRegisterAgreement()
                                        // The list is the live registry: re-read it so the
                                        // registration just made is offered at once.
                                        .then(() => refetchAgreements())
                                        .catch((err: unknown) => {
                                            setRegisterError(err instanceof Error ? err.message : String(err));
                                        })
                                        .finally(() => setRegistering(false));
                                }}
                                data-testid="drawer-register-agreement"
                                className="text-xs px-2 py-1 rounded border border-default bg-paper text-ink-body hover:border-default-strong disabled:opacity-50"
                            >
                                {registering ? "Registering\u2026" : "Register this agreement on its own"}
                            </button>
                        )}
                        {registerError && (
                            <p className="text-xs text-danger-fg" role="alert" data-testid="drawer-register-agreement-error">
                                {registerError}
                            </p>
                        )}
                    </div>
                )}
            </div>
            {!readOnly && (
                <div>
                    <p className="text-xs text-ink-muted mb-2">
                        Or bind a registered agreement as is &mdash; read live from the on-chain{" "}
                        <code className="font-mono">AgreementRegistry</code>.
                    </p>
                    {liveAgreements === null ? (
                        <p className="text-xs text-ink-muted" data-testid="drawer-agreements-loading">
                            Reading the registry&hellip;
                        </p>
                    ) : liveAgreements.length === 0 ? (
                        <p className="text-xs text-ink-muted" data-testid="drawer-agreements-empty">
                            No agreements registered on the network this site is reading.
                        </p>
                    ) : (
                        <ul className="space-y-1" data-testid="drawer-agreements-list">
                            {liveAgreements.map((row) => {
                                const bound = !!boundAgreementKey && boundAgreementKey.toLowerCase() === row.agreementKey.toLowerCase();
                                return (
                                    <li key={row.agreementKey}>
                                        <button
                                            type="button"
                                            onClick={() => onBindAgreement?.(row.agreementKey)}
                                            aria-pressed={bound}
                                            data-testid={`drawer-agreement-${row.agreementKey}`}
                                            title={row.agreementKey}
                                            className={`w-full text-left text-[11px] font-mono px-2 py-1 rounded border break-all ${
                                                bound
                                                    ? "border-ink-primary bg-subtle text-ink-primary"
                                                    : "border-default bg-paper text-ink-body hover:border-default-strong"
                                            }`}
                                        >
                                            {label(row.agreementKey)}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}

/**
 * One registered clause on the registry tab: a checkbox to compose it onto the
 * order, plus — for fields named in design.fills only — its field editors when
 * selected (general clauses fill at checkout; runtime process clauses
 * toggle whole — no fields). Under any field, renders the clauses that declare
 * `block.design.nestsUnder === <that field's name>` (read from the spec, never
 * hardcoded) — e.g. proximity-policy nested under the modality clause's
 * `handoff` field. Recurses, so a nested clause can host deeper nesting.
 */
interface ClauseRegistryPanelProps {
    selectedClauseValues?: Record<string, Record<string, unknown>>;
    onToggleClause?: (clauseKey: string, next: boolean) => void;
    onSetClauseField?: (clauseKey: string, field: string, value: unknown) => void;
}

/**
 * The clause-registry content of the drawer — the single composition surface.
 * Reads the on-chain clause set (chain → IPFS), groups it via the one shared
 * `groupClausesByArticle()` classification, and renders a checkbox per clause. Owns its
 * own loading state; the drawer shell knows nothing about clauses.
 */
function ClauseRegistryPanel({
    selectedClauseValues,
    onToggleClause,
    onSetClauseField,
}: ClauseRegistryPanelProps) {
    // The clause set is network state — read live from `ClauseRegistry.ClauseRegistered`,
    // each spec fetched from its on-chain `contentURI` (chain → IPFS). `clauseSpecsVersion`
    // bumps as specs resolve so the grouping recomputes against the warm cache.
    // Surfacing derives from the live stake (K4): the drawer OFFERS clauses
    // for new compositions, so withdrawn-stake clauses drop here — while
    // orders already committed elsewhere still resolve under them (spec-loading is
    // unfiltered by design).
    const { data: allRegisteredClauses } = useAllRegisteredClauses();
    const registeredClauses = useMemo(
        () => allRegisteredClauses?.filter(isLiveRegistration) ?? null,
        [allRegisteredClauses],
    );
    const { version: clauseSpecsVersion } = useClauseSpecs();

    // THE single clause classification, shared with the /clauses inventory.
    const registryGroups = useMemo<{ article: string; entries: RegisteredClauseEvent[] }[] | null>(() => {
        if (registeredClauses === null) return null;
        // Keyed by the clause key — every live registration is one row; two
        // specs that share a name (two versions, or a lookalike) are two rows,
        // each labeled by its own spec's name and version.
        const eventByKey = new Map<string, RegisteredClauseEvent>();
        for (const e of registeredClauses) eventByKey.set(e.clauseKey.toLowerCase(), e);

        const groups = groupClausesByArticle()
            .map((g) => ({
                article: g.article,
                entries: g.clauses
                    // Mandatory clauses fold in automatically; ASSEMBLY-SCOPED
                    // clauses (design.scope: "assembly") compose once at the
                    // assembly level, never per order — the drawer offering
                    // them here is how duplicates would happen.
                    .filter((c) => !clauseIsMandatory(c.clauseKey) && !clauseIsAssemblyScoped(c.clauseKey))
                    .map((c) => eventByKey.get(c.clauseKey.toLowerCase()))
                    .filter((e): e is RegisteredClauseEvent => e !== undefined),
            }))
            .filter((g) => g.entries.length > 0);
        return groups;
    }, [registeredClauses, clauseSpecsVersion]);

    return (
                        <section data-testid="drawer-section-registry">
                            <p className="text-xs text-ink-muted mb-3">
                                Compose this order&rsquo;s terms. Check a clause to add it &mdash;
                                the list is read live from the on-chain{" "}
                                <code className="font-mono">ClauseRegistry</code>. Process clauses
                                (like, Merchant, Courier) activate as a whole; their events are
                                attested at runtime as the work happens for coordination.
                            </p>
                            {registeredClauses === null ? (
                                <p
                                    className="text-xs text-ink-muted"
                                    data-testid="drawer-registry-loading"
                                >
                                    Reading the registry&hellip;
                                </p>
                            ) : !registryGroups || registryGroups.length === 0 ? (
                                <p
                                    className="text-xs text-ink-muted"
                                    data-testid="drawer-registry-empty"
                                >
                                    No clauses registered on the network this site is reading.
                                </p>
                            ) : (
                                <ClausesByArticle
                                    sections={(registryGroups ?? []).map((g) => ({
                                        article: g.article,
                                        items: g.entries.filter(
                                            (c) => !clauseNestsUnder(c.clauseKey),
                                        ),
                                    }))}
                                    rootTestId="drawer-registry-list"
                                    rootClassName="space-y-5"
                                    listClassName="space-y-2"
                                    headingClassName="text-sm font-medium text-ink-heading mb-2"
                                    sectionTestId={(article) => `drawer-registry-group-${article}`}
                                    renderClause={(clause, i) => (
                                        <li key={`${clause.clauseKey}-${i}`}>
                                            <ClauseControl
                                                clause={clause}
                                                registeredClauses={registeredClauses}
                                                selectedClauseValues={selectedClauseValues}
                                                onToggleClause={onToggleClause}
                                                onSetClauseField={onSetClauseField}
                                            />
                                        </li>
                                    )}
                                />
                            )}
                        </section>
    );
}

function ClauseControl({
    clause,
    registeredClauses,
    selectedClauseValues,
    onToggleClause,
    onSetClauseField,
}: {
    clause: RegisteredClauseEvent;
    registeredClauses: ReadonlyArray<RegisteredClauseEvent> | null | undefined;
    selectedClauseValues?: Record<string, Record<string, unknown>>;
    onToggleClause?: (clauseKey: string, next: boolean) => void;
    onSetClauseField?: (clauseKey: string, field: string, value: unknown) => void;
}) {
    // A row is one registration: one key, checked when the composition holds
    // that key.
    const clauseKey = clause.clauseKey;
    const selected = selectedClauseValues ? clauseKey in selectedClauseValues : false;
    const values = selectedClauseValues?.[clauseKey] ?? {};
    const spec = getClauseSpec(clauseKey);
    return (
        <div>
            <label className="flex items-center gap-2 text-xs text-ink-body">
                <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={selected}
                    onChange={(e) => onToggleClause?.(clauseKey, e.target.checked)}
                    data-testid={`drawer-registry-clause-${clauseKey}`}
                />
                <span
                    className={`text-xs text-ink-primary${spec?.description ? " cursor-help" : ""}`}
                    title={spec?.description}
                >
                    {spec?.title ?? truncateHex(clauseKey, { head: 10, tail: 0 })}
                    {spec ? <span className="ml-1 font-mono text-[10px] text-ink-muted" title={clauseKey}>v{spec.version}</span> : null}
                </span>
            </label>
            {selected && spec && spec.fields.length > 0 && (
                <div className="ml-6 mt-2 space-y-3">
                    {spec.fields
                        .filter((field) => {
                            // Gate an object sub-clause on a sibling
                            // array-of-enum field that offers the object's name
                            // as a value — the object shows only while its name
                            // is selected. Read from the spec — never hardcoded.
                            // (No current clause uses this; dormant, generic.)
                            if (field.type !== "object") return true;
                            const gate = spec.fields.find(
                                (f) =>
                                    f.type === "array"
                                    && f.items.type === "enum"
                                    && f.items.values.includes(field.name),
                            );
                            if (!gate) return true;
                            const picked = values[gate.name];
                            return Array.isArray(picked) && picked.includes(field.name);
                        })
                        .map((field) => {
                            const nested = (registeredClauses ?? []).filter(
                                (c) => clauseNestsUnder(c.clauseKey) === field.name,
                            );
                            // Design time is STRUCTURAL: the
                            // designer edits ONLY the fields a clause names in
                            // `block.design.fills` — the tailoring (a pinned
                            // consent document, a pinned denomination).
                            // Every other field shows no inputs here: it is a
                            // transaction particular (the buyer's, at checkout)
                            // or a seller fill (catalog/profile, folded at
                            // checkout). Sub-clause NESTING is structure and
                            // always renders.
                            const editable = clauseDesignFills(clauseKey).includes(field.name);
                            if (!editable && nested.length === 0) return null;
                            return (
                                <div key={field.name}>
                                    {editable && <FieldControl
                                        field={field}
                                        value={values[field.name]}
                                        onChange={(v) => onSetClauseField?.(clauseKey, field.name, v)}
                                        testId={`drawer-field-${clauseKey}-${field.name}`}
                                        hideLabel={field.name.toLowerCase() === (spec.title ?? "").toLowerCase()}
                                    />}
                                    {nested.map((nc) => (
                                        <div
                                            key={nc.clauseKey}
                                            className="mt-2 ml-3 border-l border-default pl-3"
                                            data-testid={`drawer-nested-${field.name}-${nc.clauseKey}`}
                                        >
                                            <ClauseControl
                                                clause={nc}
                                                registeredClauses={registeredClauses}
                                                selectedClauseValues={selectedClauseValues}
                                                onToggleClause={onToggleClause}
                                                onSetClauseField={onSetClauseField}
                                            />
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                </div>
            )}
        </div>
    );
}
