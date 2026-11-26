/**
 * analyst — the graph projections and the canonical queries, as a library.
 *
 * The read half of the fourth capacity (`ecosystem-agents/figaro-analyst.md`).
 * It rides the INDEXER tooling — `@figaro-protocol/sdk` events + `/derive`
 * projections — and shares nothing with the sequencer but a chain.
 *
 * The loop is four steps and this file is all four:
 *   1. FETCH   — `fetchCoreEvents` + `fetchAttestationRecords`, each folding
 *                BOTH resolution paths, address-filtered (attestations also
 *                tagged per row), so the corpus spans the direct and the
 *                batched path.
 *   2. RECOVER — substance at the edge: each attestation's fingerprint is its
 *                own content address (`witnessContent.mjs`); agreement bodies
 *                are party-private and arrive only from the operator's own
 *                holdings or a data-market purchase, each verified against the
 *                chain's `checkoutHash` before it is allowed to inform an
 *                answer.
 *   3. PROJECT — the graphs, each carrying its truth boundary.
 *   4. ANSWER  — canonical queries as folds over the graphs.
 *
 * Nothing here signs, and nothing here writes: an analysis is a read.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createPublicClient, http } from "viem";
import {
    addressesFromDeploymentRecord,
    computeCheckoutHash,
    fetchAttestationRecords,
    fetchCoreEvents,
    fetchEndpointLogAgreement,
    fetchDiscoveryEvents,
    fetchUsageRecords,
    forEachConcurrently,
    isBytes32Hex,
    parseProjectionHints,
    reconstructDiscovery,
    readUtilityTokenPin,
} from "@figaro-protocol/sdk";
import { parseClauseSpec } from "@figaro-protocol/sdk/clauses";
import {
    attributeProcessDesigns,
    extractOverlays,
    marketShape,
    projectProcessGraph,
    projectResolutionGraph,
    projectValueFlow,
    readCommitFundingLegs,
    walletRecord,
    witnessContentCid,
} from "@figaro-protocol/sdk/derive";
import { frame } from "./dataChannel.mjs";
import { ipfsGateways } from "./ipfsRead.mjs";
import { fetchWitnessContent } from "./witnessContent.mjs";
import { fetchAnchoredClauseSpec, fetchAnchoredRegisteredAgreement, fetchAnchoredAssembly } from "./anchoredContent.mjs";

// ── Serialization ───────────────────────────────────────────────────────────

/**
 * JSON-safe rendering of protocol values: bigints become DECIMAL STRINGS
 * (never numbers — a payment does not survive a double), Maps become objects,
 * Sets become arrays. Applied at the wire edge, never inside a projection.
 */
export function jsonSafe(value) {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [String(k), jsonSafe(v)]));
    if (value instanceof Set) return [...value].map(jsonSafe);
    if (Array.isArray(value)) return value.map(jsonSafe);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
    }
    return value;
}

// ── Framing at the wire edge ────────────────────────────────────────────────
// Every readable string a stranger authored — a clause id its registrant
// chose, a field an attester decoded into — leaves this module inside a
// FIGARO-DATA frame, the same frame the recovered substance wears: a model
// reading any answer here reads attacker-authored text framed or not at all.

/** An overlay family's readable clause id, framed; `null` when its spec did
 *  not resolve (the family is then named by its on-chain key alone). */
function framedClauseId(graph) {
    const clauseId = graph.spec?.clauseId;
    if (clauseId === undefined || clauseId === null) return null;
    return frame({ source: "clause-registry", refKind: "clauseKey", ref: graph.clauseKey, content: String(clauseId) });
}

/** An overlay entry's spec-decoded fields, framed as JSON; `null` for a
 *  fingerprint-only entry. */
function framedDecoded(entry) {
    if (entry.decoded === null) return null;
    return frame({
        source: "attestation-decoded", refKind: "cid", ref: witnessContentCid(entry.contentRef),
        content: JSON.stringify(jsonSafe(entry.decoded)),
    });
}

