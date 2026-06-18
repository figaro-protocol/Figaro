// Figaro V5 Configuration
// Addresses are sourced from environment variables written by deploy-local.sh
//
// ABIs are re-exported from the canonical SDK (@figaro/core).
// Frontend-specific additions (e.g. MockERC20 mint) are defined locally.

import { parseAbi } from "viem";
export {
    CORE_ABI,
    ATTESTATION_COORDINATOR_ABI,
    DUTCH_AUCTION_ABI,
    CLAUSE_REGISTRY_ABI,
    
    ERC20_ABI,
} from "@figaro/core";

/// ProcessOffsetReceipt — permissionless receipts contract for Path A
/// off-protocol carbon-offset retirements. The frontend bridge calls
/// `record(...)` after the buyer pays an aggregator; the contract verifies
/// caller == rootBuyer and emits ReceiptRecorded with the processId↔retirement
/// link. ABI is locally declared because this contract isn't part of the SDK
/// re-export surface — it's a frontend-specific runtime anchor.
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
] as const);

// MockERC20 mint — devnet only, not part of the protocol ABI.
export const MOCK_MINT_ABI = parseAbi([
    "function mint(address to, uint256 amount) external",
]);

// NOTE: Next.js/SWC only statically inlines process.env.NEXT_PUBLIC_* with
// dot-notation direct property access. Dynamic bracket access via a function
// parameter (getEnvVar(key)) is NOT replaced and returns undefined in the browser.
// Always use process.env.NEXT_PUBLIC_... directly for client-side env vars.

export interface ChainConfig {
    core: `0x${string}`;
    mockToken: `0x${string}`;
    /** EIP-2612 permit-capable test token (MockPermitToken). Optional — empty string when not deployed. */
    permitToken: `0x${string}`;
    /** AttestationCoordinator. Optional — empty string when not deployed. */
    attestationCoordinator: `0x${string}`;
    /** ClauseRegistry. Optional — empty string when not deployed. */
    clauseRegistry: `0x${string}`;
    /** DutchAuction. Optional — empty string when not deployed. */
    dutchAuction: `0x${string}`;
    /** FigaroBatchVerifier (SP1). Optional — empty string when not deployed. */
    batchVerifier: `0x${string}`;
    /** ProcessOffsetReceipt — Path A carbon-offset receipts anchor. Optional — empty string when not deployed. */
    processOffsetReceipt: `0x${string}`;
    /** SellerRegistry. Read by the core indexer (seller events); the mechanisms
     *  layer re-exports it. Optional — empty string when not deployed. */
    sellerRegistry: `0x${string}`;
    /** RpgfMinter. Read by the core indexer (Claimed events); the mechanisms
     *  layer re-exports it. Optional — empty string when not deployed. */
    rpgfMinter: `0x${string}`;
    /** MockOffsetAggregator — devnet stand-in for Klima/Toucan aggregators. Empty on testnet/mainnet. */
    mockOffsetAggregator: `0x${string}`;
}

export const CONTRACTS: ChainConfig = {
    core: (process.env.NEXT_PUBLIC_FIGARO_CORE || "") as `0x${string}`,
    mockToken: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS || "") as `0x${string}`,
    permitToken: (process.env.NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS || "") as `0x${string}`,
    attestationCoordinator: (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR || "") as `0x${string}`,
    clauseRegistry: (process.env.NEXT_PUBLIC_CLAUSE_REGISTRY || "") as `0x${string}`,
    dutchAuction: (process.env.NEXT_PUBLIC_DUTCH_AUCTION || "") as `0x${string}`,
    batchVerifier: (process.env.NEXT_PUBLIC_BATCH_VERIFIER || "") as `0x${string}`,
    processOffsetReceipt: (process.env.NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT || "") as `0x${string}`,
    sellerRegistry: (process.env.NEXT_PUBLIC_SELLER_REGISTRY || "") as `0x${string}`,
    rpgfMinter: (process.env.NEXT_PUBLIC_RPGF_MINTER || "") as `0x${string}`,
    mockOffsetAggregator: (process.env.NEXT_PUBLIC_MOCK_OFFSET_AGGREGATOR || "") as `0x${string}`,
};

// Runtime validation helpers
export function getMissingContractEnv(): string[] {
    const missing: string[] = [];
    if (!process.env.NEXT_PUBLIC_FIGARO_CORE) missing.push("NEXT_PUBLIC_FIGARO_CORE");
    if (!process.env.NEXT_PUBLIC_TOKEN_ADDRESS) missing.push("NEXT_PUBLIC_TOKEN_ADDRESS");
    if (!process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR) missing.push("NEXT_PUBLIC_ATTESTATION_COORDINATOR");
    if (!process.env.NEXT_PUBLIC_CLAUSE_REGISTRY) missing.push("NEXT_PUBLIC_CLAUSE_REGISTRY");
    if (!process.env.NEXT_PUBLIC_DUTCH_AUCTION) missing.push("NEXT_PUBLIC_DUTCH_AUCTION");
    if (!process.env.NEXT_PUBLIC_SELLER_REGISTRY) missing.push("NEXT_PUBLIC_SELLER_REGISTRY");
    if (!process.env.NEXT_PUBLIC_FIG_TOKEN_ADDRESS) missing.push("NEXT_PUBLIC_FIG_TOKEN_ADDRESS");
    return missing;
}
