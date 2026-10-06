import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRegisteredCatalogs } from "@/lib/member/useRegisteredCatalogs";
import type { DiscoveryService } from "@/lib/member/discoveryService";
import type { MemberCatalog } from "@/lib/member/types";

const usePublicClientMock = vi.fn();
const useChainIdMock = vi.fn();

vi.mock("wagmi", () => ({
    usePublicClient: () => usePublicClientMock(),
    useChainId: () => useChainIdMock(),
}));

// The surfacing-rule cross-check gate — resolved (empty) so the discovery
// effect proceeds; the discovery service is injected below. Stable reference
// so it does not itself re-trigger the effect on every render.
const PUBLISHED = { data: [] as unknown[], isLoading: false };
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({
    usePublishedAssemblies: () => PUBLISHED,
}));

const publicClient = { transport: { type: "http" } };

function cat(name: string): MemberCatalog {
    return {
        name,
        description: "",
        specialty: "",
        address: "0x0000000000000000000000000000000000000001",
        items: [],
        acceptedTokens: [],
    };
}

describe("useRegisteredCatalogs focus refresh", () => {
    beforeEach(() => {
        usePublicClientMock.mockReset();
        useChainIdMock.mockReset();
        usePublicClientMock.mockReturnValue(publicClient);
        useChainIdMock.mockReturnValue(31337);
    });

    it("re-runs discovery on window focus so a long-open tab does not go stale", async () => {
        const listCatalogs = vi
            .fn()
            .mockResolvedValueOnce({ catalogs: [cat("First")] })
            .mockResolvedValue({ catalogs: [cat("First"), cat("Second")] });
        const service = {
            isRegistryConfigured: () => true,
            listCatalogs,
        } as unknown as DiscoveryService;

        const { result } = renderHook(() => useRegisteredCatalogs({ service }));

        await waitFor(() => expect(result.current.catalogs).toHaveLength(1));
        expect(listCatalogs).toHaveBeenCalledTimes(1);

        // Returning to a long-open tab: the window regains focus and the
        // catalog should refresh from the chain rather than stay stale.
        act(() => {
            window.dispatchEvent(new Event("focus"));
        });

        await waitFor(() => expect(result.current.catalogs).toHaveLength(2));
        expect(listCatalogs).toHaveBeenCalledTimes(2);
    });
});
