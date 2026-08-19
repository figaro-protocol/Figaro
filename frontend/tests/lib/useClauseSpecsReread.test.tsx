import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
    _resetClauseSpecCache_TESTING_ONLY,
    getClauseSpec,
    getClauseSpecLoadError,
    setClauseSpecFetcher,
} from "@/lib/shared/clauseSpecSource";
import { contentRetryDelayMs } from "@/lib/shared/ipfsService";

const useAllRegisteredClausesMock = vi.fn();
vi.mock("@/lib/protocol/useClauseRegistry", () => ({
    useAllRegisteredClauses: () => useAllRegisteredClausesMock(),
}));

import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";

const event = (clauseId: string) => ({
    idHash: "0x01" as `0x${string}`,
    clauseId,
    version: 1,
    contentHash: undefined,
    contentURI: `ipfs://${clauseId}`,
    registeredBy: "0xA" as `0x${string}`,
    blockNumber: 1n,
    stakeWithdrawn: false,
});

const validSpec = (clauseId: string) => ({
    clauseId,
    version: 1,
    title: clauseId,
    description: "d",
    fields: [{ name: "x", type: "string", required: true }],
    block: { design: { article: "logistics" } },
});

/** Flush the microtasks a settled `Promise.allSettled` needs before its `.then`. */
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

describe("useClauseSpecs — a spec the gateway has not served yet is re-read, not abandoned", () => {
    beforeEach(() => {
        _resetClauseSpecCache_TESTING_ONLY();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        _resetClauseSpecCache_TESTING_ONLY();
    });

    it("re-reads a network miss on the retry schedule and bumps `version` when it lands", async () => {
        useAllRegisteredClausesMock.mockReturnValue({ data: [event("figaro-fresh"), event("figaro-old")], failed: false });
        let freshServed = false;
        const reads: string[] = [];
        setClauseSpecFetcher(async (uri) => {
            reads.push(uri);
            if (uri === "ipfs://figaro-fresh" && !freshServed) throw new Error("Failed to fetch clause spec at ipfs://figaro-fresh: 504 Gateway Time-out");
            return validSpec(uri.slice("ipfs://".length));
        });

        const { result } = renderHook(() => useClauseSpecs());
        await flush();

        // First pass settled: `loaded` is true (the pass finished), the served
        // spec cached, the miss skipped — and its error reported.
        expect(result.current.loaded).toBe(true);
        expect(getClauseSpec("figaro-old")).toBeDefined();
        expect(getClauseSpec("figaro-fresh")).toBeUndefined();
        expect(result.current.errors).toHaveLength(1);
        const versionAfterFirstPass = result.current.version;
        expect(reads.filter((u) => u === "ipfs://figaro-fresh")).toHaveLength(1);

        // Content lands at the gateway; the scheduled re-read finds it.
        freshServed = true;
        await act(async () => { vi.advanceTimersByTime(contentRetryDelayMs(0)); });
        await flush();

        expect(getClauseSpec("figaro-fresh")).toBeDefined();
        expect(result.current.version).toBeGreaterThan(versionAfterFirstPass);
        expect(result.current.errors).toHaveLength(0);
        // The already-cached spec was NOT re-read: only the unresolved one was.
        expect(reads.filter((u) => u === "ipfs://figaro-old")).toHaveLength(1);
        expect(reads.filter((u) => u === "ipfs://figaro-fresh")).toHaveLength(2);
    });

    it("keeps re-reading on the schedule while the content stays unserved (10 s, 20 s, 40 s, 60 s…)", async () => {
        useAllRegisteredClausesMock.mockReturnValue({ data: [event("figaro-slow")], failed: false });
        let reads = 0;
        setClauseSpecFetcher(async () => { reads += 1; throw new Error("504"); });
        renderHook(() => useClauseSpecs());
        await flush();
        expect(reads).toBe(1);
        for (let attempt = 0; attempt < 4; attempt++) {
            await act(async () => { vi.advanceTimersByTime(contentRetryDelayMs(attempt)); });
            await flush();
            expect(reads).toBe(attempt + 2);
        }
    });

    it("leaves a PERMANENT failure alone — a spec that fails verification is never re-read", async () => {
        useAllRegisteredClausesMock.mockReturnValue({ data: [event("figaro-bad")], failed: false });
        let reads = 0;
        // The document declares another clauseId: wrong content, not a slow gateway.
        setClauseSpecFetcher(async () => { reads += 1; return validSpec("figaro-other"); });
        renderHook(() => useClauseSpecs());
        await flush();
        expect(reads).toBe(1);
        expect(getClauseSpecLoadError("figaro-bad")).toMatch(/declares clauseId/);
        await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
        await flush();
        expect(reads).toBe(1);
    });

    it("unmount cancels the pending re-read", async () => {
        useAllRegisteredClausesMock.mockReturnValue({ data: [event("figaro-slow")], failed: false });
        let reads = 0;
        setClauseSpecFetcher(async () => { reads += 1; throw new Error("504"); });
        const { unmount } = renderHook(() => useClauseSpecs());
        await flush();
        unmount();
        await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
        await flush();
        expect(reads).toBe(1);
    });
});
