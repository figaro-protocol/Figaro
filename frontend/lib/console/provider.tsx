"use client";

/**
 * FigaroProvider — React context wrapping the SDK's FigaroContext + ActionQueue.
 *
 * Provides:
 * - Synced on-chain state via FigaroContext (ProcessGraph)
 * - Unified action queue for human-in-the-loop approval
 * - Auto-polling for new events
 */

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
    type ReactNode,
} from "react";
import { usePublicClient, useAccount, useWalletClient } from "wagmi";
import { FigaroContext, proposeActions, SequencerClient } from "@figaro/core/agent";
import type {
    SyncResult,
    ProposedAction,
    TxResult,
    ResolveProcessAction,
    AttestAction,
    CommitSubOrderAction,
    SequencerStatus,
} from "@figaro/core/agent";
import type { Process, Hex, Address, AttestationEvent } from "@figaro/core";
import {
    SCHEMA_REGISTRY_ABI,
    parseAttestationLogs,
} from "@figaro/core";
import { getFigaroAddresses } from "./addresses";
import { ConsoleQueue, type ConsoleQueueItem } from "./consoleQueue";
import type { QueuedBuildAction } from "./buildProvider";
import { buildResolutionCommitments } from "./commitmentStore";
import { buildCreateOrderPrefill, type ConsoleCreateOrderPrefill } from "./actionPresentation";
import { ZERO_BYTES32, useAttestationCoordinatorActions } from "@/lib/mechanisms/useAttestationCoordinatorActions";
import { useFigaroActions } from "@/lib/core/useFigaroActions";
import { executeBuildAction } from "@/lib/console/buildActionExecutor";
import { serializeAssemblyDocument } from "@/lib/shared/assemblyDraft";
import { extractErrorMessage } from "@/lib/shared/errors";
import { resolveSemanticRuntimeSnapshotForSubjectAddress } from "@/lib/shared/runtimeResolution";

function getOperatingActionActorAddress(action: ProposedAction): Address | undefined {
    switch (action.type) {
        case "resolve-process":
            return action.caller;
        case "commit-sub-order":
            return action.buyer;
        case "attest-as-seller":
        case "attest-as-buyer":
            return action.attester;
        default:
            return undefined;
    }
}

// ── Context shape ───────────────────────────────────────────────────────────

interface FigaroProviderState {
    /** SDK context (null until first sync). */
    ctx: FigaroContext | null;
    /** Whether initial sync is in progress. */
    syncing: boolean;
    /** Last sync result. */
    lastSync: SyncResult | null;
    /** Sync counter — increments on every sync with new data. */
    syncVersion: number;

    /** Connected wallet address. */
    address: Address | undefined;

    /** All processes for the connected wallet. */
    myProcesses: Process[];
    /** Currently selected process. */
    selectedProcess: Process | null;
    /** Select a process by ID. */
    selectProcess: (processId: Hex | null) => void;

    /** Proposed actions for the selected process. */
    proposedActions: ProposedAction[];

    /** The unified console queue. */
    queue: ConsoleQueue;
    /** Snapshot of queue items (triggers re-render on change). */
    queueItems: ConsoleQueueItem[];
    /** Approve a queued action. */
    approveAction: (id: number) => void;
    /** Reject a queued action. */
    rejectAction: (id: number, reason?: string) => void;
    /** Execute an approved action (operating or building). */
    executeApproved: (id: number) => Promise<TxResult | null>;
    /** Enqueue an operating action for approval. */
    enqueueAction: (action: ProposedAction) => void;
    /** Enqueue a building action for approval. */
    enqueueBuildAction: (action: QueuedBuildAction) => void;

    /** Prefill intent for the console create-order form. */
    createOrderPrefill: ConsoleCreateOrderPrefill | null;
    /** Clear the current create-order prefill intent after the form consumes it. */
    clearCreateOrderPrefill: () => void;

    /** Force a re-sync. */
    resync: () => Promise<void>;

    /** Sequencer status (null until first probe). */
    sequencerStatus: SequencerStatus | null;
    /** Whether the sequencer is reachable. */
    sequencerAvailable: boolean;

    /** Attestation events observed on the coordinator. */
    attestationEvents: AttestationEvent[];
}

const FigaroCtx = createContext<FigaroProviderState | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 4_000; // 4s — roughly 2 Anvil blocks

