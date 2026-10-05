/**
 * Registry-anchored documents, read through a gateway that serves whatever it
 * likes: the anchored bytes pass, anything else reads as absence. The gateway
 * here is a local server standing in for an untrusted one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalContentHash, templateCompositionHash } from "@figaro-protocol/sdk";
import { fetchAnchoredClauseSpec, fetchAnchoredTemplate } from "../anchoredContent.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_TEXT = fs.readFileSync(path.join(__dirname, "..", "..", "..", "clauses", "figaro-commerce.json"), "utf8");
const SPEC = JSON.parse(SPEC_TEXT);
const TEMPLATE = {
    agreements: [{ id: "order-0", clauses: { "figaro-commerce": {}, "figaro-topology": { parentOrderHashes: [] } } }],
};

/** A gateway serving `bodies[cid]` at /ipfs/<cid>; anything else 404s. */
async function gateway(bodies) {
    const server = http.createServer((req, res) => {
        const cid = req.url.replace(/^\/ipfs\//, "");
        if (!(cid in bodies)) { res.statusCode = 404; return res.end(); }
        res.end(bodies[cid]);
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

test("a clause spec that hashes to the registry's anchor is read", async () => {
    const gw = await gateway({ spec: SPEC_TEXT });
    try {
        const clause = { contentURI: "ipfs://spec", contentHash: canonicalContentHash(SPEC) };
        const hit = await fetchAnchoredClauseSpec(clause, { gateways: [gw.url] });
        assert.equal(hit.absent, undefined, hit.absent);
        assert.equal(hit.raw.clauseId, "figaro-commerce");
        assert.equal(hit.text, SPEC_TEXT);
    } finally { await gw.close(); }
});

test("a clause spec a gateway substituted reads as absence", async () => {
    // One field changed: valid JSON, a valid-looking spec, not the anchored one.
    const forged = JSON.stringify({ ...SPEC, description: "the gateway's own text" });
    const gw = await gateway({ spec: forged, notjson: "<html>not a spec</html>" });
    try {
        const clause = { contentURI: "ipfs://spec", contentHash: canonicalContentHash(SPEC) };
        const hit = await fetchAnchoredClauseSpec(clause, { gateways: [gw.url] });
        assert.match(hit.absent, /hashes to 0x[0-9a-f]+, the registry anchors/);
        assert.equal(hit.raw, undefined);

        const notJson = await fetchAnchoredClauseSpec({ ...clause, contentURI: "ipfs://notjson" }, { gateways: [gw.url] });
        assert.equal(notJson.absent, "not JSON");
        const missing = await fetchAnchoredClauseSpec({ ...clause, contentURI: "ipfs://missing" }, { gateways: [gw.url] });
        assert.equal(missing.absent, "not served");
    } finally { await gw.close(); }
});

test("a template that hashes to its composition hash is read; a substituted one is absence", async () => {
    const forged = { agreements: [{ ...TEMPLATE.agreements[0], clauses: { "figaro-commerce": { payment: "1" } } }] };
    const gw = await gateway({ t: JSON.stringify(TEMPLATE), forged: JSON.stringify(forged), notTemplate: "{\"x\":1}" });
    try {
        const assembly = { contentURI: "ipfs://t", compositionHash: templateCompositionHash(TEMPLATE) };
        const hit = await fetchAnchoredTemplate(assembly, { gateways: [gw.url] });
        assert.equal(hit.absent, undefined, hit.absent);
        assert.deepEqual(hit.template.agreements[0].id, "order-0");

        const swapped = await fetchAnchoredTemplate({ ...assembly, contentURI: "ipfs://forged" }, { gateways: [gw.url] });
        assert.match(swapped.absent, /the registry anchors/);
        const notTemplate = await fetchAnchoredTemplate({ ...assembly, contentURI: "ipfs://notTemplate" }, { gateways: [gw.url] });
        assert.equal(notTemplate.absent, "not an assembly template");
    } finally { await gw.close(); }
});

test("the parse strips prototype keys from an anchored document", async () => {
    // The anchor proves the registrant published these bytes, not that they
    // are harmless: a hostile template anchored under its own hash still
    // reaches no prototype.
    const hostileText = '{"agreements":[],"__proto__":{"polluted":true}}';
    const hostile = JSON.parse(hostileText);
    const gw = await gateway({ h: hostileText });
    try {
        const hit = await fetchAnchoredTemplate(
            { contentURI: "ipfs://h", compositionHash: templateCompositionHash(hostile) },
            { gateways: [gw.url] },
        );
        assert.equal(({}).polluted, undefined);
        if (!hit.absent) assert.equal(Object.prototype.hasOwnProperty.call(hit.template, "__proto__"), false);
    } finally { await gw.close(); }
});
