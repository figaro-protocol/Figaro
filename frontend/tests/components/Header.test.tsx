import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Header } from "@/components/shared/Header";
import { MARKETING_MAP } from "@/components/shared/navLinks";
import { SECTION_IDS, navGroupShown, sectionLabel, sectionLanding } from "@/lib/shared/sections";

// The header derives its two levels from the route: /orders is in the join section.
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

    it("renders the logo, the six door links, and one inert disclosure button per group the section shows", () => {
        useWalletConnectedMock.mockReturnValue(false);
        render(<Header />);
        expect(screen.getByText("Figaro Protocol")).toBeInTheDocument();
        const sections = screen.getByTestId("section-links");
        for (const id of SECTION_IDS) {
            expect(within(sections).getByRole("link", { name: sectionLabel(id)! })).toHaveAttribute("href", sectionLanding(id));
        }
        expect(within(sections).getByRole("link", { name: "Join" })).toHaveAttribute("aria-current", "true");
        for (const group of MARKETING_MAP) {
            const shown = navGroupShown(group.links.map((l) => l.href), "/orders/");
            const button = screen.queryByRole("button", { name: group.section });
            if (shown) expect(button).toHaveAttribute("aria-expanded", "false");
            else expect(button).toBeNull();
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
