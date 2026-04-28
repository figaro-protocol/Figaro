import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "@/components/shared/Header";
import { NAV_LINKS } from "@/components/shared/navLinks";

// Mock NotificationBell to test conditional rendering
vi.mock("@/components/shared/NotificationBell", () => ({
    NotificationBell: () => React.createElement("div", { "data-testid": "notification-bell" }),
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

    it("renders logo and all nav links", () => {
        useWalletConnectedMock.mockReturnValue(false);
        render(<Header />);
        expect(screen.getByText("Figaro Protocol")).toBeInTheDocument();
        for (const link of NAV_LINKS) {
            expect(screen.getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
        }
    });

    it("shows notification bell only when wallet is connected", () => {
        useWalletConnectedMock.mockReturnValue(true);
        render(<Header />);
        expect(screen.getByTestId("notification-bell")).toBeInTheDocument();
    });

    it("does not show notification bell when wallet is not connected", () => {
        useWalletConnectedMock.mockReturnValue(false);
        render(<Header />);
        expect(screen.queryByTestId("notification-bell")).not.toBeInTheDocument();
    });

    it("logo is a link", () => {
        useWalletConnectedMock.mockReturnValue(false);
        render(<Header />);
        const logo = screen.getByText("Figaro Protocol");
        expect(logo.closest("a")).toBeTruthy();
    });
});
