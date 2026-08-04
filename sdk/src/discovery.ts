/**
 * @figaro/sdk — Discovery Reconstructor
 *
 * The cold-start half of an agent's state. Where `state.ts`/`Topology`
 * reconstructs the processes an agent is ALREADY in, this module reconstructs
 * what EXISTS on the network — the three artifact families a fresh-key agent
 * has never seen: clauses, members, assemblies.
 *
 * It is a PARALLEL family, deliberately not folded into `Topology`: the
 * registries have no on-chain edges among themselves or to FigaroCore
 * (separation-of-concerns doctrine — each family its own anchor and its own
 * reducer). `DiscoveryGraph` mirrors `Topology`'s shape (applyEvents +
 * getters) so the two read the same way without knowing about each other.
 *
 * Surfacing derives from the LIVE stake (the registries' staked-intent model):
 * an artifact whose deposit has been withdrawn is de-surfaced. The three
 * families withdraw differently, and the reducer honours each:
 *   - clauses/assemblies — binding permanent, withdraw terminal ⇒ set-difference.
 *   - members — requesting withdrawal clears the guard and allows re-registration
 *     ⇒ the live state is order-dependent; the most-recent lifecycle event per
 *     address wins. De-surfacing is the REQUEST, not the later ETH release.
 *
 * Every returned artifact is a POINTER (contentURI/metadataURI). Hydrating the
 * pinned document from IPFS is the consumer's job — the SDK is viem-only.
 */

import { type PublicClient, type Log, decodeEventLog, keccak256, encodeAbiParameters } from "viem";
import {
    CLAUSE_REGISTRY_ABI,
    MEMBERS_REGISTRY_ABI,
    ASSEMBLY_REGISTRY_ABI,
} from "./abis.js";
import { fetchLogsChunked } from "./events.js";
import type {
    Hex,
    Address,
    FigaroAddresses,
    ClauseRegisteredEvent,
    ClauseWithdrawnEvent,
    MemberRegisteredEvent,
    MemberWithdrawnEvent,
    AssemblyRegisteredEvent,
    AssemblyWithdrawnEvent,
    RegisteredClause,
    RegisteredMember,
    RegisteredAssembly,
} from "./types.js";

// ── Clause key ───────────────────────────────────────────────────────────────

/**
 * The on-chain clause key: `keccak256(abi.encode(clauseId, version))`
 * (ClauseRegistry.sol:146). `ClauseRegistered` carries the bare name + version;
 * `DepositWithdrawn` carries only this key — so correlating a withdrawal to its
 * registration means recomputing it here.
 */
export function computeClauseKey(clauseId: string, version: number | bigint): Hex {
    return keccak256(
        encodeAbiParameters(
            [{ type: "string" }, { type: "uint64" }],
            [clauseId, BigInt(version)],
        ),
    );
}

// ── Log decoders ─────────────────────────────────────────────────────────────

export interface ClauseRegistryEvents {
    registered: ClauseRegisteredEvent[];
    withdrawn: ClauseWithdrawnEvent[];
}

export function parseClauseRegistryLogs(logs: Log[]): ClauseRegistryEvents {
    const registered: ClauseRegisteredEvent[] = [];
    const withdrawn: ClauseWithdrawnEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: CLAUSE_REGISTRY_ABI, data: log.data, topics: log.topics });
            const a = decoded.args as Record<string, unknown>;
            if (decoded.eventName === "ClauseRegistered") {
                registered.push({
                    clauseId: a.clauseId as string,
                    version: Number(a.version),
                    contentHash: a.contentHash as Hex,
                    contentURI: a.contentURI as string,
                    registrar: a.registrar as Address,
                    blockNumber: Number(log.blockNumber ?? 0),
                    logIndex: Number(log.logIndex ?? 0),
                    transactionHash: (log.transactionHash ?? null) as Hex | null,
                });
            } else if (decoded.eventName === "DepositWithdrawn") {
                withdrawn.push({
                    idHash: a.clauseId as Hex, // the withdraw event's `clauseId` IS the key hash
                    registrar: a.registrar as Address,
                    blockNumber: Number(log.blockNumber ?? 0),
                    logIndex: Number(log.logIndex ?? 0),
                });
            }
            // MechanismClauseSet is not a discovery input — skip.
        } catch {
            // Skip non-matching logs
        }
    }
    return { registered, withdrawn };
}

