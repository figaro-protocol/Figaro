/**
 * applyUntilCleanup and presentValue — the canceled-on-cleanup network read
 * and the value of a present read.
 *
 * Proves: an answer that lands before the effect's cleanup is applied; one
 * that lands after it never is, so a late answer cannot overwrite a newer
 * one; a pending or absent read has no value, and only a present read's
 * value (an empty list included) comes back.
 */
import { describe, expect, it } from "vitest";
import { ABSENT, PENDING, applyUntilCleanup, present, presentValue } from "@/lib/shared/networkRead";

describe("applyUntilCleanup", () => {
    it("applies an answer that lands before the cleanup", async () => {
        const applied: number[] = [];
        applyUntilCleanup(Promise.resolve(1), (v) => applied.push(v));
        await Promise.resolve();
        await Promise.resolve();
        expect(applied).toEqual([1]);
    });

    it("drops an answer that lands after the cleanup", async () => {
        const applied: number[] = [];
        let answer!: (v: number) => void;
        const cleanup = applyUntilCleanup(new Promise<number>((resolve) => { answer = resolve; }), (v) => applied.push(v));
        cleanup();
        answer(2);
        await Promise.resolve();
        await Promise.resolve();
        expect(applied).toEqual([]);
    });
});

describe("presentValue", () => {
    it("is null for a pending or an absent read", () => {
        expect(presentValue(PENDING)).toBeNull();
        expect(presentValue(ABSENT)).toBeNull();
    });

    it("is the value of a present read, an empty list included", () => {
        expect(presentValue(present([]))).toEqual([]);
        expect(presentValue(present(3))).toBe(3);
    });
});
