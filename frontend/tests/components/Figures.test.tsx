// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProcessTopologyFigure } from "@/components/figures/ProcessTopologyFigure";
import { DesignGraphCollapseFigure } from "@/components/figures/DesignGraphCollapseFigure";
import { RpgfScheduleFigure } from "@/components/figures/RpgfScheduleFigure";
import { LayeredDefenseFigure } from "@/components/figures/LayeredDefenseFigure";
import { BatchSettlementSequenceFigure } from "@/components/figures/BatchSettlementSequenceFigure";
import { SettlementPathsFigure } from "@/components/figures/SettlementPathsFigure";
import { MarketFormationSwimlaneFigure } from "@/components/figures/MarketFormationSwimlaneFigure";
import { readFile } from "node:fs/promises";

afterEach(() => {
    cleanup();
});

describe("ProcessTopologyFigure", () => {
    const props = {
        buyerLabel: "Passenger",
        unit: "$",
        figureTitle: "t",
        figureDesc: "d",
        caption: "c",
    };

    it("derives each seller's bond as twice the accumulator at its own commit (well-formed input)", () => {
        const { container } = render(
            <ProcessTopologyFigure
                {...props}
                legs={[
                    { name: "Aircraft", payment: 65 },
                    { name: "Fuel", payment: 45 },
                ]}
            />,
        );
        const text = container.textContent ?? "";
        // G runs 65 then 110; bonds 2G run 130 then 220.
        expect(text).toContain("P $65 · G $65");
        expect(text).toContain("P $45 · G $110");
        expect(text).toContain("$130");
        expect(text).toContain("$220");
    });

    it("reports the buyer aggregate as 2 × final accumulator and the cohort as the sum of seller bonds", () => {
        const { container } = render(
            <ProcessTopologyFigure
                {...props}
                legs={[
                    { name: "A", payment: 10 },
                    { name: "B", payment: 2 },
                ]}
            />,
        );
        const text = container.textContent ?? "";
        // Buyer: 2 × 12 = 24. Cohort: 2×10 + 2×12 = 44.
        expect(text).toContain("$24 in all");
        expect(text).toContain("lock $44");
    });

    it("handles a single-order process without collapsing the layout (edge case)", () => {
        const { container } = render(
            <ProcessTopologyFigure {...props} legs={[{ name: "Only seller", payment: 7.5 }]} />,
        );
        const svg = container.querySelector("svg");
        const height = Number((svg?.getAttribute("viewBox") ?? "0 0 400 0").split(" ")[3]);
        expect(height).toBeGreaterThan(100);
        expect(container.textContent).toContain("Resolution settles the order, and it is the buyer's alone to call.");
    });

    it("exposes an accessible title and description bound by aria-labelledby", () => {
        const { container } = render(
            <ProcessTopologyFigure
                {...props}
                idPrefix="tp"
                figureTitle="One process, two edges"
                figureDesc="Long description."
                legs={[{ name: "A", payment: 1 }]}
            />,
        );
        const svg = container.querySelector("svg");
        expect(svg).toHaveAttribute("aria-labelledby", "tp-title tp-desc");
        expect(container.querySelector("#tp-title")?.textContent).toBe("One process, two edges");
        expect(container.querySelector("#tp-desc")?.textContent).toBe("Long description.");
    });
});

describe("DesignGraphCollapseFigure", () => {
    const props = {
        rootBuyerLabel: "Importer",
        designHeading: "Handoff chain",
        topologyNote: ["The agreement does."],
        figureTitle: "t",
        figureDesc: "d",
        caption: "c",
    };

    it("numbers the commit sequence in order and names the root buyer once (well-formed input)", () => {
        const { container } = render(
            <DesignGraphCollapseFigure
                {...props}
                designNodes={[{ label: "shipper" }, { label: "carrier" }]}
                commitOrder={["importer → shipper", "importer → carrier"]}
            />,
        );
        const text = container.textContent ?? "";
        expect(text).toContain("commit 1");
        expect(text).toContain("commit 2");
        expect(text).not.toContain("commit 3");
        expect(text).toContain("Importerroot buyer of every order below");
    });

    it("counts branch nodes in the design layer but never in the commit sequence", () => {
        const { container } = render(
            <DesignGraphCollapseFigure
                {...props}
                designNodes={[{ label: "shipper" }, { label: "insurer", branch: true }]}
                commitOrder={["importer → shipper", "importer → insurer"]}
            />,
        );
        expect(container.textContent).toContain("2 nodes");
        expect(container.textContent).toContain("2 commits and one accumulator");
    });

    it("grows the viewBox with the longer of the two columns (asymmetric input)", () => {
        const heightOf = (nodes: number, commits: number) => {
            const { container } = render(
                <DesignGraphCollapseFigure
                    {...props}
                    designNodes={Array.from({ length: nodes }, (_, i) => ({ label: `n${i}` }))}
                    commitOrder={Array.from({ length: commits }, (_, i) => `c${i}`)}
                />,
            );
            const h = Number((container.querySelector("svg")?.getAttribute("viewBox") ?? "").split(" ")[3]);
            cleanup();
            return h;
        };
        expect(heightOf(12, 2)).toBeGreaterThan(heightOf(2, 2));
        expect(heightOf(2, 12)).toBeGreaterThan(heightOf(2, 2));
    });
});

