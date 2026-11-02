// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProcessTopologyFigure } from "@/components/figures/ProcessTopologyFigure";
import { DesignGraphCollapseFigure } from "@/components/figures/DesignGraphCollapseFigure";
import { LayeredDefenseFigure } from "@/components/figures/LayeredDefenseFigure";
import { MarketFormationSwimlaneFigure } from "@/components/figures/MarketFormationSwimlaneFigure";
import { RegistryLifecycleFigure } from "@/components/figures/RegistryLifecycleFigure";
import { WholeSystemFigure } from "@/components/figures/WholeSystemFigure";
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
        expect(container.textContent).toContain("Resolution closes the order, and it is the buyer's alone to call.");
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
            <DesignGraphCollapseFigure {...shape} branchNote="spawned from agreement-0, not the next link" />,
        );
        expect(custom.textContent).toContain("spawned from agreement-0, not the next link");
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

/** Mirrors the prop set verified-resolution-kernel §5.5 passes. The companion
 *  source-level assertion below is what stops this fixture drifting from the
 *  page: a banned identifier reaching the real call site fails there. */
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

    it("puts the mechanism beneath both lanes and marks the on-chain boundary", () => {
        const { container } = render(<MarketFormationSwimlaneFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("The mechanism — market-blind");
        expect(text).toContain("nothing above this line is on chain");
        // The market-blindness claim, stated where it can be read off the shape.
        expect(text).toContain("Nothing in the artifact says how the seller was found");
    });

    it("states that losing answers expire rather than being canceled", () => {
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

describe("LayeredDefenseFigure", () => {
    it("renders /faq's ranked five layers when no labels are passed (default)", () => {
        render(<LayeredDefenseFigure />);
        expect(screen.getByText("1 · The chain")).toBeInTheDocument();
        expect(screen.getByText("5 · Ordinary courts")).toBeInTheDocument();
        expect(screen.getByText(/data only below this line/)).toBeInTheDocument();
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

    it("names each hash-keyed registry's key on its own line — the hashes cover different things", () => {
        const { container } = render(<RegistryLifecycleFigure />);
        const text = container.textContent ?? "";
        expect(text).toContain("ClauseRegistry — hash of the pinned spec");
        expect(text).toContain("AssemblyRegistry — hash of the pinned composition");
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

    it("claims anti-displacement, never anti-squatting — a registered binding cannot be rebound", () => {
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

describe("WholeSystemFigure", () => {
    const PART_TITLES = [
        "The bonded commitment",
        "The stake",
        "The designs and the designers\u2019 rewards",
        "The florin",
        "The DAO",
        "The denominations",
        "The composition with law and the market",
        "8  The data",
    ];

    it("renders the eight part titles, numbered 1 to 8 in order, above the base chain", () => {
        const { container } = render(<WholeSystemFigure />);
        const texts = Array.from(container.querySelectorAll("svg text")).map((t) => t.textContent ?? "");
        const positions = PART_TITLES.map((title) => texts.indexOf(title));
        expect(positions.every((p) => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
        for (let n = 1; n <= 7; n++) {
            expect(texts[positions[n - 1] - 1]).toBe(String(n));
        }
        expect(screen.getByText("The base chain")).toBeInTheDocument();
        expect(screen.getByText("the rules fix the bond and the resolution")).toBeInTheDocument();
        expect(screen.getByText("mutual-aid")).toBeInTheDocument();
    });

    it("binds the accessible title and description under its id prefix", () => {
        const { container } = render(<WholeSystemFigure idPrefix="paper-whole" />);
        const svg = container.querySelector("svg");
        expect(svg?.getAttribute("role")).toBe("img");
        expect(svg?.getAttribute("aria-labelledby")).toBe("paper-whole-title paper-whole-desc");
        expect(container.querySelector("#paper-whole-title")?.textContent).toBe("The whole of Figaro");
        expect(container.querySelector("#paper-whole-desc")?.textContent).toContain("Bottom to top: the base chain");
        expect(container.querySelector("figcaption")).toBeNull();
    });
});
