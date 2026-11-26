/**
 * useBusyAction — one user action at a time, its in-flight flag and its
 * failure line.
 *
 * Proves: `busy` is raised while the action runs and dropped after; the
 * action's value is returned; a throw becomes `error` (the cause's message)
 * and `run` resolves undefined; the next run clears the last failure.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBusyAction } from "@/lib/shared/useBusyAction";

describe("useBusyAction", () => {
    it("raises busy while the action runs and returns its value", async () => {
        const { result } = renderHook(() => useBusyAction());
        let release!: (value: number) => void;
        let pending!: Promise<number | undefined>;
        act(() => {
            pending = result.current.run("never shown", () => new Promise<number>((resolve) => { release = resolve; }));
        });
        expect(result.current.busy).toBe(true);
        await act(async () => {
            release(7);
            expect(await pending).toBe(7);
        });
        expect(result.current.busy).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it("turns a throw into the failure line and clears it on the next run", async () => {
        const { result } = renderHook(() => useBusyAction());
        await act(async () => {
            const value = await result.current.run("Request failed.", async () => {
                throw new Error("the channel closed");
            });
            expect(value).toBeUndefined();
        });
        expect(result.current.busy).toBe(false);
        expect(result.current.error).toContain("the channel closed");
        await act(async () => {
            await result.current.run("Request failed.", async () => "ok");
        });
        expect(result.current.error).toBeNull();
    });
});
