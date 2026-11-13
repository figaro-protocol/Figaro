/**
 * Process audit timeline.
 *
 * THE process event log for `audit/`: given a processId, queries all
 * FigaroCore lifecycle events AND every clause's runtime attestations (the
 * unified AttestationCoordinator event) and reconstructs a chronological,
 * human-readable timeline. Attestations are labeled from each clause's OWN
 * spec via `describeAttestation` (clause title + the enum value at `stage`) —
 * no clause names, no per-clause label maps, so a permissionlessly-registered
 * clause's attestations appear correctly with no code change.
 *
 * This is the audit documentation, and the audit documentation IS the
 * evidence: the same data the parties read is what a forum (Kleros or any
 * other) reads. There is no separate "evidence" timeline — the audit-bundle
 * PDF and the forum-facing `/evidence-display` reader are two views of THIS one
 * timeline. Pure read — no contract writes, no on-chain storage; the output is
 * serializable.
 */

import { erc20Abi, formatUnits, getAbiItem, type Abi, type PublicClient } from "viem";
import { CORE_ABI, CONTRACTS } from "@/lib/kernel/contracts";
import { ATTESTATION_COORDINATOR_ABI } from "@figaro-protocol/sdk";
import { getAttestationCoordinator, getBatchVerifier } from "@/lib/composition/contracts";
import type { ResolutionUniverse } from "@figaro-protocol/sdk";
import { cachedGetContractEvents, deploymentBlock, getLogsAdaptive, type LogScanClient } from "@/lib/kernel/eventCache";
import { activeChain } from "@/lib/shared/chains";
import { describeAttestation } from "@/lib/shared/clauseSpecSource";
import { hexEqual } from "@/lib/shared/evm";
import type { MissingPart } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineEvent {
    /** Human-readable label: "Order Created", "Order Accepted", etc. */
    label: string;
    /** Block number the event was emitted in. */
    blockNumber: bigint;
    /** Block timestamp (seconds since epoch). */
    timestamp: number;
    /** ISO-8601 formatted timestamp for human-readable display. */
    iso: string;
    /** Transaction hash for verification. */
    txHash: string;
    /** Content-addressed order hash. */
    orderHash: string;
    /** Source contract event name (e.g. "OrderCommitted"). */
    eventName: string;
    /** The path that emitted the event: "direct" (FigaroCore, the coordinator)
     *  or "batch" (the batch verifier's re-emission). */
    universe: ResolutionUniverse;
    /** Key fields from the event, stringified for display. */
    details: Record<string, string>;
}

