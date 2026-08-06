// @vitest-environment jsdom
// @ts-nocheck
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileNav } from "@/components/shared/MobileNav";
import {
    MARKETING_MAP,
    NAV_LINKS_APP_DRAWER,
    NAV_LINKS_APP_PRIMARY,
    NAV_LINKS_MARKETING_DRAWER,
} from "@/components/shared/navLinks";

// Mock next/navigation
vi.mock("next/navigation", () => ({
    usePathname: () => "/",
}));

describe("MobileNav", () => {
    const links = [
        { label: "Home", href: "/" },
        { label: "Kernel", href: "/kernel" },
    ];

    it("applies active class to current route", () => {
        render(<MobileNav links={links} />);
        fireEvent.click(screen.getByLabelText(/toggle mobile menu/i));
        const activeLink = screen.getByRole("link", { name: links[0].label });
        expect(activeLink).toHaveAttribute("aria-current", "page");
    });

    // Wayfinding is comprehension: on mobile the marketing drawer is the only way
    // in, so every page on the marketing map must be reachable from it — not just
    // the three doorways, which left the rest footer-only.
    it("the marketing drawer exposes every page on the marketing map", () => {
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        fireEvent.click(screen.getByLabelText(/toggle mobile menu/i));

        for (const group of MARKETING_MAP) {
            // The section header is a non-link element. Filter on that: a section
            // and its doorway link share a name ("Builders" heads the group AND
            // labels /builders), so an unscoped text query matches both.
            const header = screen.getAllByText(group.section).filter((el) => el.tagName !== "A");
            expect(header.length).toBeGreaterThan(0);

            for (const link of group.links) {
                expect(screen.getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
            }
        }
    });

    // The drawer's App section is the primary row restated for mobile. It SPREADS
    // NAV_LINKS_APP_PRIMARY; this fails if anyone hand-copies it again and the two
    // surfaces drift (which is how /discover went missing from one of them).
    it("the app drawer carries every primary-row surface", () => {
        render(<MobileNav links={NAV_LINKS_APP_DRAWER} />);
        fireEvent.click(screen.getByLabelText(/toggle mobile menu/i));

        for (const link of NAV_LINKS_APP_PRIMARY) {
            expect(screen.getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
        }
    });
});
