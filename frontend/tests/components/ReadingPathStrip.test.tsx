// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReadingPathStrip } from "@/components/marketing/ReadingPathStrip";
import { ARGUMENT_TRACK_STEPS, READING_PATH_STEPS } from "@/components/marketing/readingPathSteps";

const usePathnameMock = vi.fn(() => "/");

vi.mock("next/navigation", () => ({
    usePathname: () => usePathnameMock(),
}));

afterEach(() => {
    cleanup();
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/");
});

describe("ReadingPathStrip", () => {
    it("renders all four steps as links, in order (well-formed input)", () => {
        usePathnameMock.mockReturnValue("/protocol");
        render(<ReadingPathStrip />);
        for (const step of READING_PATH_STEPS) {
            expect(screen.getByRole("link", { name: step.label })).toHaveAttribute("href", step.href);
        }
        expect(READING_PATH_STEPS).toHaveLength(4);
    });

    it("highlights the current step and names the next one when the pathname matches a step", () => {
        usePathnameMock.mockReturnValue("/local-commerce");
        render(<ReadingPathStrip />);
        const current = screen.getByRole("link", { name: "Local commerce" });
        expect(current).toHaveAttribute("aria-current", "page");
        const position = screen.getByTestId("reading-path-strip-position").textContent!;
        expect(position).toContain("step 2 of 4");
        expect(position).toContain("next: Security");
    });

    it("keeps the numbered path all-concrete: /why is NOT a numbered step (spine ruling, final 2026-08-04)", () => {
        expect(READING_PATH_STEPS.some((s) => s.href === "/why")).toBe(false);
        expect(ARGUMENT_TRACK_STEPS[0]?.href).toBe("/why");
    });

    it("names no next step after the last one (optional-field handling — no 'next' when there is none)", () => {
        usePathnameMock.mockReturnValue("/users");
        render(<ReadingPathStrip />);
        expect(screen.getByTestId("reading-path-strip-position").textContent).toContain("step 4 of 4");
        expect(screen.getByTestId("reading-path-strip-position").textContent).not.toContain("next:");
    });

    it("renders with no step highlighted on a page outside the four-step path (malformed / non-member input)", () => {
        usePathnameMock.mockReturnValue("/data");
        render(<ReadingPathStrip />);
        expect(screen.getByTestId("reading-path-strip-position").textContent).not.toContain("step");
        for (const step of READING_PATH_STEPS) {
            expect(screen.getByRole("link", { name: step.label })).not.toHaveAttribute("aria-current");
        }
    });

    it("renders the go-deeper links to the three reference surfaces", () => {
        usePathnameMock.mockReturnValue("/protocol");
        render(<ReadingPathStrip />);
        for (const href of ["/data", "/clauses", "/assemblies"]) {
            expect(
                screen.getAllByRole("link").some((el) => el.getAttribute("href") === href),
            ).toBe(true);
        }
    });

    it("renders the argument track (Why, Physics, Consequences) with no step-position claim (optional-field handling)", () => {
        usePathnameMock.mockReturnValue("/protocol");
        render(<ReadingPathStrip />);
        const track = screen.getByTestId("reading-path-strip-argument-track");
        expect(track.textContent).toContain("The argument:");
        for (const step of ARGUMENT_TRACK_STEPS) {
            expect(screen.getByRole("link", { name: step.label })).toHaveAttribute("href", step.href);
        }
        expect(ARGUMENT_TRACK_STEPS).toHaveLength(3);
        expect(track.textContent).not.toContain("step");
    });

    it("highlights the current step within the argument track when the pathname matches (well-formed input)", () => {
        usePathnameMock.mockReturnValue("/why");
        render(<ReadingPathStrip />);
        expect(screen.getByRole("link", { name: "Why" })).toHaveAttribute("aria-current", "page");
    });
});