// ── Spec source (ClauseRegistry → IPFS, at the edge) ────────────────────────

/**
 * Build a `SpecSource` from the LIVE registry: the same specs any UI reads,
 * loaded from ClauseRegistry → IPFS at run time. Nothing bundles a spec, so a
 * clause family registered after this file was written decodes the same way as
 * one registered before it. A spec that will not parse or will not fetch is
 * skipped and counted — its overlay degrades to fingerprint-only.
 */
async function loadSpecSource(discovery, { gateways } = {}) {
    const views = [];
    const skipped = [];
    for (const clause of discovery.getClauses()) {
        let raw;
        try {
            // Verified against the clause key (the hash of the spec without `block`):
            // a spec a gateway substituted is skipped, never decoded with.
            const hit = await fetchAnchoredClauseSpec(clause, { gateways });
            if (hit.absent) { skipped.push({ contentURI: clause.contentURI, reason: hit.absent }); continue; }
            raw = hit.raw;
        } catch (e) {
            skipped.push({ contentURI: clause.contentURI, reason: e instanceof Error ? e.name : "unreadable" });
            continue;
        }
        const parsed = parseClauseSpec(raw);
        if (!parsed.ok) { skipped.push({ contentURI: clause.contentURI, reason: "not a clause spec" }); continue; }
        views.push({ ...parsed.spec, clauseKey: clause.clauseKey, hints: parseProjectionHints(raw) });
    }
    const specs = {
        get: (clauseKey) => views.find((v) => v.clauseKey.toLowerCase() === clauseKey.toLowerCase()),
        list: () => views,
    };
    return { specs, loaded: views.length, skipped };
}

// ── Agreement bodies (party-private; verified against the chain) ────────────

/**
 * Load agreement documents the operator HOLDS — its own, or ones bought on the
 * data market — and admit only those that verify against a committed
 * `checkoutHash` read from the chain. This is the provenance gate: a document
 * whose recomputed root is not on chain informs nothing, whoever handed it
 * over. It proves provenance and integrity, never veracity: what a held
 * document declares is its parties' declaration, weighed by their
 * resolution history and the bonds they had at stake.
 *
 * @param dir    directory of `*.json` agreement documents (absent dir = none)
 * @param events the fetched core events — the source of committed roots
 */
export function loadHeldAgreements(dir, events) {
    const byHash = new Map();
    const rejected = [];
    if (!dir || !fs.existsSync(dir)) return { byHash, rejected, committedRoots: 0 };

    const committed = new Map();
    for (const e of events.orderCommitted) committed.set(e.checkoutHash.toLowerCase(), e);

    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
        const file = path.join(dir, name);
        let doc;
        try {
            doc = JSON.parse(fs.readFileSync(file, "utf-8"));
        } catch {
            rejected.push({ file: name, reason: "not JSON" });
            continue;
        }
        let root;
        try {
            root = computeCheckoutHash(doc).toLowerCase();
        } catch {
            rejected.push({ file: name, reason: "not an agreement document" });
            continue;
        }
        const order = committed.get(root);
        if (!order) {
            rejected.push({ file: name, reason: "recomputed root is not a committed checkoutHash on this chain" });
            continue;
        }
        byHash.set(root, { agreement: doc, order });
    }
    return { byHash, rejected, committedRoots: committed.size };
}

// ── Funding legs (the commit receipts) ──────────────────────────────────────
// The SDK's `readCommitFundingLegs` (`@figaro-protocol/sdk/derive`): each
// commit transaction's receipt read once, its legs kept by transaction hash in
// the cache the caller keeps across resyncs.

// ── Sync ────────────────────────────────────────────────────────────────────

/**
 * Cross-endpoint corroboration: the SAME pinned `[fromBlock, toBlock]` range,
 * asked of every endpoint the operator supplied, per watched contract.
 * Load-balanced public RPC endpoints can answer the same query with divergent
 * event sets — a reader on one endpoint silently under-reports; the report
 * (`@figaro-protocol/sdk` `fetchEndpointLogAgreement`) makes that a checkable
 * fact. An endpoint that cannot answer is reported as unreachable for this
 * pass — the corpus itself still stands on the primary endpoint's answer.
 */
