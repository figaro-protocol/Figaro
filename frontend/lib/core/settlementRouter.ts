/**
 * Settlement Router — Two-tier settlement path abstraction.
 *
 * Routes kernel operations to either the batch path (sequencer → prover →
 * FigaroBatchVerifier) or the direct path (FigaroCore on-chain), with
 * automatic fallback from batch to direct when the sequencer is unavailable.
 *
 * The runtime uses this router so institutions and builders don't need
 * to know which settlement path is active.
 *
 * Configuration:
 *   NEXT_PUBLIC_SEQUENCER_URL — sequencer HTTP API base URL.
 *   If empty or omitted, the router uses direct-only mode.
 */

import { SequencerClient, toSequencerCommitment, toSequencerSig } from "@figaro/core/agent";
import type { Commitment } from "@figaro/core";
import { extractErrorMessage } from "@/lib/shared/errors";

// ── Settlement mode ─────────────────────────────────────────────────────────

export type SettlementMode = "batch" | "direct";

export interface SettlementRouterConfig {
    /** Sequencer URL. If falsy, direct-only mode. */
    sequencerUrl?: string;
    /** Prefer direct path even when sequencer is available. */
    preferDirect?: boolean;
    /** Callback when the router falls back from batch to direct. */
    onFallback?: (reason: string) => void;
}

export interface SettlementResult {
    mode: SettlementMode;
    /** Operation ID from sequencer (batch mode) or undefined (direct mode). */
    operationId?: number;
}

// ── Router ──────────────────────────────────────────────────────────────────

/**
 * Determines the active settlement mode and provides a sequencer client
 * when the batch path is available.
 *
 * The router is stateless — it probes on each call. Callers may cache
 * the result for the duration of a user session if they want to avoid
 * repeated probes.
 */
export class SettlementRouter {
    private readonly client: SequencerClient | null;
    private readonly preferDirect: boolean;
    private readonly onFallback?: (reason: string) => void;

    constructor(config: SettlementRouterConfig = {}) {
        this.client = config.sequencerUrl
            ? new SequencerClient({ url: config.sequencerUrl })
            : null;
        this.preferDirect = config.preferDirect ?? false;
        this.onFallback = config.onFallback;
    }

    /** Probe the sequencer and return the active settlement mode. */
    async resolveMode(): Promise<SettlementMode> {
        if (!this.client || this.preferDirect) return "direct";
        const available = await this.client.isAvailable();
        return available ? "batch" : "direct";
    }

    /** Get the sequencer client (null if direct-only or sequencer unavailable). */
    getSequencerClient(): SequencerClient | null {
        return this.client;
    }

    /**
     * Submit a commit operation via the batch path with automatic fallback.
     *
     * Returns { mode: "batch", operationId } if the sequencer accepted it,
     * or { mode: "direct" } if the caller should submit directly to FigaroCore.
     *
     * The caller is responsible for executing the direct path when mode === "direct".
     * This keeps the router signing-agnostic — it doesn't hold a WalletClient.
     */
    async routeCommit(
        commitment: Commitment,
        buyerSig: `0x${string}`,
        sellerSig: `0x${string}`,
    ): Promise<SettlementResult> {
        if (!this.client || this.preferDirect) {
            return { mode: "direct" };
        }

        try {
            const result = await this.client.submitCommit(commitment, buyerSig, sellerSig);
            return { mode: "batch", operationId: result.id };
        } catch (e) {
            const reason = extractErrorMessage(e, String(e));
            this.onFallback?.(`Batch commit failed, falling back to direct: ${reason}`);
            return { mode: "direct" };
        }
    }

    /**
     * Submit a resolve operation via the batch path with automatic fallback.
     */
    async routeResolve(
        processId: `0x${string}`,
        commitments: Commitment[],
        buyerSig: `0x${string}`,
    ): Promise<SettlementResult> {
        if (!this.client || this.preferDirect) {
            return { mode: "direct" };
        }

        try {
            const result = await this.client.submitResolve(processId, commitments, buyerSig);
            return { mode: "batch", operationId: result.id };
        } catch (e) {
            const reason = extractErrorMessage(e, String(e));
            this.onFallback?.(`Batch resolve failed, falling back to direct: ${reason}`);
            return { mode: "direct" };
        }
    }
}

// ── Singleton factory ───────────────────────────────────────────────────────

let _router: SettlementRouter | null = null;

/**
 * Get or create the singleton SettlementRouter.
 * Reads NEXT_PUBLIC_SEQUENCER_URL from environment on first call.
 */
export function getSettlementRouter(
    config?: SettlementRouterConfig,
): SettlementRouter {
    if (!_router) {
        const sequencerUrl =
            config?.sequencerUrl ??
            (typeof process !== "undefined"
                ? process.env?.NEXT_PUBLIC_SEQUENCER_URL
                : undefined) ??
            "";
        _router = new SettlementRouter({
            sequencerUrl: sequencerUrl || undefined,
            preferDirect: config?.preferDirect,
            onFallback: config?.onFallback,
        });
    }
    return _router;
}

/** Reset the singleton (for testing). */
export function resetSettlementRouter(): void {
    _router = null;
}