type SchemaRegistryWriter = {
    writeContract: (request: {
        address: Address;
        abi: typeof SCHEMA_REGISTRY_ABI;
        functionName: "registerSchema";
        args: [Hex, bigint, Hex];
    }) => Promise<Hex>;
};

export function FigaroProvider({ children }: { children: ReactNode }) {
    const publicClient = usePublicClient();
    const { address } = useAccount();
    const { data: walletClient } = useWalletClient();
    const { submitSellerAttestation, submitBuyerAttestation } = useAttestationCoordinatorActions();
    const { resolveProcess: resolveActiveProcess } = useFigaroActions();

    const ctxRef = useRef<FigaroContext | null>(null);
    const queueRef = useRef(new ConsoleQueue());

    const [syncing, setSyncing] = useState(false);
    const [lastSync, setLastSync] = useState<SyncResult | null>(null);
    const [syncVersion, setSyncVersion] = useState(0);
    const [selectedProcessId, setSelectedProcessId] = useState<Hex | null>(null);
    const [queueItems, setQueueItems] = useState<ConsoleQueueItem[]>([]);
    const [createOrderPrefill, setCreateOrderPrefill] = useState<ConsoleCreateOrderPrefill | null>(null);
    const [attestationEvents, setAttestationEvents] = useState<AttestationEvent[]>([]);
    const lastAttestationBlockRef = useRef<bigint>(0n);

    // ── Sequencer client ────────────────────────────────────────────────────
    const sequencerUrl = typeof window !== "undefined"
        ? process.env.NEXT_PUBLIC_SEQUENCER_URL ?? null
        : null;
    const sequencerRef = useRef<SequencerClient | null>(null);
    const [sequencerStatus, setSequencerStatus] = useState<SequencerStatus | null>(null);
    const [sequencerAvailable, setSequencerAvailable] = useState(false);

    useEffect(() => {
        if (!sequencerUrl) {
            sequencerRef.current = null;
            setSequencerAvailable(false);
            setSequencerStatus(null);
            return;
        }
        const client = new SequencerClient({ url: sequencerUrl });
        sequencerRef.current = client;

        // Probe availability + status
        const probe = async () => {
            const ok = await client.isAvailable();
            setSequencerAvailable(ok);
            if (ok) {
                try {
                    setSequencerStatus(await client.status());
                } catch { /* status fetch failed — availability already set */ }
            }
        };
        probe();
        const timer = setInterval(probe, 15_000);
        return () => clearInterval(timer);
    }, [sequencerUrl]);

    // Poll attestation events from the coordinator (separate from core sync —
    // AttestationCoordinator emits on its own address).
    useEffect(() => {
        if (!publicClient) return;
        const addresses = getFigaroAddresses();
        if (!addresses.attestationCoordinator) return;
        let cancelled = false;

        const poll = async () => {
            try {
                const currentBlock = await publicClient.getBlockNumber();
                const fromBlock = lastAttestationBlockRef.current > 0n
                    ? lastAttestationBlockRef.current + 1n
                    : 0n;
                if (currentBlock < fromBlock) return;

                const logs = await publicClient.getLogs({
                    address: addresses.attestationCoordinator,
                    fromBlock,
                    toBlock: currentBlock,
                });
                const parsed = parseAttestationLogs(logs);
                if (cancelled) return;
                if (parsed.length > 0) {
                    setAttestationEvents((prev) => [...prev, ...parsed]);
                }
                lastAttestationBlockRef.current = currentBlock;
            } catch {
                // Transport errors surface through the shared banner; swallow here.
            }
        };

        poll();
        const timer = setInterval(poll, POLL_INTERVAL);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [publicClient]);

    // Initialize FigaroContext when publicClient is available
    useEffect(() => {
        if (!publicClient) return;
        const addresses = getFigaroAddresses();
        if (!addresses.core) return;

        // Cast to satisfy SDK's viem types (same version, different node_modules copies)
        const ctx = new FigaroContext(
            publicClient as unknown as ConstructorParameters<typeof FigaroContext>[0],
            addresses,
        );
        ctxRef.current = ctx;

        // Initial sync
        setSyncing(true);
        ctx.sync().then((result) => {
            setLastSync(result);
            setSyncing(false);
            setSyncVersion((v) => v + 1);
        });

        // Start polling
        ctx.startWatching(POLL_INTERVAL, (result) => {
            setLastSync(result);
            setSyncVersion((v) => v + 1);
        });

        return () => {
            ctx.stopWatching();
            ctxRef.current = null;
        };
    }, [publicClient]);

    // Derived state
    const ctx = ctxRef.current;
    const myProcesses = useMemo(() => {
        void syncVersion;
        if (!ctx || !address) return [];
        return ctx.getMyProcesses(address);
    }, [ctx, address, syncVersion]);

    const selectedProcess = selectedProcessId && ctx
        ? ctx.getProcess(selectedProcessId) ?? null
        : null;

    // Auto-select first process if none selected
    useEffect(() => {
        if (!selectedProcessId && myProcesses.length > 0) {
            setSelectedProcessId(myProcesses[0].processId);
        }
    }, [myProcesses, selectedProcessId]);

    // Propose actions when selected process changes
    const proposedActions = selectedProcess && address
        ? proposeActions(selectedProcess, address)
        : [];

    const selectProcess = useCallback((processId: Hex | null) => {
        setSelectedProcessId(processId);
    }, []);

    const refreshQueue = useCallback(() => {
        setQueueItems([...queueRef.current.all()]);
    }, []);

    const enqueueAction = useCallback((action: ProposedAction) => {
        const runtimeSnapshot = resolveSemanticRuntimeSnapshotForSubjectAddress(
            getOperatingActionActorAddress(action),
        );
        queueRef.current.enqueueOperating(action, { runtimeSnapshot });
        refreshQueue();
    }, [refreshQueue]);

    const enqueueBuildAction = useCallback((action: QueuedBuildAction) => {
        queueRef.current.enqueueBuilding(action);
        refreshQueue();
    }, [refreshQueue]);

    const approveAction = useCallback((id: number) => {
        queueRef.current.approve(id);
        refreshQueue();
    }, [refreshQueue]);

    const rejectAction = useCallback((id: number, reason?: string) => {
        queueRef.current.reject(id, reason);
        refreshQueue();
    }, [refreshQueue]);

    const clearCreateOrderPrefill = useCallback(() => {
        setCreateOrderPrefill(null);
    }, []);

    const executeApproved = useCallback(async (id: number): Promise<TxResult | null> => {
        const item = queueRef.current.get(id);
        if (!item || item.status !== "approved") return null;

        // ── Operating actions → route through shared runtime executors ──
        if (item.entry.kind === "operating") {
            if (!ctx) return null;
            const action = item.entry.action;
            const runtimeSnapshot = item.runtimeSnapshot;

            try {
                let result: TxResult;

                switch (action.type) {
                    case "resolve-process": {
                        const a = action as ResolveProcessAction;
                        const activeOrders = [...(ctx.getProcess(a.processId)?.orders.values() ?? [])]
                            .filter((o) => o.state === 1); // Active
                        if (activeOrders.length === 0) {
                            throw new Error("No active orders are available to resolve.");
                        }

                        const commitments = buildResolutionCommitments(
                            activeOrders.map((order) => ({
                                orderHash: order.orderHash,
                                processId: order.processId,
                                buyer: order.buyer,
                                seller: order.seller,
                                currency: order.currency,
                                payment: order.payment,
                                cumulativeValue: order.cumulativeValue,
                                agreementHash: order.agreementHash,
                                salt: order.salt,
                                deadline: order.deadline,
                            })),
                        );

                        const hash = await resolveActiveProcess(a.processId, commitments);
                        result = { hash };
                        break;
                    }
                    case "attest-as-seller": {
                        const a = action as AttestAction;
                        const orderHash = a.orderHashes[0];
                        if (!orderHash) throw new Error("No order hash to attest");

                        const { computeSchemaId } = await import("@figaro/core/extensions");
                        const schemaId = a.schemaId ?? computeSchemaId("figaro-courier-process-v1");
                        const stage = a.stage ?? 1;
                        const content = a.content ?? ZERO_BYTES32;
                        const hash = await submitSellerAttestation({
                            orderHash,
                            schemaId,
                            stage,
                            content,
                            roleOrderHash: a.roleOrderHash,
                        });
                        result = { hash };
                        break;
                    }
                    case "attest-as-buyer": {
                        const a = action as AttestAction;
                        const orderHash = a.orderHashes[0];
                        if (!orderHash) throw new Error("No order hash to attest");

                        const { computeSchemaId } = await import("@figaro/core/extensions");
                        const schemaId = a.schemaId ?? computeSchemaId("figaro-courier-process-v1");
                        const stage = a.stage ?? 1;
                        const content = a.content ?? ZERO_BYTES32;
                        const hash = await submitBuyerAttestation({
                            orderHash,
                            schemaId,
                            stage,
                            content,
                        });
                        result = { hash };
                        break;
                    }
                    case "commit-sub-order": {
                        const a = action as CommitSubOrderAction;
                        setSelectedProcessId(a.processId);
                        setCreateOrderPrefill(buildCreateOrderPrefill(a));
                        queueRef.current.markForwarded(id, {
                            routedTo: "create-order",
                            processId: a.processId,
                            bindingId: runtimeSnapshot?.runtime.selectedBindingId,
                            roleKind: runtimeSnapshot?.runtime.selectedRole?.roleKind,
                        });
                        refreshQueue();
                        return null;
                    }
                    default:
                        throw new Error("Unknown action type");
                }

                queueRef.current.markExecuted(id, result.hash, runtimeSnapshot ? {
                    bindingId: runtimeSnapshot.runtime.selectedBindingId,
                    roleKind: runtimeSnapshot.runtime.selectedRole?.roleKind,
                } : undefined);
                refreshQueue();
                await ctx.sync();
                setSyncVersion((v) => v + 1);
                return result;
            } catch (err: unknown) {
                // Store error on the queue item for visibility
                queueRef.current.reject(id, extractErrorMessage(err, String(err)));
                refreshQueue();
                return null;
            }
        }

        // ── Building actions → custom execution ──
        if (item.entry.kind === "building") {
            const buildAction = item.entry.action;

            try {
                const outcome = await executeBuildAction(buildAction, {
                    registerSchema: async (action) => {
                        if (!walletClient) throw new Error("Connect a wallet to register schemas.");
                        const addresses = getFigaroAddresses();
                        if (!addresses.schemaRegistry) throw new Error("Schema registry address not configured.");

                        const { computeSchemaId } = await import("@figaro/core/extensions");
                        const schemaId = computeSchemaId(action.schemaKey);
                        const uriHash = action.uriHash ?? ZERO_BYTES32;
                        const schemaWriter = walletClient as unknown as SchemaRegistryWriter;
                        return schemaWriter.writeContract({
                            address: addresses.schemaRegistry,
                            abi: SCHEMA_REGISTRY_ABI,
                            functionName: "registerSchema",
                            args: [schemaId, BigInt(action.version), uriHash],
                        });
                    },
                    publishAssembly: async (action) => {
                        const { publishAssemblyAction } = await import("@/lib/console/publishActions");
                        return publishAssemblyAction(serializeAssemblyDocument(action.assembly));
                    },
                });

                queueRef.current.markExecuted(id, outcome.txHash, outcome.result);
                refreshQueue();
                return { hash: outcome.txHash ?? ("0x" as Hex) };
            } catch (error) {
                queueRef.current.reject(id, extractErrorMessage(error, String(error)));
                refreshQueue();
                return null;
            }
        }

        return null;
    }, [ctx, refreshQueue, resolveActiveProcess, submitBuyerAttestation, submitSellerAttestation, walletClient]);

    const resync = useCallback(async () => {
        if (!ctx) return;
        setSyncing(true);
        const result = await ctx.sync();
        setLastSync(result);
        setSyncing(false);
        setSyncVersion((v) => v + 1);
    }, [ctx]);

    const value: FigaroProviderState = {
        ctx,
        syncing,
        lastSync,
        syncVersion,
        address,
        myProcesses,
        selectedProcess,
        selectProcess,
        proposedActions,
        queue: queueRef.current,
        queueItems,
        approveAction,
        rejectAction,
        executeApproved,
        enqueueAction,
        enqueueBuildAction,
        createOrderPrefill,
        clearCreateOrderPrefill,
        resync,
        sequencerStatus,
        sequencerAvailable,
        attestationEvents,
    };

    return <FigaroCtx.Provider value={value}>{children}</FigaroCtx.Provider>;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useFigaro(): FigaroProviderState {
    const ctx = useContext(FigaroCtx);
    if (!ctx) throw new Error("useFigaro must be used within <FigaroProvider>");
    return ctx;
}
