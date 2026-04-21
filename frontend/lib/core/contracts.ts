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
    SCHEMA_REGISTRY_ABI,
    BATCH_VERIFIER_ABI,
    ERC20_ABI,
} from "@figaro/core";

// agreementHash (bytes32) is the opaque off-chain agreement reference.
// For the prototype, we use a deterministic non-zero default.
export const DEFAULT_AGREEMENT_HASH =
    "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

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
    /** SchemaRegistry. Optional — empty string when not deployed. */
    schemaRegistry: `0x${string}`;
    /** DutchAuction. Optional — empty string when not deployed. */
    dutchAuction: `0x${string}`;
    /** FigaroBatchVerifier (SP1). Optional — empty string when not deployed. */
    batchVerifier: `0x${string}`;
}

export const CONTRACTS: ChainConfig = {
    core: (process.env.NEXT_PUBLIC_FIGARO_CORE || "") as `0x${string}`,
    mockToken: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS || "") as `0x${string}`,
    permitToken: (process.env.NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS || "") as `0x${string}`,
    attestationCoordinator: (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR || "") as `0x${string}`,
    schemaRegistry: (process.env.NEXT_PUBLIC_SCHEMA_REGISTRY || "") as `0x${string}`,
    dutchAuction: (process.env.NEXT_PUBLIC_DUTCH_AUCTION || "") as `0x${string}`,
    batchVerifier: (process.env.NEXT_PUBLIC_BATCH_VERIFIER || "") as `0x${string}`,
};

// Runtime validation helpers
export function getMissingContractEnv(): string[] {
    const missing: string[] = [];
    if (!process.env.NEXT_PUBLIC_FIGARO_CORE) missing.push("NEXT_PUBLIC_FIGARO_CORE");
    if (!process.env.NEXT_PUBLIC_TOKEN_ADDRESS) missing.push("NEXT_PUBLIC_TOKEN_ADDRESS");
    if (!process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR) missing.push("NEXT_PUBLIC_ATTESTATION_COORDINATOR");
    if (!process.env.NEXT_PUBLIC_SCHEMA_REGISTRY) missing.push("NEXT_PUBLIC_SCHEMA_REGISTRY");
    if (!process.env.NEXT_PUBLIC_DUTCH_AUCTION) missing.push("NEXT_PUBLIC_DUTCH_AUCTION");
    if (!process.env.NEXT_PUBLIC_OPERATOR_REGISTRY) missing.push("NEXT_PUBLIC_OPERATOR_REGISTRY");
    if (!process.env.NEXT_PUBLIC_FIG_TOKEN_ADDRESS) missing.push("NEXT_PUBLIC_FIG_TOKEN_ADDRESS");
    if (!process.env.NEXT_PUBLIC_FIG_EMISSION_ADDRESS) missing.push("NEXT_PUBLIC_FIG_EMISSION_ADDRESS");
    return missing;
}

export const CONTRACTS_VALID = getMissingContractEnv().length === 0;
