/**
 * analyst — the graph projections and the canonical queries, as a library.
 *
 * The read half of the fourth capacity (`ecosystem-agents/figaro-analyst.md`).
 * It rides the INDEXER tooling — `@figaro-protocol/sdk` events + `/derive`
 * projections — and shares nothing with the sequencer but a chain.
 *
 * The loop is four steps and this file is all four:
 *   1. FETCH   — `fetchCoreEvents` (direct path) + `fetchAttestationRecords`
 *                (BOTH settlement universes, address-filtered and tagged).
 *   2. RECOVER — substance at the edge: each attestation's fingerprint is its
 *                own content address (`witnessContent.mjs`); agreement bodies
 *                are party-private and arrive only from the operator's own
 *                holdings or a data-market purchase, each verified against the
 *                chain's `agreementHash` before it is allowed to inform an
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
    computeAgreementHash,
    fetchAttestationRecords,
    fetchCoreEvents,
    fetchEndpointLogAgreement,
    fetchDiscoveryEvents,
    parseProjectionHints,
    reconstructDiscovery,
    readUtilityTokenPin,
    sectionByField,
} from "@figaro-protocol/sdk";
import { parseClauseSpec } from "@figaro-protocol/sdk/clauses";
import {
    extractOverlays,
    marketShape,
    projectProcessGraph,
    projectSettlementGraph,
    projectValueFlow,
    walletRecord,
} from "@figaro-protocol/sdk/derive";
import { frame } from "./dataChannel.mjs";
import { cidOf, fetchIpfsText, ipfsGateways } from "./ipfsRead.mjs";
import { fetchWitnessContent } from "./witnessContent.mjs";

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
            const text = await fetchIpfsText(cidOf(clause.contentURI), { gateways });
            if (text === null) { skipped.push({ contentURI: clause.contentURI, reason: "absent" }); continue; }
            raw = JSON.parse(text);
        } catch (e) {
            skipped.push({ contentURI: clause.contentURI, reason: e instanceof Error ? e.name : "unreadable" });
            continue;
        }
        const parsed = parseClauseSpec(raw);
        if (!parsed.ok) { skipped.push({ contentURI: clause.contentURI, reason: "not a clause spec" }); continue; }
        views.push({ ...parsed.spec, hints: parseProjectionHints(raw) });
    }
    const specs = {
        get: (clauseId, version) =>
            views.find((v) => v.clauseId === clauseId && (version === undefined || v.version === version)),
        list: () => views,
    };
    return { specs, loaded: views.length, skipped };
}

// ── Agreement bodies (party-private; verified against the chain) ────────────

/**
 * Load agreement documents the operator HOLDS — its own, or ones bought on the
 * data market — and admit only those that verify against a committed
 * `agreementHash` read from the chain. This is the provenance gate: a document
 * whose recomputed root is not on chain informs nothing, whoever handed it
 * over. It proves provenance and integrity, never veracity.
 *
 * @param dir    directory of `*.json` agreement documents (absent dir = none)
 * @param events the fetched core events — the source of committed roots
 */
export function loadHeldAgreements(dir, events) {
    const byHash = new Map();
    const rejected = [];
    if (!dir || !fs.existsSync(dir)) return { byHash, rejected, committedRoots: 0 };

    const committed = new Map();
    for (const e of events.orderCommitted) committed.set(e.agreementHash.toLowerCase(), e);

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
            root = computeAgreementHash(doc).toLowerCase();
        } catch {
            rejected.push({ file: name, reason: "not an agreement document" });
            continue;
        }
        const order = committed.get(root);
        if (!order) {
            rejected.push({ file: name, reason: "recomputed root is not a committed agreementHash on this chain" });
            continue;
        }
        byHash.set(root, { agreement: doc, order });
    }
    return { byHash, rejected, committedRoots: committed.size };
}

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
        assemblyRegistry: addresses.assemblyRegistry,
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

/**
 * One full pass: fetch, recover, project. Returns the corpus every query folds
 * over. `recoverSubstance: false` skips step 2 entirely — the settlement
 * skeleton alone, which is what a reader with no gateway can honestly answer
 * from. `crosscheckRpcUrls` (extra endpoints beside `rpcUrl`) turns on
 * cross-endpoint corroboration; absent, the corroboration is absent — one
 * endpoint cannot be cross-checked, and that is silence, not a warning.
 */