export async function corroborateEndpoints({
    endpoints,
    addresses,
    fromBlock,
    toBlock,
    makeClient = (url) => createPublicClient({ transport: http(url) }),
}) {
    const clients = endpoints.map((url) => ({ endpoint: url, client: makeClient(url) }));
    const watched = Object.entries({
        core: addresses.core,
        attestationCoordinator: addresses.attestationCoordinator,
        batchVerifier: addresses.batchVerifier,
        clauseRegistry: addresses.clauseRegistry,
        membersRegistry: addresses.membersRegistry,
        processRegistry: addresses.processRegistry,
        agreementRegistry: addresses.agreementRegistry,
    }).filter(([, address]) => Boolean(address));
    try {
        const perContract = {};
        for (const [name, address] of watched) {
            perContract[name] = await fetchEndpointLogAgreement(clients, { address, fromBlock, toBlock });
        }
        return { endpoints, perContract };
    } catch (err) {
        return { endpoints, error: err instanceof Error ? err.message : String(err) };
    }
}

/** How many witness contents one pass reads from the gateways at a time. */
export const RECOVER_CONCURRENCY = 8;

/**
 * The content of each attestation, read by its content reference, in the
 * attestations' order. A party keeps private content and never pins it, and
 * an unpinned address times a gateway out rather than answering, so the
 * reads run `RECOVER_CONCURRENCY` at a time: one pass waits for the slowest
 * read of each group, never for the sum of every absent content. A read
 * that fails or finds nothing is absence for this pass, never a fabricated
 * payload and never a failed sync. Every recovered payload is framed at the
 * moment it arrives: it is attacker-authorable data, and whatever hands it
 * to a model must hand it framed.
 */
export async function recoverWitnessContents(attestations, {
    gateways, recoverSubstance = true, fetchContent = fetchWitnessContent, concurrency = RECOVER_CONCURRENCY,
} = {}) {
    const recovered = attestations.map((event) => ({ event, content: null }));
    const framedSubstance = new Map();
    let substanceRecovered = 0;
    if (!recoverSubstance) return { recovered, framedSubstance, substanceRecovered };
    await forEachConcurrently(recovered, concurrency, async (entry) => {
        try {
            const hit = await fetchContent(entry.event.contentRef, { gateways });
            if (!hit) return;
            entry.content = hit.content;
            substanceRecovered += 1;
            framedSubstance.set(entry.event.contentRef.toLowerCase(), frame({
                source: "attestation-content", refKind: "cid", ref: hit.cid, content: hit.content,
            }));
        } catch {
            // A gateway outage is absence for this pass.
        }
    });
    return { recovered, framedSubstance, substanceRecovered };
}

/**
 * One full pass: fetch, recover, project. Returns the corpus every query folds
 * over. `recoverSubstance: false` skips step 2 entirely — the resolution
 * skeleton alone, which is what a reader with no gateway can honestly answer
 * from. `crosscheckRpcUrls` (extra endpoints beside `rpcUrl`) turns on
 * cross-endpoint corroboration; absent, the corroboration is absent — one
 * endpoint cannot be cross-checked, and that is silence, not a warning.
 * `fundingLegsByTx` (a Map the caller keeps) carries commit-receipt reads
 * across passes, so a resync reads only the new commits' receipts.
 */
