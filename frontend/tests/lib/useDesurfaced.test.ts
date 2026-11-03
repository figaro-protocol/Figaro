/**
 * useDesurfaced — withdraw = de-surface, one fold for every staked-intent registry family:
 * the network-wide read drops withdrawn stakes; the registering wallet's own read, and a
 * reader that opts in (`includeWithdrawn`), keep them flagged. The filtered view is
 * referentially stable while the scan's data is.
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDesurfaced } from "@/lib/protocol/registryEventScan";
import { ABSENT, PENDING, present } from "@/lib/shared/networkRead";

const ROWS = [
    { id: "live", stakeWithdrawn: false },
    { id: "gone", stakeWithdrawn: true },
];
const ME = "0x0000000000000000000000000000000000005e11" as const;
const refetch = () => undefined;
const READ = present(ROWS);

describe("useDesurfaced", () => {
    it("drops withdrawn rows on the network-wide read", () => {
        const { result } = renderHook(() => useDesurfaced({ read: READ, refetch }, undefined));
        const r = result.current.read;
        expect(r.status === "present" && r.value.map((x) => x.id)).toEqual(["live"]);
    });

    it("keeps them, flagged, on a wallet-scoped read and when the reader opts in", () => {
        const own = renderHook(() => useDesurfaced({ read: READ, refetch }, ME));
        expect(own.result.current.read).toBe(READ);
        const opted = renderHook(() => useDesurfaced({ read: READ, refetch }, undefined, { includeWithdrawn: true }));
        expect(opted.result.current.read).toBe(READ);
    });

    it("passes a pending or absent scan through and keeps the filtered view stable across renders", () => {
        const idle = renderHook(() => useDesurfaced<{ stakeWithdrawn: boolean }>({ read: PENDING, refetch }, undefined));
        expect(idle.result.current.read).toEqual({ status: "pending" });
        const failed = renderHook(() => useDesurfaced<{ stakeWithdrawn: boolean }>({ read: ABSENT, refetch }, undefined));
        expect(failed.result.current.read).toEqual({ status: "absent" });
        const { result, rerender } = renderHook(() => useDesurfaced({ read: READ, refetch }, undefined));
        const first = result.current.read;
        rerender();
        expect(result.current.read).toBe(first);
    });
});
