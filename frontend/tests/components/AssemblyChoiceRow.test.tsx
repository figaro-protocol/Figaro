import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssemblyChoiceRow } from "@/components/members/AssemblyChoiceRow";
import type { AssemblyChoice } from "@/lib/protocol/assemblyChoices";

/**
 * The wizard's assembly picker reads as the designer wrote it: name, then the
 * summary that says which trade the assembly is for, then the slug and the
 * shape. Rendering the slug and a clause list alone is how a seller of one mug
 * picked a freight assembly by accident.
 */

const CHOICE: AssemblyChoice = {
    slug: "asm-33ce205ea77e79e8",
    registeredBy: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    compositionHash: `0x${"ab".repeat(32)}` as `0x${string}`,
    contentURI: "ipfs://QmTemplate",
    blockNumber: 1n,
    networkTargets: ["local-anvil"],
    state: "loaded",
    name: "Point of sale",
    summary: "One bonded order at the counter: buyer and seller, no process in between.",
    agreementCount: 1,
    clauses: ["figaro-commerce", "figaro-topology"],
    assemblyTemplate: null,
    stakeWithdrawn: false,
};

const renderRow = (choice: AssemblyChoice) =>
    render(
        <AssemblyChoiceRow
            choice={choice}
            checked={false}
            onToggle={vi.fn()}
            testIdPrefix="seller-assembly"
        />,
    );

describe("AssemblyChoiceRow", () => {
    it("leads with the designer's name and summary", () => {
        renderRow(CHOICE);
        expect(screen.getByText("Point of sale")).toBeInTheDocument();
        expect(screen.getByTestId(`seller-assembly-summary-${CHOICE.slug}`))
            .toHaveTextContent("One bonded order at the counter");
    });

    it("keeps the slug on the row, secondary to the name", () => {
        const { container } = renderRow(CHOICE);
        const slug = container.querySelector("code");
        expect(slug).toHaveTextContent(CHOICE.slug);
    });

    it("shows the slug as the heading when the template carries no name", () => {
        // The projection falls back to the slug; the row renders what it is given.
        renderRow({ ...CHOICE, name: CHOICE.slug, summary: null });
        expect(screen.getByText(CHOICE.slug, { selector: "span" })).toBeInTheDocument();
    });

    it("renders no summary line when the template carries no prose", () => {
        renderRow({ ...CHOICE, summary: null });
        expect(screen.queryByTestId(`seller-assembly-summary-${CHOICE.slug}`)).toBeNull();
    });

    it("renders the shape alongside the summary — words and structure, not one or the other", () => {
        renderRow(CHOICE);
        expect(screen.getByTestId(`seller-assembly-shape-${CHOICE.slug}`))
            .toHaveTextContent("1 agreement · 2 clauses");
    });

    it("says the content is unresolved rather than describing an assembly it cannot read", () => {
        renderRow({
            ...CHOICE,
            state: "error",
            name: CHOICE.slug,
            summary: null,
            agreementCount: null,
            clauses: null,
        });
        expect(screen.getByText(/Document unavailable/)).toBeInTheDocument();
        expect(screen.queryByTestId(`seller-assembly-summary-${CHOICE.slug}`)).toBeNull();
    });

    it("offers the inspect link into the read-only designer view", () => {
        renderRow(CHOICE);
        expect(screen.getByTestId(`seller-assembly-inspect-${CHOICE.slug}`))
            .toHaveAttribute("href", `/assemblies/designer/view?slug=${CHOICE.slug}`);
    });
});