export async function syncCorpus({
    rpcUrl,
    deploymentRecord,
    fromBlock,
    gateways = ipfsGateways(),
    agreementsDir,
    recoverSubstance = true,
    crosscheckRpcUrls = [],
}) {
    const record = typeof deploymentRecord === "string"
        ? JSON.parse(fs.readFileSync(deploymentRecord, "utf-8"))
        : deploymentRecord;
    const addresses = addressesFromDeploymentRecord(record);
    const client = createPublicClient({ transport: http(rpcUrl) });
    const start = fromBlock ?? BigInt(record.deploymentBlock ?? 0);
    const syncedToBlock = await client.getBlockNumber();

    // 1. FETCH — both universes for attestations; core events are direct-path
    //    by construction (a batch settles token positions and re-emits no
    //    order events), which is a boundary, not an omission.
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
    const recovered = [];
    const framedSubstance = new Map();
    let substanceRecovered = 0;
    for (const event of attestations) {
        let content = null;
        if (recoverSubstance) {
            try {
                const hit = await fetchWitnessContent(event.contentRef, { gateways });
                if (hit) {
                    content = hit.content;
                    substanceRecovered += 1;
                    framedSubstance.set(event.contentRef.toLowerCase(), frame({
                        source: "attestation-content", refKind: "cid", ref: hit.cid, content: hit.content,
                    }));
                }
            } catch {
                // A gateway outage is absence for THIS pass, never a fabricated
                // payload and never a failed sync.
            }
        }
        recovered.push({ event, content });
    }

    const held = loadHeldAgreements(agreementsDir, core);

    // 3. PROJECT — each graph carries its own truth boundary.
    const process = projectProcessGraph(core);
    const settlement = projectSettlementGraph(core);
    const overlays = extractOverlays(recovered, specs);

    // Utility-token pins are a designer's registered fact, read from the
    // templates the operator could load — never a bundled token list.
    const pins = [];
    for (const assembly of discovery.getAssemblies()) {
        try {
            const text = await fetchIpfsText(cidOf(assembly.contentURI), { gateways });
            if (!text) continue;
            const template = JSON.parse(text);
            for (const agreement of template.agreements ?? []) {
                const pin = readUtilityTokenPin(agreement.clauses ?? {}, specs);
                if (pin && !pins.includes(pin)) pins.push(pin);
            }
        } catch {
            // An unreachable or unparsable template contributes no pin — absence.
        }
    }
    // Swap legs are a COMPOSED venue's own events, parsed by the caller against
    // that venue's ABI and handed in; this pass composes none, so the value-flow
    // graph carries settlement edges only. A venue is discovered from clause
    // fields and the deployment record, never from a list here.
    const valueFlow = projectValueFlow(settlement, [], pins);

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
        endpointAgreement,
        graphs: { process, settlement, overlays, valueFlow },
    };
}

// ── Attribution (caller-supplied, never guessed) ────────────────────────────

/**
 * Assembly attribution from the agreements the operator actually holds: the
 * provenance section's `compositionHash`, found by DECLARED FIELD. A process
 * with no held agreement is `undefined` — counted as unattributed, never
 * binned under a fabricated key. That is the honest public picture: the
 * settlement skeleton is public, the body that says WHICH assembly produced it
 * is party-private until someone discloses or sells it.
 */
function assemblyAttribution(corpus) {
    const byProcess = new Map();
    for (const { agreement, order } of corpus.held.byHash.values()) {
        const section = sectionByField(agreement, "compositionHash", corpus.specs);
        const key = section?.data?.compositionHash;
        if (typeof key === "string" && key.length > 0) byProcess.set(order.processId.toLowerCase(), key);
    }
    return (processId) => byProcess.get(processId.toLowerCase());
}

/**
 * Parent edges from held agreements' topology sections, found by the declared
 * `parentOrderHashes` field. Returns `undefined` when NO held agreement
 * carries edges — the caller then omits the argument and `marketShape` reports
 * the kernel's own linear view rather than a fabricated DAG.
 */
function parentEdges(corpus) {
    const byOrder = new Map();
    for (const { agreement, order } of corpus.held.byHash.values()) {
        const section = sectionByField(agreement, "parentOrderHashes", corpus.specs);
        const parents = section?.data?.parentOrderHashes;
        if (Array.isArray(parents)) byOrder.set(order.orderHash.toLowerCase(), parents);
    }
    if (byOrder.size === 0) return undefined;
    return (orderHash) => byOrder.get(orderHash.toLowerCase()) ?? [];
}

// ── The canonical queries ───────────────────────────────────────────────────

