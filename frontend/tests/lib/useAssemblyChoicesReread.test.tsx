import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { contentRetryDelayMs } from "@/lib/shared/ipfsService";

const fetchAssemblyTemplateMock = vi.fn();
const publishedMock = vi.fn();
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({
    usePublishedAssemblies: () => publishedMock(),
    fetchAssemblyTemplate: (...args: unknown[]) => fetchAssemblyTemplateMock(...args),
}));

import { useAssemblyChoices } from "@/lib/protocol/assemblyChoices";

const EVENT = {
    slug: "asm-fresh", author: "0xA", compositionHash: "0x1", contentURI: "ipfs://fresh", blockNumber: 2n,
};
const TEMPLATE = { name: "Containerised import chain", agreements: [], assemblyClauses: {} };

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

describe("useAssemblyChoices — a template the gateway has not served yet is re-read, not abandoned", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        publishedMock.mockReturnValue({ data: [EVENT], isLoading: false, refetch: vi.fn() });
        fetchAssemblyTemplateMock.mockReset();
    });
    afterEach(() => { vi.useRealTimers(); });

    it("shows the slug while unserved, then names itself from the re-read without a reload", async () => {
        fetchAssemblyTemplateMock.mockResolvedValueOnce(null).mockResolvedValueOnce(TEMPLATE);
        const { result } = renderHook(() => useAssemblyChoices());
        await flush();
        expect(result.current.data?.[0]).toMatchObject({ state: "error", name: "asm-fresh" });
        expect(fetchAssemblyTemplateMock).toHaveBeenCalledTimes(1);

        await act(async () => { vi.advanceTimersByTime(contentRetryDelayMs(0)); });
        await flush();
        expect(fetchAssemblyTemplateMock).toHaveBeenCalledTimes(2);
        expect(result.current.data?.[0]).toMatchObject({ state: "loaded", name: "Containerised import chain" });

        // Loaded: no further re-reads.
        await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
        await flush();
        expect(fetchAssemblyTemplateMock).toHaveBeenCalledTimes(2);
    });

    it("keeps the schedule while unserved and stops on unmount", async () => {
        fetchAssemblyTemplateMock.mockResolvedValue(null);
        const { unmount } = renderHook(() => useAssemblyChoices());
        await flush();
        expect(fetchAssemblyTemplateMock).toHaveBeenCalledTimes(1);
        for (let attempt = 0; attempt < 3; attempt++) {
            await act(async () => { vi.advanceTimersByTime(contentRetryDelayMs(attempt)); });
            await flush();
            expect(fetchAssemblyTemplateMock).toHaveBeenCalledTimes(attempt + 2);
        }
        unmount();
        await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
        await flush();
        expect(fetchAssemblyTemplateMock).toHaveBeenCalledTimes(4);
    });
});
