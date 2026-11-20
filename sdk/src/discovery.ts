/**
 * @figaro-protocol/sdk — Discovery Reconstructor
 *
 * The cold-start half of an agent's state. Where `state.ts`/`Topology`
 * reconstructs the processes an agent is ALREADY in, this module reconstructs
 * what EXISTS on the network — the registry families a fresh-key agent has
 * never seen: clauses, members, agreements, assemblies.
 *
 * It is a PARALLEL family, deliberately not folded into `Topology`: the
 * registries have no on-chain edges among themselves or to FigaroCore
 * (separation-of-concerns doctrine — each family its own anchor and its own
 * reducer). `DiscoveryGraph` mirrors `Topology`'s shape (applyEvents +
 * getters) so the two read the same way without knowing about each other.
 *
 * Surfacing derives from the LIVE stake (the registries' staked-intent model):
 * an entry whose stake has been withdrawn is de-surfaced. The families
 * withdraw differently, and the reducer honors each:
 *   - clauses/agreements/assemblies — binding permanent, the withdrawal REQUEST terminal ⇒
 *     set-difference (a withdrawn agreement stays readable by key, so an
 *     assembly composed from it keeps hydrating: `getAgreementBinding`).
 *   - members — requesting withdrawal clears the guard and allows re-registration
 *     ⇒ the live state is order-dependent; the most-recent lifecycle event per
 *     address wins. De-surfacing is the REQUEST, not the later ETH release.
 *
 * Every returned entry is a POINTER (contentURI/metadataURI). Hydrating the
 * pinned document from IPFS is the consumer's job — the SDK is viem-only.
 */

import { type PublicClient, type Log, decodeEventLog } from "viem";
import {
    CLAUSE_REGISTRY_ABI,
    MEMBERS_REGISTRY_ABI,
    PROCESS_REGISTRY_ABI,
    AGREEMENT_REGISTRY_ABI,
} from "./abis.js";
import { fetchLogsChunked } from "./events.js";
import type {
    Hex,
    Address,
    FigaroAddresses,
    ClauseRegisteredEvent,
    ClauseWithdrawnEvent,
    MemberRegisteredEvent,
    MemberWithdrawalRequestedEvent,
    ProcessRegisteredEvent,
    ProcessWithdrawnEvent,
    AgreementRegisteredEvent,
    AgreementWithdrawnEvent,
    RegisteredClause,
    RegisteredMember,
    RegisteredProcessDesign,
    AgreementBinding,
} from "./types.js";
import { canonicalContentHash, canonicalize } from "./agreement.js";
import { strippedKeyPath } from "./safeJson.js";

// ── Clause key ───────────────────────────────────────────────────────────────

/** The protocol half of a spec: the document without its top-level `block`.
 *  A value that is not a plain object is returned as it is.
 *
 *  Throws when the protocol half carries a `__proto__`, `constructor` or
 *  `prototype` key at any depth. Every reader parses a fetched spec with
 *  those keys stripped (`strippingReviver`, `anchorClauseSpec`), so a key
 *  computed over them is one no reader anchors: the clause would be
 *  registered and never read. Refusing here refuses it where a registrant
 *  computes the key or the preimage, before anything is pinned or sent; a
 *  spec without those keys hashes exactly as before. */
function protocolHalf(spec: unknown): unknown {
    if (spec === null || typeof spec !== "object" || Array.isArray(spec)) return spec;
    const half = Object.fromEntries(Object.entries(spec).filter(([name]) => name !== "block"));
    const stripped = strippedKeyPath(half);
    if (stripped !== null) {
        throw new Error(
            `clause spec carries the key ${stripped}: readers parse a spec with __proto__, constructor and prototype keys stripped, so no reader would anchor its clause key`,
        );
    }
    return half;
}

/**
 * The bytes a clause key hashes: the canonical serialization
 * (`canonicalize`) of the spec without its top-level `block`. They cover
 * `clauseId`, `version`, `title`, `description`, `fields`, `stages` and every
 * other top-level attribute; `block` is presentation, which any frontend may
 * replace. These are the bytes a plaintext attestation's witness carries as
 * `spec_json`, which the proof program hashes to the clause key.
 */