/** Every projected graph with its truth boundary and its size — the answer to
 *  "what can this corpus see?". The overlay list is whatever the corpus
 *  CONTAINS: the graph class is open, so this is a census, not a menu. */
export function graphInventory(corpus) {
    const { process, settlement, overlays, valueFlow } = corpus.graphs;
    return {
        base: [
            { graph: "process", truthBoundary: process.boundary, processes: process.processes.size },
            { graph: "settlement", truthBoundary: settlement.boundary, chains: settlement.chains.size },
        ],
        overlays: overlays.map((g) => ({
            graph: "overlay",
            truthBoundary: g.boundary,
            clauseKey: g.clauseKey,
            // The readable id only exists when the family's spec resolved from
            // the registry; an unresolved family is named by its on-chain key
            // and nothing else.
            clauseId: g.spec?.clauseId ?? null,
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
                edges: valueFlow.edges.length,
                // Composed venues are discovered from clause fields and the
                // deployment record; this pass folded none in.
                venueLegsFolded: valueFlow.edges.filter((e) => e.basis === "composition-derived").length,
            },
        ],
    };
}

/** Per-assembly market aggregates. Unattributed processes are REPORTED, not
 *  hidden: on a walletless read that number is usually the whole corpus, and
 *  saying so is the answer. */
export function marketShapeAnswer(corpus) {
    const shape = marketShape(corpus.graphs.process, assemblyAttribution(corpus), parentEdges(corpus));
    return {
        truthBoundary: shape.boundary,
        attribution: "held agreements only — a process with no held or purchased agreement is unattributed",
        unattributedProcessCount: shape.unattributedProcessCount,
        groups: [...shape.groups.values()].map((g) => jsonSafe(g)),
    };
}

/** One wallet's public trading record. */
export function walletRecordAnswer(corpus, wallet) {
    const rec = walletRecord(corpus.graphs.process, wallet);
    return jsonSafe({
        truthBoundary: rec.boundary,
        wallet: rec.wallet,
        processesAsRootBuyer: rec.processesAsRootBuyer.map((p) => ({
            processId: p.processId, currency: p.currency, cumulativeValue: p.cumulativeValue,
            resolved: p.resolved, orderCount: p.orders.size,
        })),
        ordersAsBuyer: rec.ordersAsBuyer.map(orderRow),
        ordersAsSeller: rec.ordersAsSeller.map(orderRow),
    });
}

function orderRow(o) {
    return {
        orderHash: o.orderHash, processId: o.processId, buyer: o.buyer, seller: o.seller,
        currency: o.currency, payment: o.payment, cumulativeValue: o.cumulativeValue,
        state: o.state, blockNumber: o.blockNumber,
        sellerPayout: o.sellerPayout ?? null, buyerPayout: o.buyerPayout ?? null,
    };
}

/**
 * Deal-story: one process narrated from the record — the settlement chain plus
 * every overlay entry anchored to it, in block order. Composed from the
 * projections, never a third walk of the same events (on-site the same answer
 * is `/audit/view?process=`).
 *
 * `framedSubstance` carries the recovered payloads as DATA blocks: a model
 * reading this story reads the substance framed or not at all.
 */
export function dealStory(corpus, processId) {
    const id = processId.toLowerCase();
    const chain = [...corpus.graphs.settlement.chains.values()]
        .find((c) => c.processId.toLowerCase() === id);
    if (!chain) {
        // Absence, stated with its two live possibilities — never "it did not
        // happen". A batch-settled process acquires no kernel status and emits
        // no kernel event, so it is absent from this projection by design.
        return {
            processId,
            found: false,
            note: "not in this chain's direct-path record — it may be batch-settled (ask a relay) or outside the synced range",
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
                clauseId: graph.spec?.clauseId ?? null,
                orderHash: entry.orderHash,
                attester: entry.attester,
                stage: entry.stage,
                universe: entry.universe,
                blockNumber: entry.blockNumber,
                contentRef: entry.contentRef,
                decoded: entry.decoded === null ? null : jsonSafe(entry.decoded),
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
        settlement: {
            truthBoundary: corpus.graphs.settlement.boundary,
            currency: chain.currency,
            cumulativeValue: chain.cumulativeValue,
            resolved: chain.resolved,
            orders: chain.orders.map((o) => ({
                orderHash: o.orderHash, buyer: o.buyer, seller: o.seller,
                payment: o.payment, cumulativeValue: o.cumulativeValue,
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
            : "verified against the on-chain agreementHash",
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
