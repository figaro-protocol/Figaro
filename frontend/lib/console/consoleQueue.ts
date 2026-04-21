/**
 * ConsoleQueue — Unified action queue for operating and building actions.
 *
 * The SDK's ActionQueue only accepts ProposedAction (operating).
 * This queue wraps both operating and building actions in a single
 * HITL pipeline so both appear in the same approval panel.
 */

import type { ProposedAction } from "@figaro/core/agent";
import type { ResolvedSemanticRuntimeSnapshot } from "@/lib/shared/runtimeResolution";
import type { QueuedBuildAction } from "./buildProvider";

// ── Discriminated union ─────────────────────────────────────────────────────

export type ConsoleActionKind = "operating" | "building";

export interface OperatingEntry {
    kind: "operating";
    action: ProposedAction;
}

export interface BuildingEntry {
    kind: "building";
    action: QueuedBuildAction;
}

export type ConsoleEntry = OperatingEntry | BuildingEntry;

// ── Queue item ──────────────────────────────────────────────────────────────

export type ConsoleItemStatus = "pending" | "approved" | "rejected" | "forwarded" | "executed";

export interface ConsoleQueueItem {
    id: number;
    entry: ConsoleEntry;
    runtimeSnapshot?: ResolvedSemanticRuntimeSnapshot;
    status: ConsoleItemStatus;
    enqueuedAt: number;
    decidedAt?: number;
    rejectionReason?: string;
    txHash?: string;
    /** For building actions that produce a non-tx result (e.g. validation). */
    result?: unknown;
}

interface ConsoleQueueEnqueueOptions {
    runtimeSnapshot?: ResolvedSemanticRuntimeSnapshot;
}

// ── Queue class ─────────────────────────────────────────────────────────────

export class ConsoleQueue {
    private items: ConsoleQueueItem[] = [];
    private nextId = 1;

    /** Enqueue an operating action. */
    enqueueOperating(action: ProposedAction, options: ConsoleQueueEnqueueOptions = {}): number {
        return this.enqueue({ kind: "operating", action }, options);
    }

    /** Enqueue a building action. */
    enqueueBuilding(action: QueuedBuildAction): number {
        return this.enqueue({ kind: "building", action });
    }

    private enqueue(entry: ConsoleEntry, options: ConsoleQueueEnqueueOptions = {}): number {
        const id = this.nextId++;
        this.items.push({
            id,
            entry,
            runtimeSnapshot: options.runtimeSnapshot,
            status: "pending",
            enqueuedAt: Date.now(),
        });
        return id;
    }

    /** All items. */
    all(): ConsoleQueueItem[] {
        return [...this.items];
    }

    /** Get a specific item. */
    get(id: number): ConsoleQueueItem | undefined {
        return this.items.find((i) => i.id === id);
    }

    /** Approve an item. */
    approve(id: number): ConsoleQueueItem {
        const item = this.items.find((i) => i.id === id);
        if (!item) throw new Error(`Queue item ${id} not found`);
        if (item.status !== "pending") {
            throw new Error(`Queue item ${id} is ${item.status}, not pending`);
        }
        item.status = "approved";
        item.decidedAt = Date.now();
        return item;
    }

    /** Reject an item. */
    reject(id: number, reason?: string): ConsoleQueueItem {
        const item = this.items.find((i) => i.id === id);
        if (!item) throw new Error(`Queue item ${id} not found`);
        if (item.status !== "pending") {
            throw new Error(`Queue item ${id} is ${item.status}, not pending`);
        }
        item.status = "rejected";
        item.decidedAt = Date.now();
        item.rejectionReason = reason;
        return item;
    }

    /** Mark an approved item as executed. */
    markExecuted(id: number, txHash?: string, result?: unknown): void {
        const item = this.items.find((i) => i.id === id);
        if (!item) throw new Error(`Queue item ${id} not found`);
        if (item.status !== "approved") {
            throw new Error(`Queue item ${id} is ${item.status}, not approved`);
        }
        item.status = "executed";
        item.txHash = txHash;
        item.result = result;
    }

    /** Mark an approved item as forwarded into an interactive surface. */
    markForwarded(id: number, result?: unknown): void {
        const item = this.items.find((i) => i.id === id);
        if (!item) throw new Error(`Queue item ${id} not found`);
        if (item.status !== "approved") {
            throw new Error(`Queue item ${id} is ${item.status}, not approved`);
        }
        item.status = "forwarded";
        item.result = result;
    }

    /** Pending count. */
    get pendingCount(): number {
        return this.items.filter((i) => i.status === "pending").length;
    }
}
