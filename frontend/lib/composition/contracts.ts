/**
 * lib/composition/contracts.ts — addresses + config for the contracts the
 * frontend COMPOSES with (dutch auction, carbon-offset receipt, attestation).
 *
 * Not core. `lib/composition/` may import from `lib/core/` (e.g. event-cache
 * primitives); `lib/core/` must NEVER import from here.
 *
 * Addresses come from env (deploy-local.sh writes them) — an address is not
 * prior knowledge the way an ABI is. STEP-2 TARGET: a composed contract's
 * address + ABI come from its registered clause/assembly spec at runtime, so
 * the terminal needs none of this bundled.
 */
import { isValidAddress } from "@/lib/shared/evm";

export const COMPOSITION_CONTRACTS = {
    attestationCoordinator: (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR || "") as `0x${string}`,
    dutchAuction: (process.env.NEXT_PUBLIC_DUTCH_AUCTION || "") as `0x${string}`,
    processOffsetReceipt: (process.env.NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT || "") as `0x${string}`,
};

function resolveAddress(addr: `0x${string}`): `0x${string}` | null {
    return isValidAddress(addr) ? addr : null;
}

export function getAttestationCoordinator(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.attestationCoordinator);
}

export function getDutchAuction(): `0x${string}` | null {
    return resolveAddress(COMPOSITION_CONTRACTS.dutchAuction);
}

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
