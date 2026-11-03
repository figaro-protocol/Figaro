/**
 * lib/shared/storage — the one web-storage seam. A write the browser refuses
 * (quota exceeded, storage disabled) or a value JSON cannot serialize is
 * caught and reported as `false`, never thrown into the caller.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

describe("writeJsonStorage", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it("catches a quota error and reports the write as not made", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        });
        let result: unknown;
        expect(() => { result = writeJsonStorage("figaro:test", { a: 1 }); }).not.toThrow();
        expect(result).toBe(false);
    });

    it("catches a value JSON cannot serialize", () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        let result: unknown;
        expect(() => { result = writeJsonStorage("figaro:test", circular); }).not.toThrow();
        expect(result).toBe(false);
        expect(localStorage.getItem("figaro:test")).toBeNull();
    });

    it("writes a value with bigints as decimal strings and reports it made", () => {
        expect(writeJsonStorage("figaro:test", { v: 5n })).toBe(true);
        expect(readJsonStorage("figaro:test", null)).toEqual({ v: "5" });
    });
});
