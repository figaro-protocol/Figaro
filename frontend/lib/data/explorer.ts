/**
 * The data explorer's pure read model — `/data/explore` reads the PUBLIC
 * GRAPHS the network emits and lets a human ask the canonical questions of
 * them, with an analyst's help where one is configured.
 *
 * The IA is `docs/DATA_LAYER.md` § "Truth boundaries": each
 * graph is rendered as its OWN semantic layer carrying its own truth boundary
 * (protocol-enforced / institution-declared / protocol-derived /
 * composition-derived), never one blended surface — so a reader never
 * conflates a kernel guarantee with an institution's declaration.
 *
 * The LAYERS are the doc's canonical presentation grouping and are therefore a
 * fixed list here; everything INSIDE a layer is derived from the record. In
 * particular the graph CLASS is open (ratified 2026-08-26): the overlay rows
 * are one per attestable clause family the corpus actually contains — a family
 * this codebase has never seen draws its own row, and a family whose spec will
 * not resolve renders fingerprint-only rather than being dropped or named.
 *
 * Everything here is pure: the projections are `@figaro-protocol/sdk/derive`'s
 * (`projectProcessGraph`, `projectSettlementGraph`, `extractOverlays`,
 * `projectValueFlow`, `marketShape`, `walletRecord`) and the I/O is
 * `lib/data/graphCorpus.ts`. This module only shapes rows, states absence, and
 * parses/serialises the URL query so every view is a permalink.
 */

import type { TruthBoundary, MarketShape, ChainShape, OverlayGraph, ValueFlowGraph, ValueFlowEdge, WalletRecord } from "@figaro-protocol/sdk/derive";
import { TRUTH_BOUNDARY_GLOSS } from "@figaro-protocol/sdk/derive";
import { OrderState, type SettlementUniverse } from "@figaro-protocol/sdk";
import type { PartyRole } from "@/lib/kernel/walletProcessQueries";
import type { BreadcrumbItem } from "@/components/shared/Breadcrumb";
import { filterRows, pick, queryParam } from "@/lib/shared/urlQuery";
import { truncateHex } from "@/lib/shared/formatHex";

export { filterRows };

// ── The query IS the state ──────────────────────────────────────────────────

/** The layers, in reading order. Internal — consumers iterate `GRAPH_LAYERS`
 *  (which carries each layer's label and boundary) rather than the bare
 *  vocabulary. */
const GRAPH_VIEWS = ["market", "overlays", "value-flow", "wallet", "deal"] as const;
export type GraphView = (typeof GRAPH_VIEWS)[number];

export interface DataExplorerQuery {
    /** Which graph layer is in focus. */
    view: GraphView;
    /** The wallet-record subject — ANY address, never only the reader's own
     *  (this surface is walletless: a spectator reads any wallet's public
     *  record, exactly as `/audit` reads any process). */
    wallet: string;
    /** Free text, matched case-insensitively against the active view's rows. */
    q: string;
}

/** Parse the URL query into explorer state. Unknown values fall back to
 *  defaults; nothing throws on a hand-typed link. */
export function parseDataExplorerQuery(params: URLSearchParams | Record<string, string | undefined>): DataExplorerQuery {
    return {
        view: pick(GRAPH_VIEWS, queryParam(params, "view"), "market"),
        wallet: queryParam(params, "wallet").trim(),
        q: queryParam(params, "q").trim(),
    };
}

/** Serialise state back to a query string, omitting empties so a permalink
 *  stays short (`?view=market` is the whole default state). */
export function serializeDataExplorerQuery(state: DataExplorerQuery): string {
    const p = new URLSearchParams();
    p.set("view", state.view);
    if (state.wallet) p.set("wallet", state.wallet);
    if (state.q) p.set("q", state.q);
    return p.toString();
}

// ── The layers, each with its truth boundary named ──────────────────────────

