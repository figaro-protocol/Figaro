// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Breadcrumb } from "@/components/shared/Breadcrumb";

afterEach(() => {
    cleanup();
});

describe("Breadcrumb", () => {
    it("renders every non-current crumb as a link to its href, in order (well-formed input)", () => {
        render(
            <Breadcrumb
                items={[
                    { label: "Specifications", href: "/spec" },
                    { label: "Designer", href: "/assemblies/designer" },
                    { label: "New assembly" },
                ]}
            />,
        );
        expect(screen.getByRole("link", { name: "Builders" })).toHaveAttribute("href", "/builders");
        expect(screen.getByRole("link", { name: "Designer" })).toHaveAttribute("href", "/assemblies/designer");
    });

    it("renders the crumb with no href as plain current-page text, not a link (well-formed input)", () => {
        render(
            <Breadcrumb
                items={[
                    { label: "Specifications", href: "/spec" },
                    { label: "Sharp edges" },
                ]}
            />,
        );
        expect(screen.queryByRole("link", { name: "Sharp edges" })).not.toBeInTheDocument();
        const current = screen.getByText("Sharp edges");
        expect(current).toHaveAttribute("aria-current", "page");
    });

    it("separates crumbs with exactly one separator per gap (N items ⇒ N-1 separators)", () => {
        const { container } = render(
            <Breadcrumb
                items={[
                    { label: "Papers", href: "/papers" },
                    { label: "Behavioral game theory", href: "/papers#discipline-8" },
                    { label: "A paper title" },
                ]}
            />,
        );
        expect(container.querySelectorAll('[aria-hidden]').length).toBe(2);
    });

    it("renders nothing for an empty trail (malformed / degenerate input)", () => {
        const { container } = render(<Breadcrumb items={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it("renders a single current-only crumb with no separator (optional-field handling — one-item trail)", () => {
        const { container } = render(<Breadcrumb items={[{ label: "Solo" }]} />);
        expect(screen.getByText("Solo")).toHaveAttribute("aria-current", "page");
        expect(container.querySelectorAll('[aria-hidden]').length).toBe(0);
    });

    it("accepts an extra className without dropping the base classes (optional-field handling)", () => {
        render(<Breadcrumb items={[{ label: "Solo" }]} className="mb-8" />);
        const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(nav.className).toContain("mb-8");
        expect(nav.className).toContain("text-ink-faint");
    });
});
