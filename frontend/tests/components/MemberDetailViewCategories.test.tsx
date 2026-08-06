import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberDetailView } from "@/app/(app)/s/view/_components/MemberDetailView";
import type { MemberCatalogue } from "@/lib/member/types";

const SELLER = "0x00000000000000000000000000000000000000aa";

const CATALOGUE: MemberCatalogue = {
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

vi.mock("@/lib/member/useRegisteredCatalogues", () => ({
    useRegisteredCatalogues: () => ({ catalogues: [CATALOGUE], isLoading: false }),
}));
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
vi.mock("@/lib/member/useMemberTrackRecord", () => ({
    useMemberTrackRecord: () => ({ trackRecord: null, isLoading: false }),
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
vi.mock("@/components/runtime/MemberTrackRecord", () => ({
    MemberTrackRecord: () => null,
}));

describe("MemberDetailView catalogue categories", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => {
        errorSpy.mockRestore();
    });

    it("renders an uncategorized item under an explicit fallback heading, not a blank group", () => {
        render(<MemberDetailView sellerAddress={SELLER} />);

        // The categorized group renders as before.
        expect(screen.getByRole("heading", { name: "Mains" })).toBeInTheDocument();
        // The uncategorized item gets a real, visible fallback heading.
        expect(screen.getByRole("heading", { name: "(unclassified)" })).toBeInTheDocument();
        // Both items are present.
        expect(screen.getByText("Pizza")).toBeInTheDocument();
        expect(screen.getByText("Mystery")).toBeInTheDocument();

        // No React "unique key" warning (undefined key on the fallback group).
        const keyWarning = errorSpy.mock.calls.some((args: unknown[]) =>
            args.some((a) => typeof a === "string" && a.includes("unique") && a.includes("key")),
        );
        expect(keyWarning).toBe(false);
    });
});
