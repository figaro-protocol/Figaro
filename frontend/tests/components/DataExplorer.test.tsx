/**
 * DataExplorer.test.tsx — the two things the surface must never get wrong:
 * a layer is rendered WITH the truth boundary behind it, and an absence is
 * rendered as an absence (unattributed processes, a fingerprint-only overlay
 * family, no venue reader) rather than as an empty table implying nothing
 * happened.
 *
 * The prompt box is tested here too, because "renders ONLY when an analyst
 * endpoint resolves" is a ruling, not a detail: with no endpoint there is no
 * reader to ask, and the box must not exist at all.
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { GraphCorpus } from "@/lib/data/graphCorpus";

let searchParams = "view=market";
vi.mock("next/navigation", () => ({
    usePathname: () => "/data/explore",
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(searchParams),
}));

const corpusMock = vi.fn();
vi.mock("@/lib/data/graphCorpus", () => ({ useGraphCorpus: () => corpusMock() }));

const analystUrlMock = vi.fn();
vi.mock("@/lib/data/analystEndpoint", () => ({
    getAnalystUrl: () => analystUrlMock(),
    readAnalystStatus: async () => statusMock(),
    askAnalyst: async () => ({ state: "no-prompt", reason: "unused" }),
}));
const statusMock = vi.fn();

import { DataExplorer } from "@/components/data/DataExplorer";
import { AnalystPrompt } from "@/components/data/AnalystPrompt";

const TOKEN = "0x1111111111111111111111111111111111111111";
const KEY = `0x${"a1".repeat(32)}`;

function corpus(over: Partial<GraphCorpus> = {}): GraphCorpus {
    return {
        chainId: 31337,
        process: { boundary: "protocol-enforced", processes: new Map() },
        settlement: { boundary: "protocol-enforced", chains: new Map() },
        overlays: [],
        valueFlow: { boundary: "composition-derived", nodes: [], edges: [] },
        market: { boundary: "protocol-derived", groups: new Map(), unattributedProcessCount: 0 },
        substance: { attempted: 0, recovered: 0, total: 0 },
        tokenMeta: new Map(),
        venue: null,
        assemblyNames: new Map(),
        attributionByProcess: new Map(),
        ...over,
    } as GraphCorpus;
}

describe("DataExplorer — layers name their truth boundary", () => {
    beforeEach(() => {
        analystUrlMock.mockReturnValue(null);
        statusMock.mockReturnValue(null);
    });

    it("renders the active layer's boundary label from the doc's vocabulary", () => {
        searchParams = "view=market";
        corpusMock.mockReturnValue({ corpus: corpus(), isLoading: false, failed: false });
        render(<DataExplorer />);
        expect(screen.getByTestId("layer-boundary").textContent).toContain("protocol-derived");

        searchParams = "view=value-flow";
        render(<DataExplorer />);
        expect(screen.getAllByTestId("layer-boundary").at(-1)!.textContent).toContain("composition-derived");
    });

    it("a failed read is UNKNOWN chain state, never an empty record", () => {
        searchParams = "view=market";
        corpusMock.mockReturnValue({ corpus: null, isLoading: false, failed: true });
        render(<DataExplorer />);
        expect(screen.getByTestId("corpus-failed").textContent).toMatch(/not an empty record/i);
        expect(screen.queryByTestId("market-empty")).toBeNull();
    });
});

describe("DataExplorer — absence is stated, never fabricated", () => {
    beforeEach(() => {
        analystUrlMock.mockReturnValue(null);
        statusMock.mockReturnValue(null);
    });

    it("counts unattributed processes and says why they are unattributed", () => {
        searchParams = "view=market";
        corpusMock.mockReturnValue({
            corpus: corpus({
                market: { boundary: "protocol-derived", groups: new Map(), unattributedProcessCount: 3 },
            }),
            isLoading: false,
            failed: false,
        });
        render(<DataExplorer />);
        expect(screen.getByTestId("market-count").textContent).toContain("3 processes unattributed");
        expect(screen.getByTestId("market-unattributed").textContent).toMatch(/party-private/i);
        expect(screen.getByTestId("market-empty").textContent).toMatch(/not absence of trade/i);
    });

    it("an overlay family whose spec never resolved is a ROW carrying its key alone", () => {
        searchParams = "view=overlays";
        corpusMock.mockReturnValue({
            corpus: corpus({
                overlays: [
                    {
                        boundary: "protocol-derived",
                        clauseKey: KEY as `0x${string}`,
                        spec: null,
                        entries: [
                            {
                                orderHash: `0x${"11".repeat(32)}`,
                                processId: `0x${"22".repeat(32)}`,
                                attester: TOKEN,
                                stage: 0,
                                universe: "direct",
                                blockNumber: 4,
                                contentRef: `0x${"33".repeat(32)}`,
                                decoded: null,
                            },
                        ],
                    },
                ],
            } as Partial<GraphCorpus>),
            isLoading: false,
            failed: false,
        });
        render(<DataExplorer />);
        expect(screen.getByTestId("overlay-count").textContent).toContain("1 overlay");
        expect(screen.getByTestId("overlay-unresolved").textContent).toMatch(/never a name or a field it does not/i);
        // The on-chain identity is shown; no invented title.
        expect(screen.getByTestId(`overlay-row-${KEY}`).textContent).toContain(KEY.slice(0, 10));
    });

    it("no composed venue reads as 'no reader here', not as 'no corridors exist'", () => {
        searchParams = "view=value-flow";
        corpusMock.mockReturnValue({ corpus: corpus(), isLoading: false, failed: false });
        render(<DataExplorer />);
        expect(screen.getByTestId("venue-posture").textContent).toMatch(/absence of a reader, never the absence of trade/i);
        expect(screen.getByTestId("denomination-empty")).toBeInTheDocument();
    });

    it("the wallet layer asks for any address and needs no connected wallet", () => {
        searchParams = "view=wallet";
        corpusMock.mockReturnValue({ corpus: corpus(), isLoading: false, failed: false });
        render(<DataExplorer />);
        expect(screen.getByTestId("wallet-prompt").textContent).toMatch(/no wallet needs to be connected/i);
        expect(screen.getByTestId("wallet-input")).toBeInTheDocument();
    });
});

describe("AnalystPrompt — the box exists only where a reader does", () => {
    it("renders NOTHING when no analyst endpoint resolves", async () => {
        analystUrlMock.mockReturnValue(null);
        const { container } = render(<AnalystPrompt />);
        await Promise.resolve();
        expect(container.innerHTML).toBe("");
    });

    it("renders the box for a configured endpoint, and says so when its host runs no model", async () => {
        analystUrlMock.mockReturnValue("https://analyst.example.com");
        statusMock.mockReturnValue({ prompt: { available: false, reason: "ANTHROPIC_MODEL is unset" } });
        render(<AnalystPrompt />);
        expect(await screen.findByTestId("analyst-prompt")).toBeInTheDocument();
        expect((await screen.findByTestId("analyst-no-prompt")).textContent).toMatch(/ANTHROPIC_MODEL is unset/);
        expect(screen.queryByTestId("analyst-question")).toBeNull();
    });
});

describe("DataExplorer — a listed process can be carried into the audit view", () => {
    const PROCESS = `0x${"ab".repeat(32)}`;
    const MARKET = `0x${"cd".repeat(32)}`;
    const BUYER = "0x5555555555555555555555555555555555555555";

    /** One process as the kernel's own reconstruction hands it over. */
    const process = (processId: string, over: Record<string, unknown> = {}) => ({
        processId,
        rootBuyer: BUYER,
        currency: TOKEN,
        cumulativeValue: 9n,
        resolved: true,
        orders: new Map([
            [
                "o1",
                {
                    orderHash: `0x${"11".repeat(32)}`,
                    processId,
                    buyer: BUYER,
                    seller: "0x6666666666666666666666666666666666666666",
                    currency: TOKEN,
                    payment: 9n,
                    cumulativeValue: 9n,
                    agreementHash: `0x${"99".repeat(32)}`,
                    salt: 0n,
                    deadline: 0n,
                    state: 1,
                    blockNumber: 12,
                },
            ],
        ]),
        ...over,
    });

    const marketGroup = (key: string) => ({
        key,
        processCount: 1,
        orderCount: 1,
        distinctPairCount: 1,
        volumeByDenomination: new Map([[TOKEN, { committed: 18n, settled: 9n }]]),
        processCommitBlocks: [12],
        shapes: [{ orderCount: 1, processCount: 1 }],
    });

    beforeEach(() => {
        analystUrlMock.mockReturnValue(null);
        statusMock.mockReturnValue(null);
    });

    it("the DEFAULT market layer shows each process's id and links it into /audit/view", () => {
        // The default view — no wallet typed, no address known. This is where
        // a reader who has only just arrived actually stands.
        searchParams = "view=market";
        corpusMock.mockReturnValue({
            corpus: corpus({
                process: { boundary: "protocol-enforced", processes: new Map([[PROCESS, process(PROCESS)]]) },
                market: {
                    boundary: "protocol-derived",
                    groups: new Map([[MARKET, marketGroup(MARKET)]]),
                    unattributedProcessCount: 0,
                },
                attributionByProcess: new Map([[PROCESS.toLowerCase(), MARKET.toLowerCase()]]),
            } as Partial<GraphCorpus>),
            isLoading: false,
            failed: false,
        });
        render(<DataExplorer />);

        const link = screen.getByTestId(`process-audit-link-${PROCESS.toLowerCase()}`);
        expect(link).toHaveAttribute("href", `/audit/view?process=${PROCESS}`);
        // The id itself is on the page, not only behind the link's href.
        expect(screen.getByTestId(`process-row-${PROCESS.toLowerCase()}`).textContent).toContain(PROCESS.slice(0, 10));
        expect(screen.getByTestId(`market-processes-${MARKET}`).textContent).toMatch(/most recent first/i);
    });

    it("an UNATTRIBUTED process is openable too — the posture hides no id", () => {
        searchParams = "view=market";
        corpusMock.mockReturnValue({
            corpus: corpus({
                process: { boundary: "protocol-enforced", processes: new Map([[PROCESS, process(PROCESS)]]) },
                market: { boundary: "protocol-derived", groups: new Map(), unattributedProcessCount: 1 },
                attributionByProcess: new Map(),
            } as Partial<GraphCorpus>),
            isLoading: false,
            failed: false,
        });
        render(<DataExplorer />);

        expect(screen.getByTestId("market-processes-unattributed")).toBeInTheDocument();
        expect(screen.getByTestId(`process-audit-link-${PROCESS.toLowerCase()}`)).toHaveAttribute(
            "href",
            `/audit/view?process=${PROCESS}`,
        );
    });

    it("an empty record lists no process rows at all — absence, never a fabricated id", () => {
        searchParams = "view=market";
        corpusMock.mockReturnValue({ corpus: corpus(), isLoading: false, failed: false });
        render(<DataExplorer />);
        expect(screen.queryByTestId("market-processes-unattributed")).toBeNull();
        expect(screen.queryByTestId(`process-audit-link-${PROCESS.toLowerCase()}`)).toBeNull();
    });
});