export async function syncCorpus({
    rpcUrl,
    deploymentRecord,
    fromBlock,
    gateways = ipfsGateways(),
    agreementsDir,
    recoverSubstance = true,
    crosscheckRpcUrls = [],
    fundingLegsByTx = new Map(),
}) {
    const record = typeof deploymentRecord === "string"
        ? JSON.parse(fs.readFileSync(deploymentRecord, "utf-8"))
        : deploymentRecord;
    const addresses = addressesFromDeploymentRecord(record);
    const client = createPublicClient({ transport: http(rpcUrl) });
    const start = fromBlock ?? BigInt(record.deploymentBlock ?? 0);
    const syncedToBlock = await client.getBlockNumber();

    // 1. FETCH — both resolution paths for the order and process events and
    //    for the attestations: the batch verifier emits the Core's own order
    //    events, and each fetch reads both addresses.
    const core = await fetchCoreEvents(client, addresses, start, syncedToBlock);
    const attestations = await fetchAttestationRecords(client, addresses, start, syncedToBlock);
    const discovery = reconstructDiscovery(
        await fetchDiscoveryEvents(client, addresses, start, syncedToBlock),
    );
    const { specs, loaded: specsLoaded, skipped: specsSkipped } = await loadSpecSource(discovery, { gateways });

    // 1b. CORROBORATE — only when the operator supplied a second endpoint;
    //     the same pinned range every fetch above used, per watched contract.
    const endpointAgreement = crosscheckRpcUrls.length > 0
        ? await corroborateEndpoints({
            endpoints: [rpcUrl, ...crosscheckRpcUrls],
            addresses,
            fromBlock: start,
            toBlock: syncedToBlock,
        })
        : null;

    // 2. RECOVER — substance at the edge. Every recovered payload is FRAMED at
    //    the moment it arrives: it is attacker-authorable data, and whatever
    //    hands it to a model must hand it framed.
    const { recovered, framedSubstance, substanceRecovered } = await recoverWitnessContents(
        attestations, { gateways, recoverSubstance },
    );

    const held = loadHeldAgreements(agreementsDir, core);

    // 3. PROJECT — each graph carries its own truth boundary.
    const process = projectProcessGraph(core);
    const resolution = projectResolutionGraph(core);
    const overlays = extractOverlays(recovered, specs);

    // Utility-token pins are a designer's registered fact, read from the
    // assemblies the operator could load — never a bundled token list.
    const pins = [];
    // Each verified process design with its registered agreements: what
    // attributes a provenance attestation whose content was not recovered
    // (`attributeProcessDesigns`, through `assemblyAttribution`).
    const designs = [];
    for (const assembly of discovery.getAssemblies()) {
        try {
            // Verified against its assembly hash: a assembly a gateway
            // substituted contributes no pin.
            const hit = await fetchAnchoredAssembly(assembly, { gateways });
            if (hit.absent) continue;
            designs.push({
                processDesignHash: assembly.processDesignHash,
                agreementHashes: (hit.assembly.agreements ?? []).map((entry) => entry.agreementHash).filter(isBytes32Hex),
            });
            for (const entry of hit.assembly.agreements ?? []) {
                // Each agreement's registered agreement, read from its
                // binding whatever its stake and verified against its key: an
                // agreement a gateway substituted, or one not registered,
                // contributes no pin.
                const binding = discovery.getAgreementBinding(entry.agreementHash);
                const composed = binding ? await fetchAnchoredRegisteredAgreement(binding, { gateways }) : { absent: "not registered" };
                // The pin is composed at the assembly level and folds into every
                // agreement's bag, each clause read by its key.
                const pin = readUtilityTokenPin(
                    {
                        ...(hit.assembly.assemblyClauses ?? {}),
                        ...(composed.absent ? {} : composed.composed.clauses),
                        ...(entry.clauses ?? {}),
                    },
                    specs,
                );
                if (pin && !pins.includes(pin)) pins.push(pin);
            }
        } catch {
            // An unreachable or unparsable assembly contributes no pin — absence.
        }
    }
    // The swap legs beside the commits: the value flowing between
    // denominations, read from the venue's own transfers in each commit
    // receipt. The coordinator is the deployment record's; the venue is
    // whichever address it handed the input token to.
    const { legs: fundingLegs, unreadReceipts } = await readCommitFundingLegs({
        client,
        orderCommitted: core.orderCommitted,
        coordinator: addresses.witnessSwapAndCommitCoordinator,
        cache: fundingLegsByTx,
    });
    const valueFlow = projectValueFlow(resolution, fundingLegs, pins);
    // The counter's records of a process design's use: the attribution's
    // first source. No counter in the record, or a read that fails, is
    // absence for this pass, counted.
    let usageRecords = [];
    let usageRecordsUnread = false;
    if (addresses.usageCounter) {
        try {
            usageRecords = await fetchUsageRecords(client, addresses.usageCounter, syncedToBlock);
        } catch {
            usageRecordsUnread = true;
        }
    }

    return {
        chainId: record.chainId,
        addresses,
        record,
        fromBlock: start,
        syncedToBlock,
        core,
        attestations,
        discovery,
        specs,
        specsLoaded,
        specsSkipped,
        recovered,
        framedSubstance,
        substanceRecovered,
        held,
        designs,
        usageRecords,
        usageRecordsUnread,
        endpointAgreement,
        fundingLegs,
        unreadReceipts,
        graphs: { process, resolution, overlays, valueFlow },
    };
}

