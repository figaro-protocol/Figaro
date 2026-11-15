/**
 * ViewAssemblyClient, the designer's publish review — an agreement that
 * composes no clause declaring `lineItems` still carries its payment in the
 * commitment, and commits no list of what the payment buys. The review says
 * so for each such order before the designer publishes.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const ORDER_A = `0x${"0a".repeat(32)}`;
const ORDER_B = `0x${"0b".repeat(32)}`;
const HASH = `0x${"ab".repeat(32)}` as const;
const REVIEW = vi.hoisted(() => ({ withoutLineItems: [] as string[] }));
// Stable identities: the page's effects re-run on a changed reference.
const STABLE = vi.hoisted(() => ({
    published: { read: { status: "pending" }, refetch: () => undefined },
    draft: {
        slug: "asm-draft", name: "Draft", summary: "", description: "", processId: "0x01",
        nextOrderIndex: 2, nextSellerIndex: 2, createdAt: 1, updatedAt: 1,
        orders: [{ orderHash: `0x${"0a".repeat(32)}` }, { orderHash: `0x${"0b".repeat(32)}` }],
    },
    specs: { loaded: true, version: 0 },
    gate: { gate: undefined },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams("intent=publish"),
}));
vi.mock("wagmi", () => ({
    useAccount: () => ({ address: undefined }),
    useChainId: () => 31337,
    usePublicClient: () => undefined,
}));
vi.mock("@/lib/designer/syntheticDesignStore", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/designer/syntheticDesignStore")>()),
    loadNamedDraft: () => STABLE.draft,
}));
vi.mock("@/lib/designer/draftToAssembly", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/designer/draftToAssembly")>()),
    unfilledAssemblyTerms: () => [],
    projectSnapshotForReview: () => ({
        ok: true,
        assembly: { agreements: [{ id: "agreement-0", agreementHash: HASH, clauses: {} }, { id: "agreement-1", agreementHash: HASH, clauses: {} }] },
        hydrated: { assembly: { agreements: [] }, agreements: {} },
        newAgreements: {},
        entries: [{ orderId: ORDER_A, agreementHash: HASH, bound: false }, { orderId: ORDER_B, agreementHash: HASH, bound: false }],
        assemblyHash: HASH,
        slug: "asm-x",
        composedByOrderId: {},
        composedClausesByOrderId: {},
        assemblyClauses: {},
        mandatory: [],
        withoutLineItems: REVIEW.withoutLineItems,
    }),
}));
vi.mock("@/lib/protocol/useAssemblyRegistry", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/protocol/useAssemblyRegistry")>()),
    getAssemblyRegistry: () => undefined,
    usePublishedAssemblies: () => STABLE.published,
    useWithdrawAssembly: () => ({ withdraw: vi.fn() }),
}));
vi.mock("@/lib/protocol/withdrawGate", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/protocol/withdrawGate")>()),
    useWithdrawGate: () => STABLE.gate,
}));
vi.mock("@/lib/designer/publishAssembly", () => ({ usePublishAssembly: () => ({ publish: vi.fn() }) }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => STABLE.specs }));
vi.mock("@/components/runtime/TopologyCanvas", () => ({ TopologyCanvas: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AgreementDrawer", () => ({ AgreementDrawer: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyTermsPanel", () => ({ AssemblyTermsPanel: () => null }));
vi.mock("@/app/(tools)/assemblies/designer/_components/AssemblyIdentity", () => ({ AssemblyIdentity: () => null }));

import { ViewAssemblyClient } from "@/app/(tools)/assemblies/designer/view/ViewAssemblyClient";

describe("ViewAssemblyClient — the review states which agreements commit no line items", () => {
    it("names the order whose agreement composes no line items, and says the cart is not committed", async () => {
        REVIEW.withoutLineItems = [ORDER_B];
        render(<ViewAssemblyClient slug="asm-draft" />);
        const notice = await screen.findByTestId("review-without-line-items", undefined, { timeout: 15_000 });
        expect(notice.textContent).toMatch(/Order 2/);
        expect(notice.textContent).not.toMatch(/Order 1/);
        expect(notice.textContent).toMatch(/the list of what the payment buys is not committed/i);
    }, 30_000);

    it("says nothing when every agreement composes line items", async () => {
        REVIEW.withoutLineItems = [];
        render(<ViewAssemblyClient slug="asm-draft" />);
        await screen.findByTestId("review-agreements", undefined, { timeout: 15_000 });
        expect(screen.queryByTestId("review-without-line-items")).toBeNull();
    }, 30_000);
});