/** Mirrors the prop set verified-settlement-kernel §5.5 passes. The companion
 *  source-level assertion below is what stops this fixture drifting from the
 *  page: a banned identifier reaching the real call site fails there. */
const PAPER_SETTLEMENT_PATHS = {
    lineFont: "sans" as const,
    directPath: {
        heading: "Direct path",
        subheading: "the kernel's own two calls",
        inputs: ["a dual-signed commitment", "the buyer's resolution over the process"],
        events: ["order committed", "order resolved", "process resolved"],
        state: ["per-order status, advancing monotonically"],
        stateNote: "has no notion of a batch",
    },
    batchPath: {
        heading: "Batch path",
        subheading: "proof-verified off-chain execution",
        inputs: [
            "signed commitments, gathered and ordered",
            "a validity proof of a mirror's execution",
            "carried to the settlement call",
        ],
        events: ["batch settled"],
        state: ["its own state root, verifier-local"],
    },
    sectionLabels: { inputs: "Inputs", events: "Records emitted", state: "State" },
    neverWrittenNote: "a kernel order status — never acquired",
    bridgeLabel: "The usage counter",
    bridgeSublabel: "clause and assembly usage",
    crossingLabel: "a usage accrual",
    crossingSublabel: "the one quantity common to both",
    figureTitle: "The two settlement paths, and the one surface common to both",
    figureDesc:
        "Two panels. The direct path is the kernel's own two calls. The batch path " +
        "is proof-verified off-chain execution, and a kernel order status is never " +
        "acquired on it. One arrow crosses between them, carrying a usage accrual " +
        "into the counter of clause and assembly usage.",
    caption: "An order settled through the batch verifier never acquires a kernel order status at all.",
};

/** The paper corpus names no contract, function, event, or proving system. */
const BANNED_IDENTIFIERS = [
    "SP1",
    "KernelOp",
    "FigaroBatchVerifier",
    "settleBatch",
    "UsageCounter",
    "applyBatchAccrual",
    "FigaroCore",
    "resolveProcess",
    "transferFrom",
    "orderStatus",
    "stateRoot",
    "OrderCommitted",
    "OrderResolved",
    "ProcessResolved",
    "BatchSettled",
];

