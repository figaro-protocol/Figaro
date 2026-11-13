/**
 * The audit page states what the evidence file does not contain.
 *
 * Proves: a missing part renders with its part, order and reason; an empty
 * list renders nothing.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MissingParts } from "@/app/(app)/audit/_components/MissingParts";

describe("MissingParts", () => {
    it("renders one missing part with its order and reason", () => {
        render(<MissingParts missing={[{ part: "Spec of clause 0xabc", orderHash: "0x0a", reason: "the spec was not loaded" }]} />);
        const block = screen.getByTestId("audit-missing-parts");
        expect(block.textContent).toContain("What this evidence file does not contain");
        expect(block.textContent).toContain("Spec of clause 0xabc");
        expect(block.textContent).toContain("0x0a");
        expect(block.textContent).toContain("the spec was not loaded");
    });

    it("renders nothing for an empty list", () => {
        const { container } = render(<MissingParts missing={[]} />);
        expect(container.innerHTML).toBe("");
    });
});
