/**
 * lib/composition/abis.ts — ABIs for contracts the frontend COMPOSES with.
 *
 * These are NOT core. Core is the five Figaro contracts (kernel +
 * Clause/Seller/Assembly registries + FIG) + the agnostic ERC-20 — those live
 * in `@figaro/core` and `lib/kernel/contracts.ts`, enforced by
 * `scripts/lint-core-contract-abis.sh`. Everything here is a contract the
 * protocol composes WITH (dutch auction, carbon-offset receipt, attestation),
 * so its ABI carries no privilege and lives outside core.
 *
 * STEP-2 TARGET (open-world): the frontend should learn a composed contract's
 * ABI + how to invoke it from the registered clause/assembly spec at runtime
 * (IPFS), the way it already learns clauses — so adding a contract needs no
 * code. Until then these are bundled here, quarantined out of core. They are
 * prior knowledge to be removed, not a pattern to copy.
 */
import { parseAbi, parseAbiItem } from "viem";
import { COMMITMENT_TUPLE } from "@figaro/core";

// ── AttestationCoordinator ───────────────────────────────────────────────────
//
// ⚠️  DEFECT — STEP 2: this contract is wrongly coupled to FigaroCore. It takes
// kernel `Commitment` structs and re-derives roles against core
// (`_requireKnownCommitment`). The open-world design is that the UI derives
// buyer/seller from the INDEXER, and role authorization goes through
// `IRoleResolver` — NOT a FigaroCore call. The contract is to be redesigned to
// drop the `Commitment` args + the `core` dependency; this ABI (and the
// `COMMITMENT_TUPLE` import) dies with that change. Bundled here only so the
// runtime-attest + audit beats work in the interim.
export const ATTESTATION_COORDINATOR_ABI = parseAbi([
    "function core() view returns (address)",
    `function attestAsSeller(${COMMITMENT_TUPLE} role, ${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    `function attestAsBuyer(${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    `function attestViaResolver(${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
    "error InvalidInclusionProof(bytes32 agreementHash, bytes32 clauseId)",
]);

export const EV_ATTESTATION = parseAbiItem(
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
);

// ── DutchAuction ─────────────────────────────────────────────────────────────
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

// ── ProcessOffsetReceipt ─────────────────────────────────────────────────────
export const PROCESS_OFFSET_RECEIPT_ABI = parseAbi([
    "function core() view returns (address)",
    "function record(bytes32 processId, bytes32 retirementTxHash, address aggregator, uint256 tonsRetired, address inputToken, uint256 inputAmount) external",
    "event ReceiptRecorded(bytes32 indexed processId, address indexed buyer, bytes32 indexed retirementTxHash, address aggregator, uint256 tonsRetired, address inputToken, uint256 inputAmount)",
    "error NotRootBuyer()",
    "error ZeroRetirementTxHash()",
    "error ZeroAggregator()",
    "error ZeroTonsRetired()",
    "error ZeroInputToken()",
    "error ZeroInputAmount()",
]);
