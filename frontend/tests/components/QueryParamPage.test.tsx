/**
 * QueryParamPage — the one shell for a page whose record rides in a query
 * parameter (a process id, a seller wallet, a design's slug). A missing or
 * malformed parameter names no record, so the page renders nothing for it:
 * no "No … in URL" copy, and the record's view never mounts on a value of the
 * wrong shape (docs/OPEN_WORLD.md § 1 "No fallbacks").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const PROCESS = `0x${"ab".repeat(32)}`;
const SELLER = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

const mocks = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
    useSearchParams: () => mocks.params,
    useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock("@/app/(app)/orders/_components/OrderTimelineView", () => ({
    OrderTimelineView: ({ processId }: { processId: string }) => <div data-testid="record">{processId}</div>,
}));
vi.mock("@/app/(app)/s/view/_components/MemberDetailView", () => ({
    MemberDetailView: ({ sellerAddress }: { sellerAddress: string }) => <div data-testid="record">{sellerAddress}</div>,
}));
vi.mock("@/app/(app)/s/checkout/_components/CheckoutView", () => ({
    CheckoutView: ({ sellerAddress }: { sellerAddress: string }) => <div data-testid="record">{sellerAddress}</div>,
}));
vi.mock("@/app/(app)/audit/_components/ProcessFinancialsView", () => ({
    ProcessFinancialsView: ({ processId }: { processId: string }) => <div data-testid="record">{processId}</div>,
}));
vi.mock("@/app/(app)/audit/_components/ProcessClauseEvidence", () => ({ ProcessClauseEvidence: () => null }));
vi.mock("@/app/(app)/audit/_components/HashVerifier", () => ({ HashVerifier: () => null }));
vi.mock("@/components/runtime/RecoursePanel", () => ({ RecoursePanel: () => null }));
vi.mock("@/components/runtime/AgreementPinErasure", () => ({ AgreementPinErasure: () => null }));
vi.mock("@/hooks/useProcessOrders", () => ({ useProcessOrders: () => [] }));
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => [] }));
vi.mock("@/app/(tools)/assemblies/designer/view/ViewAssemblyClient", () => ({
    ViewAssemblyClient: ({ slug }: { slug: string }) => <div data-testid="record">{slug}</div>,
}));
vi.mock("@/app/(tools)/assemblies/designer/edit/EditAssemblyClient", () => ({
    EditAssemblyClient: ({ slug }: { slug: string }) => <div data-testid="record">{slug}</div>,
}));

import OrderPage from "@/app/(app)/orders/view/page";
import SellerPage from "@/app/(app)/s/view/page";
import CheckoutPage from "@/app/(app)/s/checkout/page";
import AuditPage from "@/app/(app)/audit/view/page";
import ViewAssemblyPage from "@/app/(tools)/assemblies/designer/view/page";
import EditAssemblyPage from "@/app/(tools)/assemblies/designer/edit/page";

const PAGES = [
    { name: "orders/view", Page: OrderPage, param: "process", valid: PROCESS, malformed: ["0x1234", "not-a-process", SELLER] },
    { name: "audit/view", Page: AuditPage, param: "process", valid: PROCESS, malformed: ["0x1234", "not-a-process", SELLER] },
    { name: "s/view", Page: SellerPage, param: "seller", valid: SELLER, malformed: ["0x1234", "alice", PROCESS] },
    { name: "s/checkout", Page: CheckoutPage, param: "seller", valid: SELLER, malformed: ["0x1234", "alice", PROCESS] },
    { name: "designer/view", Page: ViewAssemblyPage, param: "slug", valid: "courier-leg", malformed: [] },
    { name: "designer/edit", Page: EditAssemblyPage, param: "slug", valid: "courier-leg", malformed: [] },
] as const;

describe("query-parameter pages through QueryParamPage", () => {
    beforeEach(() => {
        mocks.params = new URLSearchParams();
    });

    it.each(PAGES)("$name renders nothing for a missing parameter, and no error copy", ({ Page }) => {
        const { container } = render(<Page />);
        expect(screen.queryByTestId("record")).toBeNull();
        expect(container.textContent ?? "").not.toMatch(/in URL|not found|no .* id/i);
        expect(container.textContent).toBe("");
    });

    it.each(PAGES.flatMap((p) => p.malformed.map((value) => ({ ...p, value }))))(
        "$name renders nothing for the malformed $param $value",
        ({ Page, param, value }) => {
            mocks.params = new URLSearchParams({ [param]: value });
            const { container } = render(<Page />);
            expect(screen.queryByTestId("record")).toBeNull();
            expect(container.textContent).toBe("");
        },
    );

    it.each(PAGES)("$name mounts the record's view for a well-formed parameter", ({ Page, param, valid }) => {
        mocks.params = new URLSearchParams({ [param]: valid });
        render(<Page />);
        expect(screen.getByTestId("record").textContent).toBe(valid);
    });
});
