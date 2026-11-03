/**
 * CartLineList — a line total is the token's own figure: price × quantity in
 * base units at the token's `decimals()`, formatted by `tokenFigure`. A small
 * nonzero price is never rounded to "0.0000", and with decimals unread no
 * figure is shown at all.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CartLineList } from "@/components/runtime/CartLineList";

const line = (price: string, quantity: number) => ({ catalogItemId: "i1", name: "Sample", price, quantity });

describe("CartLineList — token figures, never floats", () => {
    it("a sub-0.0001 price shows its exact figure, not 0.0000", () => {
        render(<CartLineList items={[line("0.00001", 3)]} decimals={18} tokenSymbol="TKN" showSubtotal />);
        expect(screen.getByTestId("cart-line-i1").textContent).toContain("0.00003 TKN");
        expect(screen.getByTestId("cart-subtotal").textContent).toBe("0.00003 TKN");
        expect(document.body.textContent).not.toContain("0.0000 ");
    });

    it("a figure float arithmetic gets wrong is exact (0.1 × 3)", () => {
        render(<CartLineList items={[line("0.1", 3)]} decimals={6} showSubtotal />);
        expect(screen.getByTestId("cart-subtotal").textContent).toBe("0.3");
    });

    it("decimals unread: no figure", () => {
        render(<CartLineList items={[line("5", 1)]} decimals={undefined} tokenSymbol="TKN" showSubtotal />);
        expect(screen.getByTestId("cart-line-i1").textContent).not.toMatch(/\d+\.\d|5 TKN/);
        expect(screen.getByTestId("cart-subtotal").textContent).toBe("");
    });
});
