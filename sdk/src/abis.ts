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
    "function registerClause(string clauseId, uint64 version, bytes32 contentHash, string metadataURI) external",
    "function setMechanismClause(bytes32 clauseId) external",
    "event ClauseRegistered(string clauseId, uint64 version, bytes32 contentHash, string metadataURI, address indexed registrar)",
    "event MechanismClauseSet(address indexed mechanism, bytes32 indexed clauseId)",
]);


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

// ── AssemblyRegistry ABI ──────────────────────────────────────────────────

export const ASSEMBLY_REGISTRY_ABI = parseAbi([
    "function registerAssembly(string slug, bytes32 contentHash, string metadataURI) external payable",
    "function withdrawDeposit(string slug) external",
    "function bindings(bytes32 slugHash) view returns (address author, uint64 registeredAt, bool depositWithdrawn, bytes32 contentHash, string metadataURI)",
    "function registrationDeposit() view returns (uint256)",
    "function depositLockPeriod() view returns (uint256)",
    "event AssemblyRegistered(bytes32 indexed slugHash, address indexed author, string slug, bytes32 contentHash, string metadataURI)",
    "event DepositWithdrawn(bytes32 indexed slugHash, address indexed author, uint256 amount)",
    "error EmptySlug()",
    "error EmptyMetadataURI()",
    "error EmptyContentHash()",
    "error SlugAlreadyRegistered(string slug)",
    "error WrongDeposit(uint256 provided, uint256 required)",
    "error NotRegistered()",
    "error NotAuthor(address caller, address author)",
    "error DepositLocked(uint64 unlocksAt)",
    "error AlreadyWithdrawn()",
    "error TransferFailed()",
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