export interface GraphLayer {
    view: GraphView;
    label: string;
    /** The doc's own vocabulary — a layer PICKS a boundary, never coins one.
     *  `null` on the deal view, which renders no rows of its own: it hands
     *  off to `/audit/view`, whose record carries its own boundaries. */
    boundary: TruthBoundary | null;
    /** What the layer's rows are, and what its boundary does and does not
     *  guarantee about them. */
    statement: string;
}

export const GRAPH_LAYERS: readonly GraphLayer[] = [
    {
        view: "market",
        label: "Market shape",
        boundary: "protocol-derived",
        statement:
            "Per-assembly aggregates over the process graph. The underlying commits and resolutions are protocol-enforced; the grouping rides provenance the parties declared, so an assembly attribution is a declaration, not a kernel guarantee. Processes whose provenance is not recoverable here are counted as unattributed, never binned under a fabricated key.",
    },
    {
        view: "overlays",
        label: "Attestation overlays",
        boundary: "protocol-derived",
        statement:
            "One overlay per attestable clause family this corpus contains — a census, not a menu. The anchoring is on chain (timestamped attestations bound to merkle-committed agreements); the content behind each fingerprint lives off chain, so what a decoded field says is the attester's declaration. Referential integrity, never substantive accuracy.",
    },
    {
        view: "value-flow",
        label: "Value flow",
        boundary: "composition-derived",
        statement:
            "Denominations the record settles in, plus the corridors between them. Settlement flow per denomination is protocol-enforced; a corridor between two denominations is read from a composed venue's OWN events and is true per that contract's rules, outside the kernel's guarantees.",
    },
    {
        view: "wallet",
        label: "Wallet record",
        boundary: "protocol-enforced",
        statement:
            "One wallet's public trading record: the processes it resolves as root buyer and the orders it stands either side of. Every row is a bonded commitment on chain.",
    },
    {
        view: "deal",
        label: "Deal story",
        boundary: null,
        statement:
            "One process, narrated from its own record. The full narration already exists at /audit/view — timeline, financials, clause evidence, signature verdicts — so this view hands off rather than telling the story twice.",
    },
];

export function graphLayer(view: GraphView): GraphLayer {
    return GRAPH_LAYERS.find((l) => l.view === view) ?? GRAPH_LAYERS[0];
}

/** The plain-words gloss of a truth boundary — the SDK's one home
 *  (`TRUTH_BOUNDARY_GLOSS`), re-exported under the explorer's own name so
 *  every layer heading and every analyst answer reads the same. */
export const BOUNDARY_GLOSS: Record<TruthBoundary, string> = TRUTH_BOUNDARY_GLOSS;

// ── Market shape ────────────────────────────────────────────────────────────

/** One denomination's totals inside a market row. Amounts in DIFFERENT
 *  denominations never sum — they are carried per token, always.
 *
 *  @public — names the element type of `MarketRow.volumes`, so any consumer
 *  rendering a market's per-token totals needs it even though nothing imports
 *  it by name today. */
export interface MarketVolume {
    token: string;
    committed: bigint;
    settled: bigint;
}

/** The spacing of a market's commits in CHAIN TIME (block numbers, never a
 *  wall clock). `medianGapBlocks` is null with fewer than two processes —
 *  absence of a cadence, not a cadence of zero.
 *
 *  @public — names the type of `MarketRow.cadence`, so any consumer reading a
 *  market's spacing needs it even though nothing imports it by name today. */
export interface MarketCadence {
    firstBlock: number | null;
    lastBlock: number | null;
    medianGapBlocks: number | null;
}

export interface MarketRow {
    /** The attribution key — the compositionHash the parties declared. */
    key: string;
    /** The registered assembly's name when the registry resolves the key,
     *  else the key itself: an unresolved attribution is never given a name
     *  it does not have. */
    name: string;
    nameResolved: boolean;
    processCount: number;
    orderCount: number;
    distinctPairCount: number;
    volumes: MarketVolume[];
    cadence: MarketCadence;
    shapes: readonly ChainShape[];
    text: string;
}

