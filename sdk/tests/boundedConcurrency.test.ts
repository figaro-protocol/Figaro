import { describe, it, expect } from "vitest";
import { forEachConcurrently } from "../src/boundedConcurrency.js";

describe("forEachConcurrently", () => {
    it("visits every item once and never runs more than `concurrency` at a time", async () => {
        const items = Array.from({ length: 7 }, (_, i) => i);
        const visited: number[] = [];
        let open = 0;
        let peak = 0;
        await forEachConcurrently(items, 3, async (item) => {
            open += 1;
            peak = Math.max(peak, open);
            await new Promise((resolve) => setTimeout(resolve, 1));
            visited.push(item);
            open -= 1;
        });
        expect([...visited].sort((a, b) => a - b)).toEqual(items);
        expect(peak).toBe(3);
    });

    it("starts a group only after the slowest read of the group before it answers", async () => {
        const started: number[] = [];
        const finished: number[] = [];
        await forEachConcurrently([0, 1, 2, 3], 2, async (item) => {
            started.push(item);
            await new Promise((resolve) => setTimeout(resolve, item === 0 ? 5 : 1));
            finished.push(item);
        });
        expect(started.indexOf(2)).toBeGreaterThan(-1);
        expect(finished.indexOf(0)).toBeLessThan(started.indexOf(2));
    });

    it("reads a concurrency below 1 as 1 and walks an empty list without a call", async () => {
        const visited: string[] = [];
        await forEachConcurrently(["a", "b"], 0, async (item) => { visited.push(item); });
        expect(visited).toEqual(["a", "b"]);
        let calls = 0;
        await forEachConcurrently([], 4, async () => { calls += 1; });
        expect(calls).toBe(0);
    });
});
