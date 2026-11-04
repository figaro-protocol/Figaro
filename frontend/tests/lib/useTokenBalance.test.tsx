/**
 * useTokenBalance — the one ERC-20 balance read, as a NetworkRead: a read in
 * flight (or with no token/owner yet) is pending, a failed read is absent
 * (never a 0 balance a surface could gate on), and only an answered read is
 * present.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const query = vi.hoisted(() => ({
    current: { status: "pending", data: undefined } as { status: string; data: unknown },
    lastOptions: null as null | { args?: unknown; query?: { enabled?: boolean } },
}));
vi.mock("wagmi", () => ({
    useReadContract: (options: { args?: unknown; query?: { enabled?: boolean } }) => {
        query.lastOptions = options;
        return { ...query.current, refetch: vi.fn() };
    },
}));

import useTokenBalance from "@/hooks/useTokenBalance";

const TOKEN = "0x00000000000000000000000000000000000000d1" as const;
const OWNER = "0x00000000000000000000000000000000000000a1" as const;

describe("useTokenBalance", () => {
    it("is pending, and the read disabled, until both the token and the owner are known", () => {
        query.current = { status: "pending", data: undefined };
        const { result } = renderHook(() => useTokenBalance(TOKEN, undefined));
        expect(result.current.read.status).toBe("pending");
        expect(query.lastOptions?.query?.enabled).toBe(false);
    });

    it("is present with the balance the chain answered", () => {
        query.current = { status: "success", data: 7n };
        const { result } = renderHook(() => useTokenBalance(TOKEN, OWNER));
        expect(result.current.read).toEqual({ status: "present", value: 7n });
        expect(query.lastOptions?.args).toEqual([OWNER]);
    });

    it("a failed read is absent, never a zero balance", () => {
        query.current = { status: "error", data: undefined };
        const { result } = renderHook(() => useTokenBalance(TOKEN, OWNER));
        expect(result.current.read.status).toBe("absent");
    });
});
