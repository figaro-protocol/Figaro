import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ipfsGatewayURL, ipfsURI, pinJSON } from "@/lib/dispute/ipfsPin";
import { uploadFileToIPFS } from "@/lib/shared/ipfsUpload";

describe("ipfsUpload", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    function makeFile(name: string, type: string, sizeBytes: number): File {
        const buf = new ArrayBuffer(sizeBytes);
        return new File([buf], name, { type });
    }

    it("rejects files over 5 MB", async () => {
        const big = makeFile("large.png", "image/png", 6 * 1024 * 1024);
        await expect(uploadFileToIPFS(big)).rejects.toThrow("File too large");
    });

    it("rejects disallowed MIME types", async () => {
        const txt = makeFile("test.txt", "text/plain", 100);
        await expect(uploadFileToIPFS(txt)).rejects.toThrow("Unsupported file type");
    });

    it("uploads a valid image and returns ipfs:// URI", async () => {
        const file = makeFile("photo.jpg", "image/jpeg", 1024);
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ Hash: "QmTestPhoto123" }),
            text: async () => JSON.stringify({ Hash: "QmTestPhoto123" }),
        });

        const uri = await uploadFileToIPFS(file);
        expect(uri).toBe("ipfs://QmTestPhoto123");
        expect(globalThis.fetch).toHaveBeenCalledOnce();
    });

    it("throws on IPFS API failure", async () => {
        const file = makeFile("ok.png", "image/png", 500);
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
        });

        await expect(uploadFileToIPFS(file)).rejects.toThrow("IPFS upload failed: 500");
    });

    it("throws when IPFS returns no CID", async () => {
        const file = makeFile("ok.png", "image/png", 500);
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ Hash: "" }),
            text: async () => JSON.stringify({ Hash: "" }),
        });

        await expect(uploadFileToIPFS(file)).rejects.toThrow("IPFS upload returned no CID");
    });

    it("accepts all allowed image MIME types", async () => {
        const types = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ Hash: "QmValid" }),
            text: async () => JSON.stringify({ Hash: "QmValid" }),
        });

        for (const type of types) {
            const file = makeFile("test", type, 100);
            const uri = await uploadFileToIPFS(file);
            expect(uri).toBe("ipfs://QmValid");
        }
    });

    it("uses an injected IPFS service for upload and dispute helper compatibility wrappers", async () => {
        const service = {
            uploadFile: vi.fn().mockResolvedValue({ uri: "ipfs://QmInjected", cid: "QmInjected" }),
            pinJSON: vi.fn().mockResolvedValue("QmPinned"),
            buildPath: vi.fn().mockReturnValue("/ipfs/QmPinned"),
            buildGatewayUrl: vi.fn().mockReturnValue("http://gateway.test/ipfs/QmPinned"),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        const file = makeFile("photo.jpg", "image/jpeg", 1024);

        await expect(uploadFileToIPFS(file, { service })).resolves.toBe("ipfs://QmInjected");
        await expect(pinJSON({ ok: true }, { service })).resolves.toBe("QmPinned");
        expect(ipfsURI("QmPinned", { service })).toBe("/ipfs/QmPinned");
        expect(ipfsGatewayURL("QmPinned", { service })).toBe("http://gateway.test/ipfs/QmPinned");
        expect(service.uploadFile).toHaveBeenCalledWith(file);
        expect(service.pinJSON).toHaveBeenCalledWith({ ok: true });
        expect(service.buildPath).toHaveBeenCalledWith("QmPinned");
        expect(service.buildGatewayUrl).toHaveBeenCalledWith("QmPinned");
    });
});
