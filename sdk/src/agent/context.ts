/**
 * @figaro-protocol/sdk/agent — Context Provider
 *
 * Stateful wrapper around Topology + PublicClient.
 * Handles sync, incremental updates, and structured briefings.
 *
 * Usage:
 *   const ctx = new FigaroContext(client, addresses);
 *   await ctx.sync();
 *   const briefing = ctx.getProcessBriefing(processId);
 */

import type { PublicClient } from "viem";
import type {
    Hex,
    Address,
    FigaroAddresses,
    AgentProcessContext,
    Process,
    Order,
    RegisteredClause,
    RegisteredMember,
    RegisteredAssembly,
} from "../types.js";
import { Topology } from "../state.js";
import { fetchCoreEvents } from "../events.js";
import { DiscoveryGraph, fetchDiscoveryEvents } from "../discovery.js";

export interface SyncResult {
    /** Number of new OrderCommitted events ingested. */
    newCommits: number;
    /** Number of new OrderResolved events ingested. */
    newResolutions: number;
    /** Number of new ClauseRegistered events ingested. */
    newClauses: number;
    /** Number of new MemberRegistered/MemberProfileUpdated events ingested. */
    newSellers: number;
    /** Number of new AssemblyRegistered events ingested. */
    newAssemblies: number;
    /** Block number synced up to. */
    syncedToBlock: bigint;
}

/**
 * Stateful context that an agent maintains.
 * Wraps Topology with chain sync capabilities.
 */
export class FigaroContext {
    /** The processes this agent is in — reconstructed from FigaroCore events. */
    readonly topology: Topology;
    /** What EXISTS on the network — the live clause/seller/assembly catalogue.
     *  A parallel family (registries have no on-chain edges to the kernel), so
     *  a distinct reducer, never folded into `topology`. */
    readonly discovery: DiscoveryGraph;
    readonly client: PublicClient;
    readonly addresses: FigaroAddresses;

    /** Last synced block number. */
    private lastSyncedBlock: bigint = 0n;

    /** Polling interval ID (if watching). */
    private pollIntervalId: ReturnType<typeof setInterval> | null = null;

    constructor(client: PublicClient, addresses: FigaroAddresses) {
        this.client = client;
        this.addresses = addresses;
        this.topology = new Topology();
        this.discovery = new DiscoveryGraph();
    }

    /**
     * Sync all events from chain — both the agent's processes AND the network
     * catalogue (the registries). First call fetches from genesis; subsequent
     * calls fetch only new blocks (incremental). Registry families whose address
     * is unconfigured simply contribute nothing.
     */
    async sync(): Promise<SyncResult> {
        const fromBlock = this.lastSyncedBlock > 0n ? this.lastSyncedBlock + 1n : 0n;
        // cacheTime:0 — viem caches getBlockNumber for ~pollingInterval, so an
        // agent that syncs right after its own write would see a stale head and
        // skip its just-emitted event. sync() must always read the true head.
        const currentBlock = await this.client.getBlockNumber({ cacheTime: 0 });

        if (currentBlock < fromBlock) {
            return {
                newCommits: 0,
                newResolutions: 0,
                newClauses: 0,
                newSellers: 0,
                newAssemblies: 0,
                syncedToBlock: this.lastSyncedBlock,
            };
        }

        const [events, discoveryEvents] = await Promise.all([
            fetchCoreEvents(this.client, this.addresses, fromBlock, currentBlock),
            fetchDiscoveryEvents(this.client, this.addresses, fromBlock, currentBlock),
        ]);

        this.topology.applyEvents(events);
        this.discovery.applyEvents(discoveryEvents);
        this.lastSyncedBlock = currentBlock;

        return {
            newCommits: events.orderCommitted.length,
            newResolutions: events.orderResolved.length,
            newClauses: discoveryEvents.clauseRegistered.length,
            newSellers: discoveryEvents.memberRegistered.length,
            newAssemblies: discoveryEvents.assemblyRegistered.length,
            syncedToBlock: currentBlock,
        };
    }

    /**
     * Get a structured JSON briefing for a process.
     * This is what you feed to an LLM or specialized agent.
     */
    getProcessBriefing(processId: Hex): AgentProcessContext | null {
        return this.topology.buildAgentContext(processId);
    }

    /** Get the raw Process object. */
    getProcess(processId: Hex): Process | undefined {
        return this.topology.getProcess(processId);
    }

    /** Get a single order by hash. */
    getOrder(orderHash: Hex): Order | undefined {
        return this.topology.getOrder(orderHash);
    }

    /** All processes where `address` is the root buyer. */
    getProcessesAsBuyer(address: Address): Process[] {
        return this.topology.getProcessesByBuyer(address);
    }

    /** All orders where `address` is the seller. */
    getOrdersAsSeller(address: Address): Order[] {
        return this.topology.getOrdersBySeller(address);
    }

    /** All active (unresolved) processes. */
    getActiveProcesses(): Process[] {
        return this.topology.getActiveProcesses();
    }

    /** All processes where `address` participates (buyer or seller). */
    getMyProcesses(address: Address): Process[] {
        const lc = address.toLowerCase();
        return [...this.topology.processes.values()].filter((p) => {
            if (p.rootBuyer.toLowerCase() === lc) return true;
            for (const o of p.orders.values()) {
                if (o.seller.toLowerCase() === lc) return true;
            }
            return false;
        });
    }

    // ── Discovery (the cold-start catalogue) ─────────────────────────────────

    /** All live-staked clauses on the network. */
    getClauses(): RegisteredClause[] {
        return this.discovery.getClauses();
    }

    /** Every live-staked member on the network — buyers and sellers alike (the
     *  member stake is one deposit for both postures). */
    getMembers(): RegisteredMember[] {
        return this.discovery.getMembers();
    }

    /** All live-staked assemblies on the network — the templates an agent can
     *  instantiate from a cold start. */
    getAssemblies(): RegisteredAssembly[] {
        return this.discovery.getAssemblies();
    }

    /**
     * Start polling for new events at the given interval.
     * Calls the callback after each sync with new events.
     */
    startWatching(
        intervalMs: number,
        onSync?: (result: SyncResult) => void,
    ): void {
        if (this.pollIntervalId !== null) return; // Already watching

        this.pollIntervalId = setInterval(async () => {
            const result = await this.sync();
            if (result.newCommits > 0 || result.newResolutions > 0) {
                onSync?.(result);
            }
        }, intervalMs);
    }

    /** Stop polling. */
    stopWatching(): void {
        if (this.pollIntervalId !== null) {
            clearInterval(this.pollIntervalId);
            this.pollIntervalId = null;
        }
    }

    /** Current synced block. */
    get syncedBlock(): bigint {
        return this.lastSyncedBlock;
    }
}
