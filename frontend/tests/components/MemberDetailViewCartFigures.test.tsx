/**
 * MemberDetailView — the order summary prices the cart in the seller's
 * declared denomination at that token's `decimals()`, read from the chain for
 * the catalog's `defaultTokenAddress`, and shows no figure until decimals are
 * read (CartLineList renders a figure only with decimals in hand).
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MemberCatalog } from "@/lib/registries/types";

const SELLER = "0x00000000000000000000000000000000000000aa";
const TOKEN = "0x00000000000000000000000000000000000007ed";

const CATALOG: MemberCatalog = {
    name: "Test Seller",
    description: "",
    specialty: "",
    address: SELLER,
    defaultTokenAddress: TOKEN,
    items: [{ id: "a", name: "Pizza", description: "", price: "1.5", category: "Mains", available: true }],
    acceptedTokens: [],
};

const m = vi.hoisted(() => ({ decimals: undefined as number | undefined, decimalsAsked: [] as unknown[] }));
vi.mock("@/hooks/useTokenDecimals", () => ({
    default: (token: unknown) => {
        m.decimalsAsked.push(token);
        return { decimals: m.decimals, ready: m.decimals !== undefined, loading: false };
    },
}));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: "TKN" }) }));
vi.mock("@/lib/registries/useRegisteredCatalogs", () => ({
    useRegisteredCatalogs: () => ({ read: { status: "present", value: [CATALOG] } }),
}));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));
vi.mock("@/lib/checkout", () => ({ useCommerce: () => ({ address: undefined }) }));
vi.mock("@/lib/checkout/cartStore", () => ({
    useCartStore: () => ({
        items: [{ catalogItemId: "a", sellerId: SELLER, sellerAddress: SELLER, sellerName: "Test Seller", name: "Pizza", price: "1.5", quantity: 2 }],
        addItem: vi.fn(),
        removeItem: vi.fn(),
        clearCart: vi.fn(),
    }),
}));
vi.mock("@/lib/registries/useMemberResolutionHistory", () => ({
    useMemberResolutionHistory: () => ({ resolutionHistory: null, isLoading: false }),
}));
vi.mock("@/components/modules/MemberBrandingModule", () => ({ MemberLogo: () => null }));
vi.mock("@/components/members/MemberAgentIdentity", () => ({ MemberAgentIdentity: () => null }));
vi.mock("@/components/runtime/MemberResolutionHistory", () => ({ MemberResolutionHistory: () => null }));

import { MemberDetailView } from "@/app/(app)/s/view/_components/MemberDetailView";

beforeEach(() => {
    m.decimals = undefined;
    m.decimalsAsked = [];
});

describe("MemberDetailView — the order summary's figures", () => {
    it("reads decimals for the seller's denomination and prices the cart at them", () => {
        m.decimals = 6;
        render(<MemberDetailView sellerAddress={SELLER} />);
        expect(m.decimalsAsked).toContain(TOKEN);
        expect(screen.getByTestId("cart-line-a").textContent).toContain("3 TKN");
        expect(screen.getByTestId("cart-subtotal").textContent).toBe("3 TKN");
    });

    it("shows no figure until the denomination's decimals are read", () => {
        render(<MemberDetailView sellerAddress={SELLER} />);
        expect(screen.getByTestId("cart-subtotal").textContent).toBe("");
    });
});

// No wallet: `useCommerce` answers no address, and the page calls no wagmi hook
// (the module mocks none, and wagmi throws outside its provider).
describe("/s/view?seller= — no wallet, read present", () => {
    it("no wallet, read present: the seller's name and catalog show, and a wallet gate holds none of them", () => {
        m.decimals = 6;
        render(<MemberDetailView sellerAddress={SELLER} />);
        expect(screen.getAllByText("Test Seller").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Pizza").length).toBeGreaterThan(0);
        for (const gate of screen.queryAllByTestId("wallet-gate")) {
            expect(gate.textContent).not.toMatch(/Test Seller|Pizza/);
        }
    });
});
