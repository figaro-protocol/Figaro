"use client";

/**
 * The registry explorer — `/registries`. ONE reads-only surface over the
 * three protocol registries: what is registered, searchable, faceted,
 * sortable. The concept pages (`/clauses`, `/assemblies`, `/members`) say
 * what each thing IS; this page says what EXISTS on the network the site
 * is reading. Every row comes from an event stream + pinned content through
 * the standalone `publicClient` (marketing tier: no wallet provider);
 * nothing is bundled, and no sort ranks by usage or popularity.
 *
 * The URL query is the state (`lib/registries/explorer.ts` parses and
 * serialises it), so every facet is a permalink and the concept pages can
 * deep-link a family preselected.
 */

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAllRegisteredClauses } from "@/lib/protocol/useClauseRegistry";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { getClauseSpec, getClauseSpecLoadError } from "@/lib/shared/clauseSpecSource";
import { useAssemblyChoices } from "@/lib/protocol/assemblyChoices";
import { useRegisteredMembers } from "@/lib/member/useRegisteredMembers";
import { AssemblyShapeLine } from "@/components/assemblies/AssemblyShapeLine";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { truncateHex } from "@/lib/shared/formatHex";
import {
    FAMILY_CONCEPT_ROUTE, REGISTRY_FAMILIES, REGISTRY_SORTS, STAKE_VIEWS,
    explorerBreadcrumb, facetValues, parseExplorerQuery, selectRows, serializeExplorerQuery,
    type ExplorerQuery, type ExplorerRow, type RegistryFamily,
} from "@/lib/registries/explorer";

const FAMILY_LABEL: Record<RegistryFamily, string> = { clauses: "Clauses", assemblies: "Assemblies", members: "Members" };
// ONE role, plainly phrased: the wallet that registered the row — both
// contracts spell it `registeredBy` (ClauseRegistry and AssemblyRegistry,
// the same per-wallet role); the reader sees one expression.
const SORT_LABEL: Record<(typeof REGISTRY_SORTS)[number], string> = { article: "Article", name: "Name", block: "Most recent", registeredBy: "Registered by" };
const STAKE_LABEL: Record<(typeof STAKE_VIEWS)[number], string> = { live: "Live stake", withdrawn: "Stake withdrawn", all: "All" };

/** Row descriptions — the spec's / template's / profile's own short words. */
type RowText = { description: string };

