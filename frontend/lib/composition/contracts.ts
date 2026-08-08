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
import { getUsageCounter as getKernelUsageCounter } from "@/lib/kernel/contracts";

const COMPOSITION_CONTRACTS = {
    attestationCoordinator: (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR || "") as `0x${string}`,
    witnessSwapAndCommitCoordinator: (process.env.NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR || "") as `0x${string}`,
    permit2: (process.env.NEXT_PUBLIC_PERMIT2 || "") as `0x${string}`,
    swapRouter: (process.env.NEXT_PUBLIC_SWAP_ROUTER || "") as `0x${string}`,
    rpgfMinter: (process.env.NEXT_PUBLIC_RPGF_MINTER || "") as `0x${string}`,
    batchVerifier: (process.env.NEXT_PUBLIC_BATCH_VERIFIER || "") as `0x${string}`,
    multisender: (process.env.NEXT_PUBLIC_MULTISENDER || "") as `0x${string}`,
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

/** The UsageCounter — verified clause and assembly usage, counted on chain as it
 *  happens. The minter pays from its periods; this resolver is what the
 *  rewards surface reads accrual (c, d, score) and period-closure from.
 *  Resolved-empty: null = accrual is unreadable on this network. Delegates to
 *  the kernel's validated accessor (the canonical env parse for
 *  `NEXT_PUBLIC_USAGE_COUNTER`) rather than re-reading the env itself — one
 *  source, one behavior for a malformed address. */
export function getUsageCounter(): `0x${string}` | null {
    return getKernelUsageCounter();
}

/** The FigaroBatchVerifier — the SECOND settlement universe. It shares no state
 *  with FigaroCore and never calls it, so it is not a kernel contract and does
 *  not belong in `lib/kernel/contracts.ts`: a batch-settled process never
 *  acquires kernel status (docs/SCALING_STRATEGY.md § "Two settlement paths, two
 *  DISJOINT state universes"). Readers that fold both universes resolve the
 *  address here. Resolved-empty: null = the batch path is unreadable on this
 *  network, which is absence, never "not settled". */
export function getBatchVerifier(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.batchVerifier);
}

/** The public multisender the payout-routing surface composes with —
 *  provider-agnostic (mainnet: the canonical ownerless Disperse deployment;
 *  devnet: MockDisperse, which mirrors its verified interface). Fifth-noun
 *  composition over a wallet's OWN settled receipts, never a Figaro-owned
 *  silo. Resolved-empty: null = the routing surface simply doesn't render. */
export function getMultisender(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.multisender);
}
