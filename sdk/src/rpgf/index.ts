/**
 * RPGF recompute — the reference implementation of `sdk/src/rpgf/formula.json`.
 *
 * The RpgfMinter's distribution is OPTIMISTIC: anyone posts a tranche's payout
 * Merkle root, anyone recomputes it from public chain events and challenges a
 * mismatch. This module IS that recompute: deterministic integer arithmetic
 * (no floats anywhere), one canonical answer for any event window. The
 * formula-spec file's exact bytes are anchored on-chain as
 * `RpgfMinter.formulaHash`; this implementation mirrors it and the two must
 * move in lockstep.
 *
 * Pipeline: `fetchRpgfEventStream` (chain logs, window-clamped) →
 * `computeRpgfAllocations` (pure aggregation + scoring + water-filled cap) →
 * `buildRpgfTree` (leaves, root, claim proofs).
 */

import type { Address, Hex, PublicClient } from "viem";
import { decodeEventLog, encodeAbiParameters, keccak256, stringToHex } from "viem";
import {
    ATTESTATION_COORDINATOR_ABI,
    ASSEMBLY_REGISTRY_ABI,
    CLAUSE_REGISTRY_ABI,
    CORE_ABI,
    SELLER_REGISTRY_ABI,
} from "../abis.js";
import { canonicalizeSectionData } from "../agreement.js";
import { computeClauseKey } from "../discovery.js";
import formula from "./formula.json" with { type: "json" };

// ── Formula constants — derived from the canonical artifact, never
//    restated in code. The clause identity of the provenance leg, the
//    article sets, and every cap live in formula.json; this module only
//    executes what the anchored spec declares. ──────────────────────

export const RPGF_FORMULA = formula;
export const RPGF_PAIR_CAP: number = formula.parameters.pairCap;
export const RPGF_TIER1_ARTICLES: readonly string[] = formula.parameters.tier1Articles;
export const RPGF_EXCLUDED_ARTICLES: readonly string[] = formula.parameters.excludedArticles;
export const RPGF_CAP_NUMERATOR = BigInt(formula.parameters.capNumerator);
export const RPGF_CAP_DENOMINATOR = BigInt(formula.parameters.capDenominator);
export const RPGF_PROVENANCE_CLAUSE: string = formula.parameters.provenanceClauseId;

/** The contentRef a re-asserting provenance attestation carries for a given
 *  compositionHash: keccak256 of the canonical-JSON section bytes — the SAME
 *  bytes the SDK's agreement encoding commits (content defaults to
 *  sectionData). The inversion table enumerates registered hashes with this. */
export function provenanceContentRef(compositionHash: Hex): Hex {
    return keccak256(
        stringToHex(canonicalizeSectionData({ [formula.parameters.provenanceField]: compositionHash })),
    );
}
/** Canonical root for a window with no positive allocations. */
export const RPGF_EMPTY_ROOT: Hex = keccak256(stringToHex(formula.parameters.emptyRootPreimage));

// ── Event-stream types ───────────────────────────────────────────────

interface LogMeta {
    blockNumber: bigint;
    logIndex: number;
}

export interface RpgfOrderEvent extends LogMeta {
    orderHash: Hex;
    processId: Hex;
    buyer: Address;
    seller: Address;
}

export interface RpgfResolvedEvent extends LogMeta {
    processId: Hex;
}

export interface RpgfAttestationEvent extends LogMeta {
    orderHash: Hex;
    processId: Hex;
    clauseKey: Hex;
    contentRef: Hex;
}

export interface RpgfClauseRegisteredEvent extends LogMeta {
    clauseId: string;
    version: bigint;
    contentHash: Hex;
    contentURI: string;
    registrar: Address;
}

export interface RpgfAssemblyRegisteredEvent extends LogMeta {
    compositionHash: Hex;
    author: Address;
}

/** ClauseRegistry.DepositWithdrawn (key = clause idHash) or
 *  AssemblyRegistry.DepositWithdrawn (key = compositionHash). */
