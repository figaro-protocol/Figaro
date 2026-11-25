"use client";

/**
 * graphCorpus — the explorer's READ: chain events in, projected graphs out.
 *
 * The four steps are the analyst runnable's own
 * (`ecosystem-agents/runtime/analyst.mjs`), performed in the browser against
 * the same SDK: FETCH the events, RECOVER what substance is publicly
 * recoverable, PROJECT the graphs, and let the caller ANSWER. Nothing is
 * re-derived here — the projections are `@figaro-protocol/sdk/derive`'s and
 * the events come from the frontend's EXISTING caches (`lib/core/indexer.ts`
 * `getCoreEvents` for the order events, `lib/core/attestationIndexer.ts` for
 * attestations, each across both resolution paths), so this module adds a
 * fold, never a second indexer.
 *
 * Three boundaries this reader states rather than papers over:
 *
 *   core events are read from both emitters: FigaroBatchVerifier emits the
 *   Core's own order and process events for batched trade, so the process
 *   and resolution graphs fold both paths. Attestations are read from both
 *   emitters and tagged.
 *
 *   substance is recovered AT THE EDGE, and often absent. An attestation's
 *   `contentRef` IS its content address (the bytes are pinned as a raw block
 *   multihashed with keccak-256), so a public payload resolves from the
 *   fingerprint alone; a withheld, private, erased or unserved payload
 *   resolves to nothing and its entry stays fingerprint-only.
 *
 *   process-design attribution is the SDK's (`attributeProcessDesigns`):
 *   the counter's `UsageRecorded` of the process-design kind first, else a
 *   party's attestation of the agreement format's provenance leaf
 *   (`PROVENANCE_LEAF_KEY`), never a clause name. Two attestations naming
 *   two designs leave the process contested, and a contested process is
 *   unattributed: neither design stands in. A process neither source names
 *   is counted as unattributed and said to be.
 *
 *   no edge between two orders is read here. Which order follows which is
 *   each agreement's topology leaf, which no event carries and this reader
 *   does not hold, and FigaroCore fixes no order among sibling orders, so a
 *   commit's position names no edge. Every order's edges are unknown, and the
 *   market shape counts its process as unshaped. A process attributed to a
 *   registered process design the page loaded carries that design's own
 *   edges between its entries, which name no order.
 */

import { useEffect, useMemo, useState } from "react";
import type { Hex, PublicClient } from "viem";
import {
    agreementClauses,
    USAGE_COUNTER_ABI,
    readUtilityTokenPin,
    type Address,
    type OrderCommittedEvent,
    type SpecSource,
} from "@figaro-protocol/sdk";
import {
    attributeProcessDesigns,
    extractOverlays,
    marketShape,
    projectProcessGraph,
    projectResolutionGraph,
    projectValueFlow,
    readCommitFundingLegs as readCommitFundingLegsFrom,
    type MarketShape,
    type OverlayGraph,
    type ProcessGraph,
    type ReceiptLogInput,
    type RecoveredAttestation,
    type ResolutionGraph,
    type SwapLeg,
    type ValueFlowGraph,
    type VenueEvent,
} from "@figaro-protocol/sdk/derive";
import {
    getCoreEvents,
    getReceiptLogsOf,
    type IndexedLog,
} from "@/lib/core/indexer";
import { getAllAttestationRecords } from "@/lib/core/attestationIndexer";
import { cachedGetContractEvents } from "@/lib/core/eventCache";
import { fetchWitnessContent } from "@/lib/core/witnessContent";
import { ERC20_ABI } from "@/lib/core/contracts";
import { getUsageCounter } from "@/lib/rewards/contracts";
import { getSwapRouter, getWitnessSwapAndCommitCoordinator } from "@/lib/composability/contracts";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { activeChain } from "@/lib/shared/chains";
import { publicClient } from "@/lib/shared/publicClient";
import { useAssemblyChoices } from "@/lib/registries/assemblyChoices";
import { useClauseSpecs } from "@/lib/registries/useClauseSpecs";
import { ABSENT, PENDING, readNetwork, applyUntilCleanup, type NetworkRead } from "@/lib/shared/networkRead";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";
import type { DesignedEdges } from "@/lib/data/explorer";

