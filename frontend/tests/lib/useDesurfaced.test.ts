/**
 * useDesurfaced — withdraw = de-surface, one fold for every staked-intent registry family:
 * the network-wide read drops withdrawn stakes; the registering wallet's own read, and a
 * reader that opts in (`includeWithdrawn`), keep them flagged. The filtered view is
 * referentially stable while the scan's data is.
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDesurfaced } from "@/lib/protocol/registryEventScan";

const ROWS = [
    { id: "live", stakeWithdrawn: false },
    { id: "gone", stakeWithdrawn: true },
];
const ME = "0x0000000000000000000000000000000000005e11" as const;

describe("useDesurfaced", () => {
    it("drops withdrawn rows on the network-wide read", () => {
        const { result } = renderHook(() => useDesurfaced({ data: ROWS, isLoading: false }, undefined));
        expect(result.current.data?.map((r) => r.id)).toEqual(["live"]);
        expect(result.current.isLoading).toBe(false);
    });

    it("keeps them, flagged, on a wallet-scoped read and when the reader opts in", () => {
        const own = renderHook(() => useDesurfaced({ data: ROWS }, ME));
        expect(own.result.current.data).toBe(ROWS);
        const opted = renderHook(() => useDesurfaced({ data: ROWS }, undefined, { includeWithdrawn: true }));
        expect(opted.result.current.data).toBe(ROWS);
    });

    it("passes an unread scan through as null and keeps the filtered view stable across renders", () => {
        const idle = renderHook(() => useDesurfaced({ data: null as typeof ROWS | null }, undefined));
        expect(idle.result.current.data).toBeNull();
        const { result, rerender } = renderHook(() => useDesurfaced({ data: ROWS }, undefined));
        const first = result.current.data;
        rerender();
        expect(result.current.data).toBe(first);
    });
});
