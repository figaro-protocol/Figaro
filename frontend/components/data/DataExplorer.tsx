"use client";

/**
 * The data explorer — `/data/explore`. The human's instrument for asking
 * questions of the PUBLIC GRAPHS, with an analyst's help where a reader has
 * one configured.
 *
 * The IA is `docs/DATA_LAYER.md` § "Truth boundaries": one
 * layer at a time, each carrying its own truth boundary, so a kernel guarantee
 * and an institution's declaration are never rendered as the same kind of
 * fact. The rows inside a layer are derived from the record — the overlay list
 * is a census of the clause families this corpus contains, never a menu this
 * component knows in advance, and a family whose spec will not resolve is a
 * row that says so rather than a row that is dropped.
 *
 * WALLETLESS by construction: like `/audit`, every view here reads from the
 * chain through the standalone client and no view is gated on a connected
 * wallet. The wallet-record view takes ANY address — a spectator reads a
 * stranger's public record exactly as they read a stranger's process.
 *
 * The URL query is the state (`lib/data/explorer.ts` parses and serialises
 * it), so every view and every wallet subject is a permalink.
 */

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { walletRecord } from "@figaro-protocol/sdk/derive";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { AnalystPrompt } from "@/components/data/AnalystPrompt";
import { ProcessAuditOpen } from "@/app/(app)/audit/_components/ProcessAuditOpen";
import { useGraphCorpus, type GraphCorpus } from "@/lib/data/graphCorpus";
import {
    BOUNDARY_GLOSS,
    GRAPH_LAYERS,
    dataExplorerBreadcrumb,
    denominationRows,
    filterRows,
    graphLayer,
    marketRows,
    overlayRows,
    overlaysForMarket,
    parseDataExplorerQuery,
    processAuditHref,
    processRowsForMarket,
    PROCESS_ROW_CAP,
    serializeDataExplorerQuery,
    venuePosture,
    venuePostureNote,
    walletOrderRows,
    walletRecordSummary,
    type DataExplorerQuery,
    type GraphView,
    type ProcessRow,
} from "@/lib/data/explorer";
import { isValidAddress } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatToken } from "@/lib/shared/utils";

/** An amount in its own denomination — the token's decimals when the token
 *  answered, else base units against the address. Amounts in different
 *  denominations never sum, so every figure carries its token. */
function Amount({ value, token, corpus }: { value: bigint; token: string; corpus: GraphCorpus }) {
    const meta = corpus.tokenMeta.get(token.toLowerCase());
    return (
        <span className="tabular-nums">
            {meta ? `${formatToken(value, meta.decimals)} ${meta.symbol}` : `${value.toString()} (base units of ${truncateHex(token)})`}
        </span>
    );
}

function BoundaryLine({ view }: { view: GraphView }) {
    const layer = graphLayer(view);
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-heading-h3 text-ink-heading">{layer.label}</h2>
                {layer.boundary ? (
                    <span className="text-xs text-ink-muted" data-testid="layer-boundary">
                        <span className="font-mono">{layer.boundary}</span> &mdash; {BOUNDARY_GLOSS[layer.boundary]}
                    </span>
                ) : null}
            </div>
            <p className="text-sm text-ink-body leading-relaxed max-w-3xl">{layer.statement}</p>
        </div>
    );
}