export function RegistryExplorer() {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const state = useMemo(() => parseExplorerQuery(params), [params]);

    const setState = useCallback((patch: Partial<ExplorerQuery>) => {
        const next = { ...state, ...patch };
        // A family change resets the family-specific facets the patch does not
        // itself set (a hand-typed article on the members family means
        // nothing) — a cross-family link like "assemblies composing it"
        // carries its facet INTO the new family; wiping it would land the
        // reader on every assembly and break the button's promise.
        if (patch.family && patch.family !== state.family) {
            if (patch.article === undefined) next.article = "";
            if (patch.clause === undefined) next.clause = "";
            if (patch.sort === undefined) next.sort = parseExplorerQuery({ family: patch.family }).sort;
        }
        router.replace(`${pathname}?${serializeExplorerQuery(next)}`, { scroll: false });
    }, [state, router, pathname]);

    // ── The three registries, each through its own walletless reader ──
    const { data: clauseEvents, failed: clausesFailed } = useAllRegisteredClauses();
    const { version: specVersion } = useClauseSpecs();
    const { data: assemblies, failed: assembliesFailed } = useAssemblyChoices(undefined, { includeWithdrawn: true });
    const { data: members, failed: membersFailed } = useRegisteredMembers();

    const rows = useMemo<Array<ExplorerRow & RowText>>(() => {
        const out: Array<ExplorerRow & RowText> = [];
        for (const e of clauseEvents ?? []) {
            const spec = getClauseSpec(e.clauseId, e.version);
            const article = spec?.block?.design?.article ?? "";
            const name = spec?.title ?? e.clauseId;
            const description = spec?.description ?? "";
            const content = spec ? "resolved" : getClauseSpecLoadError(e.clauseId) ? "unavailable" : "resolving";
            out.push({
                family: "clauses", key: `clause-${e.clauseId}`, id: e.clauseId, name, article, description, content,
                registeredBy: e.registeredBy, blockNumber: e.blockNumber, stakeWithdrawn: e.stakeWithdrawn, clauses: [],
                text: [e.clauseId, name, description, article, e.registeredBy].join(" "),
            });
        }
        for (const a of assemblies ?? []) {
            const description = a.assemblyTemplate?.summary ?? a.assemblyTemplate?.description ?? "";
            out.push({
                family: "assemblies", key: `assembly-${a.slug}`, id: a.slug, name: a.name, article: "", description,
                content: a.state === "loaded" ? "resolved" : "resolving",
                registeredBy: a.registeredBy, blockNumber: a.blockNumber, stakeWithdrawn: a.stakeWithdrawn, clauses: a.clauses ?? [],
                text: [a.slug, a.name, description, a.registeredBy, ...(a.clauses ?? [])].join(" "),
            });
        }
        for (const m of members ?? []) {
            const name = m.profile?.name ?? truncateHex(m.address);
            out.push({
                family: "members", key: `member-${m.address.toLowerCase()}`, id: m.address, name, article: "", description: m.profile?.description ?? "",
                content: m.profile ? "resolved" : "resolving",
                registeredBy: m.address, blockNumber: m.blockNumber, stakeWithdrawn: m.stakeWithdrawn, clauses: [],
                text: [m.address, name, m.profile?.description ?? "", m.profile?.specialty ?? ""].join(" "),
            });
        }
        return out;
        // `specVersion` bumps as clause specs resolve from IPFS — names and
        // articles fill in without a refetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clauseEvents, assemblies, members, specVersion]);

    const selected = useMemo(() => selectRows(rows, state), [rows, state]);
    const articles = useMemo(() => facetValues(rows, "clauses", "article"), [rows]);
    const familyLoading = state.family === "clauses" ? clauseEvents === null
        : state.family === "assemblies" ? assemblies === null : members === null;
    const familyFailed = state.family === "clauses" ? clausesFailed
        : state.family === "members" ? membersFailed : assembliesFailed;
    const familyTotal = rows.filter((r) => r.family === state.family && !r.stakeWithdrawn).length;

    return (
        <div className="space-y-8">
            <Breadcrumb items={explorerBreadcrumb(state)} />

            <p className="text-sm text-ink-muted leading-relaxed">
                What is registered on the network this site reads &mdash; every row an on-chain
                registration, its content fetched from IPFS. What a {FAMILY_LABEL[state.family].toLowerCase().replace(/s$/, "")}{" "}
                <em>is</em> lives on{" "}
                <Link href={FAMILY_CONCEPT_ROUTE[state.family]} className="text-ink-heading hover:underline">
                    {FAMILY_CONCEPT_ROUTE[state.family]}
                </Link>.
            </p>

            {/* ── Family + facets ─────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Registry">
                {REGISTRY_FAMILIES.map((f) => (
                    <button
                        key={f}
                        type="button"
                        role="tab"
                        aria-selected={state.family === f}
                        data-testid={`registry-family-${f}`}
                        onClick={() => setState({ family: f })}
                        className={`px-3 py-1.5 text-sm rounded border ${state.family === f ? "border-ink-heading text-ink-heading" : "border-ink-muted/30 text-ink-muted hover:text-ink-heading"}`}
                    >
                        {FAMILY_LABEL[f]}
                    </button>
                ))}
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
                <input
                    type="search"
                    value={state.q}
                    onChange={(e) => setState({ q: e.target.value })}
                    placeholder={`Search ${FAMILY_LABEL[state.family].toLowerCase()}…`}
                    aria-label="Search"
                    data-testid="registry-search"
                    className="flex-1 min-w-[12rem] rounded border border-ink-muted/30 bg-transparent px-3 py-1.5 text-sm"
                />
                <label className="text-sm text-ink-muted flex items-center gap-2">
                    Sort
                    <select
                        value={state.sort}
                        onChange={(e) => setState({ sort: e.target.value as ExplorerQuery["sort"] })}
                        data-testid="registry-sort"
                        className="rounded border border-ink-muted/30 bg-transparent px-2 py-1 text-sm"
                    >
                        {REGISTRY_SORTS.filter((s) => s !== "article" || state.family === "clauses").map((s) => (
                            <option key={s} value={s}>{SORT_LABEL[s]}</option>
                        ))}
                    </select>
                </label>
                <label className="text-sm text-ink-muted flex items-center gap-2">
                    Stake
                    <select
                        value={state.stake}
                        onChange={(e) => setState({ stake: e.target.value as ExplorerQuery["stake"] })}
                        data-testid="registry-stake"
                        className="rounded border border-ink-muted/30 bg-transparent px-2 py-1 text-sm"
                    >
                        {STAKE_VIEWS.map((s) => <option key={s} value={s}>{STAKE_LABEL[s]}</option>)}
                    </select>
                </label>
                {state.family === "clauses" && articles.length > 0 ? (
                    <label className="text-sm text-ink-muted flex items-center gap-2">
                        Article
                        <select
                            value={state.article}
                            onChange={(e) => setState({ article: e.target.value })}
                            data-testid="registry-article"
                            className="rounded border border-ink-muted/30 bg-transparent px-2 py-1 text-sm"
                        >
                            <option value="">All</option>
                            {articles.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </label>
                ) : null}
            </div>

            {(state.registeredBy || state.clause) ? (
                <p className="text-sm text-ink-muted">
                    {state.registeredBy ? <>Registered by <code className="font-mono">{truncateHex(state.registeredBy)}</code>{" "}</> : null}
                    {state.clause ? <>Composing <code className="font-mono">{state.clause}</code>{" "}</> : null}
                    <button type="button" className="underline" onClick={() => setState({ registeredBy: "", clause: "" })}>clear</button>
                </p>
            ) : null}

            {/* ── Results ─────────────────────────────────────────────── */}
            {familyLoading ? (
                <p className="text-sm text-ink-muted" data-testid="registry-loading">Reading the registry&hellip;</p>
            ) : familyFailed ? (
                <p className="text-sm text-ink-muted">The registry read failed on this network &mdash; nothing is shown rather than a stale copy.</p>
            ) : (
                <>
                    <p className="text-sm text-ink-body" data-testid="registry-count">
                        {selected.length} of {familyTotal} {FAMILY_LABEL[state.family].toLowerCase()}
                        {state.stake === "live" ? " with a live stake" : state.stake === "withdrawn" ? " whose stake was withdrawn" : ""}
                        {state.q || state.article || state.registeredBy || state.clause ? " match" : ""}.
                    </p>
                    {state.family === "clauses" ? <ClauseRows rows={selected} state={state} onFacet={setState} /> : null}
                    {state.family === "assemblies" ? <AssemblyRows rows={selected} assemblies={assemblies ?? []} onFacet={setState} /> : null}
                    {state.family === "members" ? <MemberRows rows={selected} members={members ?? []} /> : null}
                </>
            )}
        </div>
    );
}

// ── Family renderers ────────────────────────────────────────────────────────

/** Clauses grouped by article when sorted by article (the reading order the
 *  `/clauses` inventory had), otherwise one flat list. Row ids stay
 *  `clause-<clauseId>` so `/clauses#clause-<id>` deep links keep resolving. */
function ClauseRows({ rows, state, onFacet }: { rows: Array<ExplorerRow & RowText>; state: ExplorerQuery; onFacet: (p: Partial<ExplorerQuery>) => void }) {
    if (rows.length === 0) return <Empty family="clauses" />;
    const groups: Array<{ label: string; items: Array<ExplorerRow & RowText> }> = [];
    if (state.sort === "article") {
        for (const r of rows) {
            // "(unclassified)" is a RESOLVED spec that declares no article. A
            // spec not resolved yet is not unclassified — its article is
            // simply not known here yet — so it groups by that state instead.
            const label = r.content === "resolved" ? r.article || "(unclassified)" : contentStateLabel(r.content);
            const g = groups[groups.length - 1];
            if (g && g.label === label) g.items.push(r); else groups.push({ label, items: [r] });
        }
    } else {
        groups.push({ label: "", items: rows });
    }
    return (
        <div className="space-y-8">
            {groups.map((g) => (
                <section key={g.label || "all"}>
                    {g.label ? <h3 className="text-base font-semibold text-ink-heading mb-3">{g.label}</h3> : null}
                    <ul className="space-y-3">
                        {g.items.map((r) => (
                            <li key={r.key} id={r.key} className="flex flex-col sm:flex-row gap-1 sm:gap-3 scroll-mt-24">
                                <span className="font-mono text-xs text-ink-muted sm:w-56 sm:shrink-0">{r.id}</span>
                                <span className="text-sm text-ink-body">
                                    {r.name !== r.id ? <span className="text-ink-heading">{r.name}. </span> : null}
                                    {r.description ? <>{r.description} </> : null}
                                    <span className="block mt-1 text-xs text-ink-muted">
                                        <button type="button" className="underline mr-2" onClick={() => onFacet({ family: "assemblies", clause: r.id })}>
                                            assemblies composing it
                                        </button>
                                        <button type="button" className="underline" onClick={() => onFacet({ registeredBy: r.registeredBy })}>
                                            registered by {truncateHex(r.registeredBy)}
                                        </button>
                                        {r.stakeWithdrawn ? <span className="ml-2">(stake withdrawn)</span> : null}
                                        <ContentStateNote content={r.content} />
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}

function AssemblyRows({ rows, assemblies, onFacet }: { rows: Array<ExplorerRow & RowText>; assemblies: ReturnType<typeof useAssemblyChoices>["data"] & object; onFacet: (p: Partial<ExplorerQuery>) => void }) {
    if (rows.length === 0) return <Empty family="assemblies" />;
    const bySlug = new Map((assemblies ?? []).map((a) => [a.slug, a]));
    return (
        <ul className="space-y-5">
            {rows.map((r) => {
                const choice = bySlug.get(r.id);
                return (
                    <li key={r.key} id={r.key} className="flex flex-col gap-1 scroll-mt-24">
                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                            <Link
                                href={`/assemblies/designer/view?slug=${encodeURIComponent(r.id)}`}
                                className="text-sm font-semibold text-ink-heading hover:underline"
                                data-testid={`assembly-view-${r.id}`}
                            >
                                {r.name}
                            </Link>
                            <code className="font-mono text-xs text-ink-muted">{r.id}</code>
                        </div>
                        {r.description ? <p className="text-sm text-ink-body">{r.description}</p> : null}
                        {choice ? <AssemblyShapeLine choice={choice} /> : null}
                        <p className="text-xs text-ink-muted">
                            Registered by{" "}
                            <button type="button" className="font-mono underline" onClick={() => onFacet({ registeredBy: r.registeredBy })}>
                                {truncateHex(r.registeredBy)}
                            </button>
                            <ContentStateNote content={r.content} />
                        </p>
                    </li>
                );
            })}
        </ul>
    );
}

/** Every registered member — the registry, not the buyer's discover list.
 *  A member offering assemblies links to its catalogue (`/s/view`); one
 *  without renders its own declaration inline (no hollow catalogue page). */
function MemberRows({ rows, members }: { rows: Array<ExplorerRow & RowText>; members: ReturnType<typeof useRegisteredMembers>["data"] & object }) {
    if (rows.length === 0) return <Empty family="members" />;
    const byAddress = new Map((members ?? []).map((m) => [m.address.toLowerCase(), m]));
    return (
        <ul className="space-y-5">
            {rows.map((r) => {
                const m = byAddress.get(r.id.toLowerCase());
                const offers = (m?.profile?.assemblyBindings?.length ?? 0) > 0;
                return (
                    <li key={r.key} id={r.key} className="flex flex-col gap-1 scroll-mt-24" data-testid={`member-row-${r.id.toLowerCase()}`}>
                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                            {offers ? (
                                <Link href={`/s/view?seller=${r.id}`} className="text-sm font-semibold text-ink-heading hover:underline">{r.name}</Link>
                            ) : (
                                <span className="text-sm font-semibold text-ink-heading">{r.name}</span>
                            )}
                            <code className="font-mono text-xs text-ink-muted">{r.id}</code>
                        </div>
                        {m?.profile?.description ? <p className="text-sm text-ink-body">{m.profile.description}</p> : null}
                        <p className="text-xs text-ink-muted">
                            {m?.profile?.specialty ? <>{m.profile.specialty} · </> : null}
                            {offers ? "offers assemblies — orderable on /discover" : "registered; not offering assemblies"}
                            {r.stakeWithdrawn ? " · stake withdrawn" : ""}
                            <ContentStateNote content={r.content} />
                        </p>
                    </li>
                );
            })}
        </ul>
    );
}

/** The state of a row whose pinned content has not resolved, in words. */
function contentStateLabel(content: ExplorerRow["content"]): string {
    return content === "unavailable" ? "(content unavailable — the pinned document failed verification)" : "(content not served by the gateway yet — re-reading)";
}

/** Inline note on any row whose name/description are not to be trusted
 *  yet: the on-chain identity is real, the content behind it is not here. */
function ContentStateNote({ content }: { content: ExplorerRow["content"] }) {
    if (content === "resolved") return null;
    return <span className="ml-2" data-testid={`content-${content}`}>{contentStateLabel(content)}</span>;
}

function Empty({ family }: { family: RegistryFamily }) {
    return (
        <p className="text-sm text-ink-muted leading-relaxed" data-testid="registry-empty">
            Nothing matches on the network this site is reading. The list is event-driven &mdash; it
            fills as {family} register &mdash; and a resolved-empty read is absence, never a placeholder.
        </p>
    );
}
