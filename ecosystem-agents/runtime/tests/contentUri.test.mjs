/**
 * A registry stores a content URI, never a promise that it is IPFS. The reader
 * serves `ipfs://` through the configured gateways, `https://` from its own
 * host, refuses any other scheme by name, and assumes no gateway.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cidOf, fetchUriBytes, fetchUriText, fetchIpfsBytes, ipfsGateways } from "../ipfsRead.mjs";

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

test("an ipfs:// URI that names no CID is refused before any gateway is asked", async () => {
    await withFetch(() => new Response("never"), async (seen) => {
        await assert.rejects(fetchUriBytes("ipfs://not a cid/../x", { gateways: ["https://gw.example"] }), /names no CID/);
        await assert.rejects(fetchUriBytes("hello", { gateways: ["https://gw.example"] }), /names no CID/);
        assert.deepEqual(seen, []);
    });
});

test("the CID parser reads each multibase by its own alphabet and refuses a path below the CID", () => {
    const v0 = `Qm${"a".repeat(44)}`;
    assert.equal(cidOf(`ipfs://${v0}`), v0);
    assert.equal(cidOf(`/ipfs/${v0}`), v0);
    assert.equal(cidOf("f01551b20" + "ab".repeat(32)), "f01551b20" + "ab".repeat(32));
    // base 58 carries capitals.
    assert.equal(cidOf("zb2rhe5P4gXftAwvA4eXQ5HJwsER2owDyS9sKaQRRVQPn93bA"), "zb2rhe5P4gXftAwvA4eXQ5HJwsER2owDyS9sKaQRRVQPn93bA");
    assert.equal(cidOf(`ipfs://${v0}/file.json`), null);
    assert.equal(cidOf("https://host.example/x"), null);
    assert.equal(cidOf("Bafy"), null);
});
