/**
 * A keyed JSON-RPC endpoint on loopback, shared by the sandbox tests: the
 * portable proxy tests (sandboxPortable.test.mjs) and the macOS-only launcher
 * tests (sandbox.test.mjs).
 */

import * as http from "node:http";

/** A JSON-RPC endpoint on loopback whose path carries a key, as a provider's
 *  does: it answers only on the keyed path and keeps every path it saw. */
export const RPC_KEY = "AbCdEfGh1234567890ijklMN";
export async function keyedRpcStub() {
    const seen = [];
    const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
            seen.push(req.url);
            if (req.url !== `/v3/${RPC_KEY}`) { res.writeHead(401).end(); return; }
            const call = JSON.parse(body);
            const answer = (one) => ({
                jsonrpc: "2.0",
                id: one.id,
                ...({ eth_chainId: { result: "0xaa36a7" }, eth_blockNumber: { result: "0x1" }, eth_getLogs: { result: [] } }[one.method]
                    ?? { error: { code: -32601, message: "method not found" } }),
            });
            const out = Array.isArray(call) ? call.map(answer) : answer(call);
            res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
        });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { seen, origin, keyedUrl: `${origin}/v3/${RPC_KEY}`, close: () => new Promise((r) => server.close(r)) };
}
