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

export const COMPOSITION_CONTRACTS = {
    attestationCoordinator: (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR || "") as `0x${string}`,
};

function resolveAddress(addr: `0x${string}`): `0x${string}` | null {
    return isValidAddress(addr) ? addr : null;
}

/** @public — composition resolver, pending consumer: the K2 clauseId→surface
 *  registry mounts the attestation surface from this. */
export function getAttestationCoordinator(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.attestationCoordinator);
}
