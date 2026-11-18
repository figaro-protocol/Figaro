/**
 * useProcessAgreementReads — the read of each committed agreement, in the
 * three states of a network read (docs/OPEN_WORLD.md § 1): pending while the
 * fetch is in flight, absent once it failed or found no agreement that hashes
 * to the checkoutHash, present with the agreement once it loaded. The audit
 * page lists an absent agreement as lacking and shows a loading line for a
 * pending one, so the two are never folded together.
 */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ABSENT, present, type NetworkRead } from "@/lib/shared/networkRead";

const m = vi.hoisted(() => ({
    fetch: vi.fn(),
}));
vi.mock("@/lib/core/agreementFetch", () => ({ fetchAgreement: (hash: string) => m.fetch(hash) }));

import { useProcessAgreementReads, useProcessAgreements } from "@/hooks/useProcessAgreements";

const LOADS = `0x${"a1".repeat(32)}`;
const FAILS = `0x${"f0".repeat(32)}`;
const ZERO = `0x${"00".repeat(32)}`;
const AGREEMENT = { clauses: [] };

/** A fetch the test settles by hand. */
function deferred() {
    let settle: (read: NetworkRead<unknown>) => void = () => undefined;
    const promise = new Promise<NetworkRead<unknown>>((r) => { settle = r; });
    return { promise, settle };
}