describe("SettlementPathsFigure", () => {
    it("renders /spec's exact strings when given no props (the default must not drift)", () => {
        const { container } = render(<SettlementPathsFigure />);
        const text = container.textContent ?? "";
        for (const specString of [
            "Direct path",
            "FigaroCore — kernel (frozen)",
            "commit(commitment, buyerSig, sellerSig)",
            "resolveProcess(processId, commitments[])",
            "OrderCommitted",
            "OrderResolved",
            "ProcessResolved",
            "orderStatus[orderHash]: 0 → 1 → 2",
            "has no notion of a batch",
            "Batch path",
            "FigaroBatchVerifier — proof-based (SP1)",
            "signed Commitment structs",
            "→ sequencer → SP1 validity proof",
            "BatchSettled",
            "stateRoot (verifier-local only)",
            "FigaroCore.orderStatus — never written",
            "UsageCounter",
            "usage-accrual ledger",
            "usage accrual",
            "(same settleBatch tx)",
            "Two disjoint settlement paths",
        ]) {
            expect(text).toContain(specString);
        }
    });

    it("keeps /spec's default body lines monospaced", () => {
        const { container } = render(<SettlementPathsFigure />);
        const mono = container.querySelectorAll("text.font-mono");
        expect(mono.length).toBeGreaterThan(0);
    });

    it("names no contract, function, event, or proving system in the paper register", () => {
        const { container } = render(<SettlementPathsFigure {...PAPER_SETTLEMENT_PATHS} />);
        const text = container.textContent ?? "";
        for (const identifier of BANNED_IDENTIFIERS) {
            expect(text).not.toContain(identifier);
        }
    });

    it("puts the crossing quantity on the crossing arrow and the bridge on the bridge", () => {
        const { container } = render(<SettlementPathsFigure {...PAPER_SETTLEMENT_PATHS} />);
        const text = container.textContent ?? "";
        expect(text).toContain("a usage accrual");
        expect(text).toContain("the one quantity common to both");
        expect(text).toContain("The usage counter");
        expect(text).toContain("a kernel order status — never acquired");
    });

    it("carries no banned identifier at the real §5.5 call site (guards fixture drift)", async () => {
        // Relative to the vitest cwd (frontend/), not to this module.
        const source = await readFile(
            "app/(marketing)/papers/verified-settlement-kernel/page.tsx",
            "utf8",
        );
        const figureCall = source.slice(
            source.indexOf("<SettlementPathsFigure"),
            source.indexOf("<PaperRun title=\"What is checked about the composition of the two paths.\">"),
        );
        expect(figureCall.length).toBeGreaterThan(0);
        for (const identifier of BANNED_IDENTIFIERS) {
            expect(figureCall).not.toContain(identifier);
        }
    });

    it("grows a panel with its content instead of overlapping it (layout is computed)", () => {
        const heightOf = (inputs: readonly string[]) => {
            const { container } = render(
                <SettlementPathsFigure
                    directPath={{ ...PAPER_SETTLEMENT_PATHS.directPath, inputs }}
                    batchPath={PAPER_SETTLEMENT_PATHS.batchPath}
                />,
            );
            const h = Number((container.querySelector("svg")?.getAttribute("viewBox") ?? "").split(" ")[3]);
            cleanup();
            return h;
        };
        expect(heightOf(["a", "b", "c", "d", "e", "f"])).toBeGreaterThan(heightOf(["a"]));
    });
});

