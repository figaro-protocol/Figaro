import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";

describe("ipfsService", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    function makeFile(name: string, type: string, sizeBytes: number): File {
        const buf = new ArrayBuffer(sizeBytes);
        return new File([buf], name, { type });
    }

    it("publishes JSON and returns CID plus URI variants", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({ Hash: "QmJson123" }),
            text: async () => JSON.stringify({ Hash: "QmJson123" }),
        });

        const result = await DEFAULT_IPFS_SERVICE.publishJSON({ hello: "world" });

        expect(result).toEqual({
            cid: "QmJson123",
            uri: "ipfs://QmJson123",
            path: "/ipfs/QmJson123",
            gatewayUrl: "http://127.0.0.1:8080/ipfs/QmJson123",
        });
    });

    it("uploads a valid file and returns CID plus URI variants", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({ Hash: "QmFile123" }),
            text: async () => JSON.stringify({ Hash: "QmFile123" }),
        });

        const result = await DEFAULT_IPFS_SERVICE.uploadFile(
            makeFile("photo.jpg", "image/jpeg", 1024),
        );

        expect(result.cid).toBe("QmFile123");
        expect(result.uri).toBe("ipfs://QmFile123");
        expect(result.path).toBe("/ipfs/QmFile123");
    });

    it("resolves ipfs, gateway-path, and http URIs for retrieval", () => {
        expect(DEFAULT_IPFS_SERVICE.resolveFetchUrl("ipfs://bafy123")).toBe(
            "http://127.0.0.1:8080/ipfs/bafy123",
        );
        expect(DEFAULT_IPFS_SERVICE.resolveFetchUrl("/ipfs/bafy123")).toBe(
            "http://127.0.0.1:8080/ipfs/bafy123",
        );
        expect(DEFAULT_IPFS_SERVICE.resolveFetchUrl("https://example.com/file.json")).toBe(
            "https://example.com/file.json",
        );
        expect(DEFAULT_IPFS_SERVICE.resolveFetchUrl("not-a-uri")).toBeNull();
    });
});