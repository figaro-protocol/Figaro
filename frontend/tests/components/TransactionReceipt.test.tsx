/**
 * TransactionReceipt — the shared receipt-panel primitive (operator ruling
 * 2026-08-07) that replaces the hand-rolled `<dl>` markup previously
 * duplicated across RegisterClauseForm, ViewAssemblyClient, OnboardingReview,
 * and MemberLanding's inline leave receipt. Read-only: it renders a result
 * already produced by a completed transaction and never initiates one.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionReceipt } from "@/components/shared/TransactionReceipt";

describe("TransactionReceipt", () => {
    it("renders heading, prose, and list-layout rows with the testid preserved", () => {
        render(
            <TransactionReceipt
                testId="clause-register-receipt"
                heading="Registered."
                headingClassName="text-base font-semibold"
                prose={<>Anchored on <code data-testid="receipt-clause-id">figaro-widget</code>.</>}
                rows={[
                    { label: "Clause key (idHash)", value: "0xabc" },
                    { label: "Transaction", value: "0xdef" },
                ]}
                actions={<button type="button" data-testid="clause-register-again">Register another</button>}
            />,
        );

        const root = screen.getByTestId("clause-register-receipt");
        expect(root).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Registered." })).toBeInTheDocument();
        expect(screen.getByTestId("receipt-clause-id")).toHaveTextContent("figaro-widget");
        // Rows render as a definition list: one <dt>/<dd> pair per row.
        expect(screen.getByText("Clause key (idHash)").tagName).toBe("DT");
        expect(screen.getByText("0xabc").tagName).toBe("DD");
        expect(screen.getByText("Transaction").tagName).toBe("DT");
        expect(screen.getByText("0xdef").tagName).toBe("DD");
        expect(screen.getByTestId("clause-register-again")).toHaveTextContent("Register another");
    });

    it("renders as an <li> with inline rows when embedded in an existing list — malformed/absent optional fields degrade gracefully", () => {
        // No heading, no testId, no actions — every field beyond `prose` and
        // `rows` is optional; the primitive must not throw or render stray
        // chrome (headings, dl borders) for fields that were never supplied.
        render(
            <ul>
                <TransactionReceipt
                    as="li"
                    className="leave-receipt"
                    prose="You have left the registry."
                    rows={[{ label: "Tx:", value: "0x123" }]}
                    rowsLayout="inline"
                />
            </ul>,
        );

        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
        const row = screen.getByText(/Tx:\s+0x123/);
        expect(row.tagName).toBe("P");
        // Inline layout renders no <dl> chrome at all.
        expect(document.querySelector("dl")).not.toBeInTheDocument();
        expect(document.querySelector("li.leave-receipt")).toBeInTheDocument();
    });

    it("omits rows and actions entirely when neither is supplied", () => {
        render(<TransactionReceipt testId="bare-receipt" prose="Just prose." />);
        const root = screen.getByTestId("bare-receipt");
        expect(root).toHaveTextContent("Just prose.");
        expect(document.querySelector("dl")).not.toBeInTheDocument();
    });
});