export interface RpgfWithdrawalEvent extends LogMeta {
    key: Hex;
}

export interface RpgfSellerStakeEvent extends LogMeta {
    seller: Address;
    kind: "registered" | "withdrawn";
}

export interface RpgfEventStream {
    orders: RpgfOrderEvent[];
    resolved: RpgfResolvedEvent[];
    attestations: RpgfAttestationEvent[];
    clausesRegistered: RpgfClauseRegisteredEvent[];
    clauseWithdrawals: RpgfWithdrawalEvent[];
    assembliesRegistered: RpgfAssemblyRegisteredEvent[];
    assemblyWithdrawals: RpgfWithdrawalEvent[];
    sellerStakeEvents: RpgfSellerStakeEvent[];
}

/** Clause classification input: the spec's `block.article`, from bytes the
 *  caller fetched via the registered contentURI and VERIFIED against the
 *  registration's contentHash. `null` = unavailable or hash-mismatched —
 *  such a clause scores zero (it can be neither classified nor excluded). */
export type RpgfSpecClassification = { article: string } | null;

export interface RpgfAllocation {
    account: Address;
    amount: bigint;
}

// ── Integer math ─────────────────────────────────────────────────────

/** Floor cube root over non-negative bigints (binary search). */
export function icbrt(n: bigint): bigint {
    if (n < 0n) throw new Error("icbrt: negative input");
    if (n < 8n) return n > 0n ? 1n : 0n;
    let lo = 1n;
    let hi = 1n << (BigInt(n.toString(2).length) / 3n + 1n);
    while (lo < hi) {
        const mid = (lo + hi + 1n) >> 1n;
        if (mid * mid * mid <= n) lo = mid;
        else hi = mid - 1n;
    }
    return lo;
}

/** Water-filled proportional split: floor shares of `total` by score, any
 *  wallet exceeding cap = floor(total·capNum/capDen) is fixed at the cap and
 *  the remainder re-splits among the uncapped. Deterministic; flooring dust
 *  stays unallocated. */
export function waterFill(
    scores: ReadonlyMap<Address, bigint>,
    total: bigint,
    capNumerator: bigint = RPGF_CAP_NUMERATOR,
    capDenominator: bigint = RPGF_CAP_DENOMINATOR,
): Map<Address, bigint> {
    const cap = (total * capNumerator) / capDenominator;
    const out = new Map<Address, bigint>();
    let pool = total;
    // Deterministic iteration order regardless of insertion order.
    let open = [...scores.entries()].filter(([, s]) => s > 0n).sort(([a], [b]) => (a < b ? -1 : 1));
    for (;;) {
        const sum = open.reduce((acc, [, s]) => acc + s, 0n);
        if (sum === 0n) break;
        const overflowing = open.filter(([, s]) => (pool * s) / sum > cap);
        if (overflowing.length === 0) {
            for (const [account, s] of open) {
                const amount = (pool * s) / sum;
                if (amount > 0n) out.set(account, amount);
            }
            break;
        }
        for (const [account] of overflowing) out.set(account, cap);
        pool -= cap * BigInt(overflowing.length);
        const capped = new Set(overflowing.map(([a]) => a));
        open = open.filter(([a]) => !capped.has(a));
    }
    return out;
}

// ── Merkle (mirrors RpgfMinter.claim's leaf + OZ sorted-pair verify) ─

export function rpgfLeaf(account: Address, amount: bigint): Hex {
    return keccak256(keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [account, amount])));
}

function hashPair(a: Hex, b: Hex): Hex {
    const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
    return keccak256(`0x${lo.slice(2)}${hi.slice(2)}`);
}

export interface RpgfTree {
    root: Hex;
    /** Claim proof for a leaf (throws if the leaf is not in the tree). */
    proofOf(leaf: Hex): Hex[];
}

/** Sorted-leaf, sorted-pair tree per the formula spec: leaves ascending,
 *  adjacent pairs hash as keccak(min‖max), an odd node promotes unchanged.
 *  Empty leaf set → the canonical empty root (unclaimable). */