export interface ProcessTimeline {
    /** The process ID being queried. */
    processId: string;
    /** Chain ID the process lives on. */
    chainId: number;
    /** FigaroCore contract address. */
    coreAddress: string;
    /** The AttestationCoordinator whose attestations were scanned — the site's
     *  for the page's deployment, the one the link names otherwise; null
     *  when none was named, so no attestation was scanned. */
    coordinatorAddress: `0x${string}` | null;
    /** The FigaroBatchVerifier whose events were scanned beside the Core's and
     *  the coordinator's: the site's for the page's deployment; null for any
     *  other deployment (a link names none, so no batched event was scanned). */
    batchVerifierAddress: `0x${string}` | null;
    /** The first block the scans read from. */
    scannedFromBlock: bigint;
    /** When the timeline was generated (ISO-8601). */
    generatedAt: string;
    /** Chronological list of events. */
    events: TimelineEvent[];
    /** Participating addresses (buyers + sellers) discovered from events. */
    participants: string[];
    /** What the scans could not read or place, each named with its reason. */
    missing: MissingPart[];
    /** Summary statistics. */
    summary: {
        orderCount: number;
        resolvedCount: number;
        totalPayment: string;
        totalSellerPayout: string;
        totalBuyerPayout: string;
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bigintStr(v: unknown): string {
    if (v === undefined || v === null) return "";
    if (typeof v === "bigint") return v.toString();
    return String(v);
}

/** An amount in the process token's own units, its `decimals()` read from the chain; nothing when
 *  the read failed — an amount not derived from the network is not surfaced. */
function amountIn(decimals: number | undefined) {
    return (v: unknown): string => {
        if (v === undefined || v === null) return "";
        const n = typeof v === "bigint" ? v : BigInt(String(v));
        return decimals === undefined ? "" : formatUnits(n, decimals);
    };
}

async function getBlockTimestamp(
    client: PublicClient,
    blockNumber: bigint,
    cache: Map<string, number>,
): Promise<number> {
    const key = blockNumber.toString();
    if (cache.has(key)) return cache.get(key)!;
    const block = await client.getBlock({ blockNumber });
    const ts = Number(block.timestamp);
    cache.set(key, ts);
    return ts;
}

// ---------------------------------------------------------------------------
// Core: fetch all FigaroCore events for a process
// ---------------------------------------------------------------------------

export async function buildProcessTimeline(
    client: PublicClient,
    processId: `0x${string}`,
    coreAddressOverride?: string,
    /** `sharedCache: false` for a client the site did not configure (an RPC a
     *  link names): its logs are read directly and never written into the
     *  event cache every other page reads. `coordinatorAddress` is the
     *  AttestationCoordinator the link names for a core other than the page's deployment's
     *  (the Core holds no pointer to its coordinator, so only the link can
     *  name it); `fromBlock` is the block the link names its deployment at.
     *  Neither given, an outside core is scanned from genesis for FigaroCore
     *  events alone. */
    options: { sharedCache?: boolean; coordinatorAddress?: `0x${string}` | null; fromBlock?: bigint } = {},
): Promise<ProcessTimeline> {
    const coreAddress = (coreAddressOverride ?? CONTRACTS.core) as `0x${string}`;
    if (!coreAddress) throw new Error("Core contract address is not configured");

    const chainId = await client.getChainId();
    const sharedCache = options.sharedCache ?? true;
    // The page's deployment is read from its deployment block with its
    // own coordinator; any other core is read from the block the link names
    // (else genesis) with the coordinator the link names (else none) — the
    // site's coordinator address means nothing on another deployment.
    const ownDeployment = chainId === activeChain.id && hexEqual(coreAddress, CONTRACTS.core);
    const scannedFromBlock = options.fromBlock ?? (ownDeployment ? deploymentBlock() : 0n);
    const coordinatorAddr: `0x${string}` | null = options.coordinatorAddress !== undefined
        ? options.coordinatorAddress
        : ownDeployment ? getAttestationCoordinator() : null;
    const scanEvents = (params: { address: `0x${string}`; abi: Abi | readonly unknown[]; eventName: string }) => {
        if (sharedCache) return cachedGetContractEvents(client, chainId, params);
        const event = getAbiItem({ abi: params.abi as Abi, name: params.eventName });
        if (!event) throw new Error(`buildProcessTimeline: ${params.eventName} is not in the given ABI`);
        return getLogsAdaptive(client as unknown as LogScanClient, {
            address: params.address,
            event: event as Parameters<typeof getLogsAdaptive>[1]["event"],
            fromBlock: scannedFromBlock,
        });
    };
    const blockCache = new Map<string, number>();
    const events: TimelineEvent[] = [];
    const participantSet = new Set<string>();

    // Summary accumulators
    let orderCount = 0;
    let resolvedCount = 0;
    let totalPayment = 0n;
    let totalSellerPayout = 0n;
    let totalBuyerPayout = 0n;

    // Every scan below rides the event cache (deployment block, adaptive
    // chunks, cached across renders — the same cache FigaroCore indexer
    // fills); the processId narrowing is client-side over it.
    // Cached logs type blockNumber as number | bigint (the IDB round-trip is
    // bigint-tagged, but the type stays open); normalize once here.
    type ScanLog = { args?: Record<string, unknown>; blockNumber?: number | bigint | null; transactionHash?: `0x${string}` | null };
    const byProcess = (logs: ScanLog[]) =>
        logs
            .filter((l) => hexEqual(String(l.args?.processId ?? ""), processId))
            .map((l) => ({ ...l, blockNumber: BigInt(l.blockNumber ?? 0), transactionHash: l.transactionHash ?? undefined }));

    // The batch verifier emits the Core's own order events and the coordinator's
    // `Attestation` for every batched order, so each is read at both addresses and
    // each row keeps the universe of the address that emitted it. Only the
    // page's own deployment names its verifier; another deployment is read at
    // what the link names, as for the coordinator.
    const verifierAddr: `0x${string}` | null = ownDeployment ? getBatchVerifier() : null;
    const scanBoth = async (
        direct: `0x${string}` | null,
        directAbi: Abi | readonly unknown[],
        eventName: string,
    ): Promise<(ReturnType<typeof byProcess>[number] & { universe: ResolutionUniverse })[]> => {
        const rows: (ReturnType<typeof byProcess>[number] & { universe: ResolutionUniverse })[] = [];
        for (const [address, universe] of [[direct, "direct"], [verifierAddr, "batch"]] as const) {
            if (!address) continue;
            const logs = byProcess(await scanEvents({ address, abi: directAbi, eventName }));
            rows.push(...logs.map((l) => ({ ...l, universe })));
        }
        return rows;
    };

    // ── OrderCommitted ─────────────────────────────────────────────
    const committedLogs = await scanBoth(coreAddress, CORE_ABI, "OrderCommitted");

    // One currency per process (the Core's rule), so one decimals() read covers every amount,
    // from whichever commit exists, direct or batched.
    const processCurrency = (committedLogs[0]?.args as { currency?: `0x${string}` } | undefined)?.currency;
    let processDecimals: number | undefined;
    const missing: MissingPart[] = [];
    if (processCurrency) {
        try {
            processDecimals = Number(await client.readContract({ address: processCurrency, abi: erc20Abi, functionName: "decimals" }));
        } catch {
            processDecimals = undefined;
            missing.push({
                part: "Amounts in the timeline and its summary, in the token's units",
                reason: `the decimals of the token ${processCurrency} could not be read, so no amount is shown`,
            });
        }
    } else if (committedLogs.length > 0) {
        missing.push({
            part: "Amounts in the timeline and its summary, in the token's units",
            reason: "no commitment event names the process's token, so no amount is shown",
        });
    }
    const weiToDecimal = amountIn(processDecimals);

    for (const log of committedLogs) {
        const a = log.args as Partial<{
            buyer: string;
            seller: string;
            currency: string;
            payment: bigint;
            orderHash: string;
        }>;
        const ts = await getBlockTimestamp(client, log.blockNumber!, blockCache);
        orderCount++;
        totalPayment += BigInt(a.payment ?? 0);
        if (a.buyer) participantSet.add(a.buyer.toLowerCase());

        events.push({
            label: "Order Committed",
            blockNumber: log.blockNumber!,
            timestamp: ts,
            iso: new Date(ts * 1000).toISOString(),
            txHash: log.transactionHash!,
            orderHash: a.orderHash ?? "",
            eventName: "OrderCommitted",
            universe: log.universe,
            details: {
                buyer: a.buyer ?? "",
                seller: a.seller ?? "",
                currency: a.currency ?? "",
                payment: weiToDecimal(a.payment),
                orderHash: a.orderHash ?? "",
            },
        });
    }

    // Live FigaroCore: no OrderAccepted event — orders are active on commit.

    // Live FigaroCore: no OrderCancelled event — orders resolve or stay active.

    // ── OrderResolved ───────────────────────────────────────────────
    const resolvedLogs = await scanBoth(coreAddress, CORE_ABI, "OrderResolved");

    for (const log of resolvedLogs) {
        const a = log.args as Partial<{
            sellerPayout: bigint;
            buyerPayout: bigint;
            orderHash: string;
        }>;
        const ts = await getBlockTimestamp(client, log.blockNumber!, blockCache);
        resolvedCount++;
        totalSellerPayout += BigInt(a.sellerPayout ?? 0);
        totalBuyerPayout += BigInt(a.buyerPayout ?? 0);

        events.push({
            label: "Order Resolved",
            blockNumber: log.blockNumber!,
            timestamp: ts,
            iso: new Date(ts * 1000).toISOString(),
            txHash: log.transactionHash!,
            orderHash: a.orderHash ?? "",
            eventName: "OrderResolved",
            universe: log.universe,
            details: {
                sellerPayout: weiToDecimal(a.sellerPayout),
                buyerPayout: weiToDecimal(a.buyerPayout),
                orderHash: a.orderHash ?? "",
            },
        });
    }

    // ── Runtime attestations (every clause) ─────────────────────────
    // All attestations — lifecycle, proximity, disclosure, any permissionless
    // clause — arrive through the unified Attestation event, from the
    // coordinator (direct) and the verifier (batch), each labeled from its OWN
    // spec. No clause names; an unknown clause falls back to a short hash +
    // stage (describeAttestation handles it). The event's
    // `contentRef = keccak256(content)` is a verification digest, not an
    // off-chain pointer.
    const attestLogs = await scanBoth(coordinatorAddr, ATTESTATION_COORDINATOR_ABI, "Attestation");
    for (const log of attestLogs) {
        const a = log.args as Partial<{
            clauseId: string;
            stage: bigint | number;
            orderHash: string;
            attester: string;
            contentRef: string;
        }>;
        if (!a.clauseId) {
            missing.push({
                part: `Attestation in transaction ${log.transactionHash ?? "unknown"}`,
                orderHash: a.orderHash,
                reason: "the event carries no clause key, so the timeline cannot label it",
            });
            continue;
        }
        const stage = Number(a.stage ?? 0);
        const ts = await getBlockTimestamp(client, log.blockNumber!, blockCache);
        const { clauseTitle, eventLabel } = describeAttestation(a.clauseId, stage);
        events.push({
            label: `${clauseTitle} — ${eventLabel}`,
            blockNumber: log.blockNumber!,
            timestamp: ts,
            iso: new Date(ts * 1000).toISOString(),
            txHash: log.transactionHash!,
            orderHash: a.orderHash ?? "",
            eventName: "Attestation",
            universe: log.universe,
            details: {
                attester: a.attester ?? "",
                stage: String(stage),
                contentRef: a.contentRef ?? "",
                clauseId: a.clauseId,
            },
        });
    }

    events.sort((a, b) => {
        const bn = Number(a.blockNumber - b.blockNumber);
        if (bn !== 0) return bn;
        return a.timestamp - b.timestamp;
    });

    return {
        processId,
        chainId,
        coreAddress,
        coordinatorAddress: coordinatorAddr,
        batchVerifierAddress: verifierAddr,
        scannedFromBlock,
        generatedAt: new Date().toISOString(),
        events,
        participants: Array.from(participantSet),
        missing,
        summary: {
            orderCount,
            resolvedCount,
            totalPayment: weiToDecimal(totalPayment),
            totalSellerPayout: weiToDecimal(totalSellerPayout),
            totalBuyerPayout: weiToDecimal(totalBuyerPayout),
        },
    };
}
