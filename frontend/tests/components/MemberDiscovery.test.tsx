import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const listingsMock = vi.fn();
vi.mock("@/lib/member/useMemberListings", () => ({ useMemberListings: () => listingsMock() }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/app/(app)/discover/_components/useDeviceLocation", () => ({
    useDeviceLocation: () => ({ status: "idle", geohash: null, error: null, request: () => undefined, clear: () => undefined }),
}));

import { MemberDiscovery } from "@/app/(app)/discover/_components/MemberDiscovery";

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
});
