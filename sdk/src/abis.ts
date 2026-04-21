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
    `function attestAsSeller(${COMMITMENT_TUPLE} roleCommitment, bytes32 orderHash, bytes32 schemaId, uint8 stage, bytes32 contentRef) external`,
    "function attestAsBuyer(bytes32 processId, bytes32 orderHash, bytes32 schemaId, uint8 stage, bytes32 contentRef) external",
    `function attestViaResolver(${COMMITMENT_TUPLE} commitment, bytes32 schemaId, uint8 stage, bytes32 contentRef) external`,
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 schemaId, uint8 stage, bytes32 contentRef)",
]);

export const EV_ATTESTATION = parseAbiItem(
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 schemaId, uint8 stage, bytes32 contentRef)",
);

// ── DutchAuction ABI ────────────────────────────────────────────────────────

export const DUTCH_AUCTION_ABI = parseAbi([
    "function duration() view returns (uint64)",
    "function floorBps() view returns (uint16)",
    "function auctions(bytes32 auctionId) view returns (address creator, uint64 startTime, uint256 maxPrice, address driver, uint256 clearingPrice)",
    "function createAuction(bytes32 auctionId, uint256 maxPrice, bytes32 processId, address currency) external",
    "function claim(bytes32 auctionId) external",
    "function cancel(bytes32 auctionId) external",
    "function expire(bytes32 auctionId) external",
    "function getCurrentPrice(bytes32 auctionId) view returns (uint256)",
    "event AuctionCreated(bytes32 indexed auctionId, address indexed creator, uint256 maxPrice, bytes32 indexed processId, address currency)",
    "event AuctionClaimed(bytes32 indexed auctionId, address indexed driver, uint256 clearingPrice)",
    "event AuctionCancelled(bytes32 indexed auctionId)",
    "event AuctionExpired(bytes32 indexed auctionId)",
]);

export const EV_AUCTION_CREATED = parseAbiItem(
    "event AuctionCreated(bytes32 indexed auctionId, address indexed creator, uint256 maxPrice, bytes32 indexed processId, address currency)",
);

export const EV_AUCTION_CLAIMED = parseAbiItem(
    "event AuctionClaimed(bytes32 indexed auctionId, address indexed driver, uint256 clearingPrice)",
);

// ── SchemaRegistry ABI ──────────────────────────────────────────────────────

export const SCHEMA_REGISTRY_ABI = parseAbi([
    "function registered(bytes32 schemaId) view returns (bool)",
    "function registerSchema(bytes32 schemaId, uint64 version, bytes32 uriHash) external",
    "function setMechanismSchema(bytes32 schemaId) external",
    "event SchemaRegistered(bytes32 indexed schemaId, uint64 version, bytes32 uriHash, address indexed registrar)",
    "event MechanismSchemaSet(address indexed mechanism, bytes32 indexed schemaId)",
]);

// ── FigaroBatchVerifier ABI ──────────────────────────────────────────────────

export const BATCH_VERIFIER_ABI = parseAbi([
    // ── Batch settlement ────────────────────────────────────────────
    "function settleBatch(bytes proof, bytes publicValues, (address token, address user, uint256 deposit, uint256 payout)[] positions, ((bytes32 orderHash, bytes32 processId, address attester, bytes32 schemaId, uint8 stage, bytes32 contentRef)[] attestations, (bytes32 schemaId, uint64 version, bytes32 uriHash, address registrar)[] schemas, (address mechanism, bytes32 schemaId)[] mechanismSchemas, (uint8 tag, address operator, uint8 role, string metadataURI)[] operatorEvents) events) external",

    // ── Views ────────────────────────────────────────────────────────
    "function stateRoot() view returns (bytes32)",
    "function batchCount() view returns (uint64)",
    "function verifier() view returns (address)",
    "function programVKey() view returns (bytes32)",

    // ── Events (protocol-compatible re-emissions + BatchSettled) ─────
    "event BatchSettled(uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount)",
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 schemaId, uint8 stage, bytes32 contentRef)",
    "event SchemaRegistered(bytes32 indexed schemaId, uint64 version, bytes32 uriHash, address indexed registrar)",
    "event MechanismSchemaSet(address indexed mechanism, bytes32 indexed schemaId)",
    "event OperatorRegistered(address indexed operator, uint8 role, string metadataURI)",
    "event OperatorUpdated(address indexed operator, uint8 role, string metadataURI)",
    "event OperatorDeactivated(address indexed operator)",
    "event OperatorReactivated(address indexed operator)",
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

// ── OperatorRegistry ABI ────────────────────────────────────────────────────

export const OPERATOR_REGISTRY_ABI = parseAbi([
    "function register(uint8 role, string metadataURI) external payable",
    "function updateProfile(uint8 role, string metadataURI) external",
    "function deactivate() external",
    "function reactivate() external",
    "function withdraw() external",
    "function registrationDeposit() view returns (uint256)",
    "function depositLockPeriod() view returns (uint256)",
    "event OperatorRegistered(address indexed operator, uint8 role, string metadataURI)",
    "event OperatorUpdated(address indexed operator, uint8 role, string metadataURI)",
    "event OperatorDeactivated(address indexed operator)",
    "event OperatorReactivated(address indexed operator)",
    "event OperatorWithdrawn(address indexed operator, uint256 deposit)",
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

export const STAGED_MERKLE_AIRDROP_ABI = parseAbi([
    "function claim(uint8 stageIndex, uint256 amount, bytes32[] proof) external",
    "function claimed(uint8 stageIndex, address account) view returns (bool)",
    "function minter() view returns (address)",
    "function stages(uint8 stageIndex) view returns (bytes32 root, uint64 unlockTime)",
    "function STAGE_COUNT() view returns (uint8)",
    "event Claimed(uint8 indexed stageIndex, address indexed account, uint256 amount)",
]);
