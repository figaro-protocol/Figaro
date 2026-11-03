"use client";

/**
 * The registry explorer — `/registries`. ONE reads-only surface over the
 * four protocol registries (clauses, agreements, assemblies, members): what is registered, searchable, faceted,
 * sortable. The concept pages (`/clauses`, `/assemblies`, `/members`) say
 * what each thing IS; this page says what EXISTS on the network the site
 * is reading. Every row comes from an event stream + pinned content through
 * the standalone `publicClient` (marketing tier: no wallet provider);
 * nothing is bundled, and no sort ranks by usage or popularity.
 *
 * The URL query is the state (`lib/registries/explorer.ts` parses and
 * serializes it), so every facet is a permalink and the concept pages can
 * deep-link a family preselected.
 */

import Link from "@/components/shared/Link";
import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAllRegisteredClauses } from "@/lib/protocol/useClauseRegistry";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { getClauseSpec, isLiveRegistration } from "@/lib/shared/clauseSpecSource";
import { useAssemblyChoices, type AssemblyChoice } from "@/lib/protocol/assemblyChoices";
import {
    fetchRegisteredAgreement,
    getRegisteredAgreement,
    useRegisteredAgreementsVersion,
    usePublishedAgreements } from "@/lib/protocol/useAgreementRegistry";
import { useRegisteredMembers, type RegisteredMemberRow } from "@/lib/member/useRegisteredMembers";
import { AssemblyShapeLine } from "@/components/assemblies/AssemblyShapeLine";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { StoredDocument } from "@/components/registries/StoredDocument";
import { truncateHex } from "@/lib/shared/formatHex";
import {
    FAMILY_CONCEPT_ROUTE, REGISTRY_FAMILIES, REGISTRY_SORTS, STAKE_VIEWS,
    anchorForFamily, explorerBreadcrumb, facetValues, parseExplorerQuery, selectRows, serializeExplorerQuery,
    type ExplorerQuery, type ExplorerRow, type RegistryFamily,
} from "@/lib/registries/explorer";

const FAMILY_LABEL: Record<RegistryFamily, string> = { clauses: "Clauses", agreements: "Agreements", assemblies: "Assemblies", members: "Members" };
// ONE role, plainly phrased: the wallet that registered the row — both
// contracts spell it `registeredBy` (ClauseRegistry and AssemblyRegistry,
// the same per-wallet role); the reader sees one expression.
const SORT_LABEL: Record<(typeof REGISTRY_SORTS)[number], string> = { article: "Article", name: "Name", block: "Most recent", registeredBy: "Registered by" };
const STAKE_LABEL: Record<(typeof STAKE_VIEWS)[number], string> = { live: "Live stake", withdrawn: "Stake withdrawn", all: "All" };

/** The family row, as the shared WAI-ARIA tab set's items. */
const FAMILY_TABS = REGISTRY_FAMILIES.map((f) => ({ value: f, label: FAMILY_LABEL[f], testId: `registry-family-${f}` }));

