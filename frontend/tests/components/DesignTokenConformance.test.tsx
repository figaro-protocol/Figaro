/**
 * DesignTokenConformance.test.tsx — the page-type references named in
 * docs/DESIGN_TOKENS.md §9 compose from the spec's tokens, so a page copied
 * from them inherits no drift:
 *
 * - every class is a token or a Tailwind default (§8: no arbitrary values,
 *   no utility that names a token the config does not declare);
 * - text on the page ground clears WCAG 1.4.3 (§1: `ink.faint` is decorative);
 * - a page H1 is §2's `text-heading-h1`;
 * - a link styled as a control clears WCAG 2.5.5 through §7's `<Button>`
 *   shape (`min-h-11`, `rounded-tile`).
 *
 * And the tree-wide rules the references stand on:
 *
 * - `ink.muted` clears WCAG 1.4.3 as text on every ground prose sits on (§1);
 * - a field's focus indicator is the `focus` token, never the CTA-only
 *   accent (§1 Focus, §1 Accent);
 * - the base side-padding rule pads the page container only, so a
 *   `mx-auto` used for centering carries no padding (§3).
 */
import React from "react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { colorTokens } from "@/lib/shared/designTokenValues";

const accountMock = vi.fn(() => ({ address: undefined as string | undefined }));
vi.mock("wagmi", () => ({ useAccount: () => accountMock() }));

const workspaceMock = vi.fn();
vi.mock("@/hooks/useSemanticProcessWorkspace", () => ({ useSemanticProcessWorkspace: () => workspaceMock() }));
vi.mock("@/hooks/useProcessResolveCapacity", () => ({ default: () => null }));
vi.mock("@/lib/member/useMemberListings", () => ({ useMemberListings: () => ({ listings: [] }) }));
vi.mock("@/lib/shared/clauseSpecSource", () => ({
    describeAttestation: () => ({ clauseTitle: "A clause", eventLabel: "an event", eventCode: "event" }),
}));
vi.mock("@/components/runtime/ResolutionProceedsPanel", () => ({ ResolutionProceedsPanel: () => null }));
vi.mock("@/components/runtime/PayoutRoutingPanel", () => ({ PayoutRoutingPanel: () => null }));
vi.mock("@/components/runtime/CapabilityRail", () => ({ CapabilityRail: () => null }));
vi.mock("@/components/runtime/OrderInteractionSurfaces", () => ({ OrderInteractionSurfaces: () => null }));
vi.mock("@/app/(app)/discover/_components/MemberDiscovery", () => ({ MemberDiscovery: () => null }));

import { CtaLink } from "@/components/marketing/CtaLink";
import { BackToTop } from "@/components/papers/BackToTop";
import { PaperLayout } from "@/components/papers/PaperLayout";
import DiscoverPage from "@/app/(app)/discover/page";
import { OrderTimelineView } from "@/app/(app)/orders/_components/OrderTimelineView";

/** Utilities that name no token in tailwind.config.ts / designTokenValues.ts. */
const UNDECLARED = /(^|\s)[\w:-]*-paper-\d+(\s|$)/;
const ARBITRARY = /\[[^\]]*\]/;

function classesOf(el: Element): string {
    return el.getAttribute("class") ?? "";
}

describe("CtaLink — §8, no arbitrary value", () => {
    it("sizes with the default scale, never an arbitrary width", () => {
        render(<CtaLink href="/terms">Build</CtaLink>);
        const link = screen.getByRole("link", { name: /Build/ });
        expect(classesOf(link)).not.toMatch(ARBITRARY);
        expect(classesOf(link)).toContain("min-w-48");
    });
});

describe("BackToTop — §1 hover fill, §5 shadow", () => {
    it("hovers to a declared surface token and carries the declared shadow", () => {
        render(<BackToTop />);
        Object.defineProperty(window, "scrollY", { value: 900, configurable: true });
        act(() => {
            fireEvent.scroll(window);
        });
        const button = screen.getByRole("button", { name: "Back to top" });
        const cls = classesOf(button);
        expect(cls).not.toMatch(UNDECLARED);
        expect(cls).toContain("hover:bg-subtle-hover");
        expect(cls).toContain("shadow-section");
        expect(cls).not.toMatch(/(^|\s)shadow-sm(\s|$)/);
        Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    });

    it("is a 44×44px target (WCAG 2.5.5) on an opaque surface token", () => {
        render(<BackToTop />);
        Object.defineProperty(window, "scrollY", { value: 900, configurable: true });
        act(() => {
            fireEvent.scroll(window);
        });
        const cls = classesOf(screen.getByRole("button", { name: "Back to top" }));
        expect(cls).toContain("min-h-11");
        expect(cls).toContain("min-w-11");
        expect(cls).toContain("bg-paper");
        // An alpha fill or a backdrop blur composites over the scrolling page.
        expect(cls).not.toMatch(/(^|\s)bg-[\w-]+\/\d+(\s|$)/);
        expect(cls).not.toMatch(/backdrop-blur/);
        Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    });
});

/** WCAG 2.x relative luminance of a `#rrggbb` hex. */
function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two `#rrggbb` hexes. */
function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

describe("ink.muted and ink.heading — §1, WCAG 1.4.3 text contrast", () => {
    const cases = (["muted", "heading"] as const).flatMap((ink) =>
        (["canvas", "paper", "subtle"] as const).map((ground) => [ink, ground] as const),
    );
    it.each(cases)("ink.%s clears 4.5:1 on %s", (ink, ground) => {
        expect(contrast(colorTokens.ink[ink], colorTokens[ground])).toBeGreaterThanOrEqual(4.5);
    });
});

