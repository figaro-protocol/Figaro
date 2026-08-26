/**
 * dataExplorer.test.ts — the explorer's pure read model.
 *
 * What is worth asserting here is not arithmetic (the folds are the SDK's,
 * tested there) but POSTURE: that the query round-trips into a permalink, that
 * an unresolved clause family renders as itself rather than being dropped or
 * named, that a corpus with no venue reads as "no reader here" rather than "no
 * corridors exist", and that a wallet with no history is an answer.
 */
import { describe, it, expect } from "vitest";
import type {
    MarketShape,
    MarketShapeGroup,
    OverlayGraph,
    ValueFlowGraph,
    WalletRecord,
} from "@figaro-protocol/sdk/derive";
import { OrderState } from "@figaro-protocol/sdk";
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
    serializeDataExplorerQuery,
    venuePosture,
    venuePostureNote,
    walletOrderRows,
    walletRecordSummary,
} from "@/lib/data/explorer";

const KEY_A = `0x${"a1".repeat(32)}` as const;
const KEY_B = `0x${"b2".repeat(32)}` as const;
const TOKEN_A = "0x1111111111111111111111111111111111111111" as const;
const TOKEN_B = "0x2222222222222222222222222222222222222222" as const;
const WALLET = "0x3333333333333333333333333333333333333333" as const;
const OTHER = "0x4444444444444444444444444444444444444444" as const;

describe("parseDataExplorerQuery / serializeDataExplorerQuery", () => {
    it("defaults to the market layer and tolerates junk", () => {
        const s = parseDataExplorerQuery(new URLSearchParams("view=telemetry&wallet=%20&q=%20"));
        expect(s).toEqual({ view: "market", wallet: "", q: "" });
        expect(serializeDataExplorerQuery(s)).toBe("view=market");
    });

    it("round-trips a wallet permalink and omits empties", () => {
        const s = parseDataExplorerQuery(new URLSearchParams(`view=wallet&wallet=${WALLET}`));
        expect(s.view).toBe("wallet");
        expect(s.wallet).toBe(WALLET);
        expect(serializeDataExplorerQuery(s)).toBe(`view=wallet&wallet=${WALLET}`);
        expect(serializeDataExplorerQuery(parseDataExplorerQuery({}))).toBe("view=market");
        expect(serializeDataExplorerQuery({ view: "overlays", wallet: "", q: "geo" })).toBe("view=overlays&q=geo");
    });
});

describe("the layers carry their truth boundaries", () => {
    it("every layer picks a boundary from the doc's vocabulary (or none, for the hand-off)", () => {
        for (const layer of GRAPH_LAYERS) {
            if (layer.boundary === null) {
                expect(layer.view).toBe("deal");
                continue;
            }
            expect(BOUNDARY_GLOSS[layer.boundary]).toBeTruthy();
        }
        expect(graphLayer("value-flow").boundary).toBe("composition-derived");
        expect(graphLayer("wallet").boundary).toBe("protocol-enforced");
        // An unknown view falls back rather than throwing on a hand-typed link.
        expect(graphLayer("nope" as never).view).toBe("market");
    });

    it("breadcrumbs from the explainer this tool belongs to", () => {
        expect(dataExplorerBreadcrumb(parseDataExplorerQuery({ view: "overlays" })).map((b) => b.label))
            .toEqual(["Build", "Data", "Attestation overlays"]);
    });
});

describe("marketRows", () => {
    const group = (over: Partial<MarketShapeGroup>): MarketShapeGroup => ({
        key: KEY_A,
        processCount: 1,
        orderCount: 2,
        distinctPairCount: 2,
        volumeByDenomination: new Map([[TOKEN_A, { committed: 30n, settled: 10n }]]),
        processCommitBlocks: [10],
        shapes: [{ orderCount: 2, depth: 2, maxWidth: 1, processCount: 1 }],
        ...over,
    });
    const shape = (groups: MarketShapeGroup[], unattributed = 0): MarketShape => ({
        boundary: "protocol-derived",
        groups: new Map(groups.map((g) => [g.key, g])),
        unattributedProcessCount: unattributed,
    });

    it("names a row only when the registry resolves its attribution key", () => {
        const rows = marketRows(shape([group({})]), (k) => (k === KEY_A ? "Equipment hire" : undefined));
        expect(rows[0].name).toBe("Equipment hire");
        expect(rows[0].nameResolved).toBe(true);

        const unnamed = marketRows(shape([group({})]), () => undefined);
        expect(unnamed[0].name).toBe(KEY_A);
        expect(unnamed[0].nameResolved).toBe(false);
    });

    it("carries volumes PER denomination and never sums across tokens", () => {
        const rows = marketRows(
            shape([
                group({
                    volumeByDenomination: new Map([
                        [TOKEN_B, { committed: 5n, settled: 5n }],
                        [TOKEN_A, { committed: 30n, settled: 10n }],
                    ]),
                }),
            ]),
            () => undefined,
        );
        expect(rows[0].volumes).toEqual([
            { token: TOKEN_A, committed: 30n, settled: 10n },
            { token: TOKEN_B, committed: 5n, settled: 5n },
        ]);
    });

    it("reports cadence as a median block gap, and absence with one process", () => {
        // gaps 10, 6, 14 → sorted 6, 10, 14 → median 10
        const many = marketRows(shape([group({ processCommitBlocks: [10, 20, 26, 40], processCount: 4 })]), () => undefined);
        expect(many[0].cadence).toEqual({ firstBlock: 10, lastBlock: 40, medianGapBlocks: 10 });

        const one = marketRows(shape([group({})]), () => undefined);
        expect(one[0].cadence.medianGapBlocks).toBeNull();
    });

    it("orders by process COUNT, never by a cross-token value ranking", () => {
        const rows = marketRows(
            shape([
                group({ key: KEY_A, processCount: 1 }),
                group({ key: KEY_B, processCount: 9 }),
            ]),
            () => undefined,
        );
        expect(rows.map((r) => r.key)).toEqual([KEY_B, KEY_A]);
    });

    it("free-text filters over the row's own haystack", () => {
        const rows = marketRows(shape([group({})]), () => "Equipment hire");
        expect(filterRows(rows, "EQUIPMENT")).toHaveLength(1);
        expect(filterRows(rows, "nothing")).toHaveLength(0);
    });
});

