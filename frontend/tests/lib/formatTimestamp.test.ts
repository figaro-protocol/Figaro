/**
 * formatTimestamp — the one shared moment-renderer. Locks the merged
 * formatRelative semantics (the two designer copies diverged on the
 * "just now" threshold and the fallback format) and the chain-domain
 * seconds contract of formatBlockTimestamp.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatBlockTimestamp, formatRelative } from "@/lib/shared/formatTimestamp";

const NOW_MS = Date.UTC(2026, 6, 4, 12, 0, 0); // 2026-07-04T12:00:00Z

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
});
afterEach(() => {
    vi.useRealTimers();
});

describe("formatRelative (wall-clock ms domain)", () => {
    it("under 5s is 'just now'", () => {
        expect(formatRelative(NOW_MS - 3_000)).toBe("just now");
    });
    it("under a minute counts seconds", () => {
        expect(formatRelative(NOW_MS - 42_000)).toBe("42s ago");
    });
    it("under an hour counts minutes", () => {
        expect(formatRelative(NOW_MS - 5 * 60_000)).toBe("5m ago");
    });
    it("under a day counts hours", () => {
        expect(formatRelative(NOW_MS - 3 * 3_600_000)).toBe("3h ago");
    });
    it("past a day falls back to the locale date-time (carries the year)", () => {
        const label = formatRelative(NOW_MS - 40 * 24 * 3_600_000);
        expect(label).toMatch(/2026/);
        expect(label).not.toMatch(/ago/);
    });
});

describe("formatBlockTimestamp (chain seconds domain)", () => {
    it("treats input as unix SECONDS — never a magnitude guess", () => {
        const unix = Math.floor(NOW_MS / 1000);
        expect(formatBlockTimestamp(unix)).toMatch(/2026/);
    });
    it("accepts bigint (commitment deadlines, block timestamps)", () => {
        expect(formatBlockTimestamp(BigInt(Math.floor(NOW_MS / 1000)))).toMatch(/2026/);
    });
    it("honors Intl options (the track-record month-year projection)", () => {
        const label = formatBlockTimestamp(Math.floor(NOW_MS / 1000), { year: "numeric", month: "short" });
        expect(label).toMatch(/2026/);
        expect(label).not.toMatch(/12|:/); // no time-of-day in a month-year label
    });
});