export function buildRpgfTree(leaves: readonly Hex[]): RpgfTree {
    if (leaves.length === 0) {
        return {
            root: RPGF_EMPTY_ROOT,
            proofOf() {
                throw new Error("empty tree has no proofs");
            },
        };
    }
    const levels: Hex[][] = [[...leaves].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))];
    while (levels[levels.length - 1].length > 1) {
        const prev = levels[levels.length - 1];
        const next: Hex[] = [];
        for (let i = 0; i < prev.length; i += 2) {
            next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
        }
        levels.push(next);
    }
    return {
        root: levels[levels.length - 1][0],
        proofOf(leaf: Hex): Hex[] {
            let index = levels[0].findIndex((l) => l.toLowerCase() === leaf.toLowerCase());
            if (index === -1) throw new Error("leaf not in tree");
            const proof: Hex[] = [];
            for (let level = 0; level < levels.length - 1; level++) {
                const nodes = levels[level];
                const sibling = index % 2 === 0 ? index + 1 : index - 1;
                if (sibling < nodes.length) proof.push(nodes[sibling]);
                index = Math.floor(index / 2);
            }
            return proof;
        },
    };
}

// ── Aggregation (pure — the formula itself) ──────────────────────────

interface ArtifactAccumulator {
    /** counted process ids after the pair cap */
    processes: Set<Hex>;
    pairs: Set<string>;
    positionSum: bigint;
    positionCount: bigint;
    tier1: boolean;
    recipient: Address;
}

function scoreOf(acc: ArtifactAccumulator): bigint {
    const c = BigInt(acc.processes.size);
    const d = BigInt(acc.pairs.size);
    if (c === 0n || d === 0n || acc.positionCount === 0n) return 0n;
    const wCategory = acc.tier1 ? 3000n : 1000n;
    let wTopology = (acc.positionSum * 1000n) / acc.positionCount;
    if (wTopology < 1000n) wTopology = 1000n;
    if (wTopology > 3000n) wTopology = 3000n;
    const wTotal = 1000n + (wCategory - 1000n) + (wTopology - 1000n);
    return wTotal * icbrt(c * d * d * 10n ** 18n);
}

/** The formula: aggregate an event window into per-wallet FIG allocations.
 *  `specByClauseId` carries the contentHash-VERIFIED classification of every
 *  clause id appearing in the window (see RpgfSpecClassification). */
