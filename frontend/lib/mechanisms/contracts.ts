/**
 * lib/mechanisms/contracts.ts
 *
 * Mechanism-layer contract configuration for permissionless coordination primitives.
 * These are reusable modules usable by any assembly, not scoped to a single dapp.
 *
 * Import rule: core/ code must NEVER import from mechanisms/.
 * mechanisms/ code may freely import from core/.
 */
export {
    SELLER_REGISTRY_ABI,
} from "@figaro/core";
import { CONTRACTS } from "@/lib/core/contracts";
import { isValidAddress } from "@/lib/shared/evm";

// ── GHG Disclosure — aligned to real reporting standards ──────────────────────
//
// Stage encoding in AttestationCoordinator:
//   0 = Commitment   — Declaration of intent to disclose (ISO 14064-1 §5.1)
//   1 = Inventory     — Quantified GHG statement (ISO 14064-1 §5.2–5.4)
//   2 = Restatement   — Correction to prior quantified statement (GHG Protocol Ch. 5)
//   3 = Verification  — Third-party verification/validation (ISO 14064-3)
// ──────────────────────────────────────────────────────────────────────────────

export const DISCLOSURE_KIND = {
    commitment: 0,
    inventory: 1,
    restatement: 2,
    verification: 3,
} as const;

// ── Addresses ────────────────────────────────────────────────────────────────

export const MECHANISM_CONTRACTS = {
    // Re-sourced from core's CONTRACTS where the core indexer also reads the
    // address — ONE env read per address (core/ never imports mechanisms/).
    dutchAuction: CONTRACTS.dutchAuction,
    ghgReporting: (
        process.env.NEXT_PUBLIC_GHG_REPORTING_MODULE ||
        ""
    ) as `0x${string}`,
    sellerRegistry: CONTRACTS.sellerRegistry,
};

function resolveAddress(addr: `0x${string}`): `0x${string}` | null {
    return isValidAddress(addr) ? addr : null;
}

export function getDutchAuction(): `0x${string}` | null {
    return resolveAddress(MECHANISM_CONTRACTS.dutchAuction);
}

export function getSellerRegistry(): `0x${string}` | null {
    return resolveAddress(MECHANISM_CONTRACTS.sellerRegistry);
}

// ABIs are now imported from @figaro/core (see top of file)