/**
 * How many attestation payloads one pass tries to recover, most recent first.
 * Recovery is one gateway round-trip per fingerprint, so an unbounded corpus
 * would open unbounded connections; the cap is stated in the UI as "recovered
 * X of Y" rather than hidden, so a reader knows the substance they are seeing
 * is a window and not the whole of the data.
 */
const SUBSTANCE_RECOVERY_CAP = 250;

/** The token-metadata read every denomination row wants. Resolved-null when
 *  the token does not answer — the row then shows base units and the address,
 *  which is honest, rather than assuming 18 decimals. */
export interface TokenMeta {
    symbol: string;
    decimals: number;
}

export interface GraphCorpus {
    chainId: number;
    /** Both protocol-enforced base graphs. */
    process: ProcessGraph;
    resolution: ResolutionGraph;
    /** One per attestable clause family present — the open class. */
    overlays: OverlayGraph[];
    /** The fifth-noun projection: denominations, pins, and venue corridors. */
    valueFlow: ValueFlowGraph;
    /** Per-assembly aggregates, keyed by declared processDesignHash. */
    market: MarketShape;
    /** How much attested substance this pass recovered, and how much it tried. */
    substance: { attempted: number; recovered: number; total: number };
    /** Lowercased token address → metadata, absent when unreadable. */
    tokenMeta: Map<string, TokenMeta>;
    /** The composed swap venue this deployment records, or null. */
    venue: string | null;
    /** processDesignHash (lowercased) → registered assembly name. */
    assemblyNames: Map<string, string>;
    /** processId (lowercased) → the processDesignHash (lowercased) the SDK's
     *  `attributeProcessDesigns` names for it. A process absent from this map
     *  is the honest unattributed case, counted in
     *  `market.unattributedProcessCount`. */
    attributionByProcess: Map<string, string>;
    /** processIds (lowercased) two attestations name two designs for, and the
     *  counter names none: absent from `attributionByProcess`, so they are
     *  unattributed, with no design in their place. */
    contestedProcesses: Set<string>;
    /** processId (lowercased) → the edges of the loaded registered process
     *  design the process is linked to, between the design's entries. They are
     *  the design's, and name no order of the process. */
    designByProcess: Map<string, DesignedEdges>;
}

/** A published assembly in the minimal shape this read needs: its registered
 *  identity and name, plus every composed clause set the designer composed
 *  (the assembly-scoped set, where a denomination pin composes once, and each
 *  agreement's own set), each keyed by clause key. */
interface CorpusAssembly {
    processDesignHash: `0x${string}`;
    /** The registered agreement each agreement binds, in assembly order. */
    agreementHashes: readonly `0x${string}`[];
    name: string;
    /** The design's entries and the entries each follows, by the design's own
     *  labels, as the registered process design declares them. */
    entries: DesignedEdges["entries"];
    clauseSets: readonly {
        clauses: Record<string, Record<string, unknown>>;
    }[];
}

/** The designer's utility-token pins across the loaded assemblies, each
 *  distinct address once — a designer's registered fact, never a bundled
 *  token list. Every clause is read from the spec its key names. */
export function readAssemblyUtilityTokenPins(assemblies: readonly CorpusAssembly[], specs: SpecSource): Address[] {
    const pins: Address[] = [];
    for (const assembly of assemblies) {
        for (const { clauses } of assembly.clauseSets) {
            const pin = readUtilityTokenPin(clauses, specs);
            if (pin && !pins.includes(pin)) pins.push(pin);
        }
    }
    return pins;
}

/** How many commit receipts one pass reads at a time. */
const RECEIPT_READ_BATCH = 8;

/**
 * The funding legs beside the commits: the SDK's `readCommitFundingLegs`,
 * with each commit transaction's receipt read through this app's receipt
 * cache (`getReceiptLogsOf`). The coordinator emits nothing of its own; the
 * venue's ERC-20 transfers in the receipt are the swap leg. A receipt that
 * cannot be read yields no legs and a logged absence for this pass.
 */
