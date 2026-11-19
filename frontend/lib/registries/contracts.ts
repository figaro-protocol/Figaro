// The registries' contracts: ClauseRegistry, MembersRegistry, ProcessRegistry and
// AgreementRegistry, side by side. Addresses are the page's deployment's
// (`lib/shared/chains.ts`, `pageRecord`); ABIs are re-exported from the canonical
// SDK (@figaro-protocol/sdk).

import { isValidAddress } from "@/lib/shared/evm";
import { pageRecord } from "@/lib/shared/chains";

export {
    CLAUSE_REGISTRY_ABI,
    MEMBERS_REGISTRY_ABI,
    PROCESS_REGISTRY_ABI,
} from "@figaro-protocol/sdk";

export interface RegistryContracts {
    /** ClauseRegistry. */
    clauseRegistry: `0x${string}`;
    /** MembersRegistry. */
    membersRegistry: `0x${string}`;
    /** ProcessRegistry. */
    processRegistry: `0x${string}`;
    /** AgreementRegistry. */
    agreementRegistry: `0x${string}`;
}

const record = pageRecord();
const addressOf = (value: string | undefined) => (value || "") as `0x${string}`;

export const REGISTRY_CONTRACTS: RegistryContracts = {
    clauseRegistry: addressOf(record?.clauseRegistry),
    membersRegistry: addressOf(record?.membersRegistry),
    processRegistry: addressOf(record?.processRegistry),
    agreementRegistry: addressOf(record?.agreementRegistry),
};

/** The MembersRegistry address if it's a well-formed address, else null. */
export function getMembersRegistry(): `0x${string}` | null {
    const a = REGISTRY_CONTRACTS.membersRegistry;
    return isValidAddress(a) ? a : null;
}