export function clauseKeyPreimage(spec: unknown): string {
    return canonicalize(protocolHalf(spec));
}

/**
 * The on-chain clause key: `keccak256` of `clauseKeyPreimage(spec)` — the key
 * `ClauseRegistry.registerClause` takes and every leaf, attestation and usage
 * count is keyed by. A clause IS the protocol half of its spec: a reader
 * verifies a fetched spec by parsing it, dropping `block`, canonicalizing and
 * hashing (`anchorClauseSpec`), so the bytes pinned may carry any `block` and
 * any byte form. The spec's `clauseId` and `version` are words inside the
 * document; they reach the key only as bytes, like every other attribute.
 */
export function computeClauseKey(spec: unknown): Hex {
    return canonicalContentHash(protocolHalf(spec));
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
            // Both clause events index the clause key first: read it from the
            // topic, so the decode does not depend on the argument's name.
            if (decoded.eventName === "ClauseRegistered") {
                registered.push({
                    clauseKey: log.topics[1] as Hex,
                    contentURI: a.contentURI as string,
                    registeredBy: a.registeredBy as Address,
                    blockNumber: Number(log.blockNumber ?? 0),
                    logIndex: Number(log.logIndex ?? 0),
                    transactionHash: (log.transactionHash ?? null) as Hex | null,
                });
            } else if (decoded.eventName === "WithdrawalRequested") {
                // The DE-SURFACING event, as for a member: the stake stops
                // counting as live at the request, while the ETH stays locked
                // for the cooldown. `DepositWithdrawn` is only the payout.
                withdrawn.push({
                    clauseKey: log.topics[1] as Hex,
                    registeredBy: a.registeredBy as Address,
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

export interface MembersRegistryEvents {
    registered: MemberRegisteredEvent[];
    withdrawn: MemberWithdrawalRequestedEvent[];
}

export function parseMembersRegistryLogs(logs: Log[]): MembersRegistryEvents {
    const registered: MemberRegisteredEvent[] = [];
    const withdrawn: MemberWithdrawalRequestedEvent[] = [];
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

export interface ProcessRegistryEvents {
    registered: ProcessRegisteredEvent[];
    withdrawn: ProcessWithdrawnEvent[];
}

export function parseProcessRegistryLogs(logs: Log[]): ProcessRegistryEvents {
    const registered: ProcessRegisteredEvent[] = [];
    const withdrawn: ProcessWithdrawnEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: PROCESS_REGISTRY_ABI, data: log.data, topics: log.topics });
            const a = decoded.args as Record<string, unknown>;
            if (decoded.eventName === "ProcessRegistered") {
                registered.push({
                    processDesignHash: a.processDesignHash as Hex,
                    registeredBy: a.registeredBy as Address,
                    contentURI: a.contentURI as string,
                    blockNumber: Number(log.blockNumber ?? 0),
                    logIndex: Number(log.logIndex ?? 0),
                    transactionHash: (log.transactionHash ?? null) as Hex | null,
                });
            } else if (decoded.eventName === "WithdrawalRequested") {
                // The DE-SURFACING event, as for a member: the stake stops
                // counting as live at the request, while the ETH stays locked
                // for the cooldown. `DepositWithdrawn` is only the payout.
                withdrawn.push({
                    processDesignHash: a.processDesignHash as Hex,
                    registeredBy: a.registeredBy as Address,
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

export interface AgreementRegistryEvents {
    registered: AgreementRegisteredEvent[];
    withdrawn: AgreementWithdrawnEvent[];
}

export function parseAgreementRegistryLogs(logs: Log[]): AgreementRegistryEvents {
    const registered: AgreementRegisteredEvent[] = [];
    const withdrawn: AgreementWithdrawnEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: AGREEMENT_REGISTRY_ABI, data: log.data, topics: log.topics });
            const a = decoded.args as Record<string, unknown>;
            if (decoded.eventName === "AgreementRegistered") {
                registered.push({
                    agreementHash: a.agreementHash as Hex,
                    registeredBy: a.registeredBy as Address,
                    contentURI: a.contentURI as string,
                    blockNumber: Number(log.blockNumber ?? 0),
                    logIndex: Number(log.logIndex ?? 0),
                    transactionHash: (log.transactionHash ?? null) as Hex | null,
                });
            } else if (decoded.eventName === "WithdrawalRequested") {
                // The DE-SURFACING event, as for a member: the stake stops
                // counting as live at the request, while the ETH stays locked
                // for the cooldown. `DepositWithdrawn` is only the payout.
                withdrawn.push({
                    agreementHash: a.agreementHash as Hex,
                    registeredBy: a.registeredBy as Address,
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
    memberWithdrawn: MemberWithdrawalRequestedEvent[];
    assemblyRegistered: ProcessRegisteredEvent[];
    assemblyWithdrawn: ProcessWithdrawnEvent[];
    agreementRegistered: AgreementRegisteredEvent[];
    agreementWithdrawn: AgreementWithdrawnEvent[];
}


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
    const [clause, seller, assembly, agreement] = await Promise.all([
        addresses.clauseRegistry
            ? fetchLogsChunked(client, { address: addresses.clauseRegistry, fromBlock, toBlock, chunkSize }).then(parseClauseRegistryLogs)
            : Promise.resolve({ registered: [], withdrawn: [] } as ClauseRegistryEvents),
        addresses.membersRegistry
            ? fetchLogsChunked(client, { address: addresses.membersRegistry, fromBlock, toBlock, chunkSize }).then(parseMembersRegistryLogs)
            : Promise.resolve({ registered: [], withdrawn: [] } as MembersRegistryEvents),
        addresses.processRegistry
            ? fetchLogsChunked(client, { address: addresses.processRegistry, fromBlock, toBlock, chunkSize }).then(parseProcessRegistryLogs)
            : Promise.resolve({ registered: [], withdrawn: [] } as ProcessRegistryEvents),
        addresses.agreementRegistry
            ? fetchLogsChunked(client, { address: addresses.agreementRegistry, fromBlock, toBlock, chunkSize }).then(parseAgreementRegistryLogs)
            : Promise.resolve({ registered: [], withdrawn: [] } as AgreementRegistryEvents),
    ]);

    return {
        clauseRegistered: clause.registered,
        clauseWithdrawn: clause.withdrawn,
        memberRegistered: seller.registered,
        memberWithdrawn: seller.withdrawn,
        assemblyRegistered: assembly.registered,
        assemblyWithdrawn: assembly.withdrawn,
        agreementRegistered: agreement.registered,
        agreementWithdrawn: agreement.withdrawn,
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
}

interface AgreementEntry {
    agreement: AgreementBinding;
}

interface AssemblyEntry {
    assembly: RegisteredProcessDesign;
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
 * Mutable discovery graph — the "shadow catalog" an agent maintains, sibling
 * to `Topology`. Incrementally updated as new registry events arrive.
 */
export class DiscoveryGraph {
    private readonly clauses = new Map<string, ClauseEntry>(); // key: lowercased clause key
    private readonly assemblies = new Map<Hex, AssemblyEntry>(); // key: processDesignHash
    private readonly agreements = new Map<string, AgreementEntry>(); // key: lowercased agreement hash
    private readonly members = new Map<string, MemberEntry>(); // key: lowercased address

    /** Apply a batch of registry events (e.g. from fetchDiscoveryEvents). */
    applyEvents(events: DiscoveryEvents): void {
        this.applyClauseEvents(events.clauseRegistered, events.clauseWithdrawn);
        this.applyAssemblyEvents(events.assemblyRegistered, events.assemblyWithdrawn);
        this.applyAgreementEvents(events.agreementRegistered ?? [], events.agreementWithdrawn ?? []);
        this.applyMemberEvents(events.memberRegistered, events.memberWithdrawn);
    }

    // ── Live views (deposit-withdrawn entries filtered out) ────────────────

    /** All live-staked clauses. */
    getClauses(): RegisteredClause[] {
        return [...this.clauses.values()].filter((e) => !e.clause.stakeWithdrawn).map((e) => e.clause);
    }

    /** All live-staked assemblies. */
    getAssemblies(): RegisteredProcessDesign[] {
        return [...this.assemblies.values()].filter((e) => !e.withdrawn).map((e) => e.assembly);
    }

    /** All live-staked registered agreements — what a drawer offers for a
     *  new composition. */
    getAgreements(): AgreementBinding[] {
        return [...this.agreements.values()].filter((e) => !e.agreement.stakeWithdrawn).map((e) => e.agreement);
    }

    /** A single registered agreement by key; undefined if unknown or
     *  de-surfaced. */
    getAgreement(agreementHash: Hex): AgreementBinding | undefined {
        const e = this.agreements.get(agreementHash.toLowerCase());
        return e && !e.agreement.stakeWithdrawn ? e.agreement : undefined;
    }

    /** A registered agreement's binding by key WHATEVER its stake — the
     *  binding is never cleared, so hydration of an assembly composed from a
     *  withdrawn agreement reads its `contentURI` here; `stakeWithdrawn` says
     *  whether it is still offered. Undefined only if never registered. */
    getAgreementBinding(agreementHash: Hex): AgreementBinding | undefined {
        return this.agreements.get(agreementHash.toLowerCase())?.agreement;
    }

    /** All live-staked members. */
    getMembers(): RegisteredMember[] {
        return [...this.members.values()]
            .filter((e) => e.live)
            .map((e) => ({ member: e.member, metadataURI: e.metadataURI }));
    }

    /** A single clause by its key; undefined if unknown or de-surfaced. */
    getClause(clauseKey: Hex): RegisteredClause | undefined {
        const e = this.clauses.get(clauseKey.toLowerCase());
        return e && !e.clause.stakeWithdrawn ? e.clause : undefined;
    }

    /** A single assembly by processDesignHash; undefined if unknown or de-surfaced. */
    getAssembly(processDesignHash: Hex): RegisteredProcessDesign | undefined {
        const e = this.assemblies.get(processDesignHash);
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
            const key = e.clauseKey.toLowerCase();
            // Binding is permanent (registered[key] never cleared); a repeat is
            // impossible on-chain, so first-seen wins and later duplicates are ignored.
            if (!this.clauses.has(key)) {
                this.clauses.set(key, {
                    clause: {
                        clauseKey: e.clauseKey,
                        contentURI: e.contentURI,
                        registeredBy: e.registeredBy,
                        stakeWithdrawn: false,
                    },
                });
            }
        }
        for (const w of withdrawn) {
            const entry = this.clauses.get(w.clauseKey.toLowerCase());
            if (entry) entry.clause = { ...entry.clause, stakeWithdrawn: true }; // a withdrawal request is terminal for a clause key
        }
    }

    private applyAssemblyEvents(registered: ProcessRegisteredEvent[], withdrawn: ProcessWithdrawnEvent[]): void {
        for (const e of registered) {
            // processDesignHash is first-write-wins and permanent — first-seen wins.
            if (!this.assemblies.has(e.processDesignHash)) {
                this.assemblies.set(e.processDesignHash, {
                    assembly: {
                        processDesignHash: e.processDesignHash,
                        registeredBy: e.registeredBy,
                        contentURI: e.contentURI,
                    },
                    withdrawn: false,
                });
            }
        }
        for (const w of withdrawn) {
            const entry = this.assemblies.get(w.processDesignHash);
            if (entry) entry.withdrawn = true; // a withdrawal request is terminal for a composition
        }
    }

    private applyAgreementEvents(registered: AgreementRegisteredEvent[], withdrawn: AgreementWithdrawnEvent[]): void {
        for (const e of registered) {
            const key = e.agreementHash.toLowerCase();
            // agreementHash is first-write-wins and permanent — first-seen wins.
            if (!this.agreements.has(key)) {
                this.agreements.set(key, {
                    agreement: {
                        agreementHash: e.agreementHash,
                        contentURI: e.contentURI,
                        registeredBy: e.registeredBy,
                        registeredAt: e.blockNumber,
                        stakeWithdrawn: false,
                    },
                });
            }
        }
        for (const w of withdrawn) {
            const entry = this.agreements.get(w.agreementHash.toLowerCase());
            if (entry) entry.agreement = { ...entry.agreement, stakeWithdrawn: true }; // a withdrawal request is terminal for an agreement hash
        }
    }

    private applyMemberEvents(registered: MemberRegisteredEvent[], withdrawn: MemberWithdrawalRequestedEvent[]): void {
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
