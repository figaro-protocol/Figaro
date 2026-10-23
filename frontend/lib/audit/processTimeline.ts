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

import { getAbiItem, type Abi, type PublicClient } from "viem";
import { CORE_ABI, CONTRACTS } from "@/lib/kernel/contracts";
import { ATTESTATION_COORDINATOR_ABI } from "@figaro-protocol/sdk";
import { getAttestationCoordinator } from "@/lib/composition/contracts";
import { cachedGetContractEvents, deploymentBlock, getLogsAdaptive, type LogScanClient } from "@/lib/kernel/eventCache";
import { activeChain } from "@/lib/shared/chains";
import { describeAttestation } from "@/lib/shared/clauseSpecSource";

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
     *  for the site's own deployment, the one the link names otherwise; null
     *  when none was named, so no attestation was scanned. */
    coordinatorAddress: `0x${string}` | null;
    /** The first block the scans read from. */
    scannedFromBlock: bigint;
    /** When the timeline was generated (ISO-8601). */
    generatedAt: string;
    /** Chronological list of events. */
    events: TimelineEvent[];
    /** Participating addresses (buyers + sellers) discovered from events. */
    participants: string[];
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

function weiToDecimal(v: unknown): string {
    if (v === undefined || v === null) return "0";
    const n = typeof v === "bigint" ? v : BigInt(String(v));
    const whole = n / 10n ** 18n;
    const frac = n % 10n ** 18n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
    return `${whole}.${fracStr}`;
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
     *  AttestationCoordinator the link names for a core other than the site's
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
    // The site's own deployment is read from its deployment block with its
    // own coordinator; any other core is read from the block the link names
    // (else genesis) with the coordinator the link names (else none) — the
    // site's coordinator address means nothing on another deployment.
    const ownDeployment = chainId === activeChain.id && coreAddress.toLowerCase() === CONTRACTS.core?.toLowerCase();
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
            .filter((l) => String(l.args?.processId ?? "").toLowerCase() === processId.toLowerCase())
            .map((l) => ({ ...l, blockNumber: BigInt(l.blockNumber ?? 0), transactionHash: l.transactionHash ?? undefined }));

    // ── OrderCommitted ─────────────────────────────────────────────
    const committedLogs = byProcess(await scanEvents({
        address: coreAddress,
        abi: CORE_ABI,
        eventName: "OrderCommitted",
    }));

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
    const resolvedLogs = byProcess(await scanEvents({
        address: coreAddress,
        abi: CORE_ABI,
        eventName: "OrderResolved",
    }));

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
            details: {
                sellerPayout: weiToDecimal(a.sellerPayout),
                buyerPayout: weiToDecimal(a.buyerPayout),
                orderHash: a.orderHash ?? "",
            },
        });
    }

    // ── Runtime attestations (every clause) ─────────────────────────
    // All attestations — lifecycle, proximity, disclosure, any permissionless
    // clause — arrive through AttestationCoordinator's unified Attestation
    // event, each labeled from its OWN spec. No clause names; an unknown
    // clause falls back to a short hash + stage (describeAttestation handles
    // it). The event's `contentRef = keccak256(content)` is a verification
    // digest, not an off-chain pointer.
    if (coordinatorAddr) {
        const attestLogs = byProcess(await scanEvents({
            address: coordinatorAddr,
            abi: ATTESTATION_COORDINATOR_ABI,
            eventName: "Attestation",
        }));
        for (const log of attestLogs) {
            const a = log.args as Partial<{
                clauseId: string;
                stage: bigint | number;
                orderHash: string;
                attester: string;
                contentRef: string;
            }>;
            if (!a.clauseId) continue;
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
                details: {
                    attester: a.attester ?? "",
                    stage: String(stage),
                    contentRef: a.contentRef ?? "",
                    clauseId: a.clauseId,
                },
            });
        }
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
        scannedFromBlock,
        generatedAt: new Date().toISOString(),
        events,
        participants: Array.from(participantSet),
        summary: {
            orderCount,
            resolvedCount,
            totalPayment: weiToDecimal(totalPayment),
            totalSellerPayout: weiToDecimal(totalSellerPayout),
            totalBuyerPayout: weiToDecimal(totalBuyerPayout),
        },
    };
}