/** Row descriptions — the spec's / assembly's / profile's own short words. */
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

    // ── The four registries, each through its own walletless reader ──
    // Each family is a `NetworkRead`: a failed read renders nothing for it.
    const { read: clausesRead } = useAllRegisteredClauses();
    const { version: specVersion } = useClauseSpecs();
    const { read: assembliesRead } = useAssemblyChoices(undefined, { includeWithdrawn: true });
    const { read: membersRead } = useRegisteredMembers();
    const { read: agreementsRead } = usePublishedAgreements(undefined, { includeWithdrawn: true });
    const clauseEvents = clausesRead.status === "present" ? clausesRead.value : null;
    const assemblies = assembliesRead.status === "present" ? assembliesRead.value : null;
    const members = membersRead.status === "present" ? membersRead.value : null;
    const agreements = agreementsRead.status === "present" ? agreementsRead.value : null;
    // Each registered agreement's pinned document, read by its binding and
    // verified against its key; the rows re-derive as documents verify.
    const agreementsVersion = useRegisteredAgreementsVersion();
    useEffect(() => {
        for (const a of agreements ?? []) void fetchRegisteredAgreement(a.agreementHash, a.contentURI);
    }, [agreements]);

    // A row exists only once its pinned content has resolved: a registration
    // whose document is unserved or failed verification is not shown, never
    // a hash standing in for its name.
    const rows = useMemo<Array<ExplorerRow & RowText>>(() => {
        const out: Array<ExplorerRow & RowText> = [];
        for (const e of clauseEvents ?? []) {
            // A row is one registration, keyed and anchored by its clause key;
            // the spec's own name and version are its label. Two specs that
            // share a name are two rows with two anchors.
            const spec = getClauseSpec(e.clauseKey);
            if (!spec) continue;
            const article = spec.block?.design?.article ?? "";
            const name = `${spec.title} · ${spec.clauseId} v${spec.version}`;
            const description = spec.description ?? "";
            out.push({
                family: "clauses", key: `clause-${e.clauseKey}`, id: e.clauseKey, name, article, description,
                registeredBy: e.registeredBy, blockNumber: e.blockNumber, stakeWithdrawn: e.stakeWithdrawn, clauses: [],
                contentURI: e.contentURI, anchoredHash: e.clauseKey,
                text: [e.clauseKey, spec.clauseId, name, description, article, e.registeredBy].join(" "),
            });
        }
        for (const a of agreements ?? []) {
            // A row is one registration, keyed and anchored by its agreement
            // hash; its pinned document's name is its label.
            const doc = getRegisteredAgreement(a.agreementHash);
            if (!doc) continue;
            const clauses = Object.keys(doc.clauses);
            const name = doc.name ?? "";
            const description = doc.summary ?? doc.description ?? "";
            out.push({
                family: "agreements", key: `agreement-${a.agreementHash}`, id: a.agreementHash, name, article: "", description,
                registeredBy: a.registeredBy, blockNumber: a.blockNumber, stakeWithdrawn: a.stakeWithdrawn, clauses,
                contentURI: a.contentURI, anchoredHash: a.agreementHash,
                text: [a.agreementHash, name, description, a.registeredBy, ...clauses,
                    ...clauses.map((k) => getClauseSpec(k)?.clauseId ?? "")].join(" "),
            });
        }
        for (const a of assemblies ?? []) {
            if (a.state !== "loaded" || !a.hydratedAssembly) continue;
            const description = a.hydratedAssembly.assembly.summary ?? a.hydratedAssembly.assembly.description ?? "";
            out.push({
                family: "assemblies", key: `assembly-${a.slug}`, id: a.slug, name: a.name, article: "", description,
                registeredBy: a.registeredBy, blockNumber: a.blockNumber, stakeWithdrawn: a.stakeWithdrawn, clauses: a.clauses ?? [],
                contentURI: a.contentURI, anchoredHash: a.assemblyHash,
                text: [a.slug, a.name, description, a.registeredBy, ...(a.clauses ?? []),
                    ...(a.clauses ?? []).map((k) => getClauseSpec(k)?.clauseId ?? "")].join(" "),
            });
        }
        for (const m of members ?? []) {
            if (!m.profile) continue;
            const name = m.profile.name ?? "";
            out.push({
                family: "members", key: `member-${m.address.toLowerCase()}`, id: m.address, name, article: "", description: m.profile.description ?? "",
                registeredBy: m.address, blockNumber: m.blockNumber, stakeWithdrawn: m.stakeWithdrawn, clauses: [],
                contentURI: "", anchoredHash: "",
                text: [m.address, name, m.profile.description ?? "", m.profile.specialty ?? ""].join(" "),
            });
        }
        return out;
        // `specVersion` bumps as clause specs resolve from IPFS — names and
        // articles fill in without a refetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clauseEvents, agreements, assemblies, members, specVersion, agreementsVersion]);

    const selected = useMemo(() => selectRows(rows, state), [rows, state]);
    const articles = useMemo(() => facetValues(rows, "clauses", "article"), [rows]);
    const familyStatus = (state.family === "clauses" ? clausesRead
        : state.family === "agreements" ? agreementsRead
        : state.family === "assemblies" ? assembliesRead : membersRead).status;
    const familyTotal = rows.filter((r) => r.family === state.family && isLiveRegistration(r)).length;

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
            <Tabs
                label="Registry"
                tabs={FAMILY_TABS}
                selected={state.family}
                onSelect={(family) => setState({ family })}
                panelClassName="space-y-8"
            >
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
                    <Input
                        type="search"
                        value={state.q}
                        onChange={(e) => setState({ q: e.target.value })}
                        placeholder={`Search ${FAMILY_LABEL[state.family].toLowerCase()}…`}
                        aria-label="Search"
                        data-testid="registry-search"
                        className="flex-1 w-auto min-w-48"
                    />
                    <label className="text-sm text-ink-muted flex items-center gap-2">
                        Sort
                        <Select
                            value={state.sort}
                            onChange={(e) => setState({ sort: e.target.value as ExplorerQuery["sort"] })}
                            data-testid="registry-sort"
                            className="w-auto"
                        >
                            {REGISTRY_SORTS.filter((s) => s !== "article" || state.family === "clauses").map((s) => (
                                <option key={s} value={s}>{SORT_LABEL[s]}</option>
                            ))}
                        </Select>
                    </label>
                    <label className="text-sm text-ink-muted flex items-center gap-2">
                        Stake
                        <Select
                            value={state.stake}
                            onChange={(e) => setState({ stake: e.target.value as ExplorerQuery["stake"] })}
                            data-testid="registry-stake"
                            className="w-auto"
                        >
                            {STAKE_VIEWS.map((s) => <option key={s} value={s}>{STAKE_LABEL[s]}</option>)}
                        </Select>
                    </label>
                    {state.family === "clauses" && articles.length > 0 ? (
                        <label className="text-sm text-ink-muted flex items-center gap-2">
                            Article
                            <Select
                                value={state.article}
                                onChange={(e) => setState({ article: e.target.value })}
                                data-testid="registry-article"
                                className="w-auto"
                            >
                                <option value="">All</option>
                                {articles.map((a) => <option key={a} value={a}>{a}</option>)}
                            </Select>
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
                {familyStatus === "pending" ? (
                    <p className="text-sm text-ink-muted" data-testid="registry-loading">Reading the registry&hellip;</p>
                ) : familyStatus === "absent" ? null : (
                    <>
                        <p className="text-sm text-ink-body" data-testid="registry-count">
                            {selected.length} of {familyTotal} {FAMILY_LABEL[state.family].toLowerCase()}
                            {state.stake === "live" ? " with a live stake" : state.stake === "withdrawn" ? " whose stake was withdrawn" : ""}
                            {state.q || state.article || state.registeredBy || state.clause ? " match" : ""}.
                        </p>
                        {state.family === "clauses" ? <ClauseRows rows={selected} state={state} onFacet={setState} /> : null}
                        {state.family === "agreements" ? <AgreementRows rows={selected} onFacet={setState} /> : null}
                        {state.family === "assemblies" && assemblies ? <AssemblyRows rows={selected} assemblies={assemblies} onFacet={setState} /> : null}
                        {state.family === "members" && members ? <MemberRows rows={selected} members={members} /> : null}
                    </>
                )}
            </Tabs>
        </div>
    );
}

// ── Family renderers ────────────────────────────────────────────────────────

/** Clauses grouped by article when sorted by article (the reading order the
 *  `/clauses` inventory had), otherwise one flat list. Row ids are
 *  `clause-<clauseKey>`, so `/registries#clause-<key>` is a clause's permalink:
 *  it lands on the row and opens the document as stored (StoredDocument). */
function ClauseRows({ rows, state, onFacet }: { rows: Array<ExplorerRow & RowText>; state: ExplorerQuery; onFacet: (p: Partial<ExplorerQuery>) => void }) {
    if (rows.length === 0) return <Empty family="clauses" />;
    const groups: Array<{ label: string; items: Array<ExplorerRow & RowText> }> = [];
    if (state.sort === "article") {
        for (const r of rows) {
            // A spec that declares no article groups with no heading — never a
            // placeholder label the designer did not write.
            const label = r.article;
            const g = groups[groups.length - 1];
            if (g && g.label === label) g.items.push(r); else groups.push({ label, items: [r] });
        }
    } else {
        groups.push({ label: "", items: rows });
    }
    return (
        <div className="space-y-8">
            {groups.map((g) => (
                <section key={g.label || "none"}>
                    {g.label ? <h3 className="text-base font-semibold text-ink-heading mb-3">{g.label}</h3> : null}
                    <ul className="space-y-3">
                        {g.items.map((r) => (
                            <li key={r.key} id={r.key} className="flex flex-col sm:flex-row gap-1 sm:gap-3 scroll-mt-24">
                                <span className="font-mono text-xs text-ink-muted sm:w-56 sm:shrink-0 break-all">{r.id}</span>
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
                                        <a href={`#${r.key}`} className="underline ml-2" data-testid={`permalink-${r.key}`} title="This clause's own URL">
                                            permalink
                                        </a>
                                    </span>
                                    <StoredRow row={r} />
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}

/** Registered agreements — one row per `AgreementRegistry` registration: its
 *  pinned document's name, its key, its designer of record, its stake state,
 *  the clauses it composes, and the pinned document checked against the key.
 *  Row ids are `agreement-<agreementHash>`. */
function AgreementRows({ rows, onFacet }: { rows: Array<ExplorerRow & RowText>; onFacet: (p: Partial<ExplorerQuery>) => void }) {
    if (rows.length === 0) return <Empty family="agreements" />;
    return (
        <ul className="space-y-5">
            {rows.map((r) => (
                <li key={r.key} id={r.key} className="flex flex-col gap-1 scroll-mt-24" data-testid={`agreement-row-${r.id.toLowerCase()}`}>
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                        {r.name ? <span className="text-sm font-semibold text-ink-heading">{r.name}</span> : null}
                        <code className="font-mono text-xs text-ink-muted break-all" data-testid={`agreement-hash-${r.id.toLowerCase()}`}>{r.id}</code>
                    </div>
                    {r.description ? <p className="text-sm text-ink-body">{r.description}</p> : null}
                    {r.clauses.length > 0 ? (
                        <p className="text-xs text-ink-muted">
                            Composes {r.clauses.flatMap((k) => getClauseSpec(k)?.title ?? []).join(", ")}
                        </p>
                    ) : null}
                    <p className="text-xs text-ink-muted">
                        Designer of record{" "}
                        <button type="button" className="font-mono underline" onClick={() => onFacet({ registeredBy: r.registeredBy })}>
                            {truncateHex(r.registeredBy)}
                        </button>
                        <span className="ml-2" data-testid={`agreement-stake-${r.id.toLowerCase()}`}>
                            {r.stakeWithdrawn ? "(stake withdrawn)" : "(live stake)"}
                        </span>
                    </p>
                    <StoredRow row={r} />
                </li>
            ))}
        </ul>
    );
}

function AssemblyRows({ rows, assemblies, onFacet }: { rows: Array<ExplorerRow & RowText>; assemblies: readonly AssemblyChoice[]; onFacet: (p: Partial<ExplorerQuery>) => void }) {
    if (rows.length === 0) return <Empty family="assemblies" />;
    const bySlug = new Map(assemblies.map((a) => [a.slug, a]));
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
                        </p>
                        <StoredRow row={r} />
                    </li>
                );
            })}
        </ul>
    );
}

/** Every registered member — the registry, not the buyer's discover list.
 *  A member offering assemblies links to its catalog (`/s/view`); one
 *  without renders its own declaration inline (no hollow catalog page). */
function MemberRows({ rows, members }: { rows: Array<ExplorerRow & RowText>; members: readonly RegisteredMemberRow[] }) {
    if (rows.length === 0) return <Empty family="members" />;
    const byAddress = new Map(members.map((m) => [m.address.toLowerCase(), m]));
    return (
        <ul className="space-y-5">
            {rows.map((r) => {
                const m = byAddress.get(r.id.toLowerCase());
                const offers = (m?.profile?.assemblyBindings?.length ?? 0) > 0;
                return (
                    <li key={r.key} id={r.key} className="flex flex-col gap-1 scroll-mt-24" data-testid={`member-row-${r.id.toLowerCase()}`}>
                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                            {r.name && offers ? (
                                <Link href={`/s/view?seller=${r.id}`} className="text-sm font-semibold text-ink-heading hover:underline">{r.name}</Link>
                            ) : r.name ? (
                                <span className="text-sm font-semibold text-ink-heading">{r.name}</span>
                            ) : null}
                            <code className="font-mono text-xs text-ink-muted">{r.id}</code>
                        </div>
                        {m?.profile?.description ? <p className="text-sm text-ink-body">{m.profile.description}</p> : null}
                        <p className="text-xs text-ink-muted">
                            {m?.profile?.specialty ? <>{m.profile.specialty} · </> : null}
                            {offers ? "offers assemblies — orderable on /discover" : "registered; not offering assemblies"}
                            {r.stakeWithdrawn ? " · stake withdrawn" : ""}
                        </p>
                    </li>
                );
            })}
        </ul>
    );
}

/** The row's own pinned document, on demand. Mounted only where the family
 *  anchors a digest and the event carries a locator: a members row is the
 *  member's own re-pinnable declaration and anchors nothing, so it gets no
 *  disclosure rather than an empty one. */
function StoredRow({ row }: { row: ExplorerRow }) {
    const anchor = anchorForFamily(row.family);
    if (!anchor || !row.contentURI || !row.anchoredHash) return null;
    return (
        <StoredDocument
            id={row.key}
            contentURI={row.contentURI}
            anchoredHash={row.anchoredHash}
            anchor={anchor}
        />
    );
}

function Empty({ family }: { family: RegistryFamily }) {
    return (
        <p className="text-sm text-ink-muted leading-relaxed" data-testid="registry-empty">
            Nothing matches on the network this site is reading. The list is event-driven &mdash; it
            fills as {family} register &mdash; and a resolved-empty read is absence, never a placeholder.
        </p>
    );
}
