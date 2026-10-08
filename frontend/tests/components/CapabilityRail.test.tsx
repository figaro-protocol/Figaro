import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CapabilityRail } from "@/components/runtime/CapabilityRail";
import type { CapabilityModel } from "@/lib/semantic/models";

// The rail renders only id/label/actionKind/eventCode/inputFields; cast a
// minimal object (preconditions and the nested action/source aren't read for
// rendering).
const cap = (over: Partial<CapabilityModel> = {}): CapabilityModel => ({
    id: "p:o:figaro-merchant-process-seller-prep-started",
    label: "Preparation started",
    eventCode: "prep-started",
    actionKind: "submit-clause-attestation",
    preconditions: ["seller-of-active-order"],
    ...over,
} as unknown as CapabilityModel);

// Audit workstream B (finding 11): runtime buttons must show humanized labels,
// expose a STABLE event-code for targeting (not the label), and never leak raw
// internal precondition slugs to the user.
describe("CapabilityRail — humanized label + stable event-code", () => {
    it("renders the humanized label and exposes the raw code as data-event-code", () => {
        const c = cap();
        render(<CapabilityRail capabilities={[c]} executableCapabilityIds={new Set([c.id])} onExecute={() => {}} />);
        const btn = screen.getByTestId("capability-execute-submit-clause-attestation");
        expect(btn).toHaveTextContent("Preparation started");
        expect(btn).toHaveAttribute("data-event-code", "prep-started");
    });

    it("does not render the raw internal precondition slug to the user", () => {
        const c = cap();
        render(<CapabilityRail capabilities={[c]} executableCapabilityIds={new Set([c.id])} onExecute={() => {}} />);
        expect(screen.queryByText(/seller-of-active-order/)).not.toBeInTheDocument();
    });
});

// One re-assert card per party per order opens a chooser; each choice submits
// its own single-section capability, and the chooser goes with the card.
describe("CapabilityRail — a choice card opens a chooser", () => {
    const choice = (clauseId: string, title: string): CapabilityModel => ({
        id: `p:o:${clauseId}-seller-reassert`,
        label: title,
        actionKind: "reassert-committed-section",
        action: { executionType: "transaction", kind: "submit-clause-attestation", orderHash: "o", clauseId, stage: 0, party: "seller", reasserts: true },
        preconditions: [],
    } as unknown as CapabilityModel);
    const card = (choices: CapabilityModel[]): CapabilityModel => ({
        id: "p:o:seller-reassert-committed-sections",
        label: `Re-assert committed sections (${choices.length})`,
        actionKind: "reassert-committed-sections",
        action: { executionType: "choice", kind: "choose-capability", choices },
        preconditions: [],
    } as unknown as CapabilityModel);

    it("lists each choice by its title, and a submit executes that choice alone", () => {
        const choices = [choice("never-seen-a", "Section A"), choice("never-seen-b", "Section B")];
        const c = card(choices);
        const executed: CapabilityModel[] = [];
        render(<CapabilityRail capabilities={[c]} executableCapabilityIds={new Set([c.id])} onExecute={(x) => { executed.push(x); }} />);
        expect(screen.getByTestId("capability-reassert-committed-sections")).toBeInTheDocument();
        expect(screen.queryByTestId("capability-chooser-reassert-committed-sections")).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId("capability-execute-reassert-committed-sections"));
        expect(executed).toHaveLength(0);
        const rows = screen.getAllByTestId("capability-choice-reassert-committed-section");
        expect(rows.map((r) => r.getAttribute("data-clause-id"))).toEqual(["never-seen-a", "never-seen-b"]);
        expect(screen.getByText("Section A")).toBeInTheDocument();

        const submit = screen.getAllByTestId("capability-execute-reassert-committed-section")
            .find((b) => b.getAttribute("data-clause-id") === "never-seen-b")!;
        fireEvent.click(submit);
        expect(executed).toEqual([choices[1]]);
    });

    it("renders each card's order under its label, on the card and in its chooser", () => {
        const a = { ...card([choice("never-seen-a", "Section A")]), id: "p:a:buyer-reassert-committed-sections", orderLabel: "Order 1 of 2 · seller 0x2222…2222" };
        const b = { ...card([choice("never-seen-a", "Section A")]), id: "p:b:buyer-reassert-committed-sections", orderLabel: "Order 2 of 2 · seller 0x5555…5555" };
        render(<CapabilityRail capabilities={[a, b]} executableCapabilityIds={new Set([a.id, b.id])} onExecute={() => {}} />);
        expect(screen.getAllByTestId("capability-order-label").map((p) => p.textContent))
            .toEqual(["Order 1 of 2 · seller 0x2222…2222", "Order 2 of 2 · seller 0x5555…5555"]);
        fireEvent.click(screen.getAllByTestId("capability-execute-reassert-committed-sections")[1]);
        expect(screen.getByTestId("capability-chooser-reassert-committed-sections"))
            .toHaveTextContent("Order 2 of 2 · seller 0x5555…5555");
    });

    it("renders no order line for a card without one", () => {
        const c = card([choice("never-seen-a", "Section A")]);
        render(<CapabilityRail capabilities={[c]} executableCapabilityIds={new Set([c.id])} onExecute={() => {}} />);
        expect(screen.queryByTestId("capability-order-label")).not.toBeInTheDocument();
    });

    it("closes when the card is no longer derived", () => {
        const c = card([choice("never-seen-a", "Section A")]);
        const { rerender } = render(<CapabilityRail capabilities={[c]} executableCapabilityIds={new Set([c.id])} onExecute={() => {}} />);
        fireEvent.click(screen.getByTestId("capability-execute-reassert-committed-sections"));
        expect(screen.getByTestId("capability-chooser-reassert-committed-sections")).toBeInTheDocument();
        rerender(<CapabilityRail capabilities={[]} executableCapabilityIds={new Set()} onExecute={() => {}} />);
        expect(screen.queryByTestId("capability-chooser-reassert-committed-sections")).not.toBeInTheDocument();
    });
});