describe("BatchSettlementSequenceFigure", () => {
    it("renders all seven steps, numbered in order, and none beyond them", () => {
        const { container } = render(<BatchSettlementSequenceFigure />);
        const text = container.textContent ?? "";
        for (const n of [1, 2, 3, 4, 5, 6, 7]) {
            expect(text).toContain(String(n));
        }
        expect(text).toContain("Buyer + seller wallets");
        expect(text).toContain("→ Sequencer");
        expect(text).toContain("→ Validity proof");
        expect(text).toContain("→ The settlement call");
        expect(text).toContain("→ Usage accrual, then the state root");
        // The spine carries exactly one numbered dot per step.
        expect(container.querySelectorAll("circle")).toHaveLength(7);
    });

    it("renders the direct-path fallback block, and marks it a new process not a migration", () => {
        const { container } = render(<BatchSettlementSequenceFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("If the sequencer stalls or censors: the direct path");
        expect(text).toContain("never a migration of a batched one");
        // The fallback block is the one dashed-outline rect in the figure.
        const dashed = container.querySelectorAll('rect[stroke-dasharray="4 3"]');
        expect(dashed).toHaveLength(1);
    });

    it("states that the proof COMMITS to the batch data by hash, never that it carries it", () => {
        const { container } = render(<BatchSettlementSequenceFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("public values commit, by hash");
        expect(text).not.toContain("Public values carry");
    });

    it("names no contract, function, or proving system — the paper corpus convention", () => {
        const { container } = render(<BatchSettlementSequenceFigure />);
        const text = container.textContent ?? "";
        for (const identifier of BANNED_IDENTIFIERS) {
            expect(text).not.toContain(identifier);
        }
    });
});

/** The market-formation figure additionally names no SDK symbol or payload
 *  field — the corpus register keeps source identifiers in comments. */
const BANNED_FORMATION_IDENTIFIERS = [
    "startRace",
    "counterSignDraft",
    "quoteDraft",
    "verifyRaceReply",
    "verifyQuoteReply",
    "selectRaceWinner",
    "expectedCumulativeValue",
    "CommitmentPayload",
    "quoteRequest",
    "sellerSig",
    "buyerSig",
];

describe("MarketFormationSwimlaneFigure", () => {
    it("renders five numbered steps, both answer legs, and nothing beyond them", () => {
        const { container } = render(<MarketFormationSwimlaneFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("Draft");
        expect(text).toContain("Answer — race leg");
        expect(text).toContain("Answer — quote leg");
        expect(text).toContain("Verify");
        expect(text).toContain("Select, and sign once");
        // One numbered dot per step, and only the steps carry dots.
        expect(container.querySelectorAll("circle")).toHaveLength(5);
    });

    it("puts the settlement layer beneath both lanes and marks the on-chain boundary", () => {
        const { container } = render(<MarketFormationSwimlaneFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("Settlement layer — market-blind");
        expect(text).toContain("nothing above this line is on chain");
        // The market-blindness claim, stated where it can be read off the shape.
        expect(text).toContain("Nothing in the artifact says how the seller was found");
    });

    it("states that losing answers expire rather than being cancelled", () => {
        const { container } = render(<MarketFormationSwimlaneFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("answers not taken expire");
        expect(text).toContain("no cancel operation");
    });

    it("names no contract, function, package, or payload field", () => {
        const { container } = render(<MarketFormationSwimlaneFigure />);
        const text = container.textContent ?? "";
        for (const identifier of [...BANNED_IDENTIFIERS, ...BANNED_FORMATION_IDENTIFIERS]) {
            expect(text).not.toContain(identifier);
        }
    });

    it("exposes an accessible title and description bound by aria-labelledby", () => {
        const { container } = render(<MarketFormationSwimlaneFigure idPrefix="mf" />);
        const svg = container.querySelector("svg");
        expect(svg).toHaveAttribute("aria-labelledby", "mf-title mf-desc");
        expect(container.querySelector("#mf-title")?.textContent).toContain("dispatch race");
        expect(container.querySelector("#mf-desc")?.textContent).toContain("never both");
    });
});

describe("RpgfScheduleFigure", () => {
    it("renders nine annual budgets summing to the 600M reserve (deployed schedule)", () => {
        const { container } = render(<RpgfScheduleFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("The 9 budgets sum to 600M");
        // 45 × 2, 60 × 3, 82.5 × 4 — the deployed _rpgfAmounts() list.
        expect(text).toContain("45");
        expect(text).toContain("60");
        expect(text).toContain("82.5");
        expect(text).toContain("15% over years 1–2");
        expect(text).toContain("55% over years 6–9");
    });

    it("recomputes the total from whatever tranches it is given (parametrized input)", () => {
        const { container } = render(
            <RpgfScheduleFigure
                tranches={[
                    { label: "half", periods: 1, perPeriodMillions: 50 },
                    { label: "half", periods: 1, perPeriodMillions: 50 },
                ]}
                figureTitle="t"
                figureDesc="d"
                caption="c"
            />,
        );
        expect(container.textContent).toContain("The 2 budgets sum to 100M");
    });
});

describe("LayeredDefenseFigure", () => {
    it("renders /faq's ranked five layers when no labels are passed (default)", () => {
        render(<LayeredDefenseFigure />);
        expect(screen.getByText("1 · The chain")).toBeInTheDocument();
        expect(screen.getByText("5 · Ordinary courts")).toBeInTheDocument();
        expect(screen.getByText(/record only below this line/)).toBeInTheDocument();
    });

    it("renders a citing surface's own numbering and boundary note when passed (parametrized input)", () => {
        render(
            <LayeredDefenseFigure
                idPrefix="paper"
                layers={[
                    { label: "Layer 0 — chain security", note: "a" },
                    { label: "Layer 1 — bonding", note: "b" },
                    { label: "Layer 2 — peer coordination", note: "c" },
                    { label: "Layer 3 — arbitration", note: "d" },
                    { label: "Layer 4 — courts", note: "e" },
                ]}
                boundaryNote="forums rule below this line"
                figureTitle="t"
                figureDesc="d"
                caption="c"
            />,
        );
        expect(screen.getByText("Layer 0 — chain security")).toBeInTheDocument();
        expect(screen.getByText("Layer 4 — courts")).toBeInTheDocument();
        expect(screen.getByText("forums rule below this line")).toBeInTheDocument();
        expect(screen.queryByText("1 · The chain")).not.toBeInTheDocument();
    });
});
