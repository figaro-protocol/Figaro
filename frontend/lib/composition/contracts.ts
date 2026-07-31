/**
 * lib/composition/contracts.ts — addresses + config for the contracts the
 * frontend COMPOSES with (attestation).
 *
 * Not core. `lib/composition/` may import from `lib/kernel/` (e.g. event-cache
 * primitives); `lib/kernel/` must NEVER import from here.
 *
 * Addresses come from env (deploy-local.sh writes them) — an address is not
 * prior knowledge the way an ABI is. STEP-2 TARGET: a composed contract's
 * address + ABI come from its registered clause/assembly spec at runtime, so
 * the terminal needs none of this bundled.
 */
import { isValidAddress } from "@/lib/shared/evm";

const COMPOSITION_CONTRACTS = {
    attestationCoordinator: (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR || "") as `0x${string}`,
    witnessSwapAndCommitCoordinator: (process.env.NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR || "") as `0x${string}`,
    permit2: (process.env.NEXT_PUBLIC_PERMIT2 || "") as `0x${string}`,
    swapRouter: (process.env.NEXT_PUBLIC_SWAP_ROUTER || "") as `0x${string}`,
    rpgfMinter: (process.env.NEXT_PUBLIC_RPGF_MINTER || "") as `0x${string}`,
    usageCounter: (process.env.NEXT_PUBLIC_USAGE_COUNTER || "") as `0x${string}`,
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

/** The RPGF minter — the 600M distribution's claim surface. Each period's budget pays
 *  pro rata from a CLOSED accrual period, so the only act here is `claim`.
 *  Resolved-empty: null = the rewards runtime is unavailable (the marketing
 *  prose still renders). */
export function getRpgfMinter(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.rpgfMinter);
}

/** The UsageCounter — verified artifact usage, counted on chain as it
 *  happens. The minter pays from its periods; this resolver is what the
 *  rewards surface reads accrual (c, d, score) and period-closure from.
 *  Resolved-empty: null = accrual is unreadable on this network. */
export function getUsageCounter(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.usageCounter);
}