/** Every .ts/.tsx source file under the given frontend directories. */
function sourceFiles(...dirs: string[]): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const full = path.join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (/\.tsx?$/.test(name)) out.push(full);
        }
    };
    for (const d of dirs) walk(path.resolve(process.cwd(), d));
    return out;
}

describe("Field focus — §1 Focus, §1 Accent", () => {
    it("no input in app/ or components/ takes its focus ring from the CTA-only accent", () => {
        const offenders = sourceFiles("app", "components").filter((f) =>
            readFileSync(f, "utf8").includes("focus:ring-accent"),
        );
        expect(offenders).toEqual([]);
    });

    it("every focus ring in app/ or components/ is `focus-visible:`, never `focus:`", () => {
        const offenders = sourceFiles("app", "components").flatMap((f) =>
            readFileSync(f, "utf8")
                .split("\n")
                .flatMap((line, i) => (/(^|[\s"'`:])focus:ring-/.test(line) ? [`${path.relative(process.cwd(), f)}:${i + 1}`] : [])),
        );
        expect(offenders).toEqual([]);
    });
});

describe("globals.css — §3 container side-padding", () => {
    const css = readFileSync(path.resolve(process.cwd(), "app/globals.css"), "utf8");
    /** Every selector list in the stylesheet, split into its selectors. */
    const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)].flatMap((m) =>
        m[1].split(",").map((s) => s.trim()),
    );

    it("no rule selects `.mx-auto`, so a centered element gets no padding", () => {
        expect(selectors).not.toContain(".mx-auto");
    });

    it("the page container keeps its side padding", () => {
        expect(css).toMatch(/\.container\s*\{\s*@apply px-6 sm:px-10;/);
    });
});

describe("PaperLayout — §1 text contrast, §3 measure", () => {
    function renderPaper() {
        return render(
            <PaperLayout
                slug="figaro-as-a-cryptoeconomic-system"
                title="A title"
                author="Figaro"
                date="The date line"
                abstract={<p>An abstract.</p>}
                references={<li>A reference.</li>}
            >
                <p>A body.</p>
            </PaperLayout>,
        );
    }

    it("sets the date, the Abstract label and the keywords in an ink that clears 4.5:1", () => {
        renderPaper();
        const date = screen.getByText("The date line");
        const label = screen.getByRole("heading", { name: "Abstract" });
        const keywords = screen.getByText("Keywords:").parentElement!;
        for (const el of [date, label, keywords]) {
            expect(classesOf(el)).not.toContain("text-ink-faint");
            expect(classesOf(el)).toContain("text-ink-body");
        }
    });

    it("takes the paper column from the named measure token, never an arbitrary width", () => {
        const { container } = renderPaper();
        const article = container.querySelector("article")!;
        expect(classesOf(article)).not.toMatch(ARBITRARY);
        expect(classesOf(article)).toContain("max-w-paper");
    });
});

describe("/discover — §2 page H1", () => {
    it("renders its H1 on the type scale", () => {
        render(<DiscoverPage />);
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(classesOf(h1)).toContain("text-heading-h1");
        expect(classesOf(h1)).not.toMatch(/text-[45]xl|font-bold/);
    });
});

describe("/orders/view — §2 H1, §4 radius, §7 target size", () => {
    const BUYER = "0x00000000000000000000000000000000000000b1";
    const SELLER = "0x00000000000000000000000000000000000000c1";
    const PROCESS = `0x${"ab".repeat(32)}`;

    function workspace(state: "Active" | "Resolved", withModel = true) {
        return {
            processModel: withModel
                ? {
                      rootOrderId: "o1",
                      rootModality: null,
                      orders: [{ orderId: "o1", buyer: BUYER, seller: SELLER, state, agreementHash: `0x${"cd".repeat(32)}` }],
                  }
                : null,
            runtimeCapabilities: [],
            executableCapabilityIds: new Set(),
            executingCapabilityId: null,
            executeCapability: vi.fn(),
            actionError: null,
            processAttestations: [{ clauseId: "k", orderHash: "o1", stage: 0, blockNumber: 7 }],
        };
    }

    it("the loading H1 is on the type scale", () => {
        workspaceMock.mockReturnValue(workspace("Active", false));
        render(<OrderTimelineView processId={PROCESS} />);
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(classesOf(h1)).toContain("text-heading-h1");
        expect(classesOf(h1)).not.toMatch(/text-3xl|font-bold/);
    });

    it("the H1, timeline rows and secondary links take the spec's tokens", () => {
        workspaceMock.mockReturnValue(workspace("Resolved"));
        render(<OrderTimelineView processId={PROCESS} />);

        const h1 = screen.getByRole("heading", { level: 1 });
        expect(classesOf(h1)).toContain("text-heading-h1");
        expect(classesOf(h1)).not.toMatch(/text-3xl|font-bold/);

        const rows = screen.getByTestId("order-timeline").querySelectorAll("li");
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((row) => {
            expect(classesOf(row)).toContain("rounded-tile");
            expect(classesOf(row)).not.toMatch(/(^|\s)rounded(\s|$)/);
        });

        for (const id of ["link-audit", "link-your-data"]) {
            const cls = classesOf(screen.getByTestId(id));
            expect(cls).toContain("min-h-11");
            expect(cls).toContain("rounded-tile");
            expect(cls).not.toMatch(/(^|\s)rounded(\s|$)/);
        }
    });
});