describe("overlayRows — the open graph class", () => {
    const entry = (over: Partial<OverlayGraph["entries"][number]> = {}) => ({
        orderHash: `0x${"11".repeat(32)}`,
        processId: `0x${"22".repeat(32)}`,
        attester: WALLET,
        stage: 0,
        universe: "direct" as const,
        blockNumber: 12,
        contentRef: `0x${"33".repeat(32)}`,
        decoded: null,
        ...over,
    }) as OverlayGraph["entries"][number];

    const graph = (over: Partial<OverlayGraph>): OverlayGraph => ({
        boundary: "protocol-derived",
        clauseKey: KEY_A,
        spec: null,
        entries: [entry()],
        ...over,
    });

    it("renders a family whose spec never resolved as itself — key only, no invented name", () => {
        const [row] = overlayRows([graph({})]);
        expect(row.clauseId).toBeNull();
        expect(row.specResolved).toBe(false);
        expect(row.title).toBe(`${KEY_A.slice(0, 10)}…`);
        expect(row.posture).toBe("fingerprint-only");
    });

    it("a never-seen family is a row like any other, decoded when its substance resolved", () => {
        const spec = {
            clauseId: "figaro-drone-telemetry",
            version: 1,
            title: "Drone telemetry",
            description: "heading, altitude",
            fields: [],
            hints: {},
        } as unknown as NonNullable<OverlayGraph["spec"]>;
        const [row] = overlayRows([
            graph({
                spec,
                entries: [
                    entry({ decoded: { altitude: 120 }, blockNumber: 5 }),
                    entry({ universe: "batch", blockNumber: 9, attester: OTHER }),
                ],
            }),
        ]);
        expect(row.clauseId).toBe("figaro-drone-telemetry");
        expect(row.title).toBe("Drone telemetry");
        expect(row.entryCount).toBe(2);
        expect(row.decodedCount).toBe(1);
        expect(row.attesterCount).toBe(2);
        expect(row.universes).toEqual(["direct", "batch"]);
        expect(row.firstBlock).toBe(5);
        expect(row.lastBlock).toBe(9);
        expect(row.posture).toBe("decoded");
    });

    it("orders by entry count and drops nothing", () => {
        const rows = overlayRows([
            graph({ clauseKey: KEY_A, entries: [entry()] }),
            graph({ clauseKey: KEY_B, entries: [entry(), entry(), entry()] }),
        ]);
        expect(rows.map((r) => r.clauseKey)).toEqual([KEY_B, KEY_A]);
    });

    it("an empty corpus yields no rows — absence, not a placeholder family", () => {
        expect(overlayRows([])).toEqual([]);
    });

    it("narrows to ONE market by what its processes attested, not by what its template composed", () => {
        const mine = `0x${"aa".repeat(32)}` as `0x${string}`;
        const theirs = `0x${"bb".repeat(32)}` as `0x${string}`;
        const attribution = new Map([
            [mine, KEY_A.toLowerCase()],
            [theirs, KEY_B.toLowerCase()],
        ]);
        const graphs = [
            graph({
                clauseKey: KEY_A,
                entries: [entry({ processId: mine }), entry({ processId: theirs })],
            }),
            graph({ clauseKey: KEY_B, entries: [entry({ processId: theirs })] }),
        ];

        const forA = overlaysForMarket(graphs, attribution, KEY_A);
        expect(forA).toHaveLength(1);
        expect(forA[0].clauseKey).toBe(KEY_A);
        expect(forA[0].entryCount).toBe(1);

        // A family only the OTHER market attested is absent here, and a market
        // whose processes attested nothing gets an empty list, not a guess.
        expect(overlaysForMarket(graphs, attribution, KEY_B).map((r) => r.clauseKey)).toEqual([KEY_A, KEY_B]);
        expect(overlaysForMarket(graphs, new Map(), KEY_A)).toEqual([]);
    });
});

