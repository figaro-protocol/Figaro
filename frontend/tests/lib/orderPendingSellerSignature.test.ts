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
        expect(fetchMock).toHaveBeenCalledWith("http://gateway/ipfs/QmExampleCid");
        expect(result).toBe('{"hello":"world"}');
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
