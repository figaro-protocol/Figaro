"use client";

/**
 * graphCorpus — the explorer's READ: chain events in, projected graphs out.
 *
 * The four steps are the analyst runnable's own
 * (`ecosystem-agents/runtime/analyst.mjs`), performed in the browser against
 * the same SDK: FETCH the events, RECOVER what substance is publicly
 * recoverable, PROJECT the graphs, and let the caller ANSWER. Nothing is
 * re-derived here — the projections are `@figaro-protocol/sdk/derive`'s and
 * the events come from the frontend's EXISTING caches (`lib/kernel/indexer.ts`
 * for FigaroCore's own log, `lib/composition/indexer.ts` for attestations
 * across both resolution paths), so this module adds a fold, never a
 * second indexer.
 *
 * Three boundaries this reader states rather than papers over:
 *
 *   core events are DIRECT-PATH by construction. A batch resolves token
 *   positions and re-emits no order events, so a batch-resolved process is
 *   absent from the process and resolution graphs by design. Only
 *   ATTESTATIONS are emitted on both paths, which is why they are read from both
 *   emitters and tagged.
 *
 *   substance is recovered AT THE EDGE, and often absent. An attestation's
 *   `contentRef` IS its content address (the bytes are pinned as a raw block
 *   multihashed with keccak-256), so a public payload resolves from the
 *   fingerprint alone; a withheld, private, erased or unserved payload
 *   resolves to nothing and its entry stays fingerprint-only.
 *
 *   assembly attribution rides a DECLARED FIELD, never a clause name. A
 *   process is attributed when some attested overlay decodes a
 *   `compositionHash` — the provenance section the buyer attests. No such
 *   attestation, no attribution: the process is counted as unattributed and
 *   said to be.
 */

import { useEffect, useMemo, useState } from "react";
import type { Hex, PublicClient } from "viem";
import {
    parseOrderCommittedLogs,
    parseOrderResolvedLogs,
    parseProcessResolvedLogs,
    readUtilityTokenPin,
    type Address,
} from "@figaro-protocol/sdk";
import {
    extractOverlays,
    marketShape,
    projectProcessGraph,
    projectResolutionGraph,
    projectValueFlow,
    readFundingLegs,
    type MarketShape,
    type OverlayGraph,
    type ProcessGraph,
    type RecoveredAttestation,
    type ResolutionGraph,
    type SwapLeg,
    type ValueFlowGraph,
    type VenueEvent,
} from "@figaro-protocol/sdk/derive";
import {
    getAllOrderCommitted,
    getAllOrderResolved,
    getAllProcessResolved,
    getReceiptLogsOf,
    type IndexedLog,
} from "@/lib/kernel/indexer";
import { getAllAttestationRecords } from "@/lib/composition/indexer";
import { fetchWitnessContent } from "@/lib/composition/witnessContent";
import { getSwapRouter, getWitnessSwapAndCommitCoordinator } from "@/lib/composition/contracts";
import { ERC20_ABI } from "@/lib/kernel/contracts";
import { isBytes32Hex } from "@/lib/shared/evm";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { activeChain, publicClient } from "@/lib/shared/wagmi";
import { useAssemblyChoices } from "@/lib/protocol/assemblyChoices";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";

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
 *  which is honest, rather than assuming 18 decimals.
 *
 *  @public — names the value type of `GraphCorpus.tokenMeta`, so any consumer
 *  formatting an amount in its own denomination needs it even though nothing
 *  imports it by name today. */
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
    /** Per-assembly aggregates, keyed by declared compositionHash. */
    market: MarketShape;
    /** How much attested substance this pass recovered, and how much it tried. */
    substance: { attempted: number; recovered: number; total: number };
    /** Lowercased token address → metadata, absent when unreadable. */
    tokenMeta: Map<string, TokenMeta>;
    /** The composed swap venue this deployment records, or null. */
    venue: string | null;
    /** compositionHash (lowercased) → registered assembly name. */
    assemblyNames: Map<string, string>;
    /** processId (lowercased) → the attribution key an attested provenance
     *  overlay declared for it. A process absent from this map is the honest
     *  unattributed case, counted in `market.unattributedProcessCount`. */
    attributionByProcess: Map<string, string>;
}

