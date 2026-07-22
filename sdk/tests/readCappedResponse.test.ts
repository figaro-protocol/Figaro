import { describe, it, expect } from "vitest";
import { readCappedResponseText, MAX_OFFER_RESPONSE_BYTES } from "../src/agent/httpChannel.js";

/**
 * Regression for the unbounded offer-endpoint read (frontend security audit
 * 2026-07-22, finding 6). The endpoint is a counterparty's advertised URL, so a
 * hostile candidate could stream an unbounded body and OOM the reader before any
 * verification runs. The cap must reject both an over-declared Content-Length and
 * a body that streams past the ceiling.
 */
describe("readCappedResponseText", () => {
    it("reads a normal small body", async () => {
        const res = new Response("hello world");
        expect(await readCappedResponseText(res)).toBe("hello world");
    });

    it("rejects an over-declared Content-Length up front", async () => {
        const res = {
            headers: { get: (k: string) => (k.toLowerCase() === "content-length" ? String(MAX_OFFER_RESPONSE_BYTES + 1) : null) },
            text: async () => "should not be read",
        } as unknown as Response;
        await expect(readCappedResponseText(res)).rejects.toThrow(/cap/);
    });

    it("aborts a body that streams past the cap", async () => {
        // A stream that keeps emitting 1 MB chunks well past the ceiling.
        let emitted = 0;
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                if (emitted > MAX_OFFER_RESPONSE_BYTES + 4 * 1024 * 1024) {
                    controller.close();
                    return;
                }
                const chunk = new Uint8Array(1024 * 1024); // 1 MB
                emitted += chunk.byteLength;
                controller.enqueue(chunk);
            },
        });
        const res = { headers: { get: () => null }, body: stream } as unknown as Response;
        await expect(readCappedResponseText(res, 8 * 1024 * 1024)).rejects.toThrow(/cap/);
    });

    it("caps a non-stream fallback body too", async () => {
        const big = "x".repeat(10);
        const res = { headers: { get: () => null }, text: async () => big } as unknown as Response;
        await expect(readCappedResponseText(res, 5)).rejects.toThrow(/cap/);
    });
});
