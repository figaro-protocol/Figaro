/**
 * @figaro/core/agent — HITL (Human-in-the-Loop) Gateway
 *
 * Typed action queue for the "agent proposes, human approves" pattern.
 * The agent enqueues proposed actions; the human reviews and approves/rejects.
 *
 * This module has NO execution capability — it only manages the queue.
 * Approved actions are passed to the autonomous gateway (or a wallet UI)
 * for actual signing and submission.
 *
 * Usage:
 *   const queue = new ActionQueue<{ bindingId?: string; party?: string }>();
 *   queue.enqueue(action, {
 *     approvalContext: { bindingId: "binding:bobs-pizza-palace:local-anvil", party: "seller" },
 *   });                                     // Agent proposes with review context
 *   const pending = queue.pending();        // Human reviews
 *   const item = queue.approve(id);         // Human approves
 *   await executeAction(walletClient, item.action, ...);  // Executed externally
 */

import type { ProposedAction } from "./proposer.js";

export type QueueItemStatus = "pending" | "approved" | "rejected" | "executed";

export interface QueueEnqueueOptions<TApprovalContext = unknown> {
    /** Optional metadata carried with the queue item for approval workflows. */
    approvalContext?: TApprovalContext;
}

export interface QueueEnqueueItem<TApprovalContext = unknown>
    extends QueueEnqueueOptions<TApprovalContext> {
    /** The proposed action to enqueue. */
    action: ProposedAction;
}

export interface QueueItem<TApprovalContext = unknown> {
    /** Unique ID within this queue. */
    id: number;
    /** The proposed action. */
    action: ProposedAction;
    /** Optional metadata carried alongside the action for human/agent approval. */
    approvalContext?: TApprovalContext;
    /** Current status. */
    status: QueueItemStatus;
    /** When the item was enqueued. */
    enqueuedAt: number;
    /** When the item was approved/rejected (if applicable). */
    decidedAt?: number;
    /** Optional reason for rejection. */
    rejectionReason?: string;
    /** Transaction hash after execution (if applicable). */
    txHash?: string;
}

/**
 * Typed action queue for human-in-the-loop approval flow.
 */
export class ActionQueue<TApprovalContext = unknown> {
    private items: QueueItem<TApprovalContext>[] = [];
    private nextId = 1;

    /** Enqueue a proposed action for human review. Returns the queue item ID. */
    enqueue(
        action: ProposedAction,
        options?: QueueEnqueueOptions<TApprovalContext>,
    ): number {
        const id = this.nextId++;
        this.items.push({
            id,
            action,
            approvalContext: options?.approvalContext,
            status: "pending",
            enqueuedAt: Date.now(),
        });
        return id;
    }

    /** Enqueue multiple actions at once. Returns their IDs. */
    enqueueAll(actions: ProposedAction[]): number[];
    enqueueAll(items: QueueEnqueueItem<TApprovalContext>[]): number[];
    enqueueAll(
        entries: Array<ProposedAction | QueueEnqueueItem<TApprovalContext>>,
    ): number[] {
        return entries.map((entry) => {
            if ("action" in entry) {
                return this.enqueue(entry.action, {
                    approvalContext: entry.approvalContext,
                });
            }

            return this.enqueue(entry);
        });
    }

    /** Get all pending items awaiting decision. */
    pending(): QueueItem<TApprovalContext>[] {
        return this.items.filter((i) => i.status === "pending");
    }

    /** Get all items regardless of status. */
    all(): QueueItem<TApprovalContext>[] {
        return [...this.items];
    }

    /** Get a specific item by ID. */
    get(id: number): QueueItem<TApprovalContext> | undefined {
        return this.items.find((i) => i.id === id);
    }

    /** Approve an item. Returns the item for execution. */
    approve(id: number): QueueItem<TApprovalContext> {
        const item = this.items.find((i) => i.id === id);
        if (!item) throw new Error(`Queue item ${id} not found`);
        if (item.status !== "pending") {
            throw new Error(`Queue item ${id} is ${item.status}, not pending`);
        }
        item.status = "approved";
        item.decidedAt = Date.now();
        return item;
    }

    /** Reject an item with an optional reason. */
    reject(id: number, reason?: string): QueueItem<TApprovalContext> {
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

    /** Mark an approved item as executed (with optional tx hash). */
    markExecuted(id: number, txHash?: string): void {
        const item = this.items.find((i) => i.id === id);
        if (!item) throw new Error(`Queue item ${id} not found`);
        if (item.status !== "approved") {
            throw new Error(`Queue item ${id} is ${item.status}, not approved`);
        }
        item.status = "executed";
        item.txHash = txHash;
    }

    /** Clear all decided items (approved+executed and rejected). */
    prune(): number {
        const before = this.items.length;
        this.items = this.items.filter(
            (i) => i.status === "pending" || i.status === "approved",
        );
        return before - this.items.length;
    }

    /** Number of pending items. */
    get pendingCount(): number {
        return this.items.filter((i) => i.status === "pending").length;
    }
}
