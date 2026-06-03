/**
 * Kleros ArbitrableProxy integration.
 *
 * Thin wrapper around the Kleros ArbitrableProxy contract that provides:
 *   - createDispute: raise a dispute with MetaEvidence
 *   - submitEvidence: attach evidence to an existing dispute
 *   - fetchRuling: check whether a ruling has been issued
 *   - getArbitrationCost: estimate the cost of creating a dispute
 *
 * This does NOT enforce rulings on-chain. Figaro resolution remains
 * buyer-dominated. Kleros rulings are informational — they provide
 * a credible third-party determination that carries weight in
 * subsequent legal proceedings if needed.
 */

import { parseAbi, type PublicClient, type WalletClient, type Address } from "viem";

// ---------------------------------------------------------------------------
// ABI (subset of Kleros ArbitrableProxy + KlerosLiquid)
// ---------------------------------------------------------------------------

const ARBITRABLE_PROXY_ABI = parseAbi([
    "function createDispute(bytes calldata _arbitratorExtraData, string calldata _metaevidenceURI, uint256 _numberOfRulingOptions) external payable returns (uint256 disputeID)",
    "function submitEvidence(uint256 _localDisputeID, string calldata _evidenceURI) external",
    "function disputes(uint256 _localID) view returns (bytes extraData, bool isRuled, uint256 ruling, uint256 disputeIDOnArbitratorSide)",
    "function arbitrator() view returns (address)",
    "function externalIDtoLocalID(uint256 _externalID) view returns (uint256 localID)",
]);

const ARBITRATOR_ABI = parseAbi([
    "function arbitrationCost(bytes calldata _extraData) view returns (uint256 cost)",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DisputeStatus {
    isRuled: boolean;
    /** 0 = no ruling / "refuse to rule", 1 = first option, 2 = second option, etc. */
    ruling: number;
    disputeIDOnArbitratorSide: bigint;
}

export interface KlerosConfig {
    /** Address of the ArbitrableProxy on the Kleros chain (Ethereum mainnet or Gnosis). */
    arbitrableProxy: Address;
    /** Extra data bytes for the arbitrator (selects court + min jurors). */
    arbitratorExtraData: `0x${string}`;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Get the current arbitration cost (in native currency) for creating
 * a dispute through the proxy.
 */
export async function getArbitrationCost(
    client: PublicClient,
    config: KlerosConfig,
): Promise<bigint> {
    const arbitratorAddress = await client.readContract({
        address: config.arbitrableProxy,
        abi: ARBITRABLE_PROXY_ABI,
        functionName: "arbitrator",
    });

    return client.readContract({
        address: arbitratorAddress as Address,
        abi: ARBITRATOR_ABI,
        functionName: "arbitrationCost",
        args: [config.arbitratorExtraData],
    });
}

/**
 * Fetch the current ruling status for a local dispute ID.
 */
export async function fetchRuling(
    client: PublicClient,
    config: KlerosConfig,
    localDisputeID: bigint,
): Promise<DisputeStatus> {
    const [, isRuled, ruling, disputeIDOnArbitratorSide] = await client.readContract({
        address: config.arbitrableProxy,
        abi: ARBITRABLE_PROXY_ABI,
        functionName: "disputes",
        args: [localDisputeID],
    });

    return {
        isRuled,
        ruling: Number(ruling),
        disputeIDOnArbitratorSide,
    };
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Create a dispute on the Kleros ArbitrableProxy.
 *
 * @param metaEvidenceURI  IPFS URI to the MetaEvidence JSON
 *                         (e.g. "/ipfs/QmXyz.../metaevidence.json")
 * @param rulingOptions    Number of possible rulings (2 for Figaro:
 *                         "fulfilled" / "not fulfilled")
 * @returns localDisputeID on the ArbitrableProxy
 */
export async function createDispute(
    walletClient: WalletClient,
    publicClient: PublicClient,
    config: KlerosConfig,
    metaEvidenceURI: string,
    rulingOptions: number = 2,
): Promise<bigint> {
    const cost = await getArbitrationCost(publicClient, config);
    const account = walletClient.account;
    if (!account) throw new Error("Wallet not connected");

    // Simulate first to extract the return value (localDisputeID),
    // then submit the actual transaction using the prepared request.
    const { result: localDisputeID, request } = await publicClient.simulateContract({
        address: config.arbitrableProxy,
        abi: ARBITRABLE_PROXY_ABI,
        functionName: "createDispute",
        args: [config.arbitratorExtraData, metaEvidenceURI, BigInt(rulingOptions)],
        value: cost,
        account,
    });

    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
        throw new Error(`Dispute creation transaction reverted on-chain (tx ${hash}).`);
    }

    return localDisputeID;
}

/**
 * Submit evidence to an existing dispute.
 *
 * @param localDisputeID  The dispute ID on the ArbitrableProxy
 * @param evidenceURI     IPFS URI to the Evidence JSON
 */
export async function submitEvidence(
    walletClient: WalletClient,
    config: KlerosConfig,
    localDisputeID: bigint,
    evidenceURI: string,
): Promise<`0x${string}`> {
    const account = walletClient.account;
    if (!account) throw new Error("Wallet not connected");

    return walletClient.writeContract({
        address: config.arbitrableProxy,
        abi: ARBITRABLE_PROXY_ABI,
        functionName: "submitEvidence",
        args: [localDisputeID, evidenceURI],
        account,
        chain: walletClient.chain,
    });
}
