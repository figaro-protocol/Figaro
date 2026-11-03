import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberDetailView } from "@/app/(app)/s/view/_components/MemberDetailView";
import type { MemberCatalog } from "@/lib/member/types";

const SELLER = "0x00000000000000000000000000000000000000aa";

const CATALOG: MemberCatalog = {
    name: "Test Seller",
    description: "",
    specialty: "",
    address: SELLER,
    items: [
        { id: "a", name: "Pizza", description: "", price: "1", category: "Mains", available: true },
        // No category — must not render as an undefined-keyed, heading-less group.
        { id: "b", name: "Mystery", description: "", price: "2", available: true },
    ],
    acceptedTokens: [],
};

const catalogs = vi.hoisted(() => ({ read: undefined as unknown }));
vi.mock("@/lib/member/useRegisteredCatalogs", () => ({
    useRegisteredCatalogs: () => ({ read: catalogs.read }),
}));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: undefined }),
}));
vi.mock("@/lib/checkout/cartStore", () => ({
    useCartStore: () => ({
        items: [],
        addItem: vi.fn(),
        removeItem: vi.fn(),
        clearCart: vi.fn(),
    }),
}));
vi.mock("@/lib/member/useMemberResolutionHistory", () => ({
    useMemberResolutionHistory: () => ({ resolutionHistory: null, isLoading: false }),
}));
vi.mock("@/components/members/TokenAddressInput", () => ({
    useTokenSymbol: () => ({ data: "" }),
}));
vi.mock("@/components/modules/MemberBrandingModule", () => ({
    MemberLogo: () => React.createElement("div", { "data-testid": "seller-logo" }),
}));
vi.mock("@/components/members/MemberAgentIdentity", () => ({
    MemberAgentIdentity: () => null,
}));
vi.mock("@/components/runtime/MemberResolutionHistory", () => ({
    MemberResolutionHistory: () => null,
}));

describe("MemberDetailView catalog categories", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        catalogs.read = { status: "present", value: [CATALOG] };
    });
    afterEach(() => {
        errorSpy.mockRestore();
    });

    it("renders an uncategorized item in a group with no heading — never a placeholder label", () => {
        render(<MemberDetailView sellerAddress={SELLER} />);

        // The categorized group renders as before.
        expect(screen.getByRole("heading", { name: "Mains" })).toBeInTheDocument();
        // The uncategorized item gets no invented heading.
        expect(screen.queryByText("(unclassified)")).toBeNull();
        // Both items are present.
        expect(screen.getByText("Pizza")).toBeInTheDocument();
        expect(screen.getByText("Mystery")).toBeInTheDocument();

        // No React "unique key" warning (undefined key on the fallback group).
        const keyWarning = errorSpy.mock.calls.some((args: unknown[]) =>
            args.some((a) => typeof a === "string" && a.includes("unique") && a.includes("key")),
        );
        expect(keyWarning).toBe(false);
    });

    it("a failed catalog read renders nothing — no 'Member not found', no 'Register as a member'", () => {
        catalogs.read = { status: "absent" };
        const { container } = render(<MemberDetailView sellerAddress={SELLER} />);
        expect(container.textContent).toBe("");
        expect(screen.queryByText(/Member not found/)).toBeNull();
        expect(screen.queryByText(/Register as a member/)).toBeNull();
    });

    it("no unit system the seller never declared: mass shows in the unit it was declared in", () => {
        catalogs.read = {
            status: "present",
            value: [{ ...CATALOG, items: [{ id: "m", name: "Flour", description: "", price: "1", available: true, massGrams: 1000 }] }],
        };
        render(<MemberDetailView sellerAddress={SELLER} />);
        expect(screen.getByTestId("catalog-item-logistics-m").textContent).toContain("1000 g");
    });

    it("a declared imperial system converts", () => {
        catalogs.read = {
            status: "present",
            value: [{ ...CATALOG, unitSystem: "imperial", items: [{ id: "m", name: "Flour", description: "", price: "1", available: true, massGrams: 1000 }] }],
        };
        render(<MemberDetailView sellerAddress={SELLER} />);
        expect(screen.getByTestId("catalog-item-logistics-m").textContent).toContain("oz");
    });
});
