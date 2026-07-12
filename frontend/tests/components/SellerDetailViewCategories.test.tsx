import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SellerDetailView } from "@/app/(app)/s/view/_components/SellerDetailView";
import type { SellerCatalogue } from "@/lib/seller/types";

const SELLER = "0x00000000000000000000000000000000000000aa";

const CATALOGUE: SellerCatalogue = {
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

vi.mock("@/lib/seller/useRegisteredCatalogues", () => ({
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
vi.mock("@/lib/seller/useSellerTrackRecord", () => ({
    useSellerTrackRecord: () => ({ trackRecord: null, isLoading: false }),
}));
vi.mock("@/components/sellers/TokenAddressInput", () => ({
    useTokenSymbol: () => ({ data: "" }),
}));
vi.mock("@/components/modules/SellerBrandingModule", () => ({
    SellerLogo: () => React.createElement("div", { "data-testid": "seller-logo" }),
}));
vi.mock("@/components/sellers/SellerAgentIdentity", () => ({
    SellerAgentIdentity: () => null,
}));
vi.mock("@/components/runtime/SellerTrackRecord", () => ({
    SellerTrackRecord: () => null,
}));

describe("SellerDetailView catalogue categories", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => {
        errorSpy.mockRestore();
    });

    it("renders an uncategorized item under an explicit fallback heading, not a blank group", () => {
        render(<SellerDetailView sellerAddress={SELLER} />);

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