// ── Attribution (caller-supplied, never guessed) ────────────────────────────

/**
 * Process-design attribution, by the agreement format's provenance leaf (the
 * registered agreement and the process design the order instantiated — the
 * format's own field, never a clause):
 *   - first, the agreements the operator holds (`agreement.provenance`), each
 *     verified against its committed `checkoutHash`;
 *   - else the SDK's `attributeProcessDesigns`: the counter's
 *     `UsageRecorded` of the process-design kind, else a party's attestation
 *     of the leaf, whose pair is its decoded content when that pair hashes
 *     to the attested `contentRef`, else the pair of a discovered design the
 *     fingerprint names. Two attestations naming two designs leave the
 *     process contested and unattributed.
 * A process no source keys is `undefined` — counted as unattributed, never
 * binned under a fabricated key.
 */
function assemblyAttribution(corpus) {
    const byProcess = new Map();
    for (const { agreement, order } of corpus.held.byHash.values()) {
        const key = agreement.provenance?.processDesignHash;
        // A process design hash is a bytes32; anything else there is a
        // party's free text, attributes nothing, and never reaches the wire.
        if (isBytes32Hex(key)) byProcess.set(order.processId.toLowerCase(), key);
    }
    const derived = attributeProcessDesigns({
        overlays: corpus.graphs.overlays,
        designs: corpus.designs ?? [],
        usageRecords: corpus.usageRecords ?? [],
    });
    for (const [processId, { processDesignHash }] of derived.byProcess) {
        if (!byProcess.has(processId)) byProcess.set(processId, processDesignHash);
    }
    return (processId) => byProcess.get(processId.toLowerCase());
}

/**
 * Parent edges from held agreements' topology leaves (`agreement.follows`,
 * the order hashes each order follows, the agreement format's own field).
 * An order whose agreement is not held, failed to load or carries no
 * topology leaf has unknown edges: the reader answers `undefined` for it,
 * never `[]`, so `marketShape` counts its process as unshaped and never
 * reads the order as a depth-0 root. FigaroCore records the commit order and
 * no edge, so a corpus whose held agreements carry no leaf gives no shape.
 */
function parentEdges(corpus) {
    const byOrder = new Map();
    for (const { agreement, order } of corpus.held.byHash.values()) {
        const parents = agreement?.follows;
        if (Array.isArray(parents)) byOrder.set(order.orderHash.toLowerCase(), parents.filter((p) => typeof p === "string"));
    }
    return (orderHash) => byOrder.get(orderHash.toLowerCase());
}

// ── The canonical queries ───────────────────────────────────────────────────

/** Every projected graph with its truth boundary and its size — the answer to
 *  "what can this corpus see?". The overlay list is whatever the corpus
 *  CONTAINS: the graph class is open, so this is a census, not a menu. */
