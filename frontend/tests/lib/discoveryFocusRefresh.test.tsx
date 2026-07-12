import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRegisteredCatalogues } from "@/lib/seller/useRegisteredCatalogues";
import type { DiscoveryService } from "@/lib/seller/discoveryService";
import type { SellerCatalogue } from "@/lib/seller/types";

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

function cat(name: string): SellerCatalogue {
    return {
        name,
        description: "",
        specialty: "",
        address: "0x0000000000000000000000000000000000000001",
        items: [],
        acceptedTokens: [],
    };
}

describe("useRegisteredCatalogues focus refresh", () => {
    beforeEach(() => {
        usePublicClientMock.mockReset();
        useChainIdMock.mockReset();
        usePublicClientMock.mockReturnValue(publicClient);
        useChainIdMock.mockReturnValue(31337);
    });

    it("re-runs discovery on window focus so a long-open tab does not go stale", async () => {
        const listCatalogues = vi
            .fn()
            .mockResolvedValueOnce({ catalogues: [cat("First")] })
            .mockResolvedValue({ catalogues: [cat("First"), cat("Second")] });
        const service = {
            isRegistryConfigured: () => true,
            listCatalogues,
        } as unknown as DiscoveryService;

        const { result } = renderHook(() => useRegisteredCatalogues({ service }));

        await waitFor(() => expect(result.current.catalogues).toHaveLength(1));
        expect(listCatalogues).toHaveBeenCalledTimes(1);

        // Returning to a long-open tab: the window regains focus and the
        // catalogue should refresh from the chain rather than stay stale.
        act(() => {
            window.dispatchEvent(new Event("focus"));
        });

        await waitFor(() => expect(result.current.catalogues).toHaveLength(2));
        expect(listCatalogues).toHaveBeenCalledTimes(2);
    });
});
