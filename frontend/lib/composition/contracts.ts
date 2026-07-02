/**
 * lib/composition/contracts.ts — addresses + config for the contracts the
 * frontend COMPOSES with (carbon-offset receipt, attestation).
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
    processOffsetReceipt: (process.env.NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT || "") as `0x${string}`,
    // Carbon-offset aggregator. On a local chain this env points at a generic
    // mock router standing in for the real service (KLIMA, …) that isn't deployed
    // on Anvil — a real on-chain composition target, not a truth-faking mock.
    offsetAggregator: (process.env.NEXT_PUBLIC_MOCK_OFFSET_AGGREGATOR || "") as `0x${string}`,
};

function resolveAddress(addr: `0x${string}`): `0x${string}` | null {
    return isValidAddress(addr) ? addr : null;
}

/** @public — composition resolver, pending consumer: the K2 clauseId→surface
 *  registry mounts the attestation surface from this. */
export function getAttestationCoordinator(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.attestationCoordinator);
}

/** @public — composition resolver, pending consumer: the restored offset
 *  (emissions-retirement) panel reads the receipt contract from this. */
export function getProcessOffsetReceipt(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.processOffsetReceipt);
}

// ── GHG Disclosure stage encoding (AttestationCoordinator `stage` arg) ────────
//   0 Commitment · 1 Inventory · 2 Restatement · 3 Verification
//   (ISO 14064-1 / GHG Protocol). A composed-contract calling convention, not core.
export const DISCLOSURE_KIND = {
    commitment: 0,
    inventory: 1,
    restatement: 2,
    verification: 3,
} as const;
