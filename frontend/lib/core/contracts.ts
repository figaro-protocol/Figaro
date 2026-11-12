// Figaro contract configuration — the core Figaro contracts only
// (the Core + Clause/Members/Assembly/Agreement registries + florin token) plus the agnostic ERC-20.
// Addresses are the page's deployment's: the deployment record the URL names among the
// deployments the build lists, else the build's own (`lib/shared/chains.ts`,
// `pageRecord`). A page whose URL names an unlisted deployment has none.
// ABIs are re-exported from the canonical SDK (@figaro-protocol/sdk).
// Any contract the frontend merely COMPOSES with lives in lib/composition/, not here.

import { isValidAddress } from "@/lib/shared/evm";
import { pageDeployment, pageRecord } from "@/lib/shared/chains";
import { missingBuildRecordVariables } from "@/lib/shared/deploymentRecords";

// The frontend imports these from here (the allowlisted core-ABI home). The
// other core ABIs (FLORIN_TOKEN_ABI) are equally canonical but currently imported
// straight from `@figaro-protocol/sdk` by their few consumers — they re-enter this
// barrel the moment a frontend surface needs them from here.
export {
    CORE_ABI,
    CLAUSE_REGISTRY_ABI,
    MEMBERS_REGISTRY_ABI,
    ASSEMBLY_REGISTRY_ABI,
    // Generic ERC-20 standard — the core contracts are ERC-20-agnostic, so the
    // token interface lives here too. Not a Figaro contract.
    ERC20_ABI,
} from "@figaro-protocol/sdk";

export interface ChainConfig {
    /** FigaroCore — FigaroCore. */
    core: `0x${string}`;
    /** ClauseRegistry. */
    clauseRegistry: `0x${string}`;
    /** MembersRegistry. */
    membersRegistry: `0x${string}`;
    /** AssemblyRegistry. */
    assemblyRegistry: `0x${string}`;
    /** AgreementRegistry. */
    agreementRegistry: `0x${string}`;
    /** The florin — the protocol's own token. */
    florinToken: `0x${string}`;
    /** UsageCounter — the designer rewards' verified-usage ledger (counted at resolve, claimed per period). */
    usageCounter: `0x${string}`;
    /** FigaroBatchVerifier — the Core's batch path. It emits FigaroCore's own
     *  order and process events for every batched order, so the order readers
     *  read it beside `core`. */
    batchVerifier: `0x${string}`;
}

const record = pageRecord();
const addressOf = (value: string | undefined) => (value || "") as `0x${string}`;

export const CONTRACTS: ChainConfig = {
    core: addressOf(record?.figaroCore),
    clauseRegistry: addressOf(record?.clauseRegistry),
    membersRegistry: addressOf(record?.membersRegistry),
    assemblyRegistry: addressOf(record?.assemblyRegistry),
    agreementRegistry: addressOf(record?.agreementRegistry),
    florinToken: addressOf(record?.florinToken),
    usageCounter: addressOf(record?.usageCounter),
    batchVerifier: addressOf(record?.batchVerifier),
};

/** The MembersRegistry address if it's a well-formed address, else null. */
export function getMembersRegistry(): `0x${string}` | null {
    const a = CONTRACTS.membersRegistry;
    return isValidAddress(a) ? a : null;
}

/** The UsageCounter address if it's a well-formed address, else null. The
 *  canonical parse of the deployment record's `usageCounter` — `lib/composition/contracts.ts`'s
 *  `getUsageCounter()` delegates here (composition may import from lib/core; the
 *  reverse never happens) instead of re-reading the env itself, and
 *  `useUsageRecorder` consumes this validated path so a malformed address
 *  resolves null and fails loudly at the call site, never reaching a
 *  contract call with a garbage address. */
export function getUsageCounter(): `0x${string}` | null {
    const a = CONTRACTS.usageCounter;
    return isValidAddress(a) ? a : null;
}

/** The FigaroBatchVerifier address if it's a well-formed address, else null:
 *  null means the batch path is unreadable on this network (absence, never
 *  "not resolved"). The canonical parse of the deployment record's `batchVerifier`;
 *  `lib/composition/contracts.ts`'s `getBatchVerifier()` delegates here. */
export function getBatchVerifier(): `0x${string}` | null {
    const a = CONTRACTS.batchVerifier;
    return isValidAddress(a) ? a : null;
}

/** The variables the build's own deployment record lacks for the Core and the four
 *  registries. Empty on a page that shows a published deployment record, or names an
 *  unlisted deployment: neither reads the build's variables. */
export function getMissingContractEnv(): string[] {
    return pageDeployment.kind === "build" ? missingBuildRecordVariables() : [];
}