export function graphInventory(corpus) {
    const { process, resolution, overlays, valueFlow } = corpus.graphs;
    return {
        base: [
            { graph: "process", truthBoundary: process.boundary, processes: process.processes.size },
            { graph: "resolution", truthBoundary: resolution.boundary, chains: resolution.chains.size },
        ],
        overlays: overlays.map((g) => ({
            graph: "overlay",
            truthBoundary: g.boundary,
            clauseKey: g.clauseKey,
            // The readable id only exists when the family's spec resolved from
            // the registry; an unresolved family is named by its on-chain key
            // and nothing else. Its registrant chose it: framed.
            clauseId: framedClauseId(g),
            // The agreement format's reserved leaf (the buyer's attestation of
            // the registered agreement and the assembly the order
            // instantiated), recognised by the SDK against the format
            // constant — never by a clause name.
            provenanceLeaf: g.provenanceLeaf === true,
            specResolved: g.spec !== null,
            entries: g.entries.length,
            decodedEntries: g.entries.filter((e) => e.decoded !== null).length,
            universes: [...new Set(g.entries.map((e) => e.universe))],
        })),
        composition: [
            {
                graph: "value-flow",
                truthBoundary: valueFlow.boundary,
                denominations: valueFlow.nodes.length,
                // The swap legs folded from the commit receipts, aggregated
                // per (venue, tokenIn, tokenOut): `ValueFlowEdge` as the SDK
                // types it, amounts as decimal strings.
                venueLegsFolded: valueFlow.edges
                    .filter((e) => e.basis === "composition-derived")
                    .reduce((n, e) => n + e.legCount, 0),
                nodes: valueFlow.nodes.map((n) => jsonSafe(n)),
                edges: valueFlow.edges.map((e) => jsonSafe(e)),
            },
        ],
    };
}

/** Per-assembly market aggregates. Unattributed processes are REPORTED, not
 *  hidden: on a walletless read that number is usually the whole corpus, and
 *  saying so is the answer. Beside them, the value-flow graph: the
 *  denominations the market moves in and the swap legs between them, as the
 *  SDK's `ValueFlowGraph`. */
export function marketShapeAnswer(corpus) {
    const shape = marketShape(corpus.graphs.process, assemblyAttribution(corpus), parentEdges(corpus));
    return {
        truthBoundary: shape.boundary,
        attribution: "the provenance leaf — of the agreements held or purchased, the usage counter's records of it, and the parties' public attestations of it; a process none keys, or two attestations name two designs for, is unattributed",
        unattributedProcessCount: shape.unattributedProcessCount,
        groups: [...shape.groups.values()].map((g) => jsonSafe(g)),
        valueFlow: jsonSafe(corpus.graphs.valueFlow),
    };
}

/** One wallet's public trading record. */
export function walletRecordAnswer(corpus, wallet) {
    const rec = walletRecord(corpus.graphs.process, wallet);
    return jsonSafe({
        truthBoundary: rec.boundary,
        wallet: rec.wallet,
        processesAsRootBuyer: rec.processesAsRootBuyer.map((p) => ({
            processId: p.processId, token: p.token, runningTotal: p.runningTotal,
            resolved: p.resolved, orderCount: p.orders.size,
        })),
        ordersAsBuyer: rec.ordersAsBuyer.map(orderRow),
        ordersAsSeller: rec.ordersAsSeller.map(orderRow),
    });
}

function orderRow(o) {
    return {
        orderHash: o.orderHash, processId: o.processId, buyer: o.buyer, seller: o.seller,
        token: o.token, payment: o.payment, runningTotal: o.runningTotal,
        state: o.state, blockNumber: o.blockNumber,
        sellerPayout: o.sellerPayout ?? null, buyerPayout: o.buyerPayout ?? null,
    };
}

/**
 * Trade-story: one process narrated from the data — the resolution chain plus
 * every overlay entry anchored to it, in block order. Composed from the
 * projections, never a third walk of the same events (on-site the same answer
 * is `/audit/view?process=`).
 *
 * `framedSubstance` carries the recovered payloads as DATA blocks, and
 * `decoded` and `clauseId` arrive framed the same way: a model reading this
 * story reads attacker-authored text framed or not at all.
 */
