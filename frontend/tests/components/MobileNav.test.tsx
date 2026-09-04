// @vitest-environment jsdom
// @ts-nocheck
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MobileNav } from "@/components/shared/MobileNav";
import {
    MARKETING_MAP,
    NAV_LINKS_APP_DRAWER,
    NAV_LINKS_APP_PRIMARY,
    NAV_LINKS_MARKETING_DRAWER,
} from "@/components/shared/navLinks";

// Mock next/navigation. `pathnameMock` is reassigned per test so the
// pre-expanded-section behaviour (derived from the route) is testable.
let pathnameMock = "/";
vi.mock("next/navigation", () => ({
    usePathname: () => pathnameMock,
}));

const openDrawer = () => fireEvent.click(screen.getByLabelText(/toggle mobile menu/i));
const sectionButton = (name: string) => screen.getByRole("button", { name });

describe("MobileNav", () => {
    beforeEach(() => {
        pathnameMock = "/";
    });

    it("applies active class to current route", () => {
        // A flat list (no section headers) stays flat — the accordion only
        // groups what the list itself marks as a section.
        render(<MobileNav links={[{ label: "Home", href: "/" }, { label: "Kernel", href: "/kernel" }]} />);
        openDrawer();
        expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    });

    // The flat list ran past the fold on every small viewport. Closed, the
    // drawer is one row per section: no page link is rendered until its
    // section is expanded.
    it("opens with every section collapsed and no page links rendered", () => {
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        for (const group of MARKETING_MAP) {
            expect(sectionButton(group.section)).toHaveAttribute("aria-expanded", "false");
            for (const link of group.links) {
                expect(screen.queryByRole("link", { name: link.label })).toBeNull();
            }
        }
    });

    // Disclosure semantics: the trigger controls a panel that is labelled by
    // the trigger, so the section name announces with its own page list.
    it("wires aria-controls to the panel the section trigger opens", () => {
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        const trigger = sectionButton("Build");
        const panelId = trigger.getAttribute("aria-controls");
        expect(panelId).toBeTruthy();
        expect(document.getElementById(panelId)).toBeNull();

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        const panel = document.getElementById(panelId);
        expect(panel).not.toBeNull();
        expect(panel).toHaveAttribute("aria-labelledby", trigger.id);
        expect(within(panel).getByRole("link", { name: "Clauses" })).toBeInTheDocument();

        // Collapsing puts the panel away again; focus never leaves the trigger.
        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(document.getElementById(panelId)).toBeNull();
    });

    // One section open at a time — the closed height is what makes the drawer
    // fit a small phone.
    it("opening a second section closes the first", () => {
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        fireEvent.click(sectionButton("Build"));
        fireEvent.click(sectionButton("Research"));

        expect(sectionButton("Build")).toHaveAttribute("aria-expanded", "false");
        expect(sectionButton("Research")).toHaveAttribute("aria-expanded", "true");
    });

    // The reader lands where they already are: the section holding the route
    // is open on arrival, and carries aria-current="true" (the doorway rule).
    it("pre-expands the section holding the current route", () => {
        pathnameMock = "/invariants/";
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        const deal = sectionButton("Core");
        expect(deal).toHaveAttribute("aria-expanded", "true");
        expect(deal).toHaveAttribute("aria-current", "true");
        expect(screen.getByRole("link", { name: "Invariants" })).toHaveAttribute("aria-current", "page");
        // Every other section stays shut.
        expect(sectionButton("Build")).toHaveAttribute("aria-expanded", "false");
    });

    // Wayfinding is comprehension: on mobile the marketing drawer is the only way
    // in, so every page on the marketing map must be reachable from it — not just
    // the three doorways, which left the rest footer-only.
    it("the marketing drawer exposes every page on the marketing map", () => {
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        for (const group of MARKETING_MAP) {
            const trigger = sectionButton(group.section);
            fireEvent.click(trigger);
            const panel = document.getElementById(trigger.getAttribute("aria-controls"));
            for (const link of group.links) {
                expect(within(panel).getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
            }
            fireEvent.click(trigger);
        }
    });

    // The drawer's App section is the primary row restated for mobile. It SPREADS
    // NAV_LINKS_APP_PRIMARY; this fails if anyone hand-copies it again and the two
    // surfaces drift (which is how /discover went missing from one of them).
    it("the app drawer carries every primary-row surface", () => {
        render(<MobileNav links={NAV_LINKS_APP_DRAWER} />);
        openDrawer();

        fireEvent.click(sectionButton("App"));
        for (const link of NAV_LINKS_APP_PRIMARY) {
            expect(screen.getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
        }
    });
});