function medianGap(blocks: readonly number[]): number | null {
    if (blocks.length < 2) return null;
    const gaps: number[] = [];
    for (let i = 1; i < blocks.length; i++) gaps.push(blocks[i] - blocks[i - 1]);
    gaps.sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    return gaps.length % 2 === 1 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

/**
 * Project the SDK's market-shape answer into display rows.
 *
 * `nameOf` resolves an attribution key to a registered assembly's name (the
 * `AssemblyRegistry` read the page already does); returning undefined leaves
 * the row named by its key alone.
 */
export function marketRows(shape: MarketShape, nameOf: (key: string) => string | undefined): MarketRow[] {
    const rows: MarketRow[] = [];
    for (const group of shape.groups.values()) {
        const name = nameOf(group.key);
        const volumes = [...group.volumeByDenomination.entries()]
            .map(([token, v]) => ({ token, committed: v.committed, settled: v.settled }))
            .sort((a, b) => a.token.localeCompare(b.token));
        const blocks = group.processCommitBlocks;
        rows.push({
            key: group.key,
            name: name ?? group.key,
            nameResolved: name !== undefined,
            processCount: group.processCount,
            orderCount: group.orderCount,
            distinctPairCount: group.distinctPairCount,
            volumes,
            cadence: {
                firstBlock: blocks[0] ?? null,
                lastBlock: blocks[blocks.length - 1] ?? null,
                medianGapBlocks: medianGap(blocks),
            },
            shapes: group.shapes,
            text: [name ?? "", group.key, ...volumes.map((v) => v.token)].join(" "),
        });
    }
    // Most-traded first by PROCESS COUNT — a count, never a value ranking:
    // volumes in different denominations do not compare.
    return rows.sort((a, b) => b.processCount - a.processCount || a.name.localeCompare(b.name));
}

// ── Attestation overlays (the open graph class) ─────────────────────────────

export interface OverlayRow {
    /** The on-chain clause key — the opaque grouping key, present always. */
    clauseKey: string;
    /** The readable id, only when the family's spec resolved from the
     *  registry. Null = unresolved family: the key is all it has. */
    clauseId: string | null;
    /** The spec's own title when resolved, else the truncated key. */
    title: string;
    specResolved: boolean;
    entryCount: number;
    decodedCount: number;
    processCount: number;
    attesterCount: number;
    universes: readonly SettlementUniverse[];
    firstBlock: number | null;
    lastBlock: number | null;
    /** "decoded" — at least one entry's substance was recovered and decoded
     *  against its spec; "fingerprint-only" — the anchors are real and the
     *  substance is not here (withheld, private, erased, unresolvable spec,
     *  or simply not served). Absence, never fabrication. */
    posture: "decoded" | "fingerprint-only";
    text: string;
}

/** Project extracted overlays into rows — one per clause family the corpus
 *  contains, in descending entry count. Nothing is filtered out: a family
 *  whose spec never resolved is a ROW, stating exactly that. */
export function overlayRows(graphs: readonly OverlayGraph[]): OverlayRow[] {
    const rows = graphs.map((g): OverlayRow => {
        const processes = new Set(g.entries.map((e) => e.processId.toLowerCase()));
        const attesters = new Set(g.entries.map((e) => e.attester.toLowerCase()));
        const decodedCount = g.entries.filter((e) => e.decoded !== null).length;
        const blocks = g.entries.map((e) => e.blockNumber);
        const clauseId = g.spec?.clauseId ?? null;
        return {
            clauseKey: g.clauseKey,
            clauseId,
            title: g.spec?.title ?? truncateHex(g.clauseKey, { head: 10, tail: 0 }),
            specResolved: g.spec !== null,
            entryCount: g.entries.length,
            decodedCount,
            processCount: processes.size,
            attesterCount: attesters.size,
            universes: [...new Set(g.entries.map((e) => e.universe))],
            firstBlock: blocks.length > 0 ? Math.min(...blocks) : null,
            lastBlock: blocks.length > 0 ? Math.max(...blocks) : null,
            posture: decodedCount > 0 ? "decoded" : "fingerprint-only",
            text: [g.clauseKey, clauseId ?? "", g.spec?.title ?? "", g.spec?.description ?? ""].join(" "),
        };
    });
    return rows.sort((a, b) => b.entryCount - a.entryCount || a.title.localeCompare(b.title));
}

/**
 * The overlays a SINGLE market draws — the same census, narrowed to the
 * processes attributed to one composition. This is what "the clause families
 * in use here" means: it is read from what was actually attested under that
 * market's processes, never from the assembly's composed clause list (a
 * composed clause that nobody attested draws no overlay, and an attestation
 * of a family the template never named still draws one).
 *
 * `attributionByProcess` maps a lowercased processId to its attribution key.
 */
export function overlaysForMarket(
    graphs: readonly OverlayGraph[],
    attributionByProcess: ReadonlyMap<string, string>,
    marketKey: string,
): OverlayRow[] {
    const key = marketKey.toLowerCase();
    const narrowed: OverlayGraph[] = [];
    for (const graph of graphs) {
        const entries = graph.entries.filter(
            (e) => attributionByProcess.get(e.processId.toLowerCase()) === key,
        );
        if (entries.length > 0) narrowed.push({ ...graph, entries });
    }
    return overlayRows(narrowed);
}

// ── Value flow ──────────────────────────────────────────────────────────────

export interface DenominationRow {
    token: string;
    processCount: number;
    settledOrderCount: number;
    settledVolume: bigint;
    /** The token a designer PINNED as an assembly's denomination — a
     *  registered fact read off the templates, never a bundled token list. */
    pinned: boolean;
    text: string;
}

/** The denomination nodes, ordered by how much of the record runs in them —
 *  by COUNTS, because volumes in different tokens are incomparable. */
export function denominationRows(graph: ValueFlowGraph): DenominationRow[] {
    return graph.nodes
        .map((n): DenominationRow => ({
            token: n.token,
            processCount: n.processCount,
            settledOrderCount: n.settledOrderCount,
            settledVolume: n.settledVolume,
            pinned: n.pinned,
            text: n.token,
        }))
        .sort(
            (a, b) =>
                b.processCount - a.processCount ||
                b.settledOrderCount - a.settledOrderCount ||
                a.token.localeCompare(b.token),
        );
}

/**
 * Why this reader shows the corridors it shows — three DIFFERENT facts, kept
 * apart. A swap corridor is read from the composed venue's own event log; the
 * swap coordinator deliberately emits nothing of its own, so with no venue
 * composed there is nothing to read, and with a venue composed but no parser
 * for its log the corridors are UNREADABLE here rather than empty.
 */
export type VenuePosture =
    | { state: "no-venue" }
    | { state: "unreadable"; venue: string }
    | { state: "read"; venue: string; legCount: number };

export function venuePosture(venue: string | null, edges: readonly ValueFlowEdge[]): VenuePosture {
    const legs = edges.filter(
        (e): e is Extract<ValueFlowEdge, { basis: "composition-derived" }> => e.basis === "composition-derived",
    );
    if (legs.length > 0) {
        return {
            state: "read",
            venue: venue ?? legs[0].venue,
            legCount: legs.reduce((n, e) => n + e.legCount, 0),
        };
    }
    return venue ? { state: "unreadable", venue } : { state: "no-venue" };
}

/** The sentence a venue posture renders as — absence stated, never an empty
 *  table passed off as "no swaps happened". */
export function venuePostureNote(posture: VenuePosture): string {
    switch (posture.state) {
        case "no-venue":
            return "No swap venue is composed in this deployment's record, so there are no corridors to read here. That is the absence of a reader, never the absence of trade.";
        case "unreadable":
            return `A swap venue is composed at ${posture.venue}, and the corridor trail is that venue's OWN event log — read against that venue's ABI, discovered from the deployment record and the clause fields that name it. No such reader is configured here, so corridors are unreadable rather than empty.`;
        case "read":
            return `${posture.legCount} swap leg${posture.legCount === 1 ? "" : "s"} read from the composed venue at ${posture.venue} — composition-derived: true per that contract's rules, outside the kernel's guarantees.`;
    }
}

// ── Wallet record ───────────────────────────────────────────────────────────

export interface WalletRecordSummary {
    wallet: string;
    processesAsRootBuyer: number;
    resolvedProcesses: number;
    ordersAsBuyer: number;
    ordersAsSeller: number;
    /** Denominations this wallet has traded in, deduped and sorted. */
    denominations: string[];
    /** True when the wallet appears nowhere in the record — an answer, not an
     *  error, and never a claim that the wallet did not trade (it may have
     *  traded on the batch path, or outside this reader's block range). */
    empty: boolean;
}

export function walletRecordSummary(record: WalletRecord): WalletRecordSummary {
    const denominations = new Set<string>();
    for (const order of [...record.ordersAsBuyer, ...record.ordersAsSeller]) {
        denominations.add(order.currency.toLowerCase());
    }
    return {
        wallet: record.wallet,
        processesAsRootBuyer: record.processesAsRootBuyer.length,
        resolvedProcesses: record.processesAsRootBuyer.filter((p) => p.resolved).length,
        ordersAsBuyer: record.ordersAsBuyer.length,
        ordersAsSeller: record.ordersAsSeller.length,
        denominations: [...denominations].sort(),
        empty:
            record.processesAsRootBuyer.length === 0 &&
            record.ordersAsBuyer.length === 0 &&
            record.ordersAsSeller.length === 0,
    };
}

/** One order row of a wallet's record — the shape the table renders. */
export interface WalletOrderRow {
    orderHash: string;
    processId: string;
    side: PartyRole;
    counterparty: string;
    currency: string;
    payment: bigint;
    cumulativeValue: bigint;
    resolved: boolean;
    blockNumber: number;
    text: string;
}

/** Both sides of a wallet's order history in one block-ordered list. An order
 *  where the wallet is BOTH parties appears once per side — the record says
 *  what it says. */
export function walletOrderRows(record: WalletRecord): WalletOrderRow[] {
    const rows: WalletOrderRow[] = [];
    const push = (side: PartyRole, orders: WalletRecord["ordersAsBuyer"]) => {
        for (const o of orders) {
            rows.push({
                orderHash: o.orderHash,
                processId: o.processId,
                side,
                counterparty: side === "buyer" ? o.seller : o.buyer,
                currency: o.currency,
                payment: o.payment,
                cumulativeValue: o.cumulativeValue,
                resolved: o.state === OrderState.Resolved,
                blockNumber: o.blockNumber,
                text: [o.orderHash, o.processId, o.buyer, o.seller, o.currency].join(" "),
            });
        }
    };
    push("buyer", record.ordersAsBuyer);
    push("seller", record.ordersAsSeller);
    return rows.sort((a, b) => b.blockNumber - a.blockNumber || a.orderHash.localeCompare(b.orderHash));
}

// ── Breadcrumb ──────────────────────────────────────────────────────────────

/** The trail a deep-linked arrival sees. "Build" is the nav section the data
 *  layer lives under, and `/data` is the explainer this tool belongs to. */
export function dataExplorerBreadcrumb(state: DataExplorerQuery): BreadcrumbItem[] {
    return [
        { label: "Build", href: "/spec" },
        { label: "Data", href: "/data" },
        { label: graphLayer(state.view).label },
    ];
}
