/**
 * @figaro/core — ABIs
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

const COMMITMENT_TUPLE =
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

export const ATTESTATION_COORDINATOR_ABI = parseAbi([
    "function core() view returns (address)",
    "function clauseValidator(bytes32 clauseId) view returns (address)",
    "function setValidator(bytes32 clauseId, address validator) external",
    // All three paths now take the full Commitment(s) so the coordinator can
    // recover `agreementHash` without new kernel state, and carry `sectionData`
    // + merkle `proof` so the attestation's clause is provably part of the
    // signed agreement.
    `function attestAsSeller(${COMMITMENT_TUPLE} role, ${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    `function attestAsBuyer(${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    `function attestViaResolver(${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
    "event ValidatorSet(bytes32 indexed clauseId, address indexed validator)",
    "error InvalidInclusionProof(bytes32 agreementHash, bytes32 clauseId)",
]);

export const EV_ATTESTATION = parseAbiItem(
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
);

// ── DutchAuction ABI ────────────────────────────────────────────────────────

export const DUTCH_AUCTION_ABI = parseAbi([
    "function duration() view returns (uint64)",
    "function floorBps() view returns (uint16)",
    "function auctions(bytes32 auctionId) view returns (address creator, uint64 startTime, uint256 maxPrice, address provider, uint256 clearingPrice)",
    "function createAuction(bytes32 auctionId, uint256 maxPrice, bytes32 processId, address currency) external",
    "function claim(bytes32 auctionId) external",
    "function cancel(bytes32 auctionId) external",
    "function expire(bytes32 auctionId) external",
    "function getCurrentPrice(bytes32 auctionId) view returns (uint256)",
    "event AuctionCreated(bytes32 indexed auctionId, address indexed creator, uint256 maxPrice, bytes32 indexed processId, address currency)",
    "event AuctionClaimed(bytes32 indexed auctionId, address indexed provider, uint256 clearingPrice)",
    "event AuctionCancelled(bytes32 indexed auctionId)",
    "event AuctionExpired(bytes32 indexed auctionId)",
]);

export const EV_AUCTION_CREATED = parseAbiItem(
    "event AuctionCreated(bytes32 indexed auctionId, address indexed creator, uint256 maxPrice, bytes32 indexed processId, address currency)",
);

export const EV_AUCTION_CLAIMED = parseAbiItem(
    "event AuctionClaimed(bytes32 indexed auctionId, address indexed provider, uint256 clearingPrice)",
);

// ── ClauseRegistry ABI ──────────────────────────────────────────────────────

export const CLAUSE_REGISTRY_ABI = parseAbi([
    "function registered(bytes32 clauseId) view returns (bool)",
    "function registerClause(string clauseId, uint64 version, bytes32 contentHash, string metadataURI, bytes32 family) external",
    "function setMechanismClause(bytes32 clauseId) external",
    "event ClauseRegistered(string clauseId, uint64 version, bytes32 contentHash, string metadataURI, bytes32 indexed family, address indexed registrar)",
    "event MechanismClauseSet(address indexed mechanism, bytes32 indexed clauseId)",
]);

// ── ClauseRegistrationHelper ABI ────────────────────────────────────────────
// Atomic register-clause + bind-validator helper. Closes the M-1 front-running
// window between ClauseRegistry.registerClause and AttestationCoordinator.setValidator
// (DESIGN_DECISIONS.md #13). Stateless, no admin — anyone can call. Use this when
// registering a non-bootstrap clause; the alternative is the two primitives called
// separately (which exposes a front-running window for high-stakes clauses).

export const CLAUSE_REGISTRATION_HELPER_ABI = parseAbi([
    "function clauseRegistry() view returns (address)",
    "function attestationCoordinator() view returns (address)",
    "function registerClauseAndValidator(string clauseId, uint64 version, bytes32 contentHash, string metadataURI, bytes32 family, address validator) external",
]);

// ── FigaroBatchVerifier ABI ──────────────────────────────────────────────────

export const BATCH_VERIFIER_ABI = parseAbi([
    // ── Batch settlement ────────────────────────────────────────────
    "function settleBatch(bytes proof, bytes publicValues, (address token, address user, uint256 deposit, uint256 payout)[] positions, ((bytes32 orderHash, bytes32 processId, address attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)[] attestations, (bytes32 clauseId, uint64 version, bytes32 uriHash, bytes32 family, address registrar)[] clauses, (address mechanism, bytes32 clauseId)[] mechanismClauses, (uint8 tag, address seller, string metadataURI)[] sellerEvents) events) external",

    // ── Views ────────────────────────────────────────────────────────
    "function stateRoot() view returns (bytes32)",
    "function batchCount() view returns (uint64)",
    "function verifier() view returns (address)",
    "function programVKey() view returns (bytes32)",

    // ── Events (protocol-compatible re-emissions + BatchSettled) ─────
    "event BatchSettled(uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount)",
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
    "event ClauseRegistered(bytes32 indexed clauseId, uint64 version, bytes32 uriHash, bytes32 indexed family, address indexed registrar)",
    "event MechanismClauseSet(address indexed mechanism, bytes32 indexed clauseId)",
    "event SellerRegistered(address indexed seller, string metadataURI)",
    "event SellerProfileUpdated(address indexed seller, string metadataURI)",
]);

export const EV_BATCH_SETTLED = parseAbiItem(
    "event BatchSettled(uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount)",
);

// ── ERC-20 ABI (standard + EIP-2612 permit) ────────────────────────────────

export const ERC20_ABI = parseAbi([
    "function balanceOf(address account) view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function name() view returns (string)",
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
    "function depositLockPeriod() view returns (uint256)",
    "event SellerRegistered(address indexed seller, string metadataURI)",
    "event SellerProfileUpdated(address indexed seller, string metadataURI)",
    "event SellerWithdrawn(address indexed seller, uint256 deposit)",
]);

// ── FIG Token ABIs ──────────────────────────────────────────────────────────

export const FIG_TOKEN_ABI = parseAbi([
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
    "function claim(uint8 stageIndex, uint256 amount, bytes32[] proof) external",
    "function claimed(uint8 stageIndex, address account) view returns (bool)",
    "function minter() view returns (address)",
    "function stages(uint8 stageIndex) view returns (bytes32 root, uint64 unlockTime, uint256 totalAllocated)",
    "function submitter() view returns (address)",
    "function programVKey() view returns (bytes32)",
    "function STAGE_COUNT() view returns (uint8)",
    "event Claimed(uint8 indexed stageIndex, address indexed account, uint256 amount)",
    "event RootSubmitted(uint8 indexed stageIndex, bytes32 indexed root, uint256 totalAllocated, uint32 clauseCount)",
]);
