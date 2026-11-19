// The designer rewards' contracts: UsageCounter, RpgfMinter and FlorinToken.
// They read the Core and the registries; no Core contract names them, and a
// trade runs without them. Addresses are the page's deployment's
// (`lib/shared/chains.ts`, `pageRecord`).

import { isValidAddress } from "@/lib/shared/evm";
import { pageRecord } from "@/lib/shared/chains";

export interface RewardsContracts {
    /** The florin, the token designers are rewarded in. */
    florinToken: `0x${string}`;
    /** UsageCounter — the verified-usage count (counted at resolve, claimed per period). */
    usageCounter: `0x${string}`;
    /** RpgfMinter — the claim surface. */
    rpgfMinter: `0x${string}`;
}

const record = pageRecord();
const addressOf = (value: string | undefined) => (value || "") as `0x${string}`;

export const REWARDS_CONTRACTS: RewardsContracts = {
    florinToken: addressOf(record?.florinToken),
    usageCounter: addressOf(record?.usageCounter),
    rpgfMinter: addressOf(record?.rpgfMinter),
};

/** The UsageCounter address if it's a well-formed address, else null: null =
 *  accrual is unreadable on this network. `useUsageRecorder` consumes this
 *  validated path so a malformed address resolves null and fails loudly at the
 *  call site, never reaching a contract call with a garbage address. */
export function getUsageCounter(): `0x${string}` | null {
    const a = REWARDS_CONTRACTS.usageCounter;
    return isValidAddress(a) ? a : null;
}

/** `RpgfMinter` — the designer rewards' claim surface (the 600M). Each period's budget is minted
 *  pro rata from a CLOSED accrual period, so the only act here is `claim`.
 *  Resolved-empty: null = the rewards runtime is unavailable (the marketing
 *  prose still renders). */
export function getRpgfMinter(): `0x${string}` | null {
    const a = REWARDS_CONTRACTS.rpgfMinter;
    return isValidAddress(a) ? a : null;
}
