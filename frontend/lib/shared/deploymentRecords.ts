/**
 * lib/shared/deploymentRecords.ts — the deployments this build lists.
 *
 * A deployment is one set of Figaro's contracts on one chain. Its identity is
 * the chain id and the Core's address, the pair every EIP-712 domain is bound
 * to. A build lists two kinds:
 *
 *   - the PUBLISHED deployment records, `deployments/<chainId>.json`, compiled in. The
 *     deployment record is the source (`deployments/README.md`); a network is added by
 *     adding its deployment record and its import below, never by typing an address.
 *   - the BUILD's own deployment record, read from the `NEXT_PUBLIC_*` variables the
 *     deploy scripts write. It is the site's default, and the only deployment record a
 *     devnet build has.
 *
 * This is the one module that reads a Figaro contract's address from the
 * environment (the devnet's mock tokens are read where they are suggested,
 * `lib/member/commonTokens.ts`).
 * Next.js inlines `process.env.NEXT_PUBLIC_*` only when the read is a direct
 * property access, so each one below is a literal.
 */
import type { FigaroDeploymentRecord } from "@figaro-protocol/sdk";
import sepolia from "../../../deployments/11155111.json";

/** A deployment record that names its chain. */
export type DeploymentRecord = FigaroDeploymentRecord & { chainId: number };

/** The published deployment records this build carries. */
export const PUBLISHED_RECORDS: readonly DeploymentRecord[] = [sepolia as DeploymentRecord];

type Address = `0x${string}`;
const address = (value: string | undefined): Address | undefined => (value ? (value as Address) : undefined);

/** The deployment record of the deployment this build was configured for, on `chainId`.
 *  Read at call time, so a test may set a variable. A field the environment
 *  does not set is absent; `figaroCore` is the empty string when unset, as
 *  every reader of an address already treats an unset one. */
export function buildRecord(chainId: number): DeploymentRecord {
    const block = process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK;
    return {
        chainId,
        figaroCore: (process.env.NEXT_PUBLIC_FIGARO_CORE || "") as Address,
        attestationCoordinator: address(process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR),
        clauseRegistry: address(process.env.NEXT_PUBLIC_CLAUSE_REGISTRY),
        membersRegistry: address(process.env.NEXT_PUBLIC_MEMBERS_REGISTRY),
        assemblyRegistry: address(process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY),
        agreementRegistry: address(process.env.NEXT_PUBLIC_AGREEMENT_REGISTRY),
        florinToken: address(process.env.NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS),
        usageCounter: address(process.env.NEXT_PUBLIC_USAGE_COUNTER),
        rpgfMinter: address(process.env.NEXT_PUBLIC_RPGF_MINTER),
        batchVerifier: address(process.env.NEXT_PUBLIC_BATCH_VERIFIER),
        witnessSwapAndCommitCoordinator: address(process.env.NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR),
        swapRouter: address(process.env.NEXT_PUBLIC_SWAP_ROUTER),
        swapQuoter: address(process.env.NEXT_PUBLIC_SWAP_QUOTER),
        permit2: address(process.env.NEXT_PUBLIC_PERMIT2),
        multisender: address(process.env.NEXT_PUBLIC_MULTISENDER),
        daoTreasury: address(process.env.NEXT_PUBLIC_DAO_TREASURY),
        deploymentBlock: block ? Number(block) : undefined,
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || undefined,
    };
}

/** The names of the variables a build must set for its own deployment record to name
 *  the Core and the four registries. */
export function missingBuildRecordVariables(): string[] {
    const missing: string[] = [];
    if (!process.env.NEXT_PUBLIC_FIGARO_CORE) missing.push("NEXT_PUBLIC_FIGARO_CORE");
    if (!process.env.NEXT_PUBLIC_CLAUSE_REGISTRY) missing.push("NEXT_PUBLIC_CLAUSE_REGISTRY");
    if (!process.env.NEXT_PUBLIC_MEMBERS_REGISTRY) missing.push("NEXT_PUBLIC_MEMBERS_REGISTRY");
    if (!process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY) missing.push("NEXT_PUBLIC_ASSEMBLY_REGISTRY");
    if (!process.env.NEXT_PUBLIC_AGREEMENT_REGISTRY) missing.push("NEXT_PUBLIC_AGREEMENT_REGISTRY");
    return missing;
}