async function readCommitFundingLegs(
    client: PublicClient,
    chainId: number,
    committedLogs: readonly IndexedLog[],
    orderCommitted: readonly OrderCommittedEvent[],
): Promise<VenueEvent<SwapLeg>[]> {
    const logByTx = new Map<string, IndexedLog>();
    for (const log of committedLogs) {
        if (log.transactionHash) logByTx.set(String(log.transactionHash).toLowerCase(), log);
    }
    const { legs, unreadReceipts } = await readCommitFundingLegsFrom({
        client: {
            async getTransactionReceipt({ hash }) {
                const log = logByTx.get(hash.toLowerCase());
                const logs = log ? await getReceiptLogsOf(client, chainId, log) : null;
                if (!logs) throw new Error(`no receipt for ${hash}`);
                return { logs: logs as unknown as readonly ReceiptLogInput[] };
            },
        },
        orderCommitted,
        coordinator: getWitnessSwapAndCommitCoordinator() ?? undefined,
        concurrency: RECEIPT_READ_BATCH,
    });
    if (unreadReceipts > 0) {
        console.warn(`[graphCorpus] ${unreadReceipts} commit receipt(s) are unreadable this pass; their funding legs are absent`);
    }
    return legs;
}

/**
 * The counter's `UsageRecorded` events, the SDK attribution's first source:
 * a direct call and a proved batch both emit them. A deployment with no
 * counter, or a read that fails, yields none this pass: those processes keep
 * whatever attribution their provenance attestations give.
 */
async function readUsageRecords(
    client: PublicClient,
    chainId: number,
): Promise<{ kind: number; clauseOrProcess: Hex; processId: Hex }[]> {
    const counter = getUsageCounter();
    if (!counter) return [];
    let logs: Awaited<ReturnType<typeof cachedGetContractEvents>>;
    try {
        logs = await cachedGetContractEvents(client, chainId, { address: counter, abi: USAGE_COUNTER_ABI, eventName: "UsageRecorded" });
    } catch (err) {
        console.warn("[graphCorpus] UsageRecorded is unreadable this pass; no process is attributed by its counted use:", err);
        return [];
    }
    return logs.flatMap((log) => {
        const a = log.args as { kind?: number | bigint; clauseOrProcess?: Hex; processId?: Hex } | undefined;
        if (a?.kind === undefined || !a.clauseOrProcess || !a.processId) return [];
        return [{ kind: Number(a.kind), clauseOrProcess: a.clauseOrProcess, processId: a.processId }];
    });
}

/**
 * The registered process design a process is attributed to, with the
 * design's own edges between its entries. The link holds only when the page
 * loaded that design. The edges are the design's, and no entry is matched to
 * an order.
 */
function designLinkOf(
    processId: Hex,
    attributionByProcess: ReadonlyMap<string, string>,
    assemblies: readonly Pick<CorpusAssembly, "processDesignHash" | "entries">[],
): DesignedEdges | undefined {
    const key = attributionByProcess.get(processId.toLowerCase());
    if (key === undefined) return undefined;
    const design = assemblies.find((a) => a.processDesignHash.toLowerCase() === key);
    if (!design) return undefined;
    return { processDesignHash: design.processDesignHash, entries: design.entries };
}

/** Best-effort `symbol()` + `decimals()` for each denomination the data
 *  names. A token that does not answer is simply absent from the map. */
async function readTokenMeta(
    client: PublicClient,
    tokens: readonly Address[],
): Promise<Map<string, TokenMeta>> {
    const out = new Map<string, TokenMeta>();
    await Promise.all(
        tokens.map(async (token) => {
            try {
                const [symbol, decimals] = await Promise.all([
                    client.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }),
                    client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
                ]);
                out.set(token.toLowerCase(), { symbol: String(symbol), decimals: Number(decimals) });
            } catch {
                // Unreadable token metadata is absence — the row shows base
                // units against the address, never a guessed 18.
            }
        }),
    );
    return out;
}

