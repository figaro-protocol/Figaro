import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const listingsMock = vi.fn();
vi.mock("@/lib/member/useMemberListings", () => ({ useMemberListings: () => listingsMock() }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/app/(app)/discover/_components/useDeviceLocation", () => ({
    useDeviceLocation: () => ({ status: "idle", geohash: null, error: null, request: () => undefined, clear: () => undefined }),
}));

import { MemberDiscovery } from "@/app/(app)/discover/_components/MemberDiscovery";
import { CONNECT_PROMPT } from "../lib/__fixtures__/noWallet";

describe("MemberDiscovery — a failed read renders nothing, never that nothing is registered", () => {
    it("failed: no failure text, no count, no empty-registry CTA", () => {
        listingsMock.mockReturnValue({ read: { status: "absent" } });
        render(<MemberDiscovery />);
        expect(screen.queryByTestId("registry-failed")).toBeNull();
        expect(document.body.textContent).not.toMatch(/read failed|RPC endpoint/);
        expect(screen.queryByText(/members shown of/)).toBeNull();
        expect(screen.queryByText(/No members registered/)).toBeNull();
        expect(screen.queryByTestId("discover-empty-cta")).toBeNull();
    });

    it("resolved-empty: the count and the empty-registry CTA render", () => {
        listingsMock.mockReturnValue({ read: { status: "present", value: [] } });
        render(<MemberDiscovery />);
        expect(screen.getByText("0 members shown of 0 total.")).toBeInTheDocument();
        expect(screen.getByTestId("discover-empty-cta")).toBeInTheDocument();
    });

    // The page calls no wallet hook: the module mocks none, and wagmi throws outside its provider.
    it("no wallet, read present: the registry's members show, and no prompt to connect stands in for them", () => {
        listingsMock.mockReturnValue({
            read: {
                status: "present",
                value: [{
                    address: "0x00000000000000000000000000000000000000aa", name: "Kitchen", description: "Warm meals",
                    acceptedTokens: [], bindings: [],
                }],
            },
        });
        const { container } = render(<MemberDiscovery />);
        expect(screen.getByText("Kitchen")).toBeInTheDocument();
        expect(screen.getByText("1 member shown of 1 total.")).toBeInTheDocument();
        expect(container.textContent).not.toMatch(CONNECT_PROMPT);
    });
});
