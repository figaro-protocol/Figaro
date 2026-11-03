/**
 * mockAwareHttp — an RPC the live transport cannot reach is an error, never
 * an answer. Empty logs, a zero gas limit or a zero balance are things a
 * chain could say; returning them for a node that said nothing would hand
 * every reader a fabricated `present`. The error reaches the reader, whose
 * read is then `absent`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAwareHttp } from "@/lib/shared/mockTransport";
import { readNetwork } from "@/lib/shared/networkRead";

const RPC_URL = "http://127.0.0.1:8545";

beforeEach(() => {
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
    // The node is down: every fetch fails at the network layer.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
});

function liveTransport() {
    return mockAwareHttp(RPC_URL, { retryCount: 0 })({ chain: undefined, retryCount: 0 });
}

describe("mockAwareHttp — an unreachable RPC is an error", () => {
    it.each([
        ["eth_getLogs", [{ fromBlock: "0x0", toBlock: "0x1" }]],
        ["eth_getBalance", ["0x70997970c51812dc3a010c7d01b50e0d17dc79c8", "latest"]],
        ["eth_getBlockByNumber", ["latest", false]],
        ["eth_blockNumber", []],
        ["eth_call", [{ to: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8", data: "0x" }, "latest"]],
    ])("%s rejects instead of answering", async (method, params) => {
        await expect(liveTransport().request({ method, params } as never)).rejects.toThrow();
    });

    it("a reader of the unreachable node gets absent", async () => {
        const read = await readNetwork("test", () => liveTransport().request({ method: "eth_getLogs", params: [{}] } as never));
        expect(read).toEqual({ status: "absent" });
    });
});
