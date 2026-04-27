/**
 * @figaro/core/agent — Agent Coordination Layer
 *
 * Stateful agent loop on top of @figaro/core primitives.
 * Provides: sync → analyze → propose → (approve) → execute.
 *
 * @example
 * ```ts
 * import { FigaroContext, proposeActions, ActionQueue, executeAction } from "@figaro/core/agent";
 *
 * // 1. Sync
 * const ctx = new FigaroContext(publicClient, addresses);
 * await ctx.sync();
 *
 * // 2. Analyze + propose
 * const process = ctx.getProcess(processId)!;
 * const actions = proposeActions(process, myAddress);
 *
 * // 3. HITL flow
 * const queue = new ActionQueue<{ bindingId?: string; roleKind?: string }>();
 * queue.enqueueAll(actions.map((action) => ({
 *   action,
 *   approvalContext: { bindingId: "binding:bobs-pizza-palace:local-anvil", roleKind: "merchant" },
 * })));
 * const approved = queue.approve(1);
 *
 * // 4. Execute
 * const result = await executeAction(walletClient, addresses, approved.action);
 * queue.markExecuted(1, result.hash);
 * ```
 */

// Context provider
export { FigaroContext } from "./context.js";
export type { SyncResult } from "./context.js";

// Action proposer
export { proposeActions, filterActions } from "./proposer.js";
export type {
    ActionType,
    ProposedAction,
    ResolveProcessAction,
    CommitSubOrderAction,
    AttestAction,
} from "./proposer.js";

// HITL gateway
export { ActionQueue } from "./hitl.js";
export type {
    QueueEnqueueItem,
    QueueEnqueueOptions,
    QueueItem,
    QueueItemStatus,
} from "./hitl.js";

// Autonomous gateway
export {
    commit,
    resolveProcess,
    attestAsSeller,
    attestAsBuyer,
    executeAction,
} from "./autonomous.js";
export type { TxResult } from "./autonomous.js";

// Sequencer client (batch path)
export { SequencerClient, SequencerError, toSequencerCommitment, toSequencerSig } from "./sequencer.js";
export type {
    SequencerClientConfig,
    SequencerOp,
    SequencerCommitment,
    SequencerSignature,
    SequencerStatus,
    SubmitResult,
} from "./sequencer.js";