/**
 * One full pass. `deps` exist so the hook can hand in the assemblies it already
 * loaded (and so a caller can point the read at another client); with none it
 * uses the standalone public client, which is what makes this surface
 * walletless. Internal — `useGraphCorpus` is this module's contract.
 */
async function readGraphCorpus(deps?: {
    client?: PublicClient;
    chainId?: number;
    assemblies?: readonly CorpusAssembly[];
}): Promise<GraphCorpus> {
    const client = deps?.client ?? (publicClient as unknown as PublicClient);
    const chainId = deps?.chainId ?? activeChain.id;

    // 1. FETCH — the order events and the attestations, each from both emitters.
    const [{ events: core, committedLogs }, attestations, usageRecords] = await Promise.all([
        getCoreEvents(client, chainId),
        getAllAttestationRecords(client, chainId),
        readUsageRecords(client, chainId),
    ]);
    const fundingLegs = await readCommitFundingLegs(client, chainId, committedLogs, core.orderCommitted);

    // 2. RECOVER — substance at the edge, newest first and capped.
    const ordered = [...attestations].sort((a, b) => b.blockNumber - a.blockNumber);
    const attempted = Math.min(ordered.length, SUBSTANCE_RECOVERY_CAP);
    const recoveredContent = await Promise.all(
        ordered.slice(0, attempted).map(async (event) => {
            try {
                return await fetchWitnessContent(event.contentRef);
            } catch {
                // A gateway outage is absence for THIS pass, never a
                // fabricated payload and never a failed read.
                return null;
            }
        }),
    );
    const contentByRef = new Map<string, Hex>();
    recoveredContent.forEach((content, i) => {
        if (content) contentByRef.set(ordered[i].contentRef.toLowerCase(), content as Hex);
    });
    const records: RecoveredAttestation[] = attestations.map((event) => ({
        event,
        content: contentByRef.get(event.contentRef.toLowerCase()) ?? null,
    }));

    // 3. PROJECT — each graph carries its own truth boundary.
    const specs = specSource();
    const process = projectProcessGraph(core);
    const resolution = projectResolutionGraph(core);
    const overlays = extractOverlays(records, specs);

    // Utility-token pins are a designer's registered fact, read off the
    // assemblies the page loaded — never a bundled token list.
    const pins = readAssemblyUtilityTokenPins(deps?.assemblies ?? [], specs);
    // The swap legs beside the commits: the value flowing between
    // denominations, read from the venue's own transfers.
    const valueFlow = projectValueFlow(resolution, fundingLegs, pins);

    const attribution = attributeProcessDesigns({ overlays, designs: deps?.assemblies ?? [], usageRecords });
    const byProcess = new Map<string, string>();
    for (const [processId, { processDesignHash }] of attribution.byProcess) {
        byProcess.set(processId, processDesignHash.toLowerCase());
    }
    // This reader holds no agreement, so every order's edges are unknown and
    // no process takes a shape; the commit order is never read as an edge.
    const market = marketShape(process, (processId: Hex) => byProcess.get(processId.toLowerCase()), () => undefined);
    const designByProcess = new Map<string, DesignedEdges>();
    for (const processId of process.processes.keys()) {
        const design = designLinkOf(processId, byProcess, deps?.assemblies ?? []);
        if (design) designByProcess.set(processId.toLowerCase(), design);
    }

    const tokenMeta = await readTokenMeta(client, valueFlow.nodes.map((n) => n.token));

    const assemblyNames = new Map<string, string>();
    for (const assembly of deps?.assemblies ?? []) {
        assemblyNames.set(assembly.processDesignHash.toLowerCase(), assembly.name);
    }

    return {
        chainId,
        process,
        resolution,
        overlays,
        valueFlow,
        market,
        substance: { attempted, recovered: contentByRef.size, total: attestations.length },
        tokenMeta,
        venue: getSwapRouter(),
        assemblyNames,
        attributionByProcess: byProcess,
        contestedProcesses: attribution.contested,
        designByProcess,
    };
}

