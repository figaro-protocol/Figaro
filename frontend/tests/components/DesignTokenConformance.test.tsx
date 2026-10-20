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
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

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