describe("useProcessAgreementReads", () => {
    beforeEach(() => {
        delete (window as unknown as { __FIGARO_AGREEMENT_STORE__?: unknown }).__FIGARO_AGREEMENT_STORE__;
        m.fetch.mockReset();
    });
    afterEach(() => {
        delete (window as unknown as { __FIGARO_AGREEMENT_STORE__?: unknown }).__FIGARO_AGREEMENT_STORE__;
    });

    it("pending while the fetch is in flight, then present or absent by its answer", async () => {
        const loads = deferred();
        const fails = deferred();
        m.fetch.mockImplementation((hash: string) => (hash === LOADS ? loads.promise : fails.promise));
        const { result } = renderHook(() => useProcessAgreementReads([LOADS, FAILS]));
        expect(result.current.get(LOADS)?.status).toBe("pending");
        expect(result.current.get(FAILS)?.status).toBe("pending");

        await act(async () => { loads.settle(present(AGREEMENT)); });
        await waitFor(() => expect(result.current.get(LOADS)).toEqual(present(AGREEMENT)));
        expect(result.current.get(FAILS)?.status).toBe("pending");

        await act(async () => { fails.settle(ABSENT); });
        await waitFor(() => expect(result.current.get(FAILS)?.status).toBe("absent"));
    });

    it("a hash that failed before reads pending, never absent, while its retry is in flight, then present", async () => {
        // The shared store holds the hash as failed, from an earlier consumer's fetch.
        (window as unknown as { __FIGARO_AGREEMENT_STORE__?: unknown }).__FIGARO_AGREEMENT_STORE__ = {
            cache: new Map(), inflight: new Set(), failed: new Set([FAILS]), subscribers: new Set(),
        };
        const retry = deferred();
        m.fetch.mockImplementation(() => retry.promise);
        const seen: string[] = [];
        const { result } = renderHook(() => {
            const reads = useProcessAgreementReads([FAILS]);
            seen.push(reads.get(FAILS)?.status ?? "none");
            return reads;
        });
        expect(m.fetch).toHaveBeenCalledTimes(1);
        expect(result.current.get(FAILS)?.status).toBe("pending");
        expect(seen).not.toContain("absent");

        await act(async () => { retry.settle(present(AGREEMENT)); });
        await waitFor(() => expect(result.current.get(FAILS)).toEqual(present(AGREEMENT)));
        expect(seen).not.toContain("absent");
    });

    it("an answer lands in the store after the asking component unmounted, and a second consumer reads it", async () => {
        const slow = deferred();
        m.fetch.mockImplementation(() => slow.promise);
        const first = renderHook(() => useProcessAgreementReads([LOADS]));
        expect(first.result.current.get(LOADS)?.status).toBe("pending");
        first.unmount();

        await act(async () => { slow.settle(present(AGREEMENT)); });
        const second = renderHook(() => useProcessAgreementReads([LOADS]));
        expect(second.result.current.get(LOADS)).toEqual(present(AGREEMENT));
        // The second consumer found it in the store: one fetch in all.
        expect(m.fetch).toHaveBeenCalledTimes(1);
    });

    it("a zero checkoutHash names no agreement: absent, and nothing is fetched", () => {
        const { result } = renderHook(() => useProcessAgreementReads([ZERO]));
        expect(result.current.get(ZERO)?.status).toBe("absent");
        expect(m.fetch).not.toHaveBeenCalled();
    });

    it("a changed list of hashes: the hash it adds is fetched once and reads pending until its answer, never absent from an earlier failure; the hash it keeps is not fetched again", async () => {
        // The shared store holds FAILS as failed, from an earlier consumer's fetch.
        (window as unknown as { __FIGARO_AGREEMENT_STORE__?: unknown }).__FIGARO_AGREEMENT_STORE__ = {
            cache: new Map(), inflight: new Set(), failed: new Set([FAILS]), subscribers: new Set(),
        };
        const retry = deferred();
        m.fetch.mockImplementation(async (hash: string) => (hash === LOADS ? present(AGREEMENT) : retry.promise));
        const seen: string[] = [];
        const { result, rerender } = renderHook(({ hashes }: { hashes: string[] }) => {
            const reads = useProcessAgreementReads(hashes);
            seen.push(reads.get(FAILS)?.status ?? "none");
            return reads;
        }, { initialProps: { hashes: [LOADS] } });
        await waitFor(() => expect(result.current.get(LOADS)).toEqual(present(AGREEMENT)));

        rerender({ hashes: [LOADS, FAILS] });
        expect(result.current.get(FAILS)?.status).toBe("pending");
        expect(result.current.get(LOADS)).toEqual(present(AGREEMENT));
        expect(seen).not.toContain("absent");
        expect(m.fetch.mock.calls.map(([h]) => h)).toEqual([LOADS, FAILS]);

        await act(async () => { retry.settle(present(AGREEMENT)); });
        await waitFor(() => expect(result.current.get(FAILS)).toEqual(present(AGREEMENT)));
        expect(seen).not.toContain("absent");
        // A list that only reorders the same hashes asks for nothing.
        rerender({ hashes: [FAILS, LOADS] });
        expect(m.fetch).toHaveBeenCalledTimes(2);
    });

    it("two consumers mounted together share one fetch per hash and read the same answer", async () => {
        const slow = deferred();
        m.fetch.mockImplementation(() => slow.promise);
        const { result } = renderHook(() => ({
            a: useProcessAgreementReads([LOADS]),
            b: useProcessAgreementReads([LOADS]),
        }));
        expect(result.current.a.get(LOADS)?.status).toBe("pending");
        expect(result.current.b.get(LOADS)?.status).toBe("pending");
        expect(m.fetch).toHaveBeenCalledTimes(1);

        await act(async () => { slow.settle(present(AGREEMENT)); });
        await waitFor(() => expect(result.current.a.get(LOADS)).toEqual(present(AGREEMENT)));
        expect(result.current.b.get(LOADS)).toEqual(present(AGREEMENT));
        expect(m.fetch).toHaveBeenCalledTimes(1);
    });

    it("under StrictMode's double effects: one fetch, the answer reaches the consumer, and unmounting leaves no subscriber", async () => {
        const slow = deferred();
        m.fetch.mockImplementation(() => slow.promise);
        const { result, unmount } = renderHook(() => useProcessAgreementReads([LOADS]), { wrapper: StrictMode });
        expect(result.current.get(LOADS)?.status).toBe("pending");
        expect(m.fetch).toHaveBeenCalledTimes(1);

        await act(async () => { slow.settle(present(AGREEMENT)); });
        await waitFor(() => expect(result.current.get(LOADS)).toEqual(present(AGREEMENT)));
        unmount();
        const store = (window as unknown as { __FIGARO_AGREEMENT_STORE__: { subscribers: Set<unknown> } }).__FIGARO_AGREEMENT_STORE__;
        expect(store.subscribers.size).toBe(0);
    });

    it("the agreements map holds only the loaded agreements", async () => {
        m.fetch.mockImplementation(async (hash: string) => (hash === LOADS ? present(AGREEMENT) : ABSENT));
        const { result } = renderHook(() => ({
            reads: useProcessAgreementReads([LOADS, FAILS]),
            agreements: useProcessAgreements([LOADS, FAILS]),
        }));
        await waitFor(() => expect(result.current.reads.get(FAILS)?.status).toBe("absent"));
        expect(result.current.agreements.get(LOADS)).toEqual(AGREEMENT);
        expect(result.current.agreements.has(FAILS)).toBe(false);
    });
});