/**
 * Whether the corpus read's two off-chain inputs have finished loading: the
 * clause-spec cache's load pass finished (`loaded`), and every published
 * assembly's hydration reached a terminal state — loaded or error, never
 * still loading. A failed assembly-registry read counts as finished too:
 * attribution is then absent, which the read states, and the rest of the
 * corpus still renders.
 *
 * The read waits for this because every pass recovers substance from the
 * gateway, and a withheld attestation (its content never pinned, by its
 * party's choice) costs the gateway's own miss timeout per pass. Restarting
 * the read on each assembly's landing — the assembly, then every agreement's
 * agreement — stacks those timeouts and the corpus never lands.
 */
export function corpusInputsLoaded(
    assemblies: readonly { state: "loading" | "loaded" | "error" }[] | null,
    assembliesFailed: boolean,
    specsLoaded: boolean,
): boolean {
    if (!specsLoaded) return false;
    if (assembliesFailed) return true;
    if (assemblies === null) return false;
    return assemblies.every((a) => a.state !== "loading");
}

/**
 * The explorer's corpus, read once its inputs have loaded (`corpusInputsLoaded`)
 * and re-read when the clause-spec cache warms further (a spec resolving on a
 * re-read pass turns a fingerprint-only overlay into a decoded one, and can
 * turn an unattributed process into an attributed one).
 *
 * The corpus is a `NetworkRead`: pending while the first read is in flight,
 * absent when the event read failed (a surface renders nothing for it),
 * present once projected — an empty corpus is the network's own answer.
 */
export function useGraphCorpus(): NetworkRead<GraphCorpus> {
    const { version: specVersion, loaded: specsLoaded, failed: specsFailed } = useClauseSpecs();
    const { read: choicesRead } = useAssemblyChoices();
    const choices = choicesRead.status === "present" ? choicesRead.value : null;
    const assembliesFailed = choicesRead.status === "absent";
    const [corpus, setCorpus] = useState<NetworkRead<GraphCorpus>>(PENDING);

    // The loaded assemblies, in the minimal shape the read needs: the
    // registered identity + name, and each agreement's composed clause values
    // (where the designer's utility-token pin lives).
    const assemblies = useMemo<CorpusAssembly[]>(
        () =>
            (choices ?? [])
                .flatMap((a) => (a.hydratedAssembly === null ? [] : [{ a, hydrated: a.hydratedAssembly }]))
                .map(({ a, hydrated }) => ({
                    processDesignHash: a.processDesignHash,
                    agreementHashes: hydrated.assembly.agreements.map((entry) => entry.agreementHash),
                    name: a.name,
                    entries: hydrated.assembly.agreements.map((entry) => ({ id: entry.id, follows: [...(entry.follows ?? [])] })),
                    clauseSets: [
                        // Assembly-scoped clauses compose ONCE for the whole
                        // design — a denomination pin lives here, not in an
                        // agreement — so both sets are read.
                        ...(hydrated.assembly.assemblyClauses
                            ? [{ clauses: hydrated.assembly.assemblyClauses }]
                            : []),
                        ...hydrated.assembly.agreements.map((entry) => ({
                            clauses: agreementClauses(hydrated, entry),
                        })),
                    ],
                })),
        [choices],
    );

    const inputsLoaded = corpusInputsLoaded(choices, assembliesFailed, specsLoaded);

    // A failed clause-registry read: nothing is known of the terms the corpus
    // reads, so the corpus is absent, not pending for ever. Set during render,
    // on the render the registry read fails (`useDepsChanged`).
    const specsFailedChanged = useDepsChanged([specsFailed]);
    if (specsFailedChanged && specsFailed) setCorpus(ABSENT);

    useEffect(() => {
        if (specsFailed || !inputsLoaded) return;
        return applyUntilCleanup(readNetwork("useGraphCorpus", () => readGraphCorpus({ assemblies })), setCorpus);
        // `specVersion` bumps as clause specs resolve from IPFS: overlays
        // decode and provenance attributions appear without a reload.
    }, [specsFailed, inputsLoaded, assemblies, specVersion]);

    return corpus;
}
