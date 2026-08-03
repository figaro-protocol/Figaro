// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReadingPathStrip } from "@/components/marketing/ReadingPathStrip";
import { READING_PATH_STEPS } from "@/components/marketing/readingPathSteps";

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
    it("renders all five steps as links, in order (well-formed input)", () => {
        usePathnameMock.mockReturnValue("/protocol");
        render(<ReadingPathStrip />);
        for (const step of READING_PATH_STEPS) {
            expect(screen.getByRole("link", { name: step.label })).toHaveAttribute("href", step.href);
        }
    });

    it("highlights the current step and names the next one when the pathname matches a step", () => {
        usePathnameMock.mockReturnValue("/why");
        render(<ReadingPathStrip />);
        const current = screen.getByRole("link", { name: "Why" });
        expect(current).toHaveAttribute("aria-current", "page");
        const position = screen.getByTestId("reading-path-strip-position").textContent!;
        expect(position).toContain("step 2 of 5");
        expect(position).toContain("next: Local commerce");
    });

    it("names no next step after the last one (optional-field handling — no 'next' when there is none)", () => {
        usePathnameMock.mockReturnValue("/users");
        render(<ReadingPathStrip />);
        expect(screen.getByTestId("reading-path-strip-position").textContent).toContain("step 5 of 5");
        expect(screen.getByTestId("reading-path-strip-position").textContent).not.toContain("next:");
    });

    it("renders with no step highlighted on a page outside the five-step path (malformed / non-member input)", () => {
        usePathnameMock.mockReturnValue("/physics");
        render(<ReadingPathStrip />);
        expect(screen.getByTestId("reading-path-strip-position").textContent).not.toContain("step");
        for (const step of READING_PATH_STEPS) {
            expect(screen.getByRole("link", { name: step.label })).not.toHaveAttribute("aria-current");
        }
    });

    it("renders the go-deeper links to the five reference surfaces", () => {
        usePathnameMock.mockReturnValue("/protocol");
        render(<ReadingPathStrip />);
        for (const href of ["/physics", "/consequences", "/data", "/clauses", "/assemblies"]) {
            expect(
                screen.getAllByRole("link").some((el) => el.getAttribute("href") === href),
            ).toBe(true);
        }
    });
});
