/**
 * A registry stores a content URI, never a promise that it is IPFS. The reader
 * serves `ipfs://` through the configured gateways, `https://` from its own
 * host, refuses any other scheme by name, and assumes no gateway.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUriBytes, fetchUriText, fetchIpfsBytes, ipfsGateways } from "../ipfsRead.mjs";

/** Run `fn` with `fetch` answering every request from `answer(url)`. */
async function withFetch(answer, fn) {
    const real = globalThis.fetch;
    const seen = [];
    globalThis.fetch = async (url) => { seen.push(String(url)); return answer(String(url)); };
    try { return await fn(seen); } finally { globalThis.fetch = real; }
}

test("an https:// URI is read from its own host, never through an IPFS gateway", async () => {
    await withFetch(() => new Response("profile bytes"), async (seen) => {
        const text = await fetchUriText("https://profiles.example/member.json", { gateways: ["https://gw.example"] });
        assert.equal(text, "profile bytes");
        assert.deepEqual(seen, ["https://profiles.example/member.json"]);
    });
});

test("an ipfs:// URI is read through the configured gateway", async () => {
    await withFetch(() => new Response("pinned"), async (seen) => {
        const bytes = await fetchUriBytes("ipfs://bafyexample", { gateways: ["https://gw.example"] });
        assert.equal(new TextDecoder().decode(bytes), "pinned");
        assert.deepEqual(seen, ["https://gw.example/ipfs/bafyexample"]);
    });
});

test("an https:// URI its host cannot resolve is absence, not an error", async () => {
    await withFetch(() => new Response("", { status: 404 }), async () => {
        assert.equal(await fetchUriBytes("https://profiles.example/gone.json"), null);
    });
});

test("a scheme the reader does not fetch is refused by name", async () => {
    await assert.rejects(fetchUriBytes("ar://some-arweave-tx"), /the ar scheme is not one this reader fetches/);
});

test("no gateway is assumed: an unconfigured host reads no ipfs:// content and says so", async () => {
    assert.deepEqual(ipfsGateways({}), []);
    await assert.rejects(fetchIpfsBytes("bafyexample", { gateways: ipfsGateways({}) }), /no IPFS gateway configured/);
});
