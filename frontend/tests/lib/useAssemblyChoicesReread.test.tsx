import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { contentRetryDelayMs } from "@/lib/shared/ipfsService";

const fetchHydratedAssemblyMock = vi.fn();
const publishedMock = vi.fn();
const loadErrorMock = vi.fn<(hash: string) => string | undefined>(() => undefined);
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({
    usePublishedAssemblies: () => publishedMock(),
    fetchHydratedAssembly: (...args: unknown[]) => fetchHydratedAssemblyMock(...args),
    getAssemblyLoadError: (hash: string) => loadErrorMock(hash),
}));

import { useAssemblyChoices } from "@/lib/protocol/assemblyChoices";

const EVENT = {
    slug: "asm-fresh", registeredBy: "0xA", assemblyHash: "0x1", contentURI: "ipfs://fresh", blockNumber: 2n,
};
const ASSEMBLY = { assembly: { name: "Containerized import chain", agreements: [], assemblyClauses: {} }, agreements: {} };

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

describe("useAssemblyChoices — a assembly the gateway has not served yet is re-read, not abandoned", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        publishedMock.mockReturnValue({ data: [EVENT], isLoading: false, refetch: vi.fn() });
        fetchHydratedAssemblyMock.mockReset();
        loadErrorMock.mockReset();
        loadErrorMock.mockReturnValue(undefined);
    });
    afterEach(() => { vi.useRealTimers(); });

    it("shows the slug while unserved, then names itself from the re-read without a reload", async () => {
        fetchHydratedAssemblyMock.mockResolvedValueOnce(null).mockResolvedValueOnce(ASSEMBLY);
        const { result } = renderHook(() => useAssemblyChoices());
        await flush();
        expect(result.current.data?.[0]).toMatchObject({ state: "error", name: "asm-fresh" });
        expect(fetchHydratedAssemblyMock).toHaveBeenCalledTimes(1);

        await act(async () => { vi.advanceTimersByTime(contentRetryDelayMs(0)); });
        await flush();
        expect(fetchHydratedAssemblyMock).toHaveBeenCalledTimes(2);
        expect(result.current.data?.[0]).toMatchObject({ state: "loaded", name: "Containerized import chain" });

        // Loaded: no further re-reads.
        await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
        await flush();
        expect(fetchHydratedAssemblyMock).toHaveBeenCalledTimes(2);
    });

    it("a assembly that was served and is not the one its root anchors is never re-read — the row stays in error", async () => {
        fetchHydratedAssemblyMock.mockResolvedValue(null);
        loadErrorMock.mockReturnValue("integrity failure at ipfs://fresh: the document is not the assembly the root anchors");
        const { result } = renderHook(() => useAssemblyChoices());
        await flush();
        expect(result.current.data?.[0]).toMatchObject({ state: "error", name: "asm-fresh" });
        expect(fetchHydratedAssemblyMock).toHaveBeenCalledTimes(1);
        await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
        await flush();
        expect(fetchHydratedAssemblyMock).toHaveBeenCalledTimes(1);
    });

    it("keeps the schedule while unserved and stops on unmount", async () => {
        fetchHydratedAssemblyMock.mockResolvedValue(null);
        const { unmount } = renderHook(() => useAssemblyChoices());
        await flush();
        expect(fetchHydratedAssemblyMock).toHaveBeenCalledTimes(1);
        for (let attempt = 0; attempt < 3; attempt++) {
            await act(async () => { vi.advanceTimersByTime(contentRetryDelayMs(attempt)); });
            await flush();
            expect(fetchHydratedAssemblyMock).toHaveBeenCalledTimes(attempt + 2);
        }
        unmount();
        await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
        await flush();
        expect(fetchHydratedAssemblyMock).toHaveBeenCalledTimes(4);
    });
});
