// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProcessTopologyFigure } from "@/components/figures/ProcessTopologyFigure";
import { DesignGraphCollapseFigure } from "@/components/figures/DesignGraphCollapseFigure";
import { RpgfScheduleFigure } from "@/components/figures/RpgfScheduleFigure";
import { LayeredDefenseFigure } from "@/components/figures/LayeredDefenseFigure";
import { BatchSettlementSequenceFigure } from "@/components/figures/BatchSettlementSequenceFigure";

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
        for (const identifier of [
            "SP1",
            "KernelOp",
            "FigaroBatchVerifier",
            "settleBatch",
            "UsageCounter",
            "applyBatchAccrual",
            "FigaroCore",
            "resolveProcess",
            "transferFrom",
        ]) {
            expect(text).not.toContain(identifier);
        }
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
