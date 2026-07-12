import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCommitmentPayloadJsonByCid } from "@/lib/checkout/orderPendingSellerSignature";

describe("fetchCommitmentPayloadJsonByCid", () => {
    const ORIGINAL_FETCH = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = ORIGINAL_FETCH;
    });

    it("resolves the CID through the IPFS service and returns the body text", async () => {
        const resolveFetchUrl = vi.fn().mockReturnValue("http://gateway/ipfs/QmExampleCid");
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue('{"hello":"world"}'),
        } as unknown as Response);
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await fetchCommitmentPayloadJsonByCid({ resolveFetchUrl }, "QmExampleCid");

        expect(resolveFetchUrl).toHaveBeenCalledWith("ipfs://QmExampleCid");
        // The size-capped fetch (F4) passes an abort signal alongside the URL.
        expect(fetchMock).toHaveBeenCalledWith(
            "http://gateway/ipfs/QmExampleCid",
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        expect(result).toBe('{"hello":"world"}');
    });

    it("throws naming the cap when the gateway declares an oversized body (F4)", async () => {
        const resolveFetchUrl = vi.fn().mockReturnValue("http://gateway/ipfs/QmExampleCid");
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            headers: { get: () => String(9 * 1024 * 1024) }, // Content-Length over the 8 MB cap
            text: vi.fn().mockResolvedValue("{}"),
        } as unknown as Response);
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(
            fetchCommitmentPayloadJsonByCid({ resolveFetchUrl }, "QmExampleCid"),
        ).rejects.toThrow(/exceeds the maximum size of 8 MB/);
    });

    it("throws when the IPFS service cannot resolve the CID", async () => {
        const resolveFetchUrl = vi.fn().mockReturnValue(null);

        await expect(
            fetchCommitmentPayloadJsonByCid({ resolveFetchUrl }, "QmExampleCid"),
        ).rejects.toThrow(/QmExampleCid/);
    });

    it("throws when the gateway responds with a non-ok status", async () => {
        const resolveFetchUrl = vi.fn().mockReturnValue("http://gateway/ipfs/QmExampleCid");
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 504,
            statusText: "Gateway Timeout",
        } as unknown as Response);
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(
            fetchCommitmentPayloadJsonByCid({ resolveFetchUrl }, "QmExampleCid"),
        ).rejects.toThrow(/504/);
    });
});
