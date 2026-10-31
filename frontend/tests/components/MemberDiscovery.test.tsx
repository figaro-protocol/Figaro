import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const listingsMock = vi.fn();
vi.mock("@/lib/member/useMemberListings", () => ({ useMemberListings: () => listingsMock() }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/app/(app)/discover/_components/useDeviceLocation", () => ({
    useDeviceLocation: () => ({ status: "idle", geohash: null, error: null, request: () => undefined, clear: () => undefined }),
}));

import { MemberDiscovery } from "@/app/(app)/discover/_components/MemberDiscovery";

describe("MemberDiscovery — a failed read says the read failed, never that nothing is registered", () => {
    it("failed with the RPC's text: the /registries failure line renders with that text; no count, no empty-registry CTA", () => {
        listingsMock.mockReturnValue({ listings: [], isLoading: false, failed: true, error: "rate limited: 429 Too Many Requests" });
        render(<MemberDiscovery />);
        const failed = screen.getByTestId("registry-failed");
        expect(failed.textContent).toContain("The registry read failed on this network");
        expect(failed.textContent).toContain("rate limited: 429 Too Many Requests");
        expect(screen.queryByText(/members shown of/)).toBeNull();
        expect(screen.queryByText(/No members registered/)).toBeNull();
        expect(screen.queryByTestId("discover-empty-cta")).toBeNull();
    });

    it("failed with no provider text: the failure line renders without the RPC clause", () => {
        listingsMock.mockReturnValue({ listings: [], isLoading: false, failed: true, error: null });
        render(<MemberDiscovery />);
        expect(screen.getByTestId("registry-failed").textContent).not.toContain("The RPC endpoint answered");
    });

    it("resolved-empty: the count and the empty-registry CTA render, no failure line", () => {
        listingsMock.mockReturnValue({ listings: [], isLoading: false, failed: false, error: null });
        render(<MemberDiscovery />);
        expect(screen.getByText("0 members shown of 0 total.")).toBeInTheDocument();
        expect(screen.getByTestId("discover-empty-cta")).toBeInTheDocument();
        expect(screen.queryByTestId("registry-failed")).toBeNull();
    });
});
