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
import { keccak256, toBytes } from "viem";
import { agreementKeyOf, canonicalize, assemblyCompositionHash } from "@figaro-protocol/sdk";
import { fetchAnchoredClauseSpec, fetchAnchoredComposedAgreement, fetchAnchoredAssembly } from "../anchoredContent.mjs";
import { fetchIpfsBytes } from "../ipfsRead.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The bytes a clause is pinned as — its canonical serialization — and its key,
// keccak256 of exactly those bytes.
const SPEC = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "clauses", "figaro-commerce.json"), "utf8"));
const SPEC_TEXT = canonicalize(SPEC);
const SPEC_KEY = keccak256(toBytes(SPEC_TEXT));
const COMMERCE = SPEC_KEY;
const TOPOLOGY = `0x${"7c".repeat(32)}`;
const COMPOSED = { name: "One order", clauses: { [COMMERCE]: {}, [TOPOLOGY]: {} } };
const ASSEMBLY = {
    agreements: [{ id: "order-0", agreementKey: agreementKeyOf(COMPOSED), clauses: { [TOPOLOGY]: { parentOrderHashes: [] } } }],
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

test("a clause spec whose fetched bytes hash to its key is read", async () => {
    const gw = await gateway({ spec: SPEC_TEXT });
    try {
        const clause = { contentURI: "ipfs://spec", clauseKey: SPEC_KEY };
        const hit = await fetchAnchoredClauseSpec(clause, { gateways: [gw.url] });
        assert.equal(hit.absent, undefined, hit.absent);
        assert.equal(hit.raw.clauseId, "figaro-commerce");
        assert.equal(hit.text, SPEC_TEXT);
    } finally { await gw.close(); }
});

test("a clause spec a gateway substituted reads as absence", async () => {
    // One field changed: valid JSON, a valid-looking spec, not the anchored one.
    const forged = canonicalize({ ...SPEC, description: "the gateway's own text" });
    // The same document in another byte form is other bytes: another key.
    const reformatted = JSON.stringify(SPEC, null, 2);
    const gw = await gateway({ spec: forged, pretty: reformatted, notjson: "<html>not a spec</html>" });
    try {
        const clause = { contentURI: "ipfs://spec", clauseKey: SPEC_KEY };
        const hit = await fetchAnchoredClauseSpec(clause, { gateways: [gw.url] });
        assert.match(hit.absent, /bytes hash to 0x[0-9a-f]+, not the clause key/);
        assert.equal(hit.raw, undefined);
        const pretty = await fetchAnchoredClauseSpec({ ...clause, contentURI: "ipfs://pretty" }, { gateways: [gw.url] });
        assert.match(pretty.absent, /not the clause key/);

        const notJsonText = "<html>not a spec</html>";
        const notJson = await fetchAnchoredClauseSpec({ contentURI: "ipfs://notjson", clauseKey: keccak256(toBytes(notJsonText)) }, { gateways: [gw.url] });
        assert.equal(notJson.absent, "not JSON");
        const missing = await fetchAnchoredClauseSpec({ ...clause, contentURI: "ipfs://missing" }, { gateways: [gw.url] });
        assert.equal(missing.absent, "not served");
    } finally { await gw.close(); }
});

test("a assembly that hashes to its composition hash is read; a substituted one is absence", async () => {
    const forged = { agreements: [{ ...ASSEMBLY.agreements[0], clauses: { [TOPOLOGY]: { parentOrderHashes: ["order-9"] } } }] };
    const gw = await gateway({ t: JSON.stringify(ASSEMBLY), forged: JSON.stringify(forged), notAssembly: "{\"x\":1}" });
    try {
        const assembly = { contentURI: "ipfs://t", compositionHash: assemblyCompositionHash(ASSEMBLY) };
        const hit = await fetchAnchoredAssembly(assembly, { gateways: [gw.url] });
        assert.equal(hit.absent, undefined, hit.absent);
        assert.deepEqual(hit.assembly.agreements[0].id, "order-0");

        const swapped = await fetchAnchoredAssembly({ ...assembly, contentURI: "ipfs://forged" }, { gateways: [gw.url] });
        assert.match(swapped.absent, /the registry anchors/);
        const notAssembly = await fetchAnchoredAssembly({ ...assembly, contentURI: "ipfs://notAssembly" }, { gateways: [gw.url] });
        assert.equal(notAssembly.absent, "not an assembly");
    } finally { await gw.close(); }
});

test("a registered agreement whose { clauses } key to its agreement key is read, editorial prose aside; another is absence", async () => {
    const forged = { ...COMPOSED, clauses: { ...COMPOSED.clauses, [COMMERCE]: { payment: "1" } } };
    const gw = await gateway({
        g: JSON.stringify(COMPOSED), renamed: JSON.stringify({ ...COMPOSED, name: "Renamed" }),
        forged: JSON.stringify(forged), notAgreement: "{\"x\":1}",
    });
    try {
        const agreement = { contentURI: "ipfs://g", agreementKey: agreementKeyOf(COMPOSED) };
        const hit = await fetchAnchoredComposedAgreement(agreement, { gateways: [gw.url] });
        assert.equal(hit.absent, undefined, hit.absent);
        assert.deepEqual(hit.composed.clauses, COMPOSED.clauses);
        const renamed = await fetchAnchoredComposedAgreement({ ...agreement, contentURI: "ipfs://renamed" }, { gateways: [gw.url] });
        assert.equal(renamed.absent, undefined, renamed.absent);

        const swapped = await fetchAnchoredComposedAgreement({ ...agreement, contentURI: "ipfs://forged" }, { gateways: [gw.url] });
        assert.match(swapped.absent, /the registry anchors/);
        const notAgreement = await fetchAnchoredComposedAgreement({ ...agreement, contentURI: "ipfs://notAgreement" }, { gateways: [gw.url] });
        assert.equal(notAgreement.absent, "not a registered agreement");
        const missing = await fetchAnchoredComposedAgreement({ ...agreement, contentURI: "ipfs://missing" }, { gateways: [gw.url] });
        assert.equal(missing.absent, "not served");
    } finally { await gw.close(); }
});

test("the parse strips prototype keys from an anchored document", async () => {
    // The anchor proves the registrant published these bytes, not that they
    // are harmless: a hostile assembly anchored under its own hash still
    // reaches no prototype.
    const hostileText = '{"agreements":[],"__proto__":{"polluted":true}}';
    const hostile = JSON.parse(hostileText);
    const gw = await gateway({ h: hostileText });
    try {
        const hit = await fetchAnchoredAssembly(
            { contentURI: "ipfs://h", compositionHash: assemblyCompositionHash(hostile) },
            { gateways: [gw.url] },
        );
        assert.equal(({}).polluted, undefined);
        if (!hit.absent) assert.equal(Object.prototype.hasOwnProperty.call(hit.assembly, "__proto__"), false);
    } finally { await gw.close(); }
});

test("a gateway body past the size cap is cut off AT the cap, never buffered whole", async () => {
    // A permissionless registrant can point a clause at any CID, and the
    // analyst fetches every clause on every sync: a gateway serving an
    // endless body must cost the reader the cap, not its memory.
    const CAP = 64 * 1024;
    const CHUNK = Buffer.alloc(16 * 1024, 0x61);
    let written = 0;
    let finished = null;
    const server = http.createServer((req, res) => {
        if (req.url.endsWith("/declared")) {
            res.writeHead(200, { "content-length": String(10 * 1024 * 1024 * 1024) });
            res.write(CHUNK);
            return; // never ends: the declared length alone must refuse it
        }
        res.writeHead(200); // chunked: no declared length to refuse on
        const pump = () => {
            while (!res.destroyed && written < 512 * 1024 * 1024) {
                written += CHUNK.length;
                if (!res.write(CHUNK)) return res.once("drain", pump);
            }
        };
        res.on("close", () => { finished = written; });
        pump();
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const gw = `http://127.0.0.1:${server.address().port}`;
    try {
        await assert.rejects(fetchIpfsBytes("endless", { gateways: [gw], maxBytes: CAP }), /more than the 65536-byte cap/);
        while (finished === null) await new Promise((r) => setTimeout(r, 10));
        // The socket closes within a few socket buffers of the cap, nowhere
        // near the 512 MiB the server was ready to send.
        assert.ok(finished < 16 * 1024 * 1024, `the reader drew ${finished} bytes before stopping`);
        await assert.rejects(fetchIpfsBytes("declared", { gateways: [gw], maxBytes: CAP }), /more than the 65536-byte cap/);
    } finally {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
    }
});