export function DataExplorer() {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const state = useMemo(() => parseDataExplorerQuery(params), [params]);

    const setState = useCallback(
        (patch: Partial<DataExplorerQuery>) => {
            const next = { ...state, ...patch };
            router.replace(`${pathname}?${serializeDataExplorerQuery(next)}`, { scroll: false });
        },
        [state, router, pathname],
    );

    const { corpus, isLoading, failed } = useGraphCorpus();

    return (
        <div className="space-y-8">
            <Breadcrumb items={dataExplorerBreadcrumb(state)} />

            <p className="text-sm text-ink-muted leading-relaxed max-w-3xl">
                Every graph below is projected in this browser from the network&apos;s own event
                record &mdash; no account, no wallet, no server in between. What each layer
                is <em>for</em> lives on{" "}
                <Link href="/data" className="text-ink-heading hover:underline">/data</Link>;
                this page is where you query it.
            </p>

            {/* ── Layers ──────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Graph layer">
                {GRAPH_LAYERS.map((l) => (
                    <button
                        key={l.view}
                        type="button"
                        role="tab"
                        aria-selected={state.view === l.view}
                        data-testid={`graph-view-${l.view}`}
                        onClick={() => setState({ view: l.view, q: "" })}
                        className={`px-3 py-1.5 text-sm rounded border ${state.view === l.view ? "border-ink-heading text-ink-heading" : "border-ink-muted/30 text-ink-muted hover:text-ink-heading"}`}
                    >
                        {l.label}
                    </button>
                ))}
            </div>

            <BoundaryLine view={state.view} />

            {failed ? (
                <p className="text-sm text-ink-muted" data-testid="corpus-failed">
                    The event read failed on this network, so nothing is shown rather than a
                    stale or partial picture. That is unknown chain state &mdash; not an empty record.
                </p>
            ) : isLoading || !corpus ? (
                <p className="text-sm text-ink-muted" data-testid="corpus-loading">
                    Reading the record and projecting the graphs&hellip;
                </p>
            ) : (
                <>
                    <CorpusLine corpus={corpus} />
                    {state.view === "market" ? <MarketView corpus={corpus} state={state} onQuery={setState} /> : null}
                    {state.view === "overlays" ? <OverlaysView corpus={corpus} state={state} onQuery={setState} /> : null}
                    {state.view === "value-flow" ? <ValueFlowView corpus={corpus} /> : null}
                    {state.view === "wallet" ? <WalletView corpus={corpus} state={state} onQuery={setState} /> : null}
                    {state.view === "deal" ? <DealView /> : null}
                </>
            )}

            <AnalystPrompt />
        </div>
    );
}

/** What this reader can see, stated before anything derived from it — the
 *  browser-side twin of the analyst's `/status`. */
function CorpusLine({ corpus }: { corpus: GraphCorpus }) {
    const attestations = corpus.overlays.reduce((n, g) => n + g.entries.length, 0);
    return (
        <p className="text-xs text-ink-muted leading-relaxed" data-testid="corpus-line">
            {corpus.process.processes.size} process{corpus.process.processes.size === 1 ? "" : "es"} ·{" "}
            {corpus.settlement.chains.size} settlement chain{corpus.settlement.chains.size === 1 ? "" : "s"} ·{" "}
            {attestations} attestation{attestations === 1 ? "" : "s"} across {corpus.overlays.length}{" "}
            clause famil{corpus.overlays.length === 1 ? "y" : "ies"} · substance recovered for{" "}
            {corpus.substance.recovered} of the {corpus.substance.attempted} most recent
            {corpus.substance.total > corpus.substance.attempted ? ` (of ${corpus.substance.total})` : ""}.
            {" "}Order events are the DIRECT path only: a batch settles token positions and
            re-emits none, so batch-settled trade reaches these graphs through its
            attestations alone.
        </p>
    );
}

// ── Market shape ────────────────────────────────────────────────────────────

function MarketView({ corpus, state, onQuery }: { corpus: GraphCorpus; state: DataExplorerQuery; onQuery: (p: Partial<DataExplorerQuery>) => void }) {
    const rows = useMemo(
        () => marketRows(corpus.market, (key) => corpus.assemblyNames.get(key.toLowerCase())),
        [corpus],
    );
    const shown = filterRows(rows, state.q);
    return (
        <div className="space-y-5">
            <Input
                type="search"
                value={state.q}
                onChange={(e) => onQuery({ q: e.target.value })}
                placeholder="Search markets…"
                aria-label="Search markets"
                data-testid="market-search"
                className="max-w-sm"
            />
            <p className="text-sm text-ink-body" data-testid="market-count">
                {shown.length} market{shown.length === 1 ? "" : "s"} attributed
                {corpus.market.unattributedProcessCount > 0
                    ? `; ${corpus.market.unattributedProcessCount} process${corpus.market.unattributedProcessCount === 1 ? "" : "es"} unattributed`
                    : ""}
                .
            </p>
            {corpus.market.unattributedProcessCount > 0 ? (
                <p className="text-xs text-ink-muted leading-relaxed max-w-3xl" data-testid="market-unattributed">
                    A process is attributed to an assembly when its buyer attested the
                    provenance the parties composed &mdash; that attestation is public, and its
                    payload resolves from its own fingerprint. Where no such attestation is
                    recoverable here, the process is counted and left unattributed: the
                    settlement skeleton is public, the body that says <em>which</em> composition
                    produced it stays party-private until someone discloses or sells it.
                </p>
            ) : null}
            {/* Unattributed is a POSTURE, not a hiding place: those processes
                settled on the same public record, so their ids open the same
                way an attributed one's does. */}
            {corpus.market.unattributedProcessCount > 0 ? (
                <ProcessList
                    rows={processRowsForMarket(corpus.process, corpus.attributionByProcess, null)}
                    corpus={corpus}
                    testId="market-processes-unattributed"
                />
            ) : null}
            {shown.length === 0 ? (
                <p className="text-sm text-ink-muted" data-testid="market-empty">
                    No attributed market on the network this site reads. Absence of an
                    attribution is not absence of trade &mdash; the process graph above counts what
                    settled.
                </p>
            ) : (
                <ul className="space-y-5">
                    {shown.map((r) => (
                        <li key={r.key} className="space-y-1">
                            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                                <span className="text-sm font-semibold text-ink-heading">{r.name}</span>
                                {r.nameResolved ? (
                                    <code className="font-mono text-xs text-ink-muted">{truncateHex(r.key)}</code>
                                ) : (
                                    <span className="text-xs text-ink-muted">
                                        composition not registered on this network &mdash; named by its hash alone
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-ink-body">
                                {r.processCount} process{r.processCount === 1 ? "" : "es"} ·{" "}
                                {r.orderCount} order{r.orderCount === 1 ? "" : "s"} ·{" "}
                                {r.distinctPairCount} distinct buyer&rarr;seller pair
                                {r.distinctPairCount === 1 ? "" : "s"}
                            </p>
                            <p className="text-sm text-ink-body">
                                {r.volumes.map((v, i) => (
                                    <span key={v.token}>
                                        {i > 0 ? " · " : ""}
                                        <Amount value={v.settled} token={v.token} corpus={corpus} /> settled of{" "}
                                        <Amount value={v.committed} token={v.token} corpus={corpus} /> committed
                                    </span>
                                ))}
                            </p>
                            <MarketOverlays corpus={corpus} marketKey={r.key} />
                            <MarketProcesses corpus={corpus} marketKey={r.key} />
                            <p className="text-xs text-ink-muted">
                                {r.cadence.firstBlock !== null
                                    ? `commits from block ${r.cadence.firstBlock} to ${r.cadence.lastBlock}`
                                    : "no commits"}
                                {r.cadence.medianGapBlocks !== null
                                    ? ` · median ${r.cadence.medianGapBlocks} blocks between processes`
                                    : " · one process, so no cadence yet"}
                                {" · "}
                                {r.shapes
                                    .map((s) => `${s.processCount}× chain of ${s.orderCount}`)
                                    .join(", ")}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-xs text-ink-muted leading-relaxed max-w-3xl">
                Chain shapes are the kernel&apos;s own LINEAR view &mdash; a chain of commits against a
                monotonic accumulator. How orders relate as a DAG is declared in each
                agreement&apos;s topology section, which is committed rather than attested, so it is
                not recoverable from public events here.
            </p>
        </div>
    );
}

/** The overlays ONE market draws — derived from what its processes actually
 *  attested, so a family this codebase has never seen lists itself here, and a
 *  family whose spec has not resolved lists its key. */
function MarketOverlays({ corpus, marketKey }: { corpus: GraphCorpus; marketKey: string }) {
    const rows = useMemo(
        () => overlaysForMarket(corpus.overlays, corpus.attributionByProcess, marketKey),
        [corpus, marketKey],
    );
    if (rows.length === 0) {
        return (
            <p className="text-xs text-ink-muted" data-testid={`market-overlays-${marketKey}`}>
                No attestation recorded under this market&apos;s processes &mdash; its clauses commit
                terms without anything having been attested against them yet.
            </p>
        );
    }
    return (
        <p className="text-xs text-ink-muted" data-testid={`market-overlays-${marketKey}`}>
            Overlays in use:{" "}
            {rows.map((o, i) => (
                <span key={o.clauseKey}>
                    {i > 0 ? ", " : ""}
                    {o.clauseId ?? o.title} ({o.entryCount}
                    {o.posture === "fingerprint-only" ? ", fingerprint-only" : ""})
                </span>
            ))}
        </p>
    );
}

/** The processes ONE market claims, each openable. Derived from the same
 *  attribution map the market counts with, so a row here and the count above
 *  can never disagree. */
function MarketProcesses({ corpus, marketKey }: { corpus: GraphCorpus; marketKey: string }) {
    const rows = useMemo(
        () => processRowsForMarket(corpus.process, corpus.attributionByProcess, marketKey),
        [corpus, marketKey],
    );
    return <ProcessList rows={rows} corpus={corpus} testId={`market-processes-${marketKey}`} />;
}

/**
 * A list of processes, each carrying its OWN id and the one link that opens
 * it at `/audit/view` — the surface that already narrates a process whole
 * (timeline, financials, clause evidence, signature verdicts). Without this a
 * reader can count the processes on the record but cannot open one: the ids
 * are derivable from the same events every figure above is derived from, so
 * withholding them would be the surface's choice, not the record's.
 *
 * Capped at `PROCESS_ROW_CAP` with the window STATED — never silently
 * truncated.
 */
function ProcessList({ rows, corpus, testId }: { rows: readonly ProcessRow[]; corpus: GraphCorpus; testId: string }) {
    if (rows.length === 0) return null;
    const shown = rows.slice(0, PROCESS_ROW_CAP);
    return (
        <div className="text-xs text-ink-muted" data-testid={testId}>
            <ul className="mt-1 space-y-1">
                {shown.map((r) => (
                    <li key={r.processId} data-testid={`process-row-${r.processId.toLowerCase()}`}>
                        {/* The FULL processId, not a truncation: it is the id
                            `/audit/view` takes, and a reader recording one for
                            their own books needs all of it. */}
                        <Link
                            href={processAuditHref(r.processId)}
                            className="font-mono underline break-all hover:text-ink-heading"
                            data-testid={`process-audit-link-${r.processId.toLowerCase()}`}
                        >
                            {r.processId}
                        </Link>
                        {" · "}
                        {r.orderCount} order{r.orderCount === 1 ? "" : "s"}
                        {" · "}
                        <Amount value={r.cumulativeValue} token={r.currency} corpus={corpus} /> cumulative
                        {" · "}
                        {r.resolved ? "settled" : "active"}
                        {r.firstBlock !== null ? ` · from block ${r.firstBlock}` : ""}
                    </li>
                ))}
            </ul>
            <p className="mt-1">
                {rows.length > shown.length
                    ? `${shown.length} of ${rows.length} processes, most recent first.`
                    : `${rows.length} process${rows.length === 1 ? "" : "es"}, most recent first.`}
                {" "}Each opens its own record at <code className="font-mono">/audit/view</code>.
            </p>
        </div>
    );
}

// ── Attestation overlays ────────────────────────────────────────────────────

function OverlaysView({ corpus, state, onQuery }: { corpus: GraphCorpus; state: DataExplorerQuery; onQuery: (p: Partial<DataExplorerQuery>) => void }) {
    const rows = useMemo(() => overlayRows(corpus.overlays), [corpus]);
    const shown = filterRows(rows, state.q);
    return (
        <div className="space-y-5">
            <Input
                type="search"
                value={state.q}
                onChange={(e) => onQuery({ q: e.target.value })}
                placeholder="Search overlays…"
                aria-label="Search overlays"
                data-testid="overlay-search"
                className="max-w-sm"
            />
            <p className="text-sm text-ink-body" data-testid="overlay-count">
                {shown.length} overlay{shown.length === 1 ? "" : "s"} in this corpus.
            </p>
            {shown.length === 0 ? (
                <p className="text-sm text-ink-muted" data-testid="overlay-empty">
                    No attestation has been recorded on the network this site reads. The list is
                    event-driven &mdash; a clause family draws its own overlay the first time
                    someone attests it, including a family registered after this page was written.
                </p>
            ) : (
                <ul className="space-y-4">
                    {shown.map((r) => (
                        <li key={r.clauseKey} className="space-y-1" data-testid={`overlay-row-${r.clauseKey}`}>
                            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                                <span className="text-sm font-semibold text-ink-heading">{r.title}</span>
                                <code className="font-mono text-xs text-ink-muted">
                                    {r.clauseId ?? truncateHex(r.clauseKey)}
                                </code>
                            </div>
                            <p className="text-sm text-ink-body">
                                {r.entryCount} attestation{r.entryCount === 1 ? "" : "s"} ·{" "}
                                {r.processCount} process{r.processCount === 1 ? "" : "es"} ·{" "}
                                {r.attesterCount} attester{r.attesterCount === 1 ? "" : "s"} ·{" "}
                                {r.universes.join(" + ")} settlement
                                {r.universes.length === 1 ? "" : "s"}
                                {r.firstBlock !== null ? ` · blocks ${r.firstBlock}–${r.lastBlock}` : ""}
                            </p>
                            <p className="text-xs text-ink-muted leading-relaxed">
                                {!r.specResolved ? (
                                    <span data-testid="overlay-unresolved">
                                        This family&apos;s spec has not resolved from the registry here, so its
                                        rows carry the on-chain anchor and nothing else &mdash; the identity it
                                        has, never a name or a field it does not.
                                    </span>
                                ) : r.posture === "fingerprint-only" ? (
                                    <span data-testid="overlay-fingerprint-only">
                                        Fingerprint-only: the anchors are on chain and the substance behind
                                        them is not here &mdash; withheld, private, erased, or simply not served.
                                        Absence, never a blank filled in.
                                    </span>
                                ) : (
                                    <>
                                        {r.decodedCount} of {r.entryCount} payload
                                        {r.entryCount === 1 ? "" : "s"} recovered and decoded against the
                                        registered spec. What a decoded field says is the attester&apos;s
                                        declaration; the record proves it sat under that agreement&apos;s root.
                                    </>
                                )}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ── Value flow ──────────────────────────────────────────────────────────────

function ValueFlowView({ corpus }: { corpus: GraphCorpus }) {
    const rows = useMemo(() => denominationRows(corpus.valueFlow), [corpus]);
    const posture = useMemo(() => venuePosture(corpus.venue, corpus.valueFlow.edges), [corpus]);
    return (
        <div className="space-y-5">
            <section className="space-y-3">
                <h3 className="text-sm font-semibold text-ink-heading">Denominations</h3>
                {rows.length === 0 ? (
                    <p className="text-sm text-ink-muted" data-testid="denomination-empty">
                        Nothing has settled on the network this site reads, so it names no
                        denomination yet.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {rows.map((r) => {
                            const meta = corpus.tokenMeta.get(r.token.toLowerCase());
                            return (
                                <li key={r.token} className="text-sm text-ink-body" data-testid={`denomination-${r.token.toLowerCase()}`}>
                                    <span className="text-ink-heading">{meta?.symbol ?? truncateHex(r.token)}</span>{" "}
                                    <code className="font-mono text-xs text-ink-muted">{r.token}</code>
                                    <span className="block text-xs text-ink-muted">
                                        {r.processCount} process{r.processCount === 1 ? "" : "es"} ·{" "}
                                        {r.settledOrderCount} settled order{r.settledOrderCount === 1 ? "" : "s"} ·{" "}
                                        <Amount value={r.settledVolume} token={r.token} corpus={corpus} /> transferred at
                                        resolution
                                        {r.pinned ? " · pinned by a designer as an assembly's denomination" : ""}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <p className="text-xs text-ink-muted leading-relaxed max-w-3xl">
                    A process is monotoken by construction &mdash; <code className="font-mono">currency</code> is
                    a signed field of every commitment &mdash; so these totals are per denomination
                    and never sum across them.
                </p>
            </section>

            <section className="space-y-2">
                <h3 className="text-sm font-semibold text-ink-heading">Corridors between denominations</h3>
                <p className="text-sm text-ink-body leading-relaxed max-w-3xl" data-testid="venue-posture">
                    {venuePostureNote(posture)}
                </p>
            </section>
        </div>
    );
}

// ── Wallet record ───────────────────────────────────────────────────────────

function WalletView({ corpus, state, onQuery }: { corpus: GraphCorpus; state: DataExplorerQuery; onQuery: (p: Partial<DataExplorerQuery>) => void }) {
    const subject = state.wallet.trim();
    const valid = isValidAddress(subject);
    const record = useMemo(
        () => (valid ? walletRecord(corpus.process, subject as `0x${string}`) : null),
        [corpus, subject, valid],
    );
    const summary = record ? walletRecordSummary(record) : null;
    const rows = record ? walletOrderRows(record) : [];

    return (
        <div className="space-y-5">
            <Input
                type="text"
                value={state.wallet}
                onChange={(e) => onQuery({ wallet: e.target.value })}
                placeholder="0x… any wallet"
                aria-label="Wallet address"
                data-testid="wallet-input"
                className="max-w-md font-mono text-xs"
            />
            {!subject ? (
                <p className="text-sm text-ink-muted" data-testid="wallet-prompt">
                    Paste any address. This record is public by construction, so no wallet
                    needs to be connected and no permission asked &mdash; the same posture as the
                    audit surface.
                </p>
            ) : !valid ? (
                <p className="text-sm text-ink-muted" data-testid="wallet-invalid">
                    That is not a 0x-prefixed 20-byte address.
                </p>
            ) : summary?.empty ? (
                <p className="text-sm text-ink-muted" data-testid="wallet-empty">
                    No orders for <code className="font-mono">{truncateHex(subject)}</code> in this
                    reader&apos;s record. That is an answer, not an error: the wallet may have traded
                    on the batch path, which emits no order events, or outside the block range
                    this browser scanned.
                </p>
            ) : summary ? (
                <>
                    <p className="text-sm text-ink-body" data-testid="wallet-summary">
                        {summary.processesAsRootBuyer} process
                        {summary.processesAsRootBuyer === 1 ? "" : "es"} resolved as root buyer
                        {summary.processesAsRootBuyer > 0 ? ` (${summary.resolvedProcesses} settled)` : ""} ·{" "}
                        {summary.ordersAsBuyer} order{summary.ordersAsBuyer === 1 ? "" : "s"} as buyer ·{" "}
                        {summary.ordersAsSeller} order{summary.ordersAsSeller === 1 ? "" : "s"} as seller ·{" "}
                        {summary.denominations.length} denomination
                        {summary.denominations.length === 1 ? "" : "s"}
                    </p>
                    <ul className="space-y-2">
                        {rows.map((r) => (
                            <li key={`${r.orderHash}-${r.side}`} className="text-sm text-ink-body">
                                <span className="text-ink-heading">{r.side}</span> ·{" "}
                                <Amount value={r.payment} token={r.currency} corpus={corpus} /> ·{" "}
                                {r.resolved ? "settled" : "active"}
                                <span className="block text-xs text-ink-muted">
                                    with <code className="font-mono">{truncateHex(r.counterparty)}</code> · block{" "}
                                    {r.blockNumber} ·{" "}
                                    <Link href={`/audit/view?process=${r.processId}`} className="underline hover:text-ink-heading">
                                        open the process record
                                    </Link>
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            ) : null}
        </div>
    );
}

// ── Deal story ──────────────────────────────────────────────────────────────

function DealView() {
    return (
        <Card className="p-6 space-y-4">
            <p className="text-sm text-ink-body leading-relaxed max-w-3xl">
                A process&apos;s whole story &mdash; its commits, bonds, attestation timeline,
                resolution and payouts &mdash; is already told at{" "}
                <code className="font-mono text-xs">/audit/view?process=&lt;id&gt;</code>, where every
                figure is re-derived and every signature checked. Open it there rather than
                have a second surface narrate the same record differently.
            </p>
            <ProcessAuditOpen />
        </Card>
    );
}
