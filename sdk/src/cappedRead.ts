/**
 * cappedRead — the one size-capped read of a fetch `Response` body.
 *
 * Every body this SDK, the frontend and the agent runtime read from a host
 * a counterparty or a member chose (an offer endpoint, a DID Document, a
 * gateway answering for a member's pin) is attacker-sizable: buffering it
 * whole before measuring it lets a hostile host stream an unbounded body and
 * exhaust the reader. This read stops AT the cap: a declared Content-Length
 * over it is refused before a byte is read, and a stream that runs past it
 * is canceled the moment it does. The header is only a fast reject; the
 * byte count off the stream is the enforcement, because a host can lie about
 * or omit the header.
 */

/**
 * Read `res`'s body as bytes, at most `maxBytes` of them. Returns `null` when
 * the body is over the cap (declared or streamed) — each caller names its own
 * refusal. A response with no readable stream (an injected test double, a
 * non-stream environment) is buffered through `arrayBuffer()` or `text()` and
 * the cap enforced on what came back.
 */
export async function readCappedBytes(res: Response, maxBytes: number): Promise<Uint8Array | null> {
    const declared = Number(res.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
        await res.body?.cancel?.().catch(() => {});
        return null;
    }
    const reader = res.body?.getReader?.();
    if (!reader) {
        const bytes = typeof res.arrayBuffer === "function"
            ? new Uint8Array(await res.arrayBuffer())
            : new TextEncoder().encode(await res.text());
        return bytes.byteLength > maxBytes ? null : bytes;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel().catch(() => {});
                return null;
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock?.();
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return joined;
}
