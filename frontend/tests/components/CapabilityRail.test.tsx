import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
