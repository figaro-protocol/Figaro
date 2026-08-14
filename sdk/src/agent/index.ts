/**
 * @figaro/sdk/agent — Agent Coordination Layer
 *
 * Stateful agent loop on top of @figaro/sdk primitives.
 * Provides: sync → analyze → propose → (approve) → execute.
 *
 * @example
 * ```ts
 * import { FigaroContext, proposeActions, ActionQueue, executeAction } from "@figaro/sdk/agent";
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
    prepareAttestationContent,
    attestAsBuyer,
    executeAction,
    recordProcessUsage,
} from "./autonomous.js";
export type { TxResult, ActionExecutionInputs, UsageRecordingEntry, UsageRecordingReport } from "./autonomous.js";

// Coordination channel + offer envelope (the two-party origination transport)
export {
    serializeCommitmentPayload,
    deserializeCommitmentPayload,
    MAX_COMMITMENT_PAYLOAD_BYTES,
    InProcessChannel,
} from "./coordination.js";
export type { CommitmentPayload, CoordinationChannel, OfferHandler, PricedField, QuoteRequestTerms } from "./coordination.js";

// HTTP transport — the first real (off-process) CoordinationChannel
export {
    HttpChannel,
    postOffer,
    makeHttpOfferResponder,
    didWebEndpointResolver,
    readCappedResponseText,
    MAX_OFFER_RESPONSE_BYTES,
} from "./httpChannel.js";
export type {
    EndpointResolver,
    HttpChannelOptions,
    HttpOfferResponse,
    DidWebResolverOptions,
} from "./httpChannel.js";

// A2A transport — the Agent2Agent-shaped CoordinationChannel (same seam,
// A2A wire): the offer envelope rides as an A2A message's data part.
export {
    A2aChannel,
    makeA2aOfferResponder,
    a2aMessageFromOffer,
    offerFromA2aMessage,
} from "./a2aChannel.js";
export type {
    A2aChannelOptions,
    A2aMessage,
    A2aOfferResponse,
    A2aPart,
} from "./a2aChannel.js";

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
    OfferPolicy,
    OriginateParams,
    SellerOfferHandlerOpts,
    ChainNodeSpec,
    BuildChainParams,
    ChainOffer,
    OriginateChainParams,
} from "./originate.js";

// The dispatch race — market formation with zero contracts: countersign-first
// choreography over unsigned drafts (the seller-signs-first inverse of the
// origination handshake). The RFQ leg is the same choreography with the
// CANDIDATE authoring the price: request at the buyer's ceiling, counter-draft
// at the quote, verified by reconstruction.
export {
    validateDraft,
    counterSignDraft,
    verifyRaceReply,
    selectRaceWinner,
    substitutePricedValue,
    buildQuoteRequest,
    buildCounterDraft,
    quoteDraft,
    verifyQuoteReply,
    requestQuotes,
    requestCounterSignatures,
    makeSellerRaceHandler,
    makeSellerQuoteHandler,
} from "./dispatchRace.js";
export type { RaceReply, BuildQuoteRequestParams } from "./dispatchRace.js";

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

// Sequencer client (batch path)
export {
    SequencerClient,
    SequencerError,
    toSequencerCommitment,
    toSequencerSig,
    fromSequencerCommitment,
    fromSequencerSig,
    parseWireQuantity,
} from "./sequencer.js";
export type {
    SequencerClientConfig,
    SequencerOp,
    SequencerCommitment,
    SequencerUsageClaim,
    SequencerSignature,
    SequencerContentProof,
    SequencerContentKind,
    SequencerStatus,
    SubmitResult,
    SequencerRetentionWindow,
    SequencerBatchRef,
    SequencerCommitView,
    SequencerResolutionView,
    SequencerOrderView,
    SequencerProcessResolutionView,
    SequencerProcessView,
    SequencerBatchRecord,
    SequencerBatchPage,
} from "./sequencer.js";