/** A published assembly in the minimal shape this read needs: its registered
 *  identity and name, plus every composed clause set the designer composed
 *  (the assembly-scoped set, where a denomination pin composes once, and each
 *  agreement's own set). */
interface CorpusTemplate {
    compositionHash: `0x${string}`;
    name: string;
    clauseSets: readonly Record<string, Record<string, unknown>>[];
}

/** Read FigaroCore's own log through the existing cache and shape it into the
 *  SDK's `CoreEvents` triple. Direct-path by construction (see the header). */
async function readCoreEvents(client: PublicClient, chainId: number) {
    const [committed, resolved, processResolved] = await Promise.all([
        getAllOrderCommitted(client, chainId),
        getAllOrderResolved(client, chainId),
        getAllProcessResolved(client, chainId),
    ]);
    type SdkLogs = Parameters<typeof parseOrderCommittedLogs>[0];
    return {
        events: {
            orderCommitted: parseOrderCommittedLogs(committed as unknown as SdkLogs),
            orderResolved: parseOrderResolvedLogs(resolved as unknown as SdkLogs),
            processResolved: parseProcessResolvedLogs(processResolved as unknown as SdkLogs),
        },
        committedLogs: committed,
    };
}

/** How many commit receipts one pass reads at a time. */
const RECEIPT_READ_BATCH = 8;

/**
 * The funding legs beside the commits: every commit transaction's receipt,
 * read once per transaction hash through the receipt cache, run through the
 * SDK's `readFundingLegs` with the order's own parties and denomination and
 * the deployment's coordinator. The coordinator emits nothing of its own; the
 * venue's ERC-20 transfers in the receipt are the swap leg. A receipt that
 * cannot be read yields no legs and a logged absence for this pass.
 */
