/**
 * @figaro/sdk — ABIs
 *
 * Canonical ABI definitions for all Figaro contracts.
 * These are the source of truth — the frontend should eventually import from here.
 */

import { parseAbi, parseAbiItem } from "viem";

// ── Commitment struct type (shared across ABI strings) ──────────────────────
// Matches CommitmentTypes.Commitment in Solidity:
//   (bytes32 processId, address buyer, address seller, address currency,
//    uint256 payment, uint256 expectedCumulativeValue, bytes32 agreementHash,
//    uint256 salt, uint256 deadline)

/** The kernel `Commitment` struct as an ABI tuple string. A core primitive —
 *  exported so contracts the frontend composes with (which take a Commitment as
 *  a calldata arg) can build their ABIs without re-stating the kernel struct. */
export const COMMITMENT_TUPLE =
    "(bytes32 processId, address buyer, address seller, address currency, uint256 payment, uint256 expectedCumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)";

// ── FigaroCore ABI ──────────────────────────────────────────────────────────

export const CORE_ABI = parseAbi([
    // ── Unified commitment (dual-signed, atomic bond lock) ──────────
    `function commit(${COMMITMENT_TUPLE} c, bytes buyerSig, bytes sellerSig) external returns (bytes32 processId, bytes32 orderHash)`,

    // ── Resolution (buyer dominance, atomic, direct transfer) ───────
    `function resolveProcess(bytes32 processId, ${COMMITMENT_TUPLE}[] commitments) external`,

    // ── Process state views ─────────────────────────────────────────
    "function processes(bytes32 processId) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint256 activeOrderCount)",
    "function orderStatus(bytes32 orderHash) view returns (uint8)",
    "function orderProcessId(bytes32 orderHash) view returns (bytes32)",

    // ── Events ──────────────────────────────────────────────────────
    "event OrderCommitted(bytes32 indexed orderHash, bytes32 indexed processId, address indexed buyer, address seller, address currency, uint256 payment, uint256 cumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)",
    "event OrderSeller(bytes32 indexed orderHash, address indexed seller)",
    "event OrderCurrency(bytes32 indexed orderHash, address indexed currency)",
    "event OrderResolved(bytes32 indexed orderHash, bytes32 indexed processId, uint256 sellerPayout, uint256 buyerPayout)",
    "event ProcessResolved(bytes32 indexed processId, address indexed buyer, uint256 orderCount)",

    // ── Errors (must mirror src/FigaroCore.sol) ──────────────────────
    // Carried in the ABI so viem can decode reverts by name rather than
    // surfacing raw 4-byte selectors. Order matches the contract.
    "error DeadlineExpired()",
    "error InvalidBuyerSignature()",
    "error InvalidSellerSignature()",
    "error ZeroPayment()",
    "error ProcessAlreadyExists()",
    "error UnknownProcess()",
    "error CumulativeValueMismatch(uint256 expected, uint256 actual)",
    "error NotProcessBuyer()",
    "error CurrencyMismatch()",
    "error OrderNotCommitted(bytes32 orderHash)",
    "error NoActiveOrders()",
    "error IncompleteOrderList(uint256 required, uint256 provided)",
    "error DuplicateCommitment()",
    "error FeeOnTransferDetected()",
    "error InvalidRootCumulativeValue()",
    "error ProcessAlreadyResolved()",
]);

// ── Individual event ABIs (for log filtering) ───────────────────────────────

export const EV_ORDER_COMMITTED = parseAbiItem(
    "event OrderCommitted(bytes32 indexed orderHash, bytes32 indexed processId, address indexed buyer, address seller, address currency, uint256 payment, uint256 cumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)",
);

export const EV_ORDER_SELLER = parseAbiItem(
    "event OrderSeller(bytes32 indexed orderHash, address indexed seller)",
);

export const EV_ORDER_CURRENCY = parseAbiItem(
    "event OrderCurrency(bytes32 indexed orderHash, address indexed currency)",
);

export const EV_ORDER_RESOLVED = parseAbiItem(
    "event OrderResolved(bytes32 indexed orderHash, bytes32 indexed processId, uint256 sellerPayout, uint256 buyerPayout)",
);

