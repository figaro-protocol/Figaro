// The Core's contracts: FigaroCore, FigaroBatchVerifier and AttestationCoordinator
// (CommitmentTypes is a library and has no address), plus the agnostic ERC-20.
// Addresses are the page's deployment's: the deployment record the URL names among the
// deployments the build lists, else the build's own (`lib/shared/chains.ts`,
// `pageRecord`). A page whose URL names an unlisted deployment has none.
// ABIs are re-exported from the canonical SDK (@figaro-protocol/sdk).
// Each other layer keeps its contracts' addresses in its own folder:
// `lib/registries/contracts.ts`, `lib/rewards/contracts.ts`,
// `lib/composability/contracts.ts`. This file imports none of them.

import { isValidAddress } from "@/lib/shared/evm";
import { pageDeployment, pageRecord } from "@/lib/shared/chains";
import { missingBuildRecordVariables } from "@/lib/shared/deploymentRecords";

export {
    CORE_ABI,
    // Generic ERC-20 standard — the core contracts are ERC-20-agnostic, so the
    // token interface lives here too. Not a Figaro contract.
    ERC20_ABI,
} from "@figaro-protocol/sdk";

export interface CoreContracts {
    /** FigaroCore. */
    core: `0x${string}`;
    /** FigaroBatchVerifier — the Core's batch path. It emits FigaroCore's own
     *  order and process events for every batched order, so the order readers
     *  read it beside `core`. */
    batchVerifier: `0x${string}`;
}

const record = pageRecord();
const addressOf = (value: string | undefined) => (value || "") as `0x${string}`;

export const CONTRACTS: CoreContracts = {
    core: addressOf(record?.figaroCore),
    batchVerifier: addressOf(record?.batchVerifier),
};

/** The FigaroBatchVerifier address if it's a well-formed address, else null:
 *  null means the batch path is unreadable on this network (absence, never
 *  "not resolved"). The canonical parse of the deployment record's `batchVerifier`. */
export function getBatchVerifier(): `0x${string}` | null {
    const a = CONTRACTS.batchVerifier;
    return isValidAddress(a) ? a : null;
}

/** The single canonical resolver for the AttestationCoordinator address. Every
 *  reader (the attestation action hook, the attestation indexer, the audit timeline)
 *  resolves it here, so its validity is defined in one place. Returns null when
 *  unset or malformed — resolved-empty means the coordinator is unavailable,
 *  never a bad address handed to a contract call. */
export function getAttestationCoordinator(): `0x${string}` | null {
    const a = addressOf(record?.attestationCoordinator);
    return isValidAddress(a) ? a : null;
}

/** The variables the build's own deployment record lacks for the Core and the four
 *  registries. Empty on a page that shows a published deployment record, or names an
 *  unlisted deployment: neither reads the build's variables. */
export function getMissingContractEnv(): string[] {
    return pageDeployment.kind === "build" ? missingBuildRecordVariables() : [];
}
