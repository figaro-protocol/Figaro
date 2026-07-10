import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IPFS_SERVICE, extractIpfsCid, ipfsTimeoutForBytes, resolveContentUri } from "@/lib/shared/ipfsService";

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

    it("pins an arbitrary blob (e.g. a PDF) and returns the CID", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({ Hash: "QmPdf123" }),
            text: async () => JSON.stringify({ Hash: "QmPdf123" }),
        });

        const blob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
            type: "application/pdf",
        });
        const cid = await DEFAULT_IPFS_SERVICE.pinBlob(blob);

        expect(cid).toBe("QmPdf123");
        // pinBlob skips the image-only allowlist that uploadFile enforces.
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
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

    describe("resolveContentUri (the canonical resolver)", () => {
        it("resolves ipfs://, /ipfs/, and http(s):// the same as the service method", () => {
            expect(resolveContentUri("ipfs://QmXyz123/logo.png")).toBe("http://127.0.0.1:8080/ipfs/QmXyz123/logo.png");
            expect(resolveContentUri("/ipfs/bafy123")).toBe("http://127.0.0.1:8080/ipfs/bafy123");
            expect(resolveContentUri("http://example.com/logo.png")).toBe("http://example.com/logo.png");
            expect(resolveContentUri("https://cdn.example.com/logo.png")).toBe("https://cdn.example.com/logo.png");
        });

        it("resolves bare CIDv0 / CIDv1 strings", () => {
            const cid = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
            expect(resolveContentUri(cid)).toBe(`http://127.0.0.1:8080/ipfs/${cid}`);
            expect(resolveContentUri("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")).toMatch(
                /^http:\/\/127\.0\.0\.1:8080\/ipfs\/bafy/,
            );
        });

        it("returns null for empty and unknown/dangerous schemes (RA-2)", () => {
            expect(resolveContentUri("")).toBeNull();
            expect(resolveContentUri("data:image/png;base64,abc")).toBeNull();
            expect(resolveContentUri("javascript:alert(1)")).toBeNull();
            expect(resolveContentUri("blob:http://evil.com/abc")).toBeNull();
        });
    });

    it("rejects uploads over the 5 MB size limit", async () => {
        const big = makeFile("large.png", "image/png", 6 * 1024 * 1024);
        await expect(DEFAULT_IPFS_SERVICE.uploadFile(big)).rejects.toThrow("File too large");
    });

    it("rejects uploads of disallowed MIME types", async () => {
        // text/plain and application/pdf are ALLOWED (affixable documents);
        // an archive is not.
        const zip = makeFile("payload.zip", "application/zip", 100);
        await expect(DEFAULT_IPFS_SERVICE.uploadFile(zip)).rejects.toThrow("Unsupported file type");
    });

    it("throws when the IPFS API returns a non-2xx response", async () => {
        const file = makeFile("ok.png", "image/png", 500);
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
        });

        await expect(DEFAULT_IPFS_SERVICE.uploadFile(file)).rejects.toThrow("IPFS upload failed: 500");
    });

    it("throws when the IPFS API returns an empty CID", async () => {
        const file = makeFile("ok.png", "image/png", 500);
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ Hash: "" }),
            text: async () => JSON.stringify({ Hash: "" }),
        });

        await expect(DEFAULT_IPFS_SERVICE.uploadFile(file)).rejects.toThrow("IPFS upload returned no CID");
    });

    describe("ipfsTimeoutForBytes (size-aware request timeout)", () => {
        const MB = 1024 * 1024;

        it("keeps the 8s floor for a tiny agreement-JSON pin", () => {
            // A few KB adds a sub-millisecond allowance — effectively the floor.
            expect(ipfsTimeoutForBytes(2 * 1024)).toBeGreaterThanOrEqual(8000);
            expect(ipfsTimeoutForBytes(2 * 1024)).toBeLessThan(8100);
        });

        it("scales the budget for a multi-MB media upload", () => {
            // 5 MB (MAX_FILE_SIZE) gets the floor plus 5× the per-MB allowance.
            expect(ipfsTimeoutForBytes(5 * MB)).toBe(8000 + 5 * 8000);
            // Strictly more headroom than the floor that was aborting it before.
            expect(ipfsTimeoutForBytes(5 * MB)).toBeGreaterThan(ipfsTimeoutForBytes(0));
        });

        it("is monotonic in payload size", () => {
            expect(ipfsTimeoutForBytes(MB)).toBeGreaterThan(ipfsTimeoutForBytes(0));
            expect(ipfsTimeoutForBytes(4 * MB)).toBeGreaterThan(ipfsTimeoutForBytes(MB));
        });

        it("clamps at the MAX_FILE_SIZE budget so an uncapped blob can't hang forever", () => {
            const capped = ipfsTimeoutForBytes(5 * MB); // MAX_FILE_SIZE
            expect(capped).toBe(8000 + 5 * 8000);
            // pinBlob has no size cap — anything past the ceiling stays clamped.
            expect(ipfsTimeoutForBytes(50 * MB)).toBe(capped);
            expect(ipfsTimeoutForBytes(500 * MB)).toBe(capped);
        });
    });

    describe("unpin (the erasure half of pin)", () => {
        it("POSTs pin/rm for the CID", async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => ({ Pins: ["QmGone"] }),
                text: async () => JSON.stringify({ Pins: ["QmGone"] }),
            });

            await DEFAULT_IPFS_SERVICE.unpin("QmGone");

            const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
            expect(url).toBe("http://127.0.0.1:5001/api/v0/pin/rm?arg=QmGone");
            expect(init.method).toBe("POST");
        });

        it("treats an already-absent pin as success (erasing an absence is absence)", async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
                json: async () => ({ Message: "not pinned or pinned indirectly" }),
                text: async () => JSON.stringify({ Message: "not pinned or pinned indirectly" }),
            });

            await expect(DEFAULT_IPFS_SERVICE.unpin("QmAbsent")).resolves.toBeUndefined();
        });

        it("throws on any other node failure", async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
                json: async () => ({ Message: "some other failure" }),
                text: async () => JSON.stringify({ Message: "some other failure" }),
            });

            await expect(DEFAULT_IPFS_SERVICE.unpin("QmBroken")).rejects.toThrow("IPFS unpin failed");
        });
    });

    describe("extractIpfsCid (the erasure path's admission check)", () => {
        it("extracts the bare CID from every IPFS URI shape", () => {
            expect(extractIpfsCid("ipfs://QmAbc123")).toBe("QmAbc123");
            expect(extractIpfsCid("ipfs://QmAbc123/logo.png")).toBe("QmAbc123");
            expect(extractIpfsCid("/ipfs/bafyAbc")).toBe("bafyAbc");
            expect(extractIpfsCid("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG")).toBe(
                "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
            );
        });

        it("returns null for http(s) and unrecognised schemes — only IPFS content is unpinnable", () => {
            expect(extractIpfsCid("https://example.com/file.json")).toBeNull();
            expect(extractIpfsCid("data:image/png;base64,abc")).toBeNull();
            expect(extractIpfsCid("")).toBeNull();
            expect(extractIpfsCid("not-a-uri")).toBeNull();
        });
    });

    it("accepts every allowed image MIME type", async () => {
        const types = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ Hash: "QmValid" }),
            text: async () => JSON.stringify({ Hash: "QmValid" }),
        });

        for (const type of types) {
            const file = makeFile("test", type, 100);
            const result = await DEFAULT_IPFS_SERVICE.uploadFile(file);
            expect(result.cid).toBe("QmValid");
        }
    });
});