export function tradeStory(corpus, processId) {
    const id = processId.toLowerCase();
    const chain = [...corpus.graphs.resolution.chains.values()]
        .find((c) => c.processId.toLowerCase() === id);
    if (!chain) {
        // Absence, stated as absence — never "it did not happen". The corpus
        // folds both resolution paths (the Core's events and the verifier's), so a
        // process it lacks is outside the synced range or on another chain.
        return {
            processId,
            found: false,
            note: "not in this corpus, which folds both resolution paths over its synced range — the process is outside the synced range or on another chain",
            syncedFromBlock: corpus.fromBlock.toString(),
            syncedToBlock: corpus.syncedToBlock.toString(),
        };
    }
    const overlayEntries = [];
    for (const graph of corpus.graphs.overlays) {
        for (const entry of graph.entries) {
            if (entry.processId.toLowerCase() !== id) continue;
            overlayEntries.push({
                truthBoundary: graph.boundary,
                clauseKey: graph.clauseKey,
                clauseId: framedClauseId(graph),
                provenanceLeaf: graph.provenanceLeaf === true,
                orderHash: entry.orderHash,
                attester: entry.attester,
                stage: entry.stage,
                universe: entry.universe,
                blockNumber: entry.blockNumber,
                contentRef: entry.contentRef,
                decoded: framedDecoded(entry),
                framedSubstance: corpus.framedSubstance.get(entry.contentRef.toLowerCase()) ?? null,
            });
        }
    }
    overlayEntries.sort((a, b) => a.blockNumber - b.blockNumber);

    const heldAgreements = [...corpus.held.byHash.values()]
        .filter((h) => h.order.processId.toLowerCase() === id).length;

    return jsonSafe({
        processId: chain.processId,
        found: true,
        resolution: {
            truthBoundary: corpus.graphs.resolution.boundary,
            token: chain.token,
            runningTotal: chain.runningTotal,
            resolved: chain.resolved,
            orders: chain.orders.map((o) => ({
                orderHash: o.orderHash, buyer: o.buyer, seller: o.seller,
                payment: o.payment, runningTotal: o.runningTotal,
                lockedBuyerBond: o.locked.buyerBond, lockedSellerBond: o.locked.sellerBond,
                atResolutionSellerPayout: o.atResolution.sellerPayout,
                atResolutionBuyerPayout: o.atResolution.buyerPayout,
                atResolutionNetTransfer: o.atResolution.netTransfer,
                state: o.state, blockNumber: o.blockNumber,
                sellerPayout: o.sellerPayout, buyerPayout: o.buyerPayout,
            })),
        },
        overlays: overlayEntries,
        heldAgreements,
        agreementBodies: heldAgreements === 0
            ? "none held for this process — agreement bodies are party-private; buy access on the data market or read the fingerprints only"
            : "verified against the on-chain checkoutHash",
    });
}

/** What the corpus is, as one object — the wire's `/status` body. */
export function corpusStatus(corpus) {
    return {
        chainId: corpus.chainId,
        syncedFromBlock: corpus.fromBlock.toString(),
        syncedToBlock: corpus.syncedToBlock.toString(),
        orderCommitted: corpus.core.orderCommitted.length,
        orderResolved: corpus.core.orderResolved.length,
        processResolved: corpus.core.processResolved.length,
        attestations: corpus.attestations.length,
        attestationsByUniverse: {
            direct: corpus.attestations.filter((a) => a.universe === "direct").length,
            batch: corpus.attestations.filter((a) => a.universe === "batch").length,
        },
        substanceRecovered: corpus.substanceRecovered,
        specsLoaded: corpus.specsLoaded,
        specsSkipped: corpus.specsSkipped.length,
        heldAgreements: corpus.held.byHash.size,
        rejectedAgreements: corpus.held.rejected,
        // Present only when the operator supplied a second endpoint — one
        // endpoint cannot be cross-checked, and that absence is silent.
        ...(corpus.endpointAgreement
            ? { endpointAgreement: jsonSafe(corpus.endpointAgreement) }
            : {}),
    };
}
