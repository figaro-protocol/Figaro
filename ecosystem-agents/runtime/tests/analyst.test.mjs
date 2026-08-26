/**
 * The analyst's four steps, tested where each can be tested without a chain:
 * the content-address derivation (step 2), the projections and queries over a
 * fixture corpus (steps 3 and 4), the wire's shapes, and the two honesty
 * properties the service exists to keep — absence answered as absence, and a
 * /prompt endpoint that is ABSENT rather than stubbed when no model is
 * configured.
 *
 * The model-loop leg runs against a stub transport (the loop's own protocol
 * handling, no network) and, when ANTHROPIC_API_KEY + ANTHROPIC_MODEL are both
 * set, against the real API. Absent either, the live leg SKIPS with its reason
 * stated — it is never faked.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { keccak256 } from "viem";
import { computeAgreementHash } from "@figaro-protocol/sdk";
import {
    projectProcessGraph, projectSettlementGraph, extractOverlays, projectValueFlow,
    witnessContentCid,
} from "@figaro-protocol/sdk/derive";
import {
    corpusStatus, corroborateEndpoints, dealStory, graphInventory, jsonSafe, loadHeldAgreements,
    marketShapeAnswer, walletRecordAnswer,
} from "../analyst.mjs";
import { analystTools, crosscheckRpcUrls, makeAnalystHandler, modelConfig, runPrompt } from "../figaro-analyst.mjs";

// ── A fixture corpus ────────────────────────────────────────────────────────
// Two orders in one process (a value-added chain), one resolved attestation.
// Built from the same event shapes fetchCoreEvents returns, so the projections
// under test are the shipped ones, not re-implementations.

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER_A = "0x2222222222222222222222222222222222222222";
const SELLER_B = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x4444444444444444444444444444444444444444";
const PROCESS = `0x${"ab".repeat(32)}`;
const ORDER_A = `0x${"01".repeat(32)}`;
const ORDER_B = `0x${"02".repeat(32)}`;
const CLAUSE_KEY = `0x${"cc".repeat(32)}`;

const SUBSTANCE = "0xdeadbeef";
const CONTENT_REF = keccak256(SUBSTANCE);

function fixtureCorpus({ recovered = true } = {}) {
    const committed = (orderHash, seller, payment, cumulative, blockNumber) => ({
        orderHash, processId: PROCESS, buyer: BUYER, seller, currency: TOKEN,
        payment, cumulativeValue: cumulative, agreementHash: `0x${"ee".repeat(32)}`,
        salt: 1n, deadline: 9_999_999_999n, blockNumber,
    });
    const core = {
        orderCommitted: [
            committed(ORDER_A, SELLER_A, 100n, 100n, 10),
            committed(ORDER_B, SELLER_B, 50n, 150n, 11),
        ],
        orderResolved: [
            { orderHash: ORDER_A, processId: PROCESS, sellerPayout: 300n, buyerPayout: 100n, blockNumber: 20 },
            { orderHash: ORDER_B, processId: PROCESS, sellerPayout: 350n, buyerPayout: 50n, blockNumber: 20 },
        ],
        processResolved: [{ processId: PROCESS, orderCount: 2, blockNumber: 20 }],
        orderSeller: [],
    };
    const attestation = {
        orderHash: ORDER_A, processId: PROCESS, attester: SELLER_A, clauseId: CLAUSE_KEY,
        stage: 1, contentRef: CONTENT_REF, blockNumber: 15, transactionHash: null,
        universe: "direct",
    };
    const specs = { get: () => undefined, list: () => [] };
    const recoveredRecords = [{ event: attestation, content: recovered ? SUBSTANCE : null }];
    const settlement = projectSettlementGraph(core);
    return {
        chainId: 31337,
        fromBlock: 0n,
        syncedToBlock: 99n,
        core,
        attestations: [attestation],
        specs,
        specsLoaded: 0,
        specsSkipped: [],
        recovered: recoveredRecords,
        framedSubstance: recovered
            ? new Map([[CONTENT_REF.toLowerCase(), `⟦FIGARO-DATA nonce…⟧\n${SUBSTANCE}\n⟦/FIGARO-DATA nonce…⟧`]])
            : new Map(),
        substanceRecovered: recovered ? 1 : 0,
        held: { byHash: new Map(), rejected: [], committedRoots: 1 },
        graphs: {
            process: projectProcessGraph(core),
            settlement,
            overlays: extractOverlays(recoveredRecords, specs),
            valueFlow: projectValueFlow(settlement, [], []),
        },
    };
}

const emptyCorpus = () => {
    const core = { orderCommitted: [], orderResolved: [], processResolved: [], orderSeller: [] };
    const settlement = projectSettlementGraph(core);
    return {
        chainId: 11155111, fromBlock: 0n, syncedToBlock: 5n, core, attestations: [],
        specs: { get: () => undefined, list: () => [] }, specsLoaded: 0, specsSkipped: [],
        recovered: [], framedSubstance: new Map(), substanceRecovered: 0,
        held: { byHash: new Map(), rejected: [], committedRoots: 0 },
        graphs: {
            process: projectProcessGraph(core), settlement,
            overlays: extractOverlays([], { get: () => undefined, list: () => [] }),
            valueFlow: projectValueFlow(settlement, [], []),
        },
    };
};

// ── Step 2: the fingerprint IS the lookup ───────────────────────────────────

test("a contentRef derives its own content address — no locator, no registry", () => {
    // CIDv1, base16 ("f"), raw codec 0x55, keccak-256 multihash 0x1b, length 32.
    const cid = witnessContentCid(CONTENT_REF);
    assert.match(cid, /^f01551b20[0-9a-f]{64}$/);
    assert.equal(cid.slice("f01551b20".length), CONTENT_REF.slice(2).toLowerCase());
});

test("the derivation agrees with the vector a real Kubo produced", () => {
    // Golden vector shared with frontend/tests/lib/witnessContent.test.ts:
    // these exact bytes `block/put` to this exact key on Kubo 0.42. The ONE
    // derivation (the SDK export) must agree with what a real node pinned, or
    // a reader deriving from the event resolves nothing.
    const GOLDEN_BYTES = new Uint8Array([0, 0, 0, 1, ...new TextEncoder().encode("hello-witness-content")]);
    const GOLDEN_REF = "0xf79b5d7502f9be068188a0f4a287418d11bd6e8aaa42c3ba28777e707571b7d6";
    assert.equal(keccak256(GOLDEN_BYTES), GOLDEN_REF, "the fixture's own hash still holds");
    assert.equal(witnessContentCid(GOLDEN_REF), `f01551b20${GOLDEN_REF.slice(2)}`);
});

test("a malformed fingerprint is refused, never guessed at", () => {
    assert.throws(() => witnessContentCid("0xnope"), /not a bytes32/);
});

// ── The provenance gate on held / purchased substance ───────────────────────

test("an agreement whose root is not a committed chain fact is REFUSED, whoever handed it over", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "analyst-agr-"));
    try {
        const good = {
            version: "a1", buyer: BUYER, seller: SELLER_A,
            sections: [{ clause: "x-demo", version: 1, data: { compositionHash: "0xfeed" } }],
        };
        const forged = { ...good, sections: [{ clause: "x-demo", version: 1, data: { compositionHash: "0xbeef" } }] };
        fs.writeFileSync(path.join(dir, "good.json"), JSON.stringify(good));
        fs.writeFileSync(path.join(dir, "forged.json"), JSON.stringify(forged));
        fs.writeFileSync(path.join(dir, "junk.json"), "{not json");

        // The ONLY root this chain committed is the good document's.
        const events = { orderCommitted: [{ orderHash: ORDER_A, processId: PROCESS, agreementHash: computeAgreementHash(good) }] };
        const held = loadHeldAgreements(dir, events);

        assert.equal(held.byHash.size, 1, "exactly the document the chain vouches for");
        assert.deepEqual(held.rejected.map((r) => r.file).sort(), ["forged.json", "junk.json"]);
        assert.match(held.rejected.find((r) => r.file === "forged.json").reason, /not a committed agreementHash/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("no agreements directory is absence, not an error", () => {
    const held = loadHeldAgreements(undefined, { orderCommitted: [] });
    assert.equal(held.byHash.size, 0);
    assert.deepEqual(held.rejected, []);
});

// ── Steps 3 and 4: the graphs and their queries ─────────────────────────────

test("the graph inventory is a CENSUS of what the corpus holds, each with its boundary", () => {
    const inv = graphInventory(fixtureCorpus());
    assert.deepEqual(inv.base.map((g) => [g.graph, g.truthBoundary]), [
        ["process", "protocol-enforced"], ["settlement", "protocol-enforced"],
    ]);
    assert.equal(inv.overlays.length, 1, "one overlay per clause family PRESENT — not a fixed list");
    assert.equal(inv.overlays[0].truthBoundary, "protocol-derived");
    assert.equal(inv.overlays[0].clauseKey, CLAUSE_KEY);
    assert.equal(inv.overlays[0].specResolved, false);
    assert.equal(inv.overlays[0].clauseId, null, "an unresolved family is named by its on-chain key alone");
    assert.deepEqual(inv.overlays[0].universes, ["direct"]);
    assert.equal(inv.composition[0].truthBoundary, "composition-derived");
    assert.equal(inv.composition[0].venueLegsFolded, 0, "no venue events folded ⇒ no venue edges invented");
});

test("the settlement chain reports the kernel's own arithmetic, per order", () => {
    const story = dealStory(fixtureCorpus(), PROCESS);
    assert.equal(story.found, true);
    assert.equal(story.settlement.truthBoundary, "protocol-enforced");
    assert.equal(story.settlement.resolved, true);
    const [a, b] = story.settlement.orders;
    // 2× invariants: buyer bonds 2× payment, seller bonds 2× cumulative value.
    assert.equal(a.lockedBuyerBond, "200");
    assert.equal(a.lockedSellerBond, "200");
    assert.equal(b.lockedBuyerBond, "100");
    assert.equal(b.lockedSellerBond, "300");
    // Observed payouts are the chain facts, kept beside the derived ones.
    assert.equal(a.sellerPayout, "300");
    assert.equal(a.atResolutionSellerPayout, "300");
    assert.equal(a.atResolutionNetTransfer, "100");
});

test("deal-story carries recovered substance FRAMED, and says so when it has none", () => {
    const withSubstance = dealStory(fixtureCorpus(), PROCESS);
    assert.equal(withSubstance.overlays.length, 1);
    assert.match(withSubstance.overlays[0].framedSubstance, /⟦FIGARO-DATA/);
    assert.equal(withSubstance.overlays[0].contentRef, CONTENT_REF);

    const fingerprintOnly = dealStory(fixtureCorpus({ recovered: false }), PROCESS);
    assert.equal(fingerprintOnly.overlays[0].framedSubstance, null);
    assert.equal(fingerprintOnly.overlays[0].decoded, null, "no bytes ⇒ fingerprint-only, never a fabricated value");
});

test("an absent process is ABSENCE with its two live possibilities, never 'it did not happen'", () => {
    const story = dealStory(fixtureCorpus(), `0x${"99".repeat(32)}`);
    assert.equal(story.found, false);
    assert.match(story.note, /batch-settled/);
    assert.match(story.note, /outside the synced range/);
});

test("market-shape reports unattributed processes rather than binning them under a guess", () => {
    const shape = marketShapeAnswer(fixtureCorpus());
    assert.equal(shape.truthBoundary, "protocol-derived");
    assert.equal(shape.groups.length, 0);
    assert.equal(shape.unattributedProcessCount, 1);
    assert.match(shape.attribution, /held agreements only/);
});

test("wallet-record answers a stranger's wallet with an empty record, not an error", () => {
    const rec = walletRecordAnswer(fixtureCorpus(), "0x9999999999999999999999999999999999999999");
    assert.equal(rec.truthBoundary, "protocol-enforced");
    assert.deepEqual(rec.processesAsRootBuyer, []);
    assert.deepEqual(rec.ordersAsBuyer, []);
    assert.deepEqual(rec.ordersAsSeller, []);
});

test("wallet-record separates the two sides of the same chain", () => {
    const buyer = walletRecordAnswer(fixtureCorpus(), BUYER);
    assert.equal(buyer.processesAsRootBuyer.length, 1);
    assert.equal(buyer.ordersAsBuyer.length, 2);
    assert.equal(buyer.ordersAsSeller.length, 0);
    const seller = walletRecordAnswer(fixtureCorpus(), SELLER_B);
    assert.equal(seller.processesAsRootBuyer.length, 0);
    assert.equal(seller.ordersAsSeller.length, 1);
    assert.equal(seller.ordersAsSeller[0].payment, "50");
});

test("amounts leave the wire as decimal STRINGS — a payment never survives a double", () => {
    assert.equal(jsonSafe(2n ** 70n), "1180591620717411303424");
    assert.equal(typeof walletRecordAnswer(fixtureCorpus(), BUYER).ordersAsBuyer[0].payment, "string");
});

test("an empty corpus answers zeroes — resolved-empty is absence, not failure", () => {
    const status = corpusStatus(emptyCorpus());
    assert.equal(status.orderCommitted, 0);
    assert.equal(status.attestations, 0);
    assert.deepEqual(status.attestationsByUniverse, { direct: 0, batch: 0 });
    assert.equal(graphInventory(emptyCorpus()).overlays.length, 0);
});

// ── Cross-endpoint corroboration ────────────────────────────────────────────
// Load-balanced public RPC endpoints can answer the same pinned range with
// divergent event sets; with a second endpoint supplied the sync makes that a
// reported fact — and with one endpoint the feature is ABSENT, silently.

test("divergent endpoints over the same pinned range are reported, gap attributed", async () => {
    // Stubbed transports: the primary sees one log the extra endpoint lacks.
    const log = (blockNumber, transactionHash, logIndex) => ({ blockNumber, transactionHash, logIndex });
    const byUrl = {
        "http://rpc-full.test": [log(10n, "0xaaa", 0), log(11n, "0xbbb", 1)],
        "http://rpc-short.test": [log(10n, "0xaaa", 0)],
    };
    const report = await corroborateEndpoints({
        endpoints: ["http://rpc-full.test", "http://rpc-short.test"],
        addresses: { core: "0x000000000000000000000000000000000000c0de" },
        fromBlock: 0n,
        toBlock: 99n,
        makeClient: (url) => ({ getLogs: async () => byUrl[url] }),
    });
    assert.deepEqual(report.endpoints, ["http://rpc-full.test", "http://rpc-short.test"]);
    assert.equal(report.perContract.core.verdict, "diverge");
    assert.equal(report.perContract.core.unionCount, 2);
    assert.equal(report.perContract.core.intersectionCount, 1);
    assert.deepEqual(report.perContract.core.endpoints, [
        { endpoint: "http://rpc-full.test", count: 2, missing: [] },
        { endpoint: "http://rpc-short.test", count: 1, missing: ["11:0xbbb:1"] },
    ]);
});

test("an endpoint that cannot answer is reported as such — never conflated with divergence", async () => {
    const report = await corroborateEndpoints({
        endpoints: ["http://rpc-a.test", "http://rpc-down.test"],
        addresses: { core: "0x000000000000000000000000000000000000c0de" },
        fromBlock: 0n,
        toBlock: 99n,
        makeClient: (url) => ({
            getLogs: async () => {
                if (url === "http://rpc-down.test") throw new Error("endpoint down");
                return [];
            },
        }),
    });
    assert.equal(report.error, "endpoint down");
    assert.equal(report.perContract, undefined);
});

test("only configured contract addresses are corroborated — absence contributes nothing", async () => {
    const calls = [];
    const report = await corroborateEndpoints({
        endpoints: ["http://a.test", "http://b.test"],
        addresses: { core: "0x000000000000000000000000000000000000c0de" }, // registries unconfigured
        fromBlock: 0n,
        toBlock: 9n,
        makeClient: () => ({ getLogs: async ({ address }) => { calls.push(address); return []; } }),
    });
    assert.deepEqual(Object.keys(report.perContract), ["core"]);
    assert.equal(report.perContract.core.verdict, "agree");
});

test("crosscheck endpoints come from FIGARO_ANALYST_CROSSCHECK_RPC_URLS; unset is empty, silently", () => {
    assert.deepEqual(crosscheckRpcUrls({}), []);
    assert.deepEqual(
        crosscheckRpcUrls({ FIGARO_ANALYST_CROSSCHECK_RPC_URLS: " http://a.test , http://b.test ,," }),
        ["http://a.test", "http://b.test"],
    );
});

test("/status carries the corroboration only when it ran — one endpoint is silence", () => {
    assert.equal("endpointAgreement" in corpusStatus(fixtureCorpus()), false);
    const withReport = {
        ...fixtureCorpus(),
        endpointAgreement: {
            endpoints: ["http://a.test", "http://b.test"],
            perContract: {
                core: {
                    fromBlock: 0n, toBlock: 99n, verdict: "agree",
                    unionCount: 0, intersectionCount: 0, disputedKeys: [],
                    endpoints: [
                        { endpoint: "http://a.test", count: 0, missing: [] },
                        { endpoint: "http://b.test", count: 0, missing: [] },
                    ],
                },
            },
        },
    };
    const status = corpusStatus(withReport);
    assert.equal(status.endpointAgreement.perContract.core.verdict, "agree");
    // The wire's rule holds here too: block bounds leave as decimal strings.
    assert.equal(status.endpointAgreement.perContract.core.toBlock, "99");
    assert.doesNotThrow(() => JSON.stringify(status));
});

// ── The wire ────────────────────────────────────────────────────────────────

async function serve(corpus, config) {
    const server = http.createServer(makeAnalystHandler(() => corpus, config));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    return { base, close: () => new Promise((r) => server.close(r)) };
}

test("the deterministic routes answer with their truth boundaries", async () => {
    const { base, close } = await serve(fixtureCorpus(), { enabled: false, reason: "test" });
    try {
        const status = await (await fetch(`${base}/status`)).json();
        assert.equal(status.orderCommitted, 2);
        assert.equal(status.substanceRecovered, 1);
        assert.equal(status.prompt.available, false);
        assert.ok(!status.routes.includes("POST /prompt"), "an absent endpoint is not advertised");

        const graphs = await (await fetch(`${base}/graphs`)).json();
        assert.equal(graphs.overlays[0].truthBoundary, "protocol-derived");

        const story = await (await fetch(`${base}/queries/deal-story?process=${PROCESS}`)).json();
        assert.equal(story.found, true);

        const bad = await fetch(`${base}/queries/wallet-record?wallet=nope`);
        assert.equal(bad.status, 400);

        const missing = await fetch(`${base}/nowhere`);
        assert.equal(missing.status, 404);
    } finally { await close(); }
});

test("with no model configured /prompt is ABSENT — an honest 404 naming why, never a stub", async () => {
    const config = modelConfig({});
    assert.equal(config.enabled, false);
    assert.match(config.reason, /ANTHROPIC_API_KEY and ANTHROPIC_MODEL are both unset/);

    const { base, close } = await serve(fixtureCorpus(), config);
    try {
        const res = await fetch(`${base}/prompt`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ question: "what is the market shape?" }),
        });
        assert.equal(res.status, 404);
        const body = await res.json();
        assert.match(body.reason, /unset/);
        assert.ok(body.deterministicRoutes.includes("/queries/market-shape"), "the 404 points at what IS available");
    } finally { await close(); }
});

test("a model id is never defaulted — a key alone does not enable the endpoint", () => {
    assert.equal(modelConfig({ ANTHROPIC_API_KEY: "sk-x" }).enabled, false);
    assert.match(modelConfig({ ANTHROPIC_API_KEY: "sk-x" }).reason, /ANTHROPIC_MODEL is unset/);
    assert.equal(modelConfig({ ANTHROPIC_MODEL: "m" }).enabled, false);
    assert.equal(modelConfig({ ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_MODEL: "m" }).enabled, true);
});

// ── The model loop ──────────────────────────────────────────────────────────

test("the loop dispatches a tool call and feeds the result back, keeping the trace", async () => {
    // A stub transport: the loop's own protocol handling, no network. It
    // stands in for the provider, never for an ANSWER — the assertion is on
    // the dispatch, and the tool result is the real deterministic query.
    let seen = [];
    const stub = async (_url, init) => {
        const body = JSON.parse(init.body);
        seen.push(body);
        if (body.messages.length === 1) {
            return {
                ok: true,
                json: async () => ({
                    stop_reason: "tool_use",
                    content: [{ type: "tool_use", id: "t1", name: "market_shape", input: {} }],
                }),
            };
        }
        return {
            ok: true,
            json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "one unattributed process" }] }),
        };
    };
    const corpus = fixtureCorpus();
    const out = await runPrompt("what is the market shape?", analystTools(corpus),
        { apiUrl: "https://stub", apiKey: "sk-test", model: "test-model" }, { fetchImpl: stub });

    assert.equal(out.answer, "one unattributed process");
    assert.deepEqual(out.trace, [{ tool: "market_shape", input: {} }]);
    assert.equal(out.turns, 2);
    // The tool result the model saw is the deterministic query's own output.
    const fedBack = JSON.parse(seen[1].messages[2].content[0].content);
    assert.equal(fedBack.unattributedProcessCount, 1);
    // The tools offered carry no `run` over the wire, and the system prompt
    // states the truth-boundary rule.
    assert.ok(seen[0].tools.every((t) => t.run === undefined));
    assert.match(seen[0].system, /TRUTH BOUNDARY/);
});

test("the loop surfaces a provider error instead of inventing an answer", async () => {
    const stub = async () => ({ ok: false, status: 404, text: async () => '{"error":{"message":"model not found"}}' });
    await assert.rejects(
        runPrompt("q", analystTools(fixtureCorpus()), { apiUrl: "https://stub", apiKey: "k", model: "no-such-model" }, { fetchImpl: stub }),
        /model API answered 404/,
    );
});

const LIVE = modelConfig();
test("LIVE: the model loop answers over the real API", {
    skip: LIVE.enabled ? false : `no model configured — ${LIVE.reason}`,
}, async () => {
    const out = await runPrompt(
        "How many processes does this corpus hold, and how many are unattributed? Answer in one sentence.",
        analystTools(fixtureCorpus()), LIVE,
    );
    assert.equal(out.truncated, false);
    assert.ok(out.answer && out.answer.length > 0);
    assert.ok(out.trace.length > 0, "it reached for a tool rather than answering from nothing");
});