describe("value flow", () => {
    const flow = (over: Partial<ValueFlowGraph>): ValueFlowGraph => ({
        boundary: "composition-derived",
        nodes: [],
        edges: [],
        ...over,
    });

    it("orders denominations by counts, never by incomparable volumes", () => {
        const rows = denominationRows(
            flow({
                nodes: [
                    { token: TOKEN_A, processCount: 1, settledOrderCount: 1, settledVolume: 10n ** 24n, pinned: false },
                    { token: TOKEN_B, processCount: 4, settledOrderCount: 4, settledVolume: 5n, pinned: true },
                ],
            }),
        );
        expect(rows.map((r) => r.token)).toEqual([TOKEN_B, TOKEN_A]);
        expect(rows[0].pinned).toBe(true);
    });

    it("distinguishes no venue, an unreadable venue, and a read venue", () => {
        expect(venuePosture(null, [])).toEqual({ state: "no-venue" });
        expect(venuePostureNote({ state: "no-venue" })).toMatch(/absence of a reader/i);

        expect(venuePosture(TOKEN_A, [{ basis: "protocol-enforced", token: TOKEN_B, settledOrderCount: 1, settledVolume: 1n }]))
            .toEqual({ state: "unreadable", venue: TOKEN_A });
        expect(venuePostureNote({ state: "unreadable", venue: TOKEN_A })).toMatch(/unreadable rather than empty/i);

        const read = venuePosture(TOKEN_A, [
            { basis: "composition-derived", venue: TOKEN_A, tokenIn: TOKEN_A, tokenOut: TOKEN_B, legCount: 2, volumeIn: 4n, volumeOut: 3n },
        ]);
        expect(read).toEqual({ state: "read", venue: TOKEN_A, legCount: 2 });
        expect(venuePostureNote(read)).toMatch(/composition-derived/);
    });
});

describe("wallet record", () => {
    const order = (over: Partial<WalletRecord["ordersAsBuyer"][number]>) => ({
        orderHash: `0x${"11".repeat(32)}`,
        processId: `0x${"22".repeat(32)}`,
        buyer: WALLET,
        seller: OTHER,
        currency: TOKEN_A,
        payment: 7n,
        cumulativeValue: 7n,
        state: OrderState.Active,
        sellerBond: 14n,
        buyerBond: 14n,
        blockNumber: 3,
        ...over,
    }) as WalletRecord["ordersAsBuyer"][number];

    const record = (over: Partial<WalletRecord>): WalletRecord => ({
        boundary: "protocol-enforced",
        wallet: WALLET,
        processesAsRootBuyer: [],
        ordersAsBuyer: [],
        ordersAsSeller: [],
        ...over,
    });

    it("an untraded wallet is an ANSWER, not an error", () => {
        const summary = walletRecordSummary(record({}));
        expect(summary.empty).toBe(true);
        expect(summary.denominations).toEqual([]);
        expect(walletOrderRows(record({}))).toEqual([]);
    });

    it("summarises both sides and dedupes denominations", () => {
        const summary = walletRecordSummary(
            record({
                ordersAsBuyer: [order({}), order({ currency: TOKEN_B, orderHash: `0x${"12".repeat(32)}` })],
                ordersAsSeller: [order({ buyer: OTHER, seller: WALLET, orderHash: `0x${"13".repeat(32)}` })],
            }),
        );
        expect(summary.empty).toBe(false);
        expect(summary.ordersAsBuyer).toBe(2);
        expect(summary.ordersAsSeller).toBe(1);
        expect(summary.denominations).toEqual([TOKEN_A.toLowerCase(), TOKEN_B.toLowerCase()]);
    });

    it("rows carry the side, the counterparty and settlement state, newest first", () => {
        const rows = walletOrderRows(
            record({
                ordersAsBuyer: [order({ blockNumber: 3 })],
                ordersAsSeller: [
                    order({
                        buyer: OTHER,
                        seller: WALLET,
                        orderHash: `0x${"14".repeat(32)}`,
                        blockNumber: 8,
                        state: OrderState.Resolved,
                    }),
                ],
            }),
        );
        expect(rows.map((r) => r.side)).toEqual(["seller", "buyer"]);
        expect(rows[0].counterparty).toBe(OTHER);
        expect(rows[0].resolved).toBe(true);
        expect(rows[1].counterparty).toBe(OTHER);
        expect(rows[1].resolved).toBe(false);
    });
});
