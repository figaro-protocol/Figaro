import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadingPathNext } from "@/components/marketing/ReadingPathNext";
import {
    READING_PATH_RUNGS,
    READING_PATH_STEPS,
    nextReadingPathStep,
} from "@/components/marketing/readingPathSteps";

const pathnameMock = vi.fn<() => string | null>();
vi.mock("next/navigation", () => ({
    usePathname: () => pathnameMock(),
}));

describe("nextReadingPathStep", () => {
    it("returns the following step for every step but the last", () => {
        for (let i = 0; i < READING_PATH_STEPS.length - 1; i++) {
            expect(nextReadingPathStep(READING_PATH_STEPS[i].href)).toBe(
                READING_PATH_STEPS[i + 1],
            );
        }
    });

    it("returns null on the last step — a reading order ends", () => {
        const last = READING_PATH_STEPS[READING_PATH_STEPS.length - 1];
        expect(last.href).toBe("/working-groups");
        expect(nextReadingPathStep(last.href)).toBeNull();
    });

    it("tolerates the exported trailing slash", () => {
        expect(nextReadingPathStep("/kernel/")).toBe(nextReadingPathStep("/kernel"));
        expect(nextReadingPathStep("/working-groups/")).toBeNull();
    });

    it("returns null off the path — home, lookup pages, papers", () => {
        // /registries is deliberately off-path (an explorer reached from the
        // live counts, not a lesson); /spec joined the path 2026-08-24 and is
        // therefore NOT listed here.
        for (const off of ["/", "/registries", "/papers/after-tradelens"]) {
            expect(nextReadingPathStep(off)).toBeNull();
        }
    });

    it("returns null for a missing pathname", () => {
        expect(nextReadingPathStep(null)).toBeNull();
        expect(nextReadingPathStep("")).toBeNull();
    });
});

describe("ReadingPathNext", () => {
    beforeEach(() => {
        pathnameMock.mockReset();
    });

    it("renders one line with exactly one link, labelled with the next step", () => {
        pathnameMock.mockReturnValue("/kernel");
        const { container } = render(<ReadingPathNext />);

        const nav = screen.getByRole("navigation", { name: "Reading path" });
        const links = nav.querySelectorAll("a");
        expect(links).toHaveLength(1);
        expect(links[0]).toHaveAttribute("href", "/invariants");
        expect(links[0].textContent).toBe("Invariants");
        expect(container.textContent).toBe("Next in the reading path: Invariants");
    });

    it("carries no blurb, no number and no rung name — the five ruled properties", () => {
        for (const step of READING_PATH_STEPS) {
            pathnameMock.mockReturnValue(step.href);
            const { container, unmount } = render(<ReadingPathNext />);
            const text = container.textContent ?? "";
            expect(text).not.toMatch(/\d/);
            for (const rung of READING_PATH_RUNGS) expect(text).not.toContain(rung);
            for (const other of READING_PATH_STEPS) {
                expect(text).not.toContain(other.description);
            }
            unmount();
        }
    });

    it("renders nothing on the last step", () => {
        pathnameMock.mockReturnValue("/working-groups");
        const { container } = render(<ReadingPathNext />);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing off the path — home, a lookup page, a paper", () => {
        for (const off of ["/", "/registries", "/papers/after-tradelens"]) {
            pathnameMock.mockReturnValue(off);
            const { container, unmount } = render(<ReadingPathNext />);
            expect(container).toBeEmptyDOMElement();
            unmount();
        }
    });

    it("renders nothing when the pathname is unavailable", () => {
        pathnameMock.mockReturnValue(null);
        const { container } = render(<ReadingPathNext />);
        expect(container).toBeEmptyDOMElement();
    });
});