export function computeRpgfAllocations(
    stream: RpgfEventStream,
    specByClauseId: ReadonlyMap<string, RpgfSpecClassification>,
    trancheAmount: bigint,
): RpgfAllocation[] {
    const byLog = (a: LogMeta, b: LogMeta) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1;

    // Orders: per-process commit order gives chain positions and the root order.
    const orderByHash = new Map<Hex, RpgfOrderEvent>();
    const ordersByProcess = new Map<Hex, RpgfOrderEvent[]>();
    for (const o of [...stream.orders].sort(byLog)) {
        orderByHash.set(o.orderHash, o);
        const list = ordersByProcess.get(o.processId) ?? [];
        list.push(o);
        ordersByProcess.set(o.processId, list);
    }
    const chainPosition = (o: RpgfOrderEvent): bigint =>
        BigInt((ordersByProcess.get(o.processId) ?? []).findIndex((x) => x.orderHash === o.orderHash) + 1);

    // Resolved-only filter, in resolution order (the pair cap picks the first 5).
    const resolutions = [...stream.resolved].sort(byLog);
    const resolvedAt = new Map<Hex, LogMeta>();
    for (const r of resolutions) if (!resolvedAt.has(r.processId)) resolvedAt.set(r.processId, r);

    // Staked-root-seller eligibility at the resolution log position.
    const stakeEventsBySeller = new Map<Address, RpgfSellerStakeEvent[]>();
    for (const e of [...stream.sellerStakeEvents].sort(byLog)) {
        const list = stakeEventsBySeller.get(e.seller) ?? [];
        list.push(e);
        stakeEventsBySeller.set(e.seller, list);
    }
    const stakedAt = (seller: Address, at: LogMeta): boolean => {
        let staked = false;
        for (const e of stakeEventsBySeller.get(seller) ?? []) {
            if (byLog(e, at) > 0) break;
            staked = e.kind === "registered";
        }
        return staked;
    };
    const eligible = new Set<Hex>();
    for (const [processId, at] of resolvedAt) {
        const root = ordersByProcess.get(processId)?.[0];
        if (root && stakedAt(root.seller, at)) eligible.add(processId);
    }

    // Clause registrations: author of record (first registration of the string
    // id), key→id mapping across versions, live-stake filter, classification.
    const regsByClauseId = new Map<string, RpgfClauseRegisteredEvent[]>();
    const clauseIdByKey = new Map<Hex, string>();
    for (const reg of [...stream.clausesRegistered].sort(byLog)) {
        const list = regsByClauseId.get(reg.clauseId) ?? [];
        list.push(reg);
        regsByClauseId.set(reg.clauseId, list);
        clauseIdByKey.set(computeClauseKey(reg.clauseId, reg.version).toLowerCase() as Hex, reg.clauseId);
    }
    const withdrawnClauseKeys = new Set(stream.clauseWithdrawals.map((w) => w.key.toLowerCase()));
    const clauseStakeLive = (clauseId: string): boolean =>
        (regsByClauseId.get(clauseId) ?? []).some(
            (reg) => !withdrawnClauseKeys.has(computeClauseKey(reg.clauseId, reg.version).toLowerCase()),
        );

    // Assemblies: designer of record, live stake, contentRef inversion table.
    const assemblyByHash = new Map<Hex, RpgfAssemblyRegisteredEvent>();
    for (const a of [...stream.assembliesRegistered].sort(byLog)) {
        const key = a.compositionHash.toLowerCase() as Hex;
        if (!assemblyByHash.has(key)) assemblyByHash.set(key, a);
    }
    const withdrawnAssemblies = new Set(stream.assemblyWithdrawals.map((w) => w.key.toLowerCase()));
    const assemblyByContentRef = new Map<Hex, Hex>();
    for (const key of assemblyByHash.keys()) {
        assemblyByContentRef.set(provenanceContentRef(key).toLowerCase() as Hex, key);
    }

    // Group counted attestations per artifact, honoring eligibility.
    const attestations = [...stream.attestations].sort(byLog);
    const clauseProcessAttestations = new Map<string, Map<Hex, RpgfAttestationEvent[]>>();
    const assemblyProcesses = new Map<Hex, Set<Hex>>();
    for (const att of attestations) {
        const order = orderByHash.get(att.orderHash);
        if (!order || !eligible.has(att.processId)) continue;
        const clauseId = clauseIdByKey.get(att.clauseKey.toLowerCase() as Hex);
        if (!clauseId) continue;
        if (clauseId === RPGF_PROVENANCE_CLAUSE) {
            const compositionHash = assemblyByContentRef.get(att.contentRef.toLowerCase() as Hex);
            if (!compositionHash || withdrawnAssemblies.has(compositionHash)) continue;
            const set = assemblyProcesses.get(compositionHash) ?? new Set<Hex>();
            set.add(att.processId);
            assemblyProcesses.set(compositionHash, set);
            continue;
        }
        const classification = specByClauseId.get(clauseId);
        if (!classification || RPGF_EXCLUDED_ARTICLES.includes(classification.article)) continue;
        if (!clauseStakeLive(clauseId)) continue;
        const perProcess = clauseProcessAttestations.get(clauseId) ?? new Map<Hex, RpgfAttestationEvent[]>();
        const list = perProcess.get(att.processId) ?? [];
        list.push(att);
        perProcess.set(att.processId, list);
        clauseProcessAttestations.set(clauseId, perProcess);
    }

    // Pair cap: at most RPGF_PAIR_CAP processes per root-order pair key per
    // artifact, first by resolution order.
    const rootPairKey = (processId: Hex): string => {
        const root = ordersByProcess.get(processId)![0];
        return `${root.buyer.toLowerCase()}|${root.seller.toLowerCase()}`;
    };
    const applyPairCap = (processIds: Iterable<Hex>): Set<Hex> => {
        const sorted = [...processIds].sort((a, b) => byLog(resolvedAt.get(a)!, resolvedAt.get(b)!));
        const perPair = new Map<string, number>();
        const kept = new Set<Hex>();
        for (const processId of sorted) {
            const key = rootPairKey(processId);
            const n = perPair.get(key) ?? 0;
            if (n < RPGF_PAIR_CAP) {
                perPair.set(key, n + 1);
                kept.add(processId);
            }
        }
        return kept;
    };

    // Score per artifact, then sum per wallet.
    const accumulators: ArtifactAccumulator[] = [];
    for (const [clauseId, perProcess] of clauseProcessAttestations) {
        const counted = applyPairCap(perProcess.keys());
        if (counted.size === 0) continue;
        const acc: ArtifactAccumulator = {
            processes: counted,
            pairs: new Set(),
            positionSum: 0n,
            positionCount: 0n,
            tier1: RPGF_TIER1_ARTICLES.includes(specByClauseId.get(clauseId)!.article),
            recipient: regsByClauseId.get(clauseId)![0].registrar,
        };
        for (const [processId, atts] of perProcess) {
            if (!counted.has(processId)) continue;
            for (const att of atts) {
                const order = orderByHash.get(att.orderHash)!;
                acc.pairs.add(`${order.buyer.toLowerCase()}|${order.seller.toLowerCase()}`);
                acc.positionSum += chainPosition(order);
                acc.positionCount += 1n;
            }
        }
        accumulators.push(acc);
    }
    for (const [compositionHash, processIds] of assemblyProcesses) {
        const counted = applyPairCap(processIds);
        if (counted.size === 0) continue;
        const acc: ArtifactAccumulator = {
            processes: counted,
            pairs: new Set(),
            positionSum: 0n,
            positionCount: 0n,
            tier1: false,
            recipient: assemblyByHash.get(compositionHash)!.author,
        };
        for (const processId of counted) {
            for (const order of ordersByProcess.get(processId) ?? []) {
                acc.pairs.add(`${order.buyer.toLowerCase()}|${order.seller.toLowerCase()}`);
                acc.positionSum += chainPosition(order);
                acc.positionCount += 1n;
            }
        }
        accumulators.push(acc);
    }

    const walletScores = new Map<Address, bigint>();
    for (const acc of accumulators) {
        const score = scoreOf(acc);
        if (score === 0n) continue;
        const key = acc.recipient.toLowerCase() as Address;
        walletScores.set(key, (walletScores.get(key) ?? 0n) + score);
    }

    const allocations = waterFill(walletScores, trancheAmount);
    return [...allocations.entries()]
        .filter(([, amount]) => amount > 0n)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([account, amount]) => ({ account, amount }));
}

