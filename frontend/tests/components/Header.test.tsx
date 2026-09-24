import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Header } from "@/components/shared/Header";
import { MARKETING_MAP } from "@/components/shared/navLinks";

// The header marks the door holding the route: /orders is under Join.
vi.mock("next/navigation", () => ({
    usePathname: () => "/orders/",
}));

// Mock YourTurnBadge to test conditional rendering
vi.mock("@/components/shared/YourTurnBadge", () => ({
    YourTurnBadge: () => React.createElement("div", { "data-testid": "your-turn-badge" }),
}));

// Mock useWalletConnected
const useWalletConnectedMock = vi.fn();
vi.mock("@/hooks/useWalletConnected", () => ({
    useWalletConnected: () => useWalletConnectedMock(),
}));

describe("Header", () => {
    beforeEach(() => {
        useWalletConnectedMock.mockReset();
    });

    it("renders the logo and one inert disclosure button per door, the reader's own marked current", () => {
        useWalletConnectedMock.mockReturnValue(false);
        render(<Header />);
        expect(screen.getByText("Figaro Protocol")).toBeInTheDocument();
        const nav = screen.getByTestId("desktop-nav");
        for (const group of MARKETING_MAP) {
            const button = within(nav).getByRole("button", { name: group.section });
            expect(button).toHaveAttribute("aria-expanded", "false");
            if (group.section === "Join") expect(button).toHaveAttribute("aria-current", "true");
            else expect(button).not.toHaveAttribute("aria-current");
        }
    });

    it("shows the your-turn badge only when wallet is connected", () => {
        useWalletConnectedMock.mockReturnValue(true);
        render(<Header />);
        expect(screen.getByTestId("your-turn-badge")).toBeInTheDocument();
    });

    it("does not show the your-turn badge when wallet is not connected", () => {
        useWalletConnectedMock.mockReturnValue(false);
        render(<Header />);
        expect(screen.queryByTestId("your-turn-badge")).not.toBeInTheDocument();
    });

    it("logo is a link", () => {
        useWalletConnectedMock.mockReturnValue(false);
        render(<Header />);
        const logo = screen.getByText("Figaro Protocol");
        expect(logo.closest("a")).toBeTruthy();
    });
});
