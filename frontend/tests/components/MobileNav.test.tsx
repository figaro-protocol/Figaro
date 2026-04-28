// @vitest-environment jsdom
// @ts-nocheck
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileNav } from "@/components/shared/MobileNav";
import { NAV_LINKS } from "@/components/shared/navLinks";

// Mock next/navigation
vi.mock("next/navigation", () => ({
    usePathname: () => "/",
}));

describe("MobileNav", () => {
    const links = [
        { label: "Home", href: "/" },
        { label: "About", href: "/about" },
    ];

    it("applies active class to current route", () => {
        render(<MobileNav links={links} />);
        fireEvent.click(screen.getByLabelText(/toggle mobile menu/i));
        const activeLink = screen.getByRole("link", { name: links[0].label });
        expect(activeLink).toHaveAttribute("aria-current", "page");
    });
});
