"use client";

/**
 * AgreementDrawer — order inspector + live clause registry.
 *
 * Two panels:
 *   - identity (Parties) — buyer / seller / DAG position, read from the order
 *     + topology.
 *   - registry — every clause registered on `ClauseRegistry`, read live from
 *     the chain, grouped by `groupClausesByArticle()` (the single clause
 *     classification, shared with the /clauses inventory — grouping + order come
 *     from the spec's `block.drawerArticle`, never a hardcoded list), a checkbox
 *     per clause. Companion clauses (named as another's `sisterClauseId`) are
 *     surfaced by their sister at commit, not listed here.
 *
 * The legacy per-article clause-editing tabs (and their hardcoded option
 * enums / sentinels / spec-card field controls) were removed; clause
 * composition is being migrated onto the registry surface.
 *
 * Rendering modes:
 *   - `embedded` (default false): fixed-overlay positioning used by /edit.
 *   - `embedded: true`: inline flex-column block; the page handles placement.
 */

import { useEffect, useMemo, useState } from "react";
import type { Order } from "@/lib/core/store";
import { loadAgreement } from "@/lib/core/agreementStore";
import { summarizeAgreement } from "@/lib/core/orderAgreement";
import { useAllRegisteredClauses, type RegisteredClauseEvent } from "@/lib/mechanisms/useClauseRegistry";
import { useClauseSpecs } from "@/lib/mechanisms/useClauseSpecs";
import { groupClausesByArticle, getClauseSpec, clauseNestsUnder, isCompanionClause, clauseIsStructural } from "@/lib/shared/clauseSpecSource";
import { ClausesByArticle } from "@/components/core/ClausesByArticle";
import type { FieldSpec } from "@figaro/core/clauses";

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
    /** clauseId → design-time field values for the current order. A clause's
     *  presence as a key = selected; the values are what the designer filled. */
    selectedClauseValues?: Record<string, Record<string, unknown>>;
    /** Toggle a clause on/off for the current order. */
    onToggleClause?: (clauseId: string, next: boolean) => void;
    /** Set one design-time field on a selected clause for the current order. */
    onSetClauseField?: (clauseId: string, field: string, value: unknown) => void;
    /** Assembly-level privileged ERC-20 ("" = agnostic). Surfaced in the
     *  Registry tab as an assembly-wide choice. */
    privilegedToken?: string;
    onPrivilegedTokenChange?: (value: string) => void;
    /** Per-chain common-token list that populates the privileged-token choice. */
    commonTokens?: ReadonlyArray<{ address: string; symbol: string; name: string }>;
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
    privilegedToken,
    onPrivilegedTokenChange,
    commonTokens,
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
    }, [order?.id]);

    if (!order) {
        if (!embedded) return null;
        return (
            <aside
                data-testid="agreement-drawer"
                data-empty="true"
                className="w-[360px] shrink-0 bg-white border-l border-neutral-200 flex flex-col items-center justify-center text-center px-6"
            >
                <div className="text-neutral-300 text-4xl mb-3" aria-hidden>←</div>
                <p className="text-sm font-semibold text-neutral-700 mb-1">
                    Select a node to edit
                </p>
                <p className="text-xs text-neutral-500 leading-relaxed max-w-[260px]">
                    Click any node on the canvas to inspect its parties and the
                    clauses available on the network.
                </p>
            </aside>
        );
    }

    const orderIndex = orders ? orders.findIndex((o) => o.id === order.id) : -1;
    const orderNumber = orderIndex >= 0 ? orderIndex + 1 : 1;
    const topology = summarizeAgreement(loadAgreement(order.agreementHash))?.topology;

    const presentArticles: readonly string[] = ["identity", "registry"];

    function selectSection(section: string) {
        setOpenSection((prev) => (prev === section ? null : section));
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
                    ? "shrink-0 bg-white border-l border-neutral-200 overflow-hidden flex flex-col transition-[width] duration-150"
                    : "fixed right-0 bg-white border-l border-t border-neutral-200 shadow-xl z-30 overflow-hidden flex flex-col rounded-tl-lg transition-[width] duration-150"
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
                        className="w-8 h-8 rounded border border-neutral-300 hover:border-neutral-700 bg-white text-neutral-600 text-xs"
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close drawer"
                        title="Close"
                        className="w-8 h-8 rounded border border-neutral-300 hover:border-red-400 bg-white text-neutral-600 text-xs"
                    >
                        ✕
                    </button>
                    <div className="border-t border-neutral-200 w-6 my-1" />
                    {presentArticles.map((article) => (
                        <button
                            key={article}
                            type="button"
                            onClick={() => { setMinimized(false); setOpenSection(article); }}
                            title={article}
                            data-testid={`drawer-rail-${article}`}
                            className="w-full text-[10px] text-neutral-500 hover:text-black px-1 py-1"
                        >
                            {article.slice(0, 3)}
                        </button>
                    ))}
                </div>
            )}
            {!minimized && (<>
            <div className="px-5 py-3 border-b border-neutral-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[11px] text-neutral-500">Agreement</p>
                    <p
                        className="text-sm font-semibold text-black mt-0.5 truncate"
                        data-testid="drawer-selected-order-id"
                        title={order.id}
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
                        className="text-xs text-neutral-500 hover:text-black px-1"
                    >
                        ›
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close drawer"
                        data-testid="drawer-close"
                        className="text-xs text-neutral-500 hover:text-black px-1"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {orders && orders.length > 1 && onSelectOrder && (
                <div
                    data-testid="drawer-node-tabs"
                    className="flex flex-row gap-1 px-3 py-2 border-b border-neutral-200 overflow-x-auto"
                >
                    {orders.map((node, index) => {
                        const isActive = node.id === order.id;
                        return (
                            <button
                                key={node.id}
                                type="button"
                                onClick={() => onSelectOrder(node.id)}
                                data-testid={`drawer-node-tab-${node.id}`}
                                aria-pressed={isActive}
                                title={node.id}
                                className={`shrink-0 rounded border px-3 py-1 text-xs ${
                                    isActive
                                        ? "border-black bg-black text-white"
                                        : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500"
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
                    className="w-[112px] shrink-0 border-r border-neutral-200 overflow-y-auto"
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
                                        ? "bg-neutral-100 text-black font-semibold"
                                        : "text-neutral-600 hover:bg-neutral-50"
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
                                    <span className="text-[11px] text-neutral-500">Buyer</span>
                                    <p className="font-mono text-xs text-neutral-700 break-all mt-0.5" data-testid="drawer-identity-buyer">
                                        {order.buyer}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-[11px] text-neutral-500">Seller</span>
                                    <p className="font-mono text-xs text-neutral-700 break-all mt-0.5" data-testid="drawer-identity-seller">
                                        {order.seller}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-[11px] text-neutral-500">Position</span>
                                    {topology?.parentOrderHashes && topology.parentOrderHashes.length > 0 ? (
                                        <ul
                                            className="font-mono text-[10px] text-neutral-600 space-y-1 break-all mt-0.5"
                                            data-testid="drawer-identity-parents"
                                        >
                                            {topology.parentOrderHashes.map((p) => (
                                                <li key={p}>{p}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p
                                            className="text-xs text-neutral-700 mt-0.5"
                                            data-testid="drawer-identity-root"
                                        >
                                            Root order.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {openSection === "registry" && (
                        <ClauseRegistryPanel
                            selectedClauseValues={selectedClauseValues}
                            onToggleClause={onToggleClause}
                            onSetClauseField={onSetClauseField}
                            privilegedToken={privilegedToken}
                            onPrivilegedTokenChange={onPrivilegedTokenChange}
                            commonTokens={commonTokens}
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
 * One registered clause on the registry tab: a checkbox to compose it onto the
 * order, plus its design-time fields when selected (category-1 process clauses
 * toggle whole — no fields). Under any field, renders the clauses that declare
 * `block.nestsUnder === <that field's name>` (read from the spec, never
 * hardcoded) — e.g. proximity-policy nested under the fulfilment clause's
 * `handoff` field. Recurses, so a nested clause can host deeper nesting.
 */
interface ClauseRegistryPanelProps {
    selectedClauseValues?: Record<string, Record<string, unknown>>;
    onToggleClause?: (clauseId: string, next: boolean) => void;
    onSetClauseField?: (clauseId: string, field: string, value: unknown) => void;
    privilegedToken?: string;
    onPrivilegedTokenChange?: (value: string) => void;
    commonTokens?: ReadonlyArray<{ address: string; symbol: string; name: string }>;
}

/**
 * The clause-registry content of the drawer — the single composition surface.
 * Reads the on-chain clause set (chain → IPFS), groups it via the one shared
 * `groupClausesByArticle()` classification, and renders a checkbox per clause. Owns its
 * own loading state; the drawer shell knows nothing about clauses. The
 * assembly-level privileged-token choice is hosted in the consent group (not a clause).
 */
function ClauseRegistryPanel({
    selectedClauseValues,
    onToggleClause,
    onSetClauseField,
    privilegedToken,
    onPrivilegedTokenChange,
    commonTokens,
}: ClauseRegistryPanelProps) {
    // The clause set is network state — read live from `ClauseRegistry.ClauseRegistered`,
    // each spec fetched from its on-chain `metadataURI` (chain → IPFS). `clauseSpecsVersion`
    // bumps as specs resolve so the grouping recomputes against the warm cache.
    const { data: registeredClauses } = useAllRegisteredClauses();
    const { version: clauseSpecsVersion } = useClauseSpecs();
    const [tokenChecked, setTokenChecked] = useState(false);

    // THE single clause classification, shared with the /clauses inventory.
    const registryGroups = useMemo<{ article: string; entries: RegisteredClauseEvent[] }[] | null>(() => {
        if (registeredClauses === null) return null;
        const eventByName = new Map<string, RegisteredClauseEvent>();
        for (const e of registeredClauses) if (e.clauseName) eventByName.set(e.clauseName, e);

        const groups = groupClausesByArticle()
            .map((g) => ({
                article: g.article,
                entries: g.clauses
                    .filter((c) => !isCompanionClause(c.clauseId) && !clauseIsStructural(c.clauseId))
                    .map((c) => eventByName.get(c.clauseId))
                    .filter((e): e is RegisteredClauseEvent => e !== undefined),
            }))
            .filter((g) => g.entries.length > 0);

        // The privileged-token choice lives in the consent section but is NOT a clause —
        // host it even if no consent clause exists.
        if (onPrivilegedTokenChange && !groups.some((g) => g.article === "consent")) {
            groups.push({ article: "consent", entries: [] });
        }
        return groups;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registeredClauses, onPrivilegedTokenChange, clauseSpecsVersion]);

    return (
                        <section data-testid="drawer-section-registry">
                            <p className="text-[11px] text-neutral-500 mb-3">
                                Compose this order&rsquo;s terms. Check a clause to add it &mdash;
                                the list is read live from the on-chain{" "}
                                <code className="font-mono">ClauseRegistry</code>. Process clauses
                                (like, Merchant, Courier) activate as a whole; their events are
                                attested at runtime as the work happens for coordination.
                            </p>
                            {registeredClauses === null ? (
                                <p
                                    className="text-xs text-neutral-500"
                                    data-testid="drawer-registry-loading"
                                >
                                    Reading the registry&hellip;
                                </p>
                            ) : !registryGroups || registryGroups.length === 0 ? (
                                <p
                                    className="text-xs text-neutral-500"
                                    data-testid="drawer-registry-empty"
                                >
                                    No clauses registered on the network this site is reading.
                                </p>
                            ) : (
                                <ClausesByArticle
                                    sections={(registryGroups ?? []).map((g) => ({
                                        article: g.article,
                                        items: g.entries.filter(
                                            (c) => !(c.clauseName && clauseNestsUnder(c.clauseName)),
                                        ),
                                    }))}
                                    rootTestId="drawer-registry-list"
                                    rootClassName="space-y-5"
                                    listClassName="space-y-2"
                                    headingClassName="text-[11px] font-semibold text-neutral-700 mb-2"
                                    sectionTestId={(article) => `drawer-registry-group-${article}`}
                                    renderClause={(clause, i) => (
                                        <li key={`${clause.clauseIdHash}-${i}`}>
                                            <ClauseControl
                                                clause={clause}
                                                registeredClauses={registeredClauses}
                                                selectedClauseValues={selectedClauseValues}
                                                onToggleClause={onToggleClause}
                                                onSetClauseField={onSetClauseField}
                                            />
                                        </li>
                                    )}
                                    renderSectionFooter={(article) =>
                                        article === "consent" && onPrivilegedTokenChange && (commonTokens?.length ?? 0) > 0 ? (
                                            <li>
                                                <label className="flex items-center gap-2 text-xs text-neutral-700">
                                                    <input
                                                        type="checkbox"
                                                        className="h-3.5 w-3.5"
                                                        checked={tokenChecked || !!privilegedToken}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setTokenChecked(true);
                                                            } else {
                                                                setTokenChecked(false);
                                                                onPrivilegedTokenChange("");
                                                            }
                                                        }}
                                                        data-testid="drawer-registry-clause-privileged-token"
                                                    />
                                                    <span className="font-mono text-[11px]">privileged-token</span>
                                                </label>
                                                {(tokenChecked || !!privilegedToken) && (
                                                    <div className="ml-6 mt-2" data-testid="drawer-privileged-token-group">
                                                        <select
                                                            value={privilegedToken ?? ""}
                                                            onChange={(e) => onPrivilegedTokenChange(e.target.value)}
                                                            data-testid="drawer-privileged-token"
                                                            className="text-xs bg-white border border-neutral-300 rounded px-2 py-1.5 min-h-11 w-full hover:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        >
                                                            <option value="" disabled>Select a token…</option>
                                                            {(commonTokens ?? []).map((t) => (
                                                                <option key={t.address} value={t.address}>
                                                                    {t.symbol}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                            </li>
                                        ) : null
                                    }
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
    const clauseKey = clause.clauseName ?? clause.clauseIdHash;
    const selected = selectedClauseValues ? clauseKey in selectedClauseValues : false;
    const values = selectedClauseValues?.[clauseKey] ?? {};
    const spec = clause.clauseName ? getClauseSpec(clause.clauseName) : undefined;
    return (
        <div>
            <label className="flex items-center gap-2 text-xs text-neutral-700">
                <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={selected}
                    onChange={(e) => onToggleClause?.(clauseKey, e.target.checked)}
                    data-testid={`drawer-registry-clause-${clauseKey}`}
                />
                <span
                    className={`text-xs text-neutral-800${spec?.description ? " cursor-help" : ""}`}
                    title={spec?.description}
                >
                    {spec?.title ?? clause.clauseName ?? `${clause.clauseIdHash.slice(0, 10)}…`}
                </span>
            </label>
            {selected && spec && spec.fields.length > 0 && spec.block?.tier !== "category-1" && (
                <div className="ml-6 mt-2 space-y-3">
                    {spec.fields
                        .filter((field) => {
                            // Gate an object sub-clause on a sibling enum field
                            // that offers its name as a value (e.g. `delivery`
                            // shows only when `modalities` has "delivery"
                            // selected). Read from the spec — never hardcoded.
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
                                (c) => c.clauseName != null && clauseNestsUnder(c.clauseName) === field.name,
                            );
                            return (
                                <div key={field.name}>
                                    <ClauseFieldControl
                                        field={field}
                                        value={values[field.name]}
                                        onChange={(v) => onSetClauseField?.(clauseKey, field.name, v)}
                                        testId={`drawer-field-${clauseKey}-${field.name}`}
                                        hideLabel={field.name.toLowerCase() === (spec.title ?? "").toLowerCase()}
                                    />
                                    {nested.map((nc) => (
                                        <div
                                            key={nc.clauseIdHash}
                                            className="mt-2 ml-3 border-l border-neutral-200 pl-3"
                                            data-testid={`drawer-nested-${field.name}-${nc.clauseName ?? nc.clauseIdHash}`}
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

/**
 * One clause field, captured at design time — single-select per the
 * one-choice-per-article rule. enum / array-of-enum render as radios; scalar
 * fields render as inputs; structured fields (object / array-of-object) are
 * left blank here and filled downstream at checkout.
 */
function ClauseFieldControl({
    field,
    value,
    onChange,
    testId,
    hideLabel = false,
}: {
    field: FieldSpec;
    value: unknown;
    onChange: (next: unknown) => void;
    testId: string;
    /** Suppress the field's own name label when it duplicates the clause title
     *  (e.g. the `modalities` field inside the "Modalities" clause). */
    hideLabel?: boolean;
}) {
    const label = hideLabel ? null : (
        <span
            className={`text-[11px] text-neutral-500${field.description ? " cursor-help" : ""}`}
            title={field.description}
        >
            {field.name}
        </span>
    );

    if (field.type === "enum") {
        const selected = typeof value === "string" ? value : undefined;
        return (
            <div data-testid={`${testId}-group`}>
                {label && <div className="mb-1">{label}</div>}
                <div className="space-y-1">
                    {field.values.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                            <input
                                type="radio"
                                name={testId}
                                checked={selected === opt}
                                onChange={() => onChange(opt)}
                                data-testid={`${testId}-${opt}`}
                                className="accent-accent"
                            />
                            <span>{opt}</span>
                        </label>
                    ))}
                </div>
            </div>
        );
    }

    // array-of-enum → single-select (one choice per article), stored as a
    // 1-element array to match the clause's array field shape.
    if (field.type === "array" && field.items.type === "enum") {
        const arr = Array.isArray(value) ? (value as string[]) : [];
        const selected = arr[0];
        const options = field.items.values;
        return (
            <div data-testid={`${testId}-group`}>
                {label && <div className="mb-1">{label}</div>}
                <div className="space-y-1">
                    {options.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                            <input
                                type="radio"
                                name={testId}
                                checked={selected === opt}
                                onChange={() => onChange([opt])}
                                data-testid={`${testId}-${opt}`}
                                className="accent-accent"
                            />
                            <span>{opt}</span>
                        </label>
                    ))}
                </div>
            </div>
        );
    }

    if (field.type === "boolean") {
        return (
            <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(e) => onChange(e.target.checked ? true : undefined)}
                    data-testid={testId}
                    className="accent-accent"
                />
                <span>{field.name}</span>
            </label>
        );
    }

    // An object field is a sub-clause: render its child fields recursively,
    // reading the tree from the spec (never hardcoded). This is how delivery's
    // coordination + handoff sub-clauses, and handoff's proximity, surface.
    if (field.type === "object") {
        const obj =
            value && typeof value === "object" && !Array.isArray(value)
                ? (value as Record<string, unknown>)
                : {};
        return (
            <div data-testid={`${testId}-object`}>
                {label && <div className="mb-1">{label}</div>}
                <div className="space-y-2 border-l border-neutral-200 pl-3">
                    {field.fields.map((child) => (
                        <ClauseFieldControl
                            key={child.name}
                            field={child}
                            value={obj[child.name]}
                            onChange={(next) => {
                                const nextObj = { ...obj };
                                if (next === undefined) delete nextObj[child.name];
                                else nextObj[child.name] = next;
                                onChange(Object.keys(nextObj).length ? nextObj : undefined);
                            }}
                            testId={`${testId}-${child.name}`}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // Everything else is a free-form / structured value, not a bounded design
    // choice (e.g. array-of-object commerce line-items). The designer does NOT
    // type it here — a fill-in field is exactly what turns the template into a
    // checkout hash. It's captured downstream by a mounted component at
    // checkout/runtime. Surface it as deferred, not fillable.
    return (
        <div className="text-[11px] text-neutral-400 italic" data-testid={`${testId}-deferred`}>
            {field.name} — provided at checkout
        </div>
    );
}