export interface MembersRegistryEvents {
    registered: MemberRegisteredEvent[];
    withdrawn: MemberWithdrawnEvent[];
}

export function parseMembersRegistryLogs(logs: Log[]): MembersRegistryEvents {
    const registered: MemberRegisteredEvent[] = [];
    const withdrawn: MemberWithdrawnEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: MEMBERS_REGISTRY_ABI, data: log.data, topics: log.topics });
            const a = decoded.args as Record<string, unknown>;
            if (decoded.eventName === "MemberRegistered" || decoded.eventName === "MemberProfileUpdated") {
                registered.push({
                    member: a.member as Address,
                    metadataURI: a.metadataURI as string,
                    updated: decoded.eventName === "MemberProfileUpdated",
                    blockNumber: Number(log.blockNumber ?? 0),
                    logIndex: Number(log.logIndex ?? 0),
                    transactionHash: (log.transactionHash ?? null) as Hex | null,
                });
            } else if (decoded.eventName === "MemberWithdrawalRequested") {
                // De-surfacing is at REQUEST, not at claim: the member leaves the
                // surface the moment they ask to, while the deposit stays locked
                // for the cooldown. Folding `MemberWithdrawn` instead would keep
                // a departed member visible for the whole cooldown.
                withdrawn.push({
                    member: a.member as Address,
                    blockNumber: Number(log.blockNumber ?? 0),
                    logIndex: Number(log.logIndex ?? 0),
                });
            }
        } catch {
            // Skip non-matching logs
        }
    }
    return { registered, withdrawn };
}

export interface AssemblyRegistryEvents {
    registered: AssemblyRegisteredEvent[];
    withdrawn: AssemblyWithdrawnEvent[];
}

export function parseAssemblyRegistryLogs(logs: Log[]): AssemblyRegistryEvents {
    const registered: AssemblyRegisteredEvent[] = [];
    const withdrawn: AssemblyWithdrawnEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: ASSEMBLY_REGISTRY_ABI, data: log.data, topics: log.topics });
            const a = decoded.args as Record<string, unknown>;
            if (decoded.eventName === "AssemblyRegistered") {
                registered.push({
                    compositionHash: a.compositionHash as Hex,
                    author: a.author as Address,
                    contentURI: a.contentURI as string,
                    blockNumber: Number(log.blockNumber ?? 0),
                    logIndex: Number(log.logIndex ?? 0),
                    transactionHash: (log.transactionHash ?? null) as Hex | null,
                });
            } else if (decoded.eventName === "DepositWithdrawn") {
                withdrawn.push({
                    compositionHash: a.compositionHash as Hex,
                    author: a.author as Address,
                    blockNumber: Number(log.blockNumber ?? 0),
                    logIndex: Number(log.logIndex ?? 0),
                });
            }
        } catch {
            // Skip non-matching logs
        }
    }
    return { registered, withdrawn };
}

// ── Bulk fetch ───────────────────────────────────────────────────────────────

export interface DiscoveryEvents {
    clauseRegistered: ClauseRegisteredEvent[];
    clauseWithdrawn: ClauseWithdrawnEvent[];
    memberRegistered: MemberRegisteredEvent[];
    memberWithdrawn: MemberWithdrawnEvent[];
    assemblyRegistered: AssemblyRegisteredEvent[];
    assemblyWithdrawn: AssemblyWithdrawnEvent[];
}

const EMPTY_DISCOVERY: DiscoveryEvents = {
    clauseRegistered: [],
    clauseWithdrawn: [],
    memberRegistered: [],
    memberWithdrawn: [],
    assemblyRegistered: [],
    assemblyWithdrawn: [],
};

/**
 * Fetch registry events across the given block range. Each family degrades
 * gracefully: a registry whose address is unconfigured contributes nothing,
 * so an agent pointed at a partial deployment still discovers what it can.
 *
 * `chunkSize` overrides `DEFAULT_LOG_CHUNK_SIZE` for providers with a
 * different (or no) block-range cap — see `fetchLogsChunked` (events.ts).
 */
