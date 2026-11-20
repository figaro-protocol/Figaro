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
    RegisteredProcessDesign,
    AgreementBinding,
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
    newMembers: number;
    /** Number of new ProcessRegistered events ingested. */
    newAssemblies: number;
    /** Number of new AgreementRegistered events ingested. */
    newAgreements: number;
    /** Block number synced up to. */
    syncedToBlock: bigint;
}

/**
 * Stateful context that an agent maintains.
 * Wraps Topology with chain sync capabilities.
 */
export class FigaroContext {
    /** The processes this agent is in — reconstructed from the order events
     *  of both paths, each order and process marked with the path that
     *  emitted it. */
    readonly topology: Topology;
    /** What EXISTS on the network — the live clause/seller/assembly catalog.
     *  A parallel family (registries have no on-chain edges to FigaroCore), so
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
     * catalog (the registries). First call fetches from genesis; subsequent
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
                newMembers: 0,
                newAssemblies: 0,
                newAgreements: 0,
                syncedToBlock: this.lastSyncedBlock,
            };
        }

        // Each order emitter is read apart, so every order and process carries
        // the path whose contract emitted it (`Order.path`, `Process.path`):
        // `fetchCoreEvents` reads the emitters it is given, and given one
        // address it reads that one. The two paths share no state, so the
        // two streams fold into one topology without meeting.
        const verifier = this.addresses.batchVerifier;
        const [direct, batch, discoveryEvents] = await Promise.all([
            fetchCoreEvents(this.client, { core: this.addresses.core }, fromBlock, currentBlock),
            verifier
                ? fetchCoreEvents(this.client, { core: verifier }, fromBlock, currentBlock)
                : Promise.resolve(null),
            fetchDiscoveryEvents(this.client, this.addresses, fromBlock, currentBlock),
        ]);

        this.topology.applyEvents(direct, "direct");
        if (batch) this.topology.applyEvents(batch, "batch");
        this.discovery.applyEvents(discoveryEvents);
        this.lastSyncedBlock = currentBlock;

        return {
            newCommits: direct.orderCommitted.length + (batch?.orderCommitted.length ?? 0),
            newResolutions: direct.orderResolved.length + (batch?.orderResolved.length ?? 0),
            newClauses: discoveryEvents.clauseRegistered.length,
            newMembers: discoveryEvents.memberRegistered.length,
            newAssemblies: discoveryEvents.assemblyRegistered.length,
            newAgreements: discoveryEvents.agreementRegistered.length,
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

    // ── Discovery (the cold-start catalog) ─────────────────────────────────

    /** All live-staked clauses on the network. */
    getClauses(): RegisteredClause[] {
        return this.discovery.getClauses();
    }

    /** Every live-staked member on the network — buyers and sellers alike (the
     *  member stake is one deposit for both postures). */
    getMembers(): RegisteredMember[] {
        return this.discovery.getMembers();
    }

    /** All live-staked assemblies on the network — the assemblies an agent can
     *  instantiate from a cold start. */
    getAssemblies(): RegisteredProcessDesign[] {
        return this.discovery.getAssemblies();
    }

    /** All live-staked registered agreements — what a designer composes a new
     *  assembly from. */
    getAgreements(): AgreementBinding[] {
        return this.discovery.getAgreements();
    }

    /** A registered agreement's binding by key WHATEVER its stake — what
     *  hydrating an assembly's agreement reads (`hydrateProcessDesign`). */
    getAgreementBinding(agreementHash: Hex): AgreementBinding | undefined {
        return this.discovery.getAgreementBinding(agreementHash);
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
