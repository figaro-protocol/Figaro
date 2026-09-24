// @vitest-environment jsdom
// @ts-nocheck
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { MobileNav } from "@/components/shared/MobileNav";
import {
    MARKETING_MAP,
    NAV_LINKS_APP_DRAWER,
    NAV_LINKS_APP_PRIMARY,
    NAV_LINKS_MARKETING_DRAWER,
} from "@/components/shared/navLinks";

// Mock next/navigation. `pathnameMock` is reassigned per test: the drawer's
// second level (which groups show, which is pre-expanded) derives from the route.
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

    // The six doors, every one on every page, as an accordion: the door holding
    // the route open and marked current, every other collapsed.
    it("lists the six doors as an accordion and marks the reader's own", () => {
        pathnameMock = "/clauses/";
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        for (const group of MARKETING_MAP) {
            const trigger = sectionButton(group.section);
            if (group.section === "Terms") {
                expect(trigger).toHaveAttribute("aria-expanded", "true");
                expect(trigger).toHaveAttribute("aria-current", "true");
            } else {
                expect(trigger).toHaveAttribute("aria-expanded", "false");
                expect(trigger).not.toHaveAttribute("aria-current");
            }
        }
    });

    // The home page is in no door: the drawer there is the six doors, all shut.
    it("on the home page the drawer holds the six doors, all collapsed", () => {
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        // The marketing drawer's groups: the six doors plus the App group the
        // drawer derives from the primary row.
        const groupCount = NAV_LINKS_MARKETING_DRAWER.filter((l) => l.isSectionHeader).length;
        const drawer = within(screen.getByRole("dialog", { name: "Mobile navigation" }));
        expect(drawer.getAllByRole("button", { expanded: false })).toHaveLength(groupCount);
        expect(drawer.queryAllByRole("button", { expanded: true })).toHaveLength(0);
    });

    // A collapsed door renders no page link until it is expanded.
    it("opens with every door collapsed except the one holding the route", () => {
        pathnameMock = "/clauses/";
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        for (const group of MARKETING_MAP) {
            if (group.section === "Terms") {
                expect(sectionButton("Terms")).toHaveAttribute("aria-expanded", "true");
                continue;
            }
            expect(sectionButton(group.section)).toHaveAttribute("aria-expanded", "false");
            for (const link of group.links) {
                expect(screen.queryByRole("link", { name: link.label })).toBeNull();
            }
        }
    });

    // Disclosure semantics: the trigger controls a panel that is labelled by
    // the trigger, so the group name announces with its own page list.
    it("wires aria-controls to the panel the group trigger opens", () => {
        pathnameMock = "/kernel/";
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        // Your evidence does not hold this route, so it opens closed.
        const trigger = sectionButton("Evidence");
        const panelId = trigger.getAttribute("aria-controls");
        expect(panelId).toBeTruthy();
        expect(document.getElementById(panelId)).toBeNull();

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        const panel = document.getElementById(panelId);
        expect(panel).not.toBeNull();
        expect(panel).toHaveAttribute("aria-labelledby", trigger.id);
        expect(within(panel).getByRole("link", { name: "Audit" })).toBeInTheDocument();

        // Collapsing puts the panel away again; focus never leaves the trigger.
        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(document.getElementById(panelId)).toBeNull();
    });

    // One group open at a time — the closed height is what makes the drawer
    // fit a small phone.
    it("opening a second group closes the first", () => {
        pathnameMock = "/kernel/";
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        expect(sectionButton("Code")).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(sectionButton("Evidence"));

        expect(sectionButton("Code")).toHaveAttribute("aria-expanded", "false");
        expect(sectionButton("Evidence")).toHaveAttribute("aria-expanded", "true");
    });

    // The reader lands where they already are: the group holding the route
    // is open on arrival, and carries aria-current="true" (the doorway rule).
    it("pre-expands the group holding the current route", () => {
        pathnameMock = "/invariants/";
        render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
        openDrawer();

        const code = sectionButton("Code");
        expect(code).toHaveAttribute("aria-expanded", "true");
        expect(code).toHaveAttribute("aria-current", "true");
        expect(screen.getByRole("link", { name: "Invariants" })).toHaveAttribute("aria-current", "page");
        // Every other group stays shut.
        expect(sectionButton("Evidence")).toHaveAttribute("aria-expanded", "false");
    });

    // Wayfinding is comprehension: on mobile the drawer is the only way in, so
    // every page on the marketing map must be reachable from it.
    it("the marketing drawer exposes every page on the marketing map", () => {
        for (const group of MARKETING_MAP) {
            pathnameMock = "/";
            render(<MobileNav links={NAV_LINKS_MARKETING_DRAWER} />);
            openDrawer();

            const trigger = sectionButton(group.section);
            fireEvent.click(trigger);
            const panel = document.getElementById(trigger.getAttribute("aria-controls"));
            for (const link of group.links) {
                expect(within(panel).getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
            }
            cleanup();
        }
    });

    // The drawer's App section is the primary row restated for mobile. It SPREADS
    // NAV_LINKS_APP_PRIMARY; this fails if anyone hand-copies it again and the two
    // surfaces drift (which is how /discover went missing from one of them).
    it("the app drawer carries every primary-row surface", () => {
        pathnameMock = "/orders/";
        render(<MobileNav links={NAV_LINKS_APP_DRAWER} />);
        openDrawer();

        // /orders is in the App group, so the group is already open on arrival.
        expect(sectionButton("App")).toHaveAttribute("aria-expanded", "true");
        for (const link of NAV_LINKS_APP_PRIMARY) {
            expect(screen.getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
        }
    });
});