async function readCommitFundingLegs(
    client: PublicClient,
    chainId: number,
    committedLogs: readonly IndexedLog[],
    orderCommitted: ReturnType<typeof parseOrderCommittedLogs>,
): Promise<VenueEvent<SwapLeg>[]> {
    const coordinator = getWitnessSwapAndCommitCoordinator();
    if (!coordinator) return [];
    const logByTx = new Map<string, IndexedLog>();
    for (const log of committedLogs) {
        if (log.transactionHash) logByTx.set(String(log.transactionHash).toLowerCase(), log);
    }
    const ordersByTx = new Map<string, typeof orderCommitted>();
    for (const order of orderCommitted) {
        if (!order.transactionHash) continue;
        const tx = order.transactionHash.toLowerCase();
        ordersByTx.set(tx, [...(ordersByTx.get(tx) ?? []), order]);
    }
    const legs: VenueEvent<SwapLeg>[] = [];
    const seen = new Set<string>();
    const txs = [...ordersByTx.keys()];
    for (let i = 0; i < txs.length; i += RECEIPT_READ_BATCH) {
        await Promise.all(txs.slice(i, i + RECEIPT_READ_BATCH).map(async (tx) => {
            const log = logByTx.get(tx);
            if (!log) return;
            let receiptLogs: Awaited<ReturnType<typeof getReceiptLogsOf>>;
            try {
                receiptLogs = await getReceiptLogsOf(client, chainId, log);
            } catch (err) {
                console.warn(`[graphCorpus] the receipt of ${tx} is unreadable this pass; its funding legs are absent:`, err);
                return;
            }
            if (!receiptLogs) return;
            for (const order of ordersByTx.get(tx) ?? []) {
                type ReceiptLogs = Parameters<typeof readFundingLegs>[0];
                for (const leg of readFundingLegs(receiptLogs as unknown as ReceiptLogs, order, coordinator)) {
                    const key = `${tx}|${leg.payload.party.toLowerCase()}|${leg.payload.tokenIn.toLowerCase()}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    legs.push(leg);
                }
            }
        }));
    }
    return legs;
}

/**
 * Assembly attribution from the OVERLAYS, by declared field.
 *
 * The buyer's attestation of the provenance section is the on-chain link
 * between a process and the registered assembly that shaped it, and its
 * payload is publicly recoverable — so a walletless reader can attribute a
 * process without holding anyone's agreement body. The field is found by the
 * spec DECLARING it (`compositionHash`), never by clause id: a provenance
 * clause this codebase has never seen attributes the same way.
 */
function attributionFromOverlays(overlays: readonly OverlayGraph[]): Map<string, string> {
    const byProcess = new Map<string, string>();
    for (const graph of overlays) {
        if (!graph.spec?.fields.some((f) => f.name === "compositionHash")) continue;
        for (const entry of graph.entries) {
            const value = entry.decoded?.["compositionHash"];
            if (isBytes32Hex(value)) {
                byProcess.set(entry.processId.toLowerCase(), value.toLowerCase());
            }
        }
    }
    return byProcess;
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
 * One full pass. `deps` exist so the hook can hand in the templates it already
 * loaded (and so a caller can point the read at another client); with none it
 * uses the standalone public client, which is what makes this surface
 * walletless. Internal — `useGraphCorpus` is this module's contract.
 */
async function readGraphCorpus(deps?: {
    client?: PublicClient;
    chainId?: number;
    templates?: readonly CorpusTemplate[];
}): Promise<GraphCorpus> {
    const client = deps?.client ?? (publicClient as unknown as PublicClient);
    const chainId = deps?.chainId ?? activeChain.id;

    // 1. FETCH — FigaroCore's log, and attestations from BOTH universes.
    const [{ events: core, committedLogs }, attestations] = await Promise.all([
        readCoreEvents(client, chainId),
        getAllAttestationRecords(client, chainId),
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
    // templates the page loaded — never a bundled token list.
    const pins: Address[] = [];
    for (const template of deps?.templates ?? []) {
        for (const clauses of template.clauseSets) {
            const pin = readUtilityTokenPin(clauses, specs);
            if (pin && !pins.includes(pin)) pins.push(pin);
        }
    }
    // The swap legs beside the commits: the value flowing between
    // denominations, read from the venue's own transfers.
    const valueFlow = projectValueFlow(resolution, fundingLegs, pins);

    const byProcess = attributionFromOverlays(overlays);
    const market = marketShape(process, (processId: Hex) => byProcess.get(processId.toLowerCase()));

    const tokenMeta = await readTokenMeta(client, valueFlow.nodes.map((n) => n.token));

    const assemblyNames = new Map<string, string>();
    for (const template of deps?.templates ?? []) {
        assemblyNames.set(template.compositionHash.toLowerCase(), template.name);
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
    };
}

/**
 * The explorer's corpus, read once per mount and re-read when the clause-spec
 * cache warms (a spec resolving turns a fingerprint-only overlay into a
 * decoded one, and can turn an unattributed process into an attributed one).
 *
 * `corpus` is null while the first read is in flight. `failed` is DISTINCT
 * from a resolved-empty corpus: empty data is absence and renders as
 * such; a failed read is unknown chain state and says so.
 */
export function useGraphCorpus(): { corpus: GraphCorpus | null; isLoading: boolean; failed: boolean } {
    const { version: specVersion } = useClauseSpecs();
    const { data: assemblies } = useAssemblyChoices();
    const [corpus, setCorpus] = useState<GraphCorpus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    // The loaded templates, in the minimal shape the read needs: the
    // registered identity + name, and each agreement's composed clause values
    // (where the designer's utility-token pin lives).
    const templates = useMemo<CorpusTemplate[]>(
        () =>
            (assemblies ?? [])
                .filter((a) => a.assemblyTemplate !== null)
                .map((a) => ({
                    compositionHash: a.compositionHash,
                    name: a.name,
                    clauseSets: [
                        // Assembly-scoped clauses compose ONCE for the whole
                        // design — a denomination pin lives here, not in an
                        // agreement — so both sets are read.
                        ...(a.assemblyTemplate?.assemblyClauses ? [a.assemblyTemplate.assemblyClauses] : []),
                        ...(a.assemblyTemplate?.agreements ?? []).map((agreement) => agreement.clauses),
                    ],
                })),
        [assemblies],
    );

    useEffect(() => {
        let canceled = false;
        setIsLoading(true);
        setFailed(false);
        readGraphCorpus({ templates })
            .then((next) => {
                if (canceled) return;
                setCorpus(next);
                setIsLoading(false);
            })
            .catch((err) => {
                if (canceled) return;
                console.warn("[useGraphCorpus] read failed:", err);
                setFailed(true);
                setIsLoading(false);
            });
        return () => {
            canceled = true;
        };
        // `specVersion` bumps as clause specs resolve from IPFS: overlays
        // decode and provenance attributions appear without a reload.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templates, specVersion]);

    return { corpus, isLoading, failed };
}