export async function fetchDiscoveryEvents(
    client: PublicClient,
    addresses: FigaroAddresses,
    fromBlock: bigint = 0n,
    toBlock: bigint | "latest" = "latest",
    chunkSize?: bigint,
): Promise<DiscoveryEvents> {
    const [clause, seller, assembly] = await Promise.all([
        addresses.clauseRegistry
            ? fetchLogsChunked(client, { address: addresses.clauseRegistry, fromBlock, toBlock, chunkSize }).then(parseClauseRegistryLogs)
            : Promise.resolve({ registered: [], withdrawn: [] } as ClauseRegistryEvents),
        addresses.membersRegistry
            ? fetchLogsChunked(client, { address: addresses.membersRegistry, fromBlock, toBlock, chunkSize }).then(parseMembersRegistryLogs)
            : Promise.resolve({ registered: [], withdrawn: [] } as MembersRegistryEvents),
        addresses.assemblyRegistry
            ? fetchLogsChunked(client, { address: addresses.assemblyRegistry, fromBlock, toBlock, chunkSize }).then(parseAssemblyRegistryLogs)
            : Promise.resolve({ registered: [], withdrawn: [] } as AssemblyRegistryEvents),
    ]);

    return {
        clauseRegistered: clause.registered,
        clauseWithdrawn: clause.withdrawn,
        memberRegistered: seller.registered,
        memberWithdrawn: seller.withdrawn,
        assemblyRegistered: assembly.registered,
        assemblyWithdrawn: assembly.withdrawn,
    };
}

// ── One-shot reconstruction ──────────────────────────────────────────────────

/**
 * Reconstruct the live discovery view from a batch of registry events.
 *
 * A seller's current `metadataURI` is EVENT-DERIVED — `MembersRegistry` exposes
 * `register`/`updateProfile`/`withdraw` and NO view returning a seller's current
 * profile URI. There is no on-chain getter for a profile; the event log is the
 * read path — verify an `updateProfile` landed by re-running discovery (re-fetch
 * events, reconstruct, read the seller's folded latest-wins `metadataURI`).
 */
export function reconstructDiscovery(events: DiscoveryEvents): DiscoveryGraph {
    const graph = new DiscoveryGraph();
    graph.applyEvents(events);
    return graph;
}

// ── Incremental discovery graph ──────────────────────────────────────────────

interface ClauseEntry {
    clause: RegisteredClause;
    withdrawn: boolean;
}

interface AssemblyEntry {
    assembly: RegisteredAssembly;
    withdrawn: boolean;
}

/** A member's most-recent lifecycle event, folded in chronological order. */
interface MemberEntry {
    member: Address;
    metadataURI: string;
    live: boolean;
    /** (block, logIndex) of the event that set this state — for latest-wins folding. */
    at: readonly [number, number];
}

/**
 * Mutable discovery graph — the "shadow catalogue" an agent maintains, sibling
 * to `Topology`. Incrementally updated as new registry events arrive.
 */
export class DiscoveryGraph {
    private readonly clauses = new Map<Hex, ClauseEntry>(); // key: idHash
    private readonly assemblies = new Map<Hex, AssemblyEntry>(); // key: compositionHash
    private readonly members = new Map<string, MemberEntry>(); // key: lowercased address

    /** Apply a batch of registry events (e.g. from fetchDiscoveryEvents). */
    applyEvents(events: DiscoveryEvents): void {
        this.applyClauseEvents(events.clauseRegistered, events.clauseWithdrawn);
        this.applyAssemblyEvents(events.assemblyRegistered, events.assemblyWithdrawn);
        this.applyMemberEvents(events.memberRegistered, events.memberWithdrawn);
    }

    // ── Live views (deposit-withdrawn artifacts filtered out) ────────────────

    /** All live-staked clauses. */
    getClauses(): RegisteredClause[] {
        return [...this.clauses.values()].filter((e) => !e.withdrawn).map((e) => e.clause);
    }

    /** All live-staked assemblies. */
    getAssemblies(): RegisteredAssembly[] {
        return [...this.assemblies.values()].filter((e) => !e.withdrawn).map((e) => e.assembly);
    }

    /** All live-staked members. */
    getMembers(): RegisteredMember[] {
        return [...this.members.values()]
            .filter((e) => e.live)
            .map((e) => ({ member: e.member, metadataURI: e.metadataURI }));
    }

    /** A single clause by its on-chain key; undefined if unknown or de-surfaced. */
    getClause(idHash: Hex): RegisteredClause | undefined {
        const e = this.clauses.get(idHash);
        return e && !e.withdrawn ? e.clause : undefined;
    }

