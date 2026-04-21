/**
 * lib/mechanisms/contracts.ts
 *
 * Mechanism-layer contract configuration for permissionless coordination primitives.
 * These are reusable modules usable by any institution assembly, not scoped to a single dapp.
 *
 * Import rule: core/ code must NEVER import from mechanisms/.
 * mechanisms/ code may freely import from core/.
 */
import { keccak256, stringToHex } from "viem";
export {
    OPERATOR_REGISTRY_ABI,
    FIG_TOKEN_ABI,
    STAGED_MERKLE_AIRDROP_ABI,
} from "@figaro/core";

// ── GHG Disclosure — aligned to real reporting standards ──────────────────────
//
// Standards mapped:
//   ISO 14064-1:2018  — Quantification and reporting of GHG emissions and removals
//   ISO 14064-3:2019  — Specification for validation/verification of GHG statements
//   GHG Protocol Corporate Standard — Scope 1 / 2 / 3 accounting
//   GHG Protocol Scope 3 Standard  — Value-chain emissions
//
// Stage encoding in AttestationCoordinator:
//   0 = Commitment   — Declaration of intent to disclose (ISO 14064-1 §5.1)
//   1 = Inventory     — Quantified GHG statement (ISO 14064-1 §5.2–5.4)
//   2 = Restatement   — Correction to prior quantified statement (GHG Protocol Ch. 5)
//   3 = Verification  — Third-party verification/validation (ISO 14064-3)
// ──────────────────────────────────────────────────────────────────────────────

export const DISCLOSURE_KIND_LABELS = [
    "Commitment",
    "Inventory",
    "Restatement",
    "Verification",
] as const;

/** Extended descriptions mapping each disclosure kind to its normative basis. */
export const DISCLOSURE_KIND_DESCRIPTIONS: Record<number, string> = {
    0: "Declaration of intent to disclose process emissions — ISO 14064-1 §5.1",
    1: "Quantified GHG emissions statement in grams CO₂e — ISO 14064-1 §5.2–5.4",
    2: "Restatement correcting a prior inventory — GHG Protocol Corporate Standard Ch. 5",
    3: "Third-party verification or validation statement — ISO 14064-3",
};

/** Standard references applicable to this schema. */
export const GHG_NORM_REFERENCES = [
    { id: "iso-14064-1", label: "ISO 14064-1:2018", scope: "Quantification & reporting" },
    { id: "iso-14064-3", label: "ISO 14064-3:2019", scope: "Verification & validation" },
    { id: "ghg-protocol-corporate", label: "GHG Protocol Corporate Standard", scope: "Scope 1/2/3 accounting" },
    { id: "ghg-protocol-scope3", label: "GHG Protocol Scope 3 Standard", scope: "Value-chain emissions" },
] as const;

export const DUE_STAGE_LABELS = [
    "Create",
    "Accept",
    "Active",
    "Resolve",
    "PostResolve",
] as const;

export const GHG_SCHEMA_KEY = "figaro-ghg-disclosure-v1";
export const GHG_SCHEMA_ID = keccak256(stringToHex(GHG_SCHEMA_KEY));

export const DISCLOSURE_KIND = {
    commitment: 0,
    inventory: 1,
    restatement: 2,
    verification: 3,
} as const;

export const DUE_STAGE = {
    create: 0,
    accept: 1,
    active: 2,
    resolve: 3,
    postResolve: 4,
} as const;

// ── Addresses ────────────────────────────────────────────────────────────────

export const MECHANISM_CONTRACTS = {
    dutchAuction: (process.env.NEXT_PUBLIC_DUTCH_AUCTION || "") as `0x${string}`,
    ghgReporting: (
        process.env.NEXT_PUBLIC_GHG_REPORTING_MODULE ||
        ""
    ) as `0x${string}`,
    operatorRegistry: (process.env.NEXT_PUBLIC_OPERATOR_REGISTRY || "") as `0x${string}`,
    figToken: (process.env.NEXT_PUBLIC_FIG_TOKEN_ADDRESS || "") as `0x${string}`,
    stagedAirdrop: (process.env.NEXT_PUBLIC_STAGED_AIRDROP || "") as `0x${string}`,
};

function resolveAddress(addr: `0x${string}`): `0x${string}` | null {
    return addr && addr.length === 42 ? addr : null;
}

export function getDutchAuction(): `0x${string}` | null {
    return resolveAddress(MECHANISM_CONTRACTS.dutchAuction);
}

export function getGhgReportingModule(): `0x${string}` | null {
    return resolveAddress(MECHANISM_CONTRACTS.ghgReporting);
}

export function getOperatorRegistry(): `0x${string}` | null {
    return resolveAddress(MECHANISM_CONTRACTS.operatorRegistry);
}

export function getFigToken(): `0x${string}` | null {
    return resolveAddress(MECHANISM_CONTRACTS.figToken);
}

export function getStagedAirdrop(): `0x${string}` | null {
    return resolveAddress(MECHANISM_CONTRACTS.stagedAirdrop);
}

// ABIs are now imported from @figaro/core (see top of file)
