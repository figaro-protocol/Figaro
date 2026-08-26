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
