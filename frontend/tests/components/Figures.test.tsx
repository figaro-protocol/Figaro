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
import { OriginationSequenceFigure } from "@/components/figures/OriginationSequenceFigure";
import { GasCrossoverFigure } from "@/components/figures/GasCrossoverFigure";
import { DualProcessIdFigure } from "@/components/figures/DualProcessIdFigure";
import { RegistryLifecycleFigure } from "@/components/figures/RegistryLifecycleFigure";
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

    it("prints the paper register's branch note by default, and a caller's when given one", () => {
        const shape = { ...props, designNodes: [{ label: "a" }, { label: "b", branch: true }], commitOrder: ["x", "y"] };
        const { container } = render(<DesignGraphCollapseFigure {...shape} />);
        expect(container.textContent).toContain("off the main line, bonded to the same process");
        cleanup();

        const { container: custom } = render(
            <DesignGraphCollapseFigure {...shape} branchNote="spawned from order-0, not the next link" />,
        );
        expect(custom.textContent).toContain("spawned from order-0, not the next link");
        expect(custom.textContent).not.toContain("off the main line, bonded to the same process");
    });

    it("keeps its own two fixed strings broken across lines, so neither runs past the plate", () => {
        const { container } = render(
            <DesignGraphCollapseFigure
                {...props}
                designNodes={[{ label: "a" }]}
                commitOrder={["b → a"]}
            />,
        );
        const lines = Array.from(container.querySelectorAll("text")).map((node) => node.textContent);
        // Written as one string each, both overran the 400-unit plate. The break
        // points are the fix — re-joining either reintroduces the overflow.
        expect(lines).toContain("one accumulator, one root buyer,");
        expect(lines).toContain("no parent field");
        expect(lines).toContain("G rises monotonically down this list,");
        expect(lines).toContain("and only down it.");
        expect(lines).not.toContain("one accumulator, one root buyer, no parent field");
        expect(lines).not.toContain("G rises monotonically down this list, and only down it.");
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

describe("OriginationSequenceFigure", () => {
    it("renders every step of the handshake, numbered in order, and none beyond them", () => {
        const { container } = render(<OriginationSequenceFigure />);
        const text = container.textContent ?? "";
        for (const step of [
            "discover — ctx.sync()",
            "instantiate the root agreement",
            "validate — assertAgreementSignable()",
            "sign — EIP-712, chain-time deadline",
            "offer — singly signed",
            "validate — validateOffer()",
            "approve 2 × expectedCumulativeValue",
            "counter-signature — now dual-signed",
            "approve 2 × payment, then commit(c, buyerSig, sellerSig)",
            "attest — AttestationCoordinator",
            "resolveProcess(processId, commitments)",
        ]) {
            expect(text).toContain(step);
        }
        // Exactly eleven ordinals, in sequence, and no twelfth.
        const ordinals = Array.from(container.querySelectorAll("text"))
            .map((node) => node.textContent ?? "")
            .filter((value) => /^\d+$/.test(value));
        expect(ordinals).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
    });

    it("names all four columns, and marks the chain column as the only written one", () => {
        const { container } = render(<OriginationSequenceFigure />);
        const text = container.textContent ?? "";
        for (const column of ["Buyer", "Channel", "Seller", "Chain"]) {
            expect(text).toContain(column);
        }
        expect(text).toContain("transport");
        // The chain column is not the kernel: the read is the registries, the
        // approvals the settlement token, the attestation the coordinator.
        const labels = Array.from(container.querySelectorAll("text")).map((n) => n.textContent);
        expect(labels).toContain("on chain");
        expect(labels).not.toContain("FigaroCore");
        expect(text).toContain("The chain is written at steps 7, 9, 10 and 11 only.");
        expect(text).toContain("steps 2–6 and 8 never touch the chain at all.");
    });

    it("draws both refusal exits, each with its own consequence", () => {
        const { container } = render(<OriginationSequenceFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("refuses to sign: a missing required term, or a leaf that");
        expect(text).toContain("contradicts the struct it rides with. Nothing is signed.");
        expect(text).toContain("a hash or signature mismatch THROWS; the two opt-in");
        expect(text).toContain("floors decline with null instead. Nothing is on chain.");
        // One no-entry glyph per exit, and no others.
        expect(container.querySelectorAll('circle[r="5"]')).toHaveLength(2);
    });

    it("keeps signing and committing as two steps, never one", () => {
        const { container } = render(<OriginationSequenceFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("Two transactions — signing is not committing.");
        expect(text).not.toContain("sign and commit");
    });

    it("names the wire channels as the wire ones, and the in-process one as the test one", () => {
        const { container } = render(<OriginationSequenceFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("HttpChannel or A2aChannel across");
        expect(text).toContain("the wire, InProcessChannel in tests");
    });

    it("states the accrual period a usage record lands in, not merely that late is bad", () => {
        const { container } = render(<OriginationSequenceFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("a record counts in whatever period");
        expect(text).toContain("is open when you call — or in none at all, once accrual has closed.");
        expect(text).not.toContain("deferred record is deniable");
    });

    it("grows its viewBox with the content rather than clipping it (layout is computed)", () => {
        const { container } = render(<OriginationSequenceFigure />);
        const viewBox = container.querySelector("svg")?.getAttribute("viewBox") ?? "";
        const [, , width, height] = viewBox.split(" ").map(Number);
        expect(width).toBe(400);
        // Eleven steps of two-to-three detail lines cannot fit in less than this.
        expect(height).toBeGreaterThan(400);
    });

    it("exposes an accessible title and description bound by aria-labelledby", () => {
        const { container } = render(<OriginationSequenceFigure idPrefix="os" />);
        const svg = container.querySelector("svg");
        expect(svg).toHaveAttribute("aria-labelledby", "os-title os-desc");
        expect(container.querySelector("#os-title")?.textContent).toContain("origination handshake");
        expect(container.querySelector("#os-desc")?.textContent).toContain("Two refusals");
    });
});

describe("GasCrossoverFigure", () => {
    it("renders /spec's own constants, and the 26.5k marginal without rounding it away", () => {
        const { container } = render(<GasCrossoverFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("direct path — 167k per order");
        expect(text).toContain("batch path — 333k fixed ÷ positions, + 26.5k each");
        expect(text).toContain("144k sub-order commit + 23k per-order resolve");
        expect(text).toContain("one-time 38k");
    });

    it("DERIVES the crossover from its inputs rather than printing a fixed number", () => {
        const { container } = render(<GasCrossoverFigure />);
        // 332,902 / (167,000 − 26,500) = 2.369… — so the 3rd whole position is
        // the first cheaper one, which is the integer /spec's prose quotes.
        expect(container.textContent).toContain("crossover ≈ 2.4");
        expect(container.textContent).toContain("the 3rd position is the first cheaper");
        cleanup();

        const { container: doubled } = render(
            <GasCrossoverFigure batchFixed={281_000} directPerOrder={167_000} batchMarginal={26_500} />,
        );
        // 281,000 / 140,500 = 2.0 exactly — the two paths TIE at two positions,
        // so the first strictly cheaper one is still the third.
        expect(doubled.textContent).toContain("crossover ≈ 2.0");
        expect(doubled.textContent).toContain("the 3rd position is the first cheaper");
        cleanup();

        const { container: late } = render(
            <GasCrossoverFigure batchFixed={600_000} directPerOrder={167_000} batchMarginal={26_500} />,
        );
        // 600,000 / 140,500 = 4.27 — the ordinal moves with the arithmetic.
        expect(late.textContent).toContain("crossover ≈ 4.3");
        expect(late.textContent).toContain("the 5th position is the first cheaper");
    });

    it("states the two units it plots, because they are not the same unit", () => {
        const { container } = render(<GasCrossoverFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("Gas per unit settled, by batch size");
        expect(text).toContain("Per order on the direct path; per net position on the batch path.");
        expect(text).not.toContain("Gas per settled order, by batch size");
    });

    it("names no network in its accessible description (alt text is not a second register)", () => {
        const { container } = render(<GasCrossoverFigure idPrefix="gd" />);
        const desc = container.querySelector("#gd-desc")?.textContent ?? "";
        expect(desc).toContain("The two measured settlements on the public record's chain");
        for (const network of ["Sepolia", "mainnet", "Ethereum", "testnet"]) {
            expect(desc).not.toContain(network);
        }
    });

    it("plots each measured receipt at its own position count, with its gas figure", () => {
        const { container } = render(<GasCrossoverFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("measured on chain");
        expect(text).toContain("385,902 gas ÷ 2 — commit + witness attestation");
        expect(text).toContain("377,885 gas ÷ 2 — resolve + RPGF usage claim");
        // One dot per receipt, plus the single hollow dot marking the crossing.
        expect(container.querySelectorAll('circle[r="3.25"]')).toHaveLength(3);
    });

    it("omits the receipt block entirely when given none (optional field)", () => {
        const { container } = render(<GasCrossoverFigure receipts={[]} />);
        expect(container.textContent).not.toContain("measured on chain");
        expect(container.querySelectorAll('circle[r="3.25"]')).toHaveLength(1);
    });

    it("draws no crossing when a position never costs less than a whole order (malformed input)", () => {
        const { container } = render(
            <GasCrossoverFigure batchMarginal={200_000} directPerOrder={167_000} receipts={[]} />,
        );
        expect(container.textContent).not.toContain("crossover");
        expect(container.querySelectorAll('circle[r="3.25"]')).toHaveLength(0);
    });

    it("exposes an accessible title and description bound by aria-labelledby", () => {
        const { container } = render(<GasCrossoverFigure idPrefix="gx" />);
        const svg = container.querySelector("svg");
        expect(svg).toHaveAttribute("aria-labelledby", "gx-title gx-desc");
        expect(container.querySelector("#gx-desc")?.textContent).toContain("2.4 net positions");
    });
});

describe("DualProcessIdFigure", () => {
    it("contrasts the two call sites, naming the bridge and the revert", () => {
        const { container } = render(<DualProcessIdFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("resolveProcess(bytes32 processId, Commitment[] commitments)");
        expect(text).toContain("orderToCommitment");
        expect(text).toContain("restoreSignedProcessId(");
        expect(text).toContain("computeCommitmentProcessId(c, chainId, core)");
        expect(text).toContain("OrderNotCommitted");
        expect(text).toContain("processId = 0");
    });

    it("strikes through exactly the one move that silently misses", () => {
        const { container } = render(<DualProcessIdFigure />);
        const struck = container.querySelectorAll("s");
        expect(struck).toHaveLength(1);
        expect(struck[0].textContent).toContain("orderToCommitment");
    });

    it("states that the argument stays the derived id, and the struct does not", () => {
        const { container } = render(<DualProcessIdFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("That id belongs in the argument, and nowhere else.");
        expect(text).toContain("the value it was signed with");
    });

    it("scopes the same-value trap to ROOT orders, which is where the two ids differ", () => {
        const { container } = render(<DualProcessIdFigure />);
        const caption = container.querySelector("figcaption")?.textContent ?? "";
        expect(caption).toContain("root");
        expect(caption).toContain("the struct carries zero where the argument carries the derived id");
        expect(caption).toContain("A sub-order already carries the id it targets");
    });

    it("exposes an accessible title and description bound by aria-labelledby", () => {
        const { container } = render(<DualProcessIdFigure idPrefix="dp" />);
        const figure = container.querySelector("figure");
        expect(figure).toHaveAttribute("aria-labelledby", "dp-title dp-desc");
        expect(container.querySelector("#dp-title")?.textContent).toContain("two process ids");
        expect(container.querySelector("#dp-desc")?.textContent).toContain("restoreSignedProcessId");
    });
});

describe("RegistryLifecycleFigure", () => {
    it("renders the participant machine with its cooldown edge", () => {
        const { container } = render(<RegistryLifecycleFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("MembersRegistry — keyed to a wallet");
        for (const state of ["unregistered", "live", "withdrawal requested", "withdrawn"]) {
            expect(text).toContain(state);
        }
        // The view takes the wallet — a reader must not copy `registered()`.
        expect(text).toContain("registered(wallet) == true");
        expect(text).toContain("requestWithdrawal()");
        expect(text).toContain("de-surfaces in the same block");
        expect(text).toContain("after withdrawalCooldown, not before");
    });

    it("renders the clause/assembly machine as one-shot, with the binding permanent", () => {
        const { container } = render(<RegistryLifecycleFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("deposit withdrawn");
        expect(text).toContain("de-surfaced for NEW compositions");
        expect(text).toContain("registeredBy only, once, no cooldown");
        expect(text).toContain("The binding is never cleared: the key stays");
    });

    it("keeps the two ID-keyed registries' keys distinct — they key by different things", () => {
        const { container } = render(<RegistryLifecycleFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("ClauseRegistry — keyed by (chosen id, version)");
        expect(text).toContain("AssemblyRegistry — by composition hash");
        // Collapsing both into one "by hash" line loses the distinction.
        expect(text).not.toContain("ClauseRegistry / AssemblyRegistry — by hash");
    });

    it("states the withdraw gate as a PROTOCOL-SURFACE refusal, not a contract check", () => {
        const { container } = render(<RegistryLifecycleFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("One call — but the protocol surface refuses");
        expect(text).toContain("while commits outnumber resolves. That count");
        expect(text).toContain("no composition provenance to harden the gate.");
    });

    it("claims anti-displacement, never anti-squatting — a clause id is caller-chosen", () => {
        const { container } = render(<RegistryLifecycleFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("reverts AlreadyRegistered forever, so a");
        expect(text).toContain("registered binding cannot be displaced.");
        expect(text).not.toContain("unsquattable");
        expect(text).not.toContain("squat");
    });

    it("marks re-registration as open for a participant and closed for a key", () => {
        const { container } = render(<RegistryLifecycleFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("Re-registering is open from the moment of the");
        expect(text).toContain("request — and costs a SECOND deposit while the");
        // Exactly one non-transition glyph: the key's, never the participant's.
        expect(container.querySelectorAll('circle[r="6"]')).toHaveLength(1);
    });

    it("exposes an accessible title and description bound by aria-labelledby", () => {
        const { container } = render(<RegistryLifecycleFigure idPrefix="rl" />);
        const svg = container.querySelector("svg");
        expect(svg).toHaveAttribute("aria-labelledby", "rl-title rl-desc");
        expect(container.querySelector("#rl-title")?.textContent).toContain("withdrawal leaves behind");
        expect(container.querySelector("#rl-desc")?.textContent).toContain("never clears");
    });
});
