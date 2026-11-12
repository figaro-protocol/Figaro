/**
 * lib/composition/contracts.ts — addresses + config for the contracts the
 * frontend COMPOSES with (attestation).
 *
 * Not core. `lib/composition/` may import from `lib/core/` (e.g. event-cache
 * primitives); `lib/core/` must NEVER import from here.
 *
 * Addresses come from the page's deployment record (`lib/shared/chains.ts`,
 * `pageRecord`) — an address is not
 * prior knowledge the way an ABI is. STEP-2 TARGET: a composed contract's
 * address + ABI come from its registered clause/assembly spec at runtime, so
 * the terminal needs none of this bundled.
 */
import { isValidAddress } from "@/lib/shared/evm";
import { pageRecord } from "@/lib/shared/chains";
import { getUsageCounter as getKernelUsageCounter, getBatchVerifier as getKernelBatchVerifier } from "@/lib/core/contracts";

const record = pageRecord();
const addressOf = (value: string | undefined) => (value || "") as `0x${string}`;

const COMPOSITION_CONTRACTS = {
    attestationCoordinator: addressOf(record?.attestationCoordinator),
    witnessSwapAndCommitCoordinator: addressOf(record?.witnessSwapAndCommitCoordinator),
    permit2: addressOf(record?.permit2),
    swapRouter: addressOf(record?.swapRouter),
    swapQuoter: addressOf(record?.swapQuoter),
    rpgfMinter: addressOf(record?.rpgfMinter),
    multisender: addressOf(record?.multisender),
};

function resolveAddress(addr: `0x${string}`): `0x${string}` | null {
    return isValidAddress(addr) ? addr : null;
}

/** The single canonical resolver for the AttestationCoordinator address. Every
 *  reader (the attestation action hook, the indexer, the audit timeline)
 *  resolves it here, so its validity is defined in one place. Returns null when
 *  unset or malformed — resolved-empty means the coordinator is unavailable,
 *  never a bad address handed to a contract call. */
export function getAttestationCoordinator(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.attestationCoordinator);
}

/** The swap-and-commit executor (WitnessSwapAndCommitCoordinator). Same
 *  resolved-empty contract as the attestation resolver: null = the swap-funded
 *  checkout path is unavailable, never a bad address handed to a call. */
export function getWitnessSwapAndCommitCoordinator(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.witnessSwapAndCommitCoordinator);
}

/** The Permit2 deployment the coordinator pulls through — canonical on public
 *  chains, the witness-verifying mock on devnet. */
export function getPermit2(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.permit2);
}

/** The coordinator's immutable swap venue (devnet: the mock venue). */
export function getSwapRouter(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.swapRouter);
}

/** The venue's quoter (Uniswap QuoterV2) — needed only by the Uniswap v3
 *  venue; the devnet mock quotes from its own rate. Resolved-empty = unset. */
export function getSwapQuoter(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.swapQuoter);
}

/** `RpgfMinter` — the designer rewards' claim surface (the 600M). Each period's budget is minted
 *  pro rata from a CLOSED accrual period, so the only act here is `claim`.
 *  Resolved-empty: null = the rewards runtime is unavailable (the marketing
 *  prose still renders). */
export function getRpgfMinter(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.rpgfMinter);
}

/** The UsageCounter — verified clause and assembly usage, counted on chain as it
 *  happens. The minter rewards from its periods; this resolver is what the
 *  rewards surface reads accrual (c, d, score) and period-closure from.
 *  Resolved-empty: null = accrual is unreadable on this network. Delegates to
 *  FigaroCore's validated accessor (the canonical parse of the deployment record's
 *  `usageCounter`) rather than re-reading the deployment record itself — one
 *  source, one behavior for a malformed address. */
export function getUsageCounter(): `0x${string}` | null {
    return getKernelUsageCounter();
}

/** The FigaroBatchVerifier, the Core's batch path: read from the Core's
 *  configuration (`lib/core/contracts.ts`), its one source. */
export function getBatchVerifier(): `0x${string}` | null {
    return getKernelBatchVerifier();
}

/** The public multisender the payout-routing surface composes with —
 *  provider-agnostic (mainnet: the canonical Disperse deployment;
 *  devnet: MockDisperse, which mirrors its verified interface). Fifth-noun
 *  composition over a wallet's OWN resolved receipts, never a Figaro-owned
 *  silo. Resolved-empty: null = the routing surface simply doesn't render. */
export function getMultisender(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.multisender);
}
