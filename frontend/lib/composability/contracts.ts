/**
 * lib/composability/contracts.ts — addresses for the contracts the frontend
 * COMPOSES with: the swap-and-commit coordinator, Permit2, the swap venue and
 * its quoter, and the multisender.
 *
 * Not core. `lib/composability/` may import from `lib/core/` (e.g. event-cache
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

const record = pageRecord();
const addressOf = (value: string | undefined) => (value || "") as `0x${string}`;

const COMPOSITION_CONTRACTS = {
    witnessSwapAndCommitCoordinator: addressOf(record?.witnessSwapAndCommitCoordinator),
    permit2: addressOf(record?.permit2),
    swapRouter: addressOf(record?.swapRouter),
    swapQuoter: addressOf(record?.swapQuoter),
    multisender: addressOf(record?.multisender),
};

function resolveAddress(addr: `0x${string}`): `0x${string}` | null {
    return isValidAddress(addr) ? addr : null;
}

/** The swap-and-commit executor (WitnessSwapAndCommitCoordinator). Returns
 *  null when unset or malformed: null = the swap-funded checkout path is
 *  unavailable, never a bad address handed to a call. */
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

/** The public multisender the payout-routing surface composes with —
 *  provider-agnostic (mainnet: the canonical Disperse deployment;
 *  devnet: MockDisperse, which mirrors its verified interface). Fifth-noun
 *  composition over a wallet's OWN resolved receipts, never a Figaro-owned
 *  silo. Resolved-empty: null = the routing surface simply doesn't render. */
export function getMultisender(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.multisender);
}