    /** A single assembly by compositionHash; undefined if unknown or de-surfaced. */
    getAssembly(compositionHash: Hex): RegisteredAssembly | undefined {
        const e = this.assemblies.get(compositionHash);
        return e && !e.withdrawn ? e.assembly : undefined;
    }

    /** A single member by address; undefined if unknown or de-surfaced. */
    getMember(member: Address): RegisteredMember | undefined {
        const e = this.members.get(member.toLowerCase());
        return e && e.live ? { member: e.member, metadataURI: e.metadataURI } : undefined;
    }

    // ── Internal event handlers ──────────────────────────────────────────────

    private applyClauseEvents(registered: ClauseRegisteredEvent[], withdrawn: ClauseWithdrawnEvent[]): void {
        for (const e of registered) {
            const idHash = computeClauseKey(e.clauseId, e.version);
            // Binding is permanent (registered[idHash] never cleared); a repeat is
            // impossible on-chain, so first-seen wins and later duplicates are ignored.
            if (!this.clauses.has(idHash)) {
                this.clauses.set(idHash, {
                    clause: {
                        clauseId: e.clauseId,
                        version: e.version,
                        idHash,
                        contentHash: e.contentHash,
                        contentURI: e.contentURI,
                        registrar: e.registrar,
                    },
                    withdrawn: false,
                });
            }
        }
        for (const w of withdrawn) {
            const entry = this.clauses.get(w.idHash);
            if (entry) entry.withdrawn = true; // withdraw is terminal for a clause key
        }
    }

    private applyAssemblyEvents(registered: AssemblyRegisteredEvent[], withdrawn: AssemblyWithdrawnEvent[]): void {
        for (const e of registered) {
            // compositionHash is first-write-wins and permanent — first-seen wins.
            if (!this.assemblies.has(e.compositionHash)) {
                this.assemblies.set(e.compositionHash, {
                    assembly: {
                        compositionHash: e.compositionHash,
                        author: e.author,
                        contentURI: e.contentURI,
                    },
                    withdrawn: false,
                });
            }
        }
        for (const w of withdrawn) {
            const entry = this.assemblies.get(w.compositionHash);
            if (entry) entry.withdrawn = true; // withdraw is terminal for a composition
        }
    }

    private applyMemberEvents(registered: MemberRegisteredEvent[], withdrawn: MemberWithdrawnEvent[]): void {
        // Members cycle: register → update → request withdrawal → re-register.
        // Liveness is whichever lifecycle event is most recent, so fold the two
        // streams together in (block, logIndex) order and let the latest win.
        // Note the second stream is `MemberWithdrawalRequested`, not
        // `MemberWithdrawn` — de-surfacing happens when the member asks to leave,
        // not when the cooldown finally releases their deposit.
        type LC = { member: Address; at: readonly [number, number]; live: boolean; metadataURI?: string };
        const timeline: LC[] = [
            ...registered.map((e) => ({
                member: e.member,
                at: [e.blockNumber, e.logIndex] as const,
                live: true,
                metadataURI: e.metadataURI,
            })),
            ...withdrawn.map((e) => ({
                member: e.member,
                at: [e.blockNumber, e.logIndex] as const,
                live: false,
            })),
        ];
        timeline.sort((a, b) => (a.at[0] - b.at[0]) || (a.at[1] - b.at[1]));

        for (const e of timeline) {
            const key = e.member.toLowerCase();
            const existing = this.members.get(key);
            // Only advance state if this event is at-or-after the last one applied —
            // makes re-applying an overlapping batch idempotent.
            if (existing && !isAtOrAfter(e.at, existing.at)) continue;
            if (e.live) {
                this.members.set(key, { member: e.member, metadataURI: e.metadataURI ?? "", live: true, at: e.at });
            } else {
                // Requesting withdrawal de-surfaces; keep the last metadataURI for
                // reference but mark dead.
                this.members.set(key, {
                    member: e.member,
                    metadataURI: existing?.metadataURI ?? "",
                    live: false,
                    at: e.at,
                });
            }
        }
    }
}

/** (block, logIndex) ordering: is `a` at or after `b`? */
function isAtOrAfter(a: readonly [number, number], b: readonly [number, number]): boolean {
    return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]);
}