// ── Chain fetcher (window-clamped) ───────────────────────────────────

export interface RpgfContractAddresses {
    figaroCore: Address;
    attestationCoordinator: Address;
    clauseRegistry: Address;
    assemblyRegistry: Address;
    sellerRegistry: Address;
}

/** Fetch the full formula input for a window `[0, toBlock]` from chain logs. */
export async function fetchRpgfEventStream(
    client: PublicClient,
    addresses: RpgfContractAddresses,
    toBlock: bigint,
): Promise<RpgfEventStream> {
    const range = { fromBlock: 0n, toBlock } as const;
    const [coreLogs, attLogs, clauseLogs, assemblyLogs, sellerLogs] = await Promise.all([
        client.getLogs({ address: addresses.figaroCore, ...range }),
        client.getLogs({ address: addresses.attestationCoordinator, ...range }),
        client.getLogs({ address: addresses.clauseRegistry, ...range }),
        client.getLogs({ address: addresses.assemblyRegistry, ...range }),
        client.getLogs({ address: addresses.sellerRegistry, ...range }),
    ]);

    const stream: RpgfEventStream = {
        orders: [],
        resolved: [],
        attestations: [],
        clausesRegistered: [],
        clauseWithdrawals: [],
        assembliesRegistered: [],
        assemblyWithdrawals: [],
        sellerStakeEvents: [],
    };
    const meta = (log: { blockNumber: bigint | null; logIndex: number | null }): LogMeta => ({
        blockNumber: log.blockNumber ?? 0n,
        logIndex: log.logIndex ?? 0,
    });

    for (const log of coreLogs) {
        try {
            const d = decodeEventLog({ abi: CORE_ABI, data: log.data, topics: log.topics });
            const a = d.args as Record<string, unknown>;
            if (d.eventName === "OrderCommitted") {
                stream.orders.push({
                    ...meta(log),
                    orderHash: a.orderHash as Hex,
                    processId: a.processId as Hex,
                    buyer: a.buyer as Address,
                    seller: a.seller as Address,
                });
            } else if (d.eventName === "ProcessResolved") {
                stream.resolved.push({ ...meta(log), processId: a.processId as Hex });
            }
        } catch {
            /* other core events are not formula inputs */
        }
    }
    for (const log of attLogs) {
        try {
            const d = decodeEventLog({ abi: ATTESTATION_COORDINATOR_ABI, data: log.data, topics: log.topics });
            if (d.eventName !== "Attestation") continue;
            const a = d.args as Record<string, unknown>;
            stream.attestations.push({
                ...meta(log),
                orderHash: a.orderHash as Hex,
                processId: a.processId as Hex,
                clauseKey: a.clauseId as Hex,
                contentRef: a.contentRef as Hex,
            });
        } catch {
            /* ignore */
        }
    }
    for (const log of clauseLogs) {
        try {
            const d = decodeEventLog({ abi: CLAUSE_REGISTRY_ABI, data: log.data, topics: log.topics });
            const a = d.args as Record<string, unknown>;
            if (d.eventName === "ClauseRegistered") {
                stream.clausesRegistered.push({
                    ...meta(log),
                    clauseId: a.clauseId as string,
                    version: a.version as bigint,
                    contentHash: a.contentHash as Hex,
                    contentURI: a.contentURI as string,
                    registrar: a.registrar as Address,
                });
            } else if (d.eventName === "DepositWithdrawn") {
                stream.clauseWithdrawals.push({ ...meta(log), key: a.clauseId as Hex });
            }
        } catch {
            /* ignore */
        }
    }
    for (const log of assemblyLogs) {
        try {
            const d = decodeEventLog({ abi: ASSEMBLY_REGISTRY_ABI, data: log.data, topics: log.topics });
            const a = d.args as Record<string, unknown>;
            if (d.eventName === "AssemblyRegistered") {
                stream.assembliesRegistered.push({
                    ...meta(log),
                    compositionHash: a.compositionHash as Hex,
                    author: a.author as Address,
                });
            } else if (d.eventName === "DepositWithdrawn") {
                stream.assemblyWithdrawals.push({ ...meta(log), key: a.compositionHash as Hex });
            }
        } catch {
            /* ignore */
        }
    }
    for (const log of sellerLogs) {
        try {
            const d = decodeEventLog({ abi: SELLER_REGISTRY_ABI, data: log.data, topics: log.topics });
            const a = d.args as Record<string, unknown>;
            if (d.eventName === "SellerRegistered") {
                stream.sellerStakeEvents.push({ ...meta(log), seller: a.seller as Address, kind: "registered" });
            } else if (d.eventName === "SellerWithdrawn") {
                stream.sellerStakeEvents.push({ ...meta(log), seller: a.seller as Address, kind: "withdrawn" });
            }
        } catch {
            /* ignore */
        }
    }
    return stream;
}
