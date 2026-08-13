import { afterEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_IPFS_SERVICE,
    MAX_IPFS_DOCUMENT_BYTES,
    extractIpfsCid,
    fetchCappedContent,
    ipfsTimeoutForBytes,
    resolveContentUri,
    resolveImageUri,
} from "@/lib/shared/ipfsService";

describe("ipfsService", () => {
    describe("managed pin service (deploy-build JWT)", () => {
        afterEach(() => {
            vi.unstubAllEnvs();
            localStorage.removeItem("figaro.user-endpoints");
        });

        it("routes add to the pinning API with the bearer JWT and maps IpfsHash", async () => {
            vi.stubEnv("NEXT_PUBLIC_IPFS_PIN_SERVICE_JWT", "test-jwt");
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => ({ IpfsHash: "QmService1" }),
                text: async () => JSON.stringify({ IpfsHash: "QmService1" }),
            });
            globalThis.fetch = fetchMock;

            const result = await DEFAULT_IPFS_SERVICE.publishJSON({ hello: "world" });

            expect(result.cid).toBe("QmService1");
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe("https://api.pinata.cloud/pinning/pinFileToIPFS");
            expect(init.headers).toEqual({ Authorization: "Bearer test-jwt" });
        });

        it("a user's own node override beats the baked service", async () => {
            vi.stubEnv("NEXT_PUBLIC_IPFS_PIN_SERVICE_JWT", "test-jwt");
            localStorage.setItem(
                "figaro.user-endpoints",
                JSON.stringify({ ipfsApiUrl: "http://my-node:5001" }),
            );
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => ({ Hash: "QmMyNode1" }),
                text: async () => JSON.stringify({ Hash: "QmMyNode1" }),
            });
            globalThis.fetch = fetchMock;

            const result = await DEFAULT_IPFS_SERVICE.publishJSON({ hello: "world" });

            expect(result.cid).toBe("QmMyNode1");
            expect(String(fetchMock.mock.calls[0][0])).toBe("http://my-node:5001/api/v0/add?pin=true");
        });

        it("tolerates a scoped-key 403 on unpin (content stays pinned, flow continues)", async () => {
            vi.stubEnv("NEXT_PUBLIC_IPFS_PIN_SERVICE_JWT", "test-jwt");
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                statusText: "Forbidden",
                json: async () => ({}),
                text: async () => "",
            });
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

            await expect(DEFAULT_IPFS_SERVICE.unpin("QmGone")).resolves.toBeUndefined();
            expect(warn).toHaveBeenCalledOnce();
        });
    });

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

    describe("resolveImageUri — IPFS-only (finding 3)", () => {
        it("resolves ipfs:// and bare CIDs through the gateway", () => {
            const cid = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
            expect(resolveImageUri(`ipfs://${cid}`)).toBe(`http://127.0.0.1:8080/ipfs/${cid}`);
            expect(resolveImageUri(cid)).toBe(`http://127.0.0.1:8080/ipfs/${cid}`);
            expect(resolveImageUri(`/ipfs/${cid}`)).toBe(`http://127.0.0.1:8080/ipfs/${cid}`);
        });

        it("REJECTS raw http(s) locators — no hotlink to an attacker-chosen host", () => {
            // The deanonymization vector: an attacker-authored branding/catalogue
            // image pointing at their own server. Must never become an <img src>.
            expect(resolveImageUri("https://tracker.evil/px.png?v=victim")).toBeNull();
            expect(resolveImageUri("http://tracker.evil/px.png")).toBeNull();
        });

        it("rejects dangerous schemes and empty just like resolveContentUri", () => {
            expect(resolveImageUri("")).toBeNull();
            expect(resolveImageUri("javascript:alert(1)")).toBeNull();
            expect(resolveImageUri("data:image/png;base64,abc")).toBeNull();
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

    describe("fetchCappedContent (the download byte cap — F4 hardening)", () => {
        // Build a Response-like stub with a controllable body stream so a test
        // can prove bytes are counted (and the read aborted) OFF THE STREAM,
        // never merely trusting the declared Content-Length.
        function streamOf(
            chunks: Uint8Array[],
            onPull?: (i: number) => void,
            onCancel?: () => void,
        ): ReadableStream<Uint8Array> {
            let i = 0;
            return new ReadableStream<Uint8Array>({
                pull(controller) {
                    if (i >= chunks.length) {
                        controller.close();
                        return;
                    }
                    onPull?.(i);
                    controller.enqueue(chunks[i++]);
                },
                cancel() {
                    onCancel?.();
                },
            });
        }

        function stubResponse(opts: {
            contentLength?: number | null;
            body: ReadableStream<Uint8Array>;
            fallbackText?: string;
        }): Response {
            return {
                ok: true,
                status: 200,
                statusText: "OK",
                headers: {
                    get: (k: string) =>
                        k.toLowerCase() === "content-length" && opts.contentLength != null
                            ? String(opts.contentLength)
                            : null,
                },
                body: opts.body,
                text: async () => opts.fallbackText ?? "",
            } as unknown as Response;
        }

        it("passes a normal-size document through unchanged", async () => {
            const doc = { hello: "world", n: 42 };
            const bytes = new TextEncoder().encode(JSON.stringify(doc));
            let canceled = false;
            const res = await fetchCappedContent("ipfs://ok", {
                fetch: async () =>
                    stubResponse({
                        contentLength: bytes.length,
                        body: streamOf([bytes], undefined, () => {
                            canceled = true;
                        }),
                    }),
            });

            expect(res.ok).toBe(true);
            expect(JSON.parse(await res.text())).toEqual(doc);
            // A well-sized body is read to completion, never aborted.
            expect(canceled).toBe(false);
        });

        it("rejects early on a Content-Length over the cap WITHOUT draining the body", async () => {
            let pulled = 0;
            const chunks = Array.from({ length: 4 }, () => new Uint8Array(16));
            await expect(
                fetchCappedContent("ipfs://huge", {
                    fetch: async () =>
                        stubResponse({
                            contentLength: MAX_IPFS_DOCUMENT_BYTES + 1,
                            body: streamOf(chunks, () => {
                                pulled++;
                            }),
                        }),
                }),
            ).rejects.toThrow(/exceeds the maximum size of 8 MB/);
            // Fast-reject path: our code never iterates the reader, so the body
            // is not drained. (A ReadableStream eagerly pre-buffers at most one
            // chunk on its own; anything beyond that would mean we read it.)
            expect(pulled).toBeLessThanOrEqual(1);
        });

        const MB = 1024 * 1024;

        it("aborts mid-stream once the running byte total crosses the cap", async () => {
            const chunks = Array.from({ length: 6 }, () => new Uint8Array(300 * 1024)); // 1.75 MB
            let canceled = false;
            await expect(
                fetchCappedContent("ipfs://oversized", {
                    cap: MB, // 1 MB
                    fetch: async () =>
                        stubResponse({
                            contentLength: null, // no header at all — must count off the stream
                            body: streamOf(chunks, undefined, () => {
                                canceled = true;
                            }),
                        }),
                }),
            ).rejects.toThrow(/exceeds the maximum size of 1 MB/);
            // The reader was cancelled — the download stopped at the ceiling
            // rather than buffering all 1.75 MB.
            expect(canceled).toBe(true);
        });

        it("never trusts a lying Content-Length — a small header with an oversized body is still aborted", async () => {
            const chunks = Array.from({ length: 6 }, () => new Uint8Array(300 * 1024)); // 1.75 MB
            let canceled = false;
            await expect(
                fetchCappedContent("ipfs://liar", {
                    cap: MB, // 1 MB
                    fetch: async () =>
                        stubResponse({
                            contentLength: 10, // claims 10 bytes, delivers 1.75 MB
                            body: streamOf(chunks, undefined, () => {
                                canceled = true;
                            }),
                        }),
                }),
            ).rejects.toThrow(/exceeds the maximum size of 1 MB/);
            expect(canceled).toBe(true);
        });

        it("returns a non-OK response as { ok: false } with an empty body", async () => {
            const res = await fetchCappedContent("ipfs://missing", {
                fetch: async () =>
                    ({
                        ok: false,
                        status: 404,
                        statusText: "Not Found",
                        headers: { get: () => null },
                        text: async () => "nope",
                    }) as unknown as Response,
            });

            expect(res.ok).toBe(false);
            expect(res.status).toBe(404);
            expect(await res.text()).toBe("");
        });
    });
});