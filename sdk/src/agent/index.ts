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
 * const queue = new ActionQueue<{ bindingId?: string; party?: string }>();
 * queue.enqueueAll(actions.map((action) => ({
 *   action,
 *   approvalContext: { bindingId: "binding:my-seller:local-anvil", party: "seller" },
 * })));
 * const approved = queue.approve(1);
 *
 * // 4. Execute (resolve-process is self-contained; commit/attest take inputs)
 * const result = await executeAction(walletClient, publicClient, addresses, approved.action);
 * queue.markExecuted(1, result.hash);
 * ```
 */

// Context provider
export { FigaroContext } from "./context.js";
export type { SyncResult } from "./context.js";

// Action proposer
export { proposeActions, proposeInitiations, filterActions } from "./proposer.js";
export type {
    ActionType,
    ProposedAction,
    InitiateProcessAction,
    ResolveProcessAction,
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
export type { TxResult, ActionExecutionInputs } from "./autonomous.js";

// Coordination channel + offer envelope (the two-party origination transport)
export {
    serializeCommitmentPayload,
    deserializeCommitmentPayload,
    InProcessChannel,
} from "./coordination.js";
export type { CommitmentPayload, CoordinationChannel, OfferHandler } from "./coordination.js";

// HTTP transport — the first real (off-process) CoordinationChannel
export {
    HttpChannel,
    makeHttpOfferResponder,
    didWebEndpointResolver,
} from "./httpChannel.js";
export type {
    EndpointResolver,
    HttpChannelOptions,
    HttpOfferResponse,
    DidWebResolverOptions,
} from "./httpChannel.js";

// Assembly instantiation + origination handshake + the two loops
export {
    instantiateRootAgreement,
    buildBuyerOffer,
    validateOffer,
    counterSignOffer,
    offerToExecutionInputs,
    originateProcess,
    makeSellerOfferHandler,
    buildChainOffers,
    originateChain,
} from "./originate.js";
export type {
    AssemblyTemplate,
    TemplateAgreement,
    InstantiateParams,
    BuildOfferParams,
    OfferCheck,
    OriginateParams,
    SellerOfferHandlerOpts,
    ChainNodeSpec,
    BuildChainParams,
    ChainOffer,
    OriginateChainParams,
} from "./originate.js";

// did:web identity — agents bind their on-chain address to a resolvable DID
export {
    isDidWeb,
    didWebToUrl,
    validateDidDocument,
    resolveDidWeb,
    extractEthereumAddresses,
    extractServiceEndpoints,
    didDocumentMatchesAddress,
    buildSellerDidDocument,
} from "./did.js";
export type {
    VerificationMethod,
    DIDService,
    DIDDocument,
    DIDResolutionResult,
} from "./did.js";