export const EV_PROCESS_RESOLVED = parseAbiItem(
    "event ProcessResolved(bytes32 indexed processId, address indexed buyer, uint256 orderCount)",
);

// ── AttestationCoordinator ABI ──────────────────────────────────────────────
//
// THE one home for this ABI (operator ruling 2026-07-06): the coordinator's
// kernel reads are DESIGN, not a defect. `core.orderStatus` anchors every
// attestation to a live committed order (without it, a merkle proof shows a
// clause is in *some* agreement, not THE order's agreement) and
// `core.DOMAIN_SEPARATOR` derives root processIds with no silent-drift risk.
// Read-side role *display* is indexer-derived in the UI; write-side role
// *verification* stays here — that is what makes the record evidence.
// `attestViaResolver` (IRoleResolver) is the open composition path for
// mechanism-contract sellers.

export const ATTESTATION_COORDINATOR_ABI = parseAbi([
    "function core() view returns (address)",
    // All three paths take the full Commitment(s) so the coordinator can
    // recover `agreementHash` without new kernel state, and carry `sectionData`
    // + merkle `proof` so the attestation's clause is provably part of the
    // signed agreement. There is no on-chain clause-content validator.
    `function attestAsSeller(${COMMITMENT_TUPLE} role, ${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    `function attestAsBuyer(${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    `function attestViaResolver(${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
    "error InvalidInclusionProof(bytes32 agreementHash, bytes32 clauseId)",
]);

export const EV_ATTESTATION = parseAbiItem(
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
);

// ── WitnessSwapAndCommitCoordinator ABI ─────────────────────────────────────
//
// Off-protocol executor: fund a FigaroCore bond from a swapped input token,
// with the swap route bound into the party's Permit2 witness signature. The
// coordinator funds the party in-place (the kernel pulls the bond from
// `c.buyer`/`c.seller`, never `msg.sender`), so the commitment stays
// bilaterally signed and the coordinator is never a counterparty.

/** The coordinator's per-leg `SwapFunding` struct as an ABI tuple string.
 *  `enabled = false` skips the leg (the party self-funds the bond currency). */
export const SWAP_FUNDING_TUPLE =
    "(bool enabled, address inputToken, uint256 maxInput, uint256 permitNonce, uint256 permitDeadline, bytes permitSignature, bytes swapData)";

export const WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI = parseAbi([
    "function figaroCore() view returns (address)",
    "function permit2() view returns (address)",
    "function router() view returns (address)",
    // Recomputes the Permit2 witness a party must sign for a leg — binds
    // {router, inputToken, maxInput, keccak256(swapData)} so the signature
    // covers the exact swap route.
    "function swapWitness(address inputToken, uint256 maxInput, bytes swapData) view returns (bytes32)",
    `function swapAndCommit(${COMMITMENT_TUPLE} c, bytes buyerSig, bytes sellerSig, ${SWAP_FUNDING_TUPLE} buyerFunding, ${SWAP_FUNDING_TUPLE} sellerFunding) external returns (bytes32 processId, bytes32 orderHash)`,
    "error NothingToFund()",
    "error SwapCallFailed()",
    "error OutputBelowBond(uint256 received, uint256 required)",
]);

// ── ClauseRegistry ABI ──────────────────────────────────────────────────────

export const CLAUSE_REGISTRY_ABI = parseAbi([
    "function registered(bytes32 clauseId) view returns (bool)",
    "function registerClause(string clauseId, uint64 version, bytes32 contentHash, string contentURI) external payable",
    "function withdrawDeposit(bytes32 idHash) external",
    "function registrationDeposit() view returns (uint256)",
    "function depositOf(bytes32 idHash) view returns (address registrar, bool withdrawn)",
    "function setMechanismClause(bytes32 idHash) external",
    "event ClauseRegistered(string clauseId, uint64 version, bytes32 contentHash, string contentURI, address indexed registrar)",
    "event DepositWithdrawn(bytes32 indexed clauseId, address indexed registrar, uint256 amount)",
    "event MechanismClauseSet(address indexed mechanism, bytes32 indexed idHash)",
    "error AlreadyRegistered(bytes32 clauseId)",
    "error NotRegistered(bytes32 clauseId)",
    "error EmptyClauseId()",
    "error EmptyContentURI()",
    "error ZeroContentHash()",
    "error WrongDeposit(uint256 provided, uint256 required)",
    "error NotRegistrar(address caller, address registrar)",
    "error AlreadyWithdrawn()",
    "error TransferFailed()",
]);


// ── ERC-20 ABI (standard + EIP-2612 permit) ────────────────────────────────

export const ERC20_ABI = parseAbi([
    "function balanceOf(address account) view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function nonces(address owner) view returns (uint256)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
]);

// ── SellerRegistry ABI ────────────────────────────────────────────────────

export const SELLER_REGISTRY_ABI = parseAbi([
    "function register(string metadataURI) external payable",
    "function updateProfile(string metadataURI) external",
    "function withdraw() external",
    "function registrationDeposit() view returns (uint256)",
    "event SellerRegistered(address indexed seller, string metadataURI)",
    "event SellerProfileUpdated(address indexed seller, string metadataURI)",
    "event SellerWithdrawn(address indexed seller, uint256 deposit)",
    "error AlreadyRegistered()",
    "error NotRegistered()",
    "error InsufficientDeposit()",
    "error TransferFailed()",
]);

// ── AssemblyRegistry ABI ──────────────────────────────────────────────────

export const ASSEMBLY_REGISTRY_ABI = parseAbi([
    "function registerAssembly(bytes32 compositionHash, string contentURI) external payable",
    "function withdrawDeposit(bytes32 compositionHash) external",
    "function bindings(bytes32 compositionHash) view returns (address author, uint64 registeredAt, bool depositWithdrawn, string contentURI)",
    "function registrationDeposit() view returns (uint256)",
    "event AssemblyRegistered(bytes32 indexed compositionHash, address indexed author, string contentURI)",
    "event DepositWithdrawn(bytes32 indexed compositionHash, address indexed author, uint256 amount)",
    "error EmptyContentURI()",
    "error ZeroCompositionHash()",
    "error CompositionAlreadyRegistered(bytes32 compositionHash)",
    "error WrongDeposit(uint256 provided, uint256 required)",
    "error NotRegistered()",
    "error NotAuthor(address caller, address author)",
    "error AlreadyWithdrawn()",
    "error TransferFailed()",
]);

// ── Florin Token ABIs ─────────────────────────────────────────────────────────

export const FLORIN_TOKEN_ABI = parseAbi([
    "function balanceOf(address account) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    // emissionContract removed
    "function deployerMintRenounced() view returns (bool)",
    "function deployer() view returns (address)",
]);

export const RPGF_MINTER_ABI = parseAbi([
    "function postRoot(uint8 trancheId, bytes32 root, uint64 fromBlock, uint64 toBlock) external payable",
    "function challenge(uint8 trancheId) external payable returns (uint256 caseId)",
    "function disputeChallenge(uint256 caseId) external payable",
    "function concede(uint256 caseId) external",
    "function finalize(uint8 trancheId) external",
    "function claim(uint8 trancheId, address account, uint256 amount, bytes32[] proof) external",
    "function withdrawBonds() external",
    "function bond() view returns (uint256)",
    "function challengeWindow() view returns (uint64)",
    "function disputeWindow() view returns (uint64)",
    "function formulaHash() view returns (bytes32)",
    "function tranches(uint256) view returns (uint256 amount, uint64 earliestPost, bytes32 root, uint64 fromBlock, uint64 toBlock, bool finalized, uint256 minted)",
    "function postings(uint256) view returns (address poster, bytes32 root, uint64 fromBlock, uint64 toBlock, uint64 postedAt)",
    "function claimed(uint8 trancheId, address account) view returns (bool)",
    "function withdrawable(address account) view returns (uint256)",
    "function arbitrator() view returns (address)",
    "function bondCases(uint256) view returns (address poster, address challenger, uint64 challengedAt, uint8 status)",
    "event RootPosted(uint8 indexed trancheId, address indexed poster, bytes32 root, uint64 fromBlock, uint64 toBlock)",
    "event RootChallenged(uint8 indexed trancheId, uint256 indexed caseId, address indexed challenger, bytes32 root)",
    "event ChallengeDisputed(uint256 indexed caseId, uint256 fee)",
    "event ChallengeConceded(uint256 indexed caseId)",
    "event CaseRuled(uint256 indexed caseId, uint8 ruling)",
    "event BondsWithdrawn(address indexed account, uint256 amount)",
    "event TrancheFinalizedRoot(uint8 indexed trancheId, bytes32 root, uint64 fromBlock, uint64 toBlock)",
    "event Claimed(uint8 indexed trancheId, address indexed account, uint256 amount)",
]);

export const DONATION_RAIL_ABI = parseAbi([
    "function donate(address token, address recipient, uint256 amount) external",
    "event Donation(address indexed token, address indexed donor, address indexed recipient, uint256 amount)",
]);

export const OPTIMISTIC_MATCH_POOL_ABI = parseAbi([
    "function postRoot(bytes32 root, uint64 fromBlock, uint64 toBlock) external payable",
    "function challenge() external payable returns (uint256 caseId)",
    "function disputeChallenge(uint256 caseId) external payable",
    "function concede(uint256 caseId) external",
    "function finalize() external",
    "function claim(address account, uint256 amount, bytes32[] proof) external",
    "function withdrawBonds() external",
    "function matchToken() view returns (address)",
    "function donationToken() view returns (address)",
    "function donationRail() view returns (address)",
    "function formulaHash() view returns (bytes32)",
    "function arbitrator() view returns (address)",
    "function bond() view returns (uint256)",
    "function challengeWindow() view returns (uint64)",
    "function disputeWindow() view returns (uint64)",
    "function donationStart() view returns (uint64)",
    "function donationEnd() view returns (uint64)",
    "function posting() view returns (address poster, bytes32 root, uint64 fromBlock, uint64 toBlock, uint64 postedAt)",
    "function bondCases(uint256) view returns (address poster, address challenger, uint64 challengedAt, uint8 status)",
    "function finalRoot() view returns (bytes32)",
    "function finalFromBlock() view returns (uint64)",
    "function finalToBlock() view returns (uint64)",
    "function finalized() view returns (bool)",
    "function budget() view returns (uint256)",
    "function claimedTotal() view returns (uint256)",
    "function claimed(address account) view returns (bool)",
    "function withdrawable(address account) view returns (uint256)",
    "event RootPosted(address indexed poster, bytes32 root, uint64 fromBlock, uint64 toBlock)",
    "event RootChallenged(uint256 indexed caseId, address indexed challenger, bytes32 root)",
    "event ChallengeDisputed(uint256 indexed caseId, uint256 fee)",
    "event ChallengeConceded(uint256 indexed caseId)",
    "event CaseRuled(uint256 indexed caseId, uint8 ruling)",
    "event MatchFinalized(bytes32 root, uint64 fromBlock, uint64 toBlock, uint256 budget)",
    "event Claimed(address indexed account, uint256 amount)",
    "event BondsWithdrawn(address indexed account, uint256 amount)",
]);

// ── FigaroBatchVerifier ABI ──────────────────────────────────────────────────
// The batch-settlement verifier (proof-based scaling). settleBatch carries the
// proof, the 7-word public values, net positions, and the event data — the
// attestations to re-emit plus the (clause key → witness-spec hash) bindings
// the contract checks against ClauseRegistry.contentHashOf before settling.

export const BATCH_VERIFIER_ABI = parseAbi([
    // ── Batch settlement ────────────────────────────────────────────
    "function settleBatch(bytes proof, bytes publicValues, (address token, address user, uint256 deposit, uint256 payout)[] positions, ((bytes32 orderHash, bytes32 processId, address attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)[] attestations, (bytes32 clauseId, bytes32 specHash)[] specBindings) events) external",

    // ── Views ────────────────────────────────────────────────────────
    "function stateRoot() view returns (bytes32)",
    "function batchCount() view returns (uint64)",
    "function verifier() view returns (address)",
    "function programVKey() view returns (bytes32)",
    "function clauseRegistry() view returns (address)",

    // ── Events (Attestation shares its topic with the coordinator's —
    //    indexers filter by address) ─────────────────────────────────
    "event BatchSettled(uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount)",
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
]);
