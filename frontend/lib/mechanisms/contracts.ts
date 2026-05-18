/**
 * lib/mechanisms/contracts.ts
 *
 * Mechanism-layer contract configuration for permissionless coordination primitives.
 * These are reusable modules usable by any assembly, not scoped to a single dapp.
 *
 * Import rule: core/ code must NEVER import from mechanisms/.
 * mechanisms/ code may freely import from core/.
 */
import { keccak256, stringToHex } from "viem";
import {
    GHG_DISCLOSURE_SCHEMA_KEYS,
    type GHGDisclosureSchemaKey,
} from "@/lib/core/agreementManifest";
export {
    OPERATOR_REGISTRY_ABI,
    FIG_TOKEN_ABI,
    STAGED_MERKLE_AIRDROP_ABI,
} from "@figaro/core";

// ── GHG Disclosure — aligned to real reporting standards ──────────────────────
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

/** Normative-standard reference for each disclosure schema. 1:1 with
 *  `GHG_DISCLOSURE_SCHEMA_KEYS` (canonical in `lib/core/agreementManifest`);
 *  each `id` IS the schemaId. */
export const GHG_NORM_REFERENCES = [
    { id: "figaro-ghg-protocol-v1", label: "GHG Protocol Corporate Standard", scope: "Scope 1/2/3 corporate accounting" },
    { id: "figaro-ghg-iso-14064-v1", label: "ISO 14064", scope: "Quantification, reporting & verification" },
    { id: "figaro-ghg-pas-2050-v1", label: "PAS 2050", scope: "Product carbon footprint" },
    { id: "figaro-ghg-en-16258-v1", label: "EN 16258", scope: "Transport energy & GHG" },
    { id: "figaro-ghg-custom-v1", label: "Custom methodology", scope: "Self-declared accounting basis" },
] as const;

/** Default GHG disclosure schema used by single-standard UI flows. */
export const GHG_SCHEMA_KEY: GHGDisclosureSchemaKey = "figaro-ghg-iso-14064-v1";
export const GHG_SCHEMA_ID = keccak256(stringToHex(GHG_SCHEMA_KEY));

export const DISCLOSURE_KIND = {
    commitment: 0,
    inventory: 1,
    restatement: 2,
    verification: 3,
} as const;

// ── GHG Measurement — runtime grams CO2e, Category-1 ─────────────────────────
//
// Grams measurements live in `figaro-ghg-measurement-v1` because the
// disclosure schema (above) is Category-2 and enforces content == sectionData
// byte-equality, which is incompatible with freely-varying grams values.
//
// Stage envelope:
//   0 = Estimate       — pre-fulfillment forecast
//   1 = Measured       — post-fulfillment actual
//   2 = Restatement    — correction to prior measurement
//   3 = Verification   — third-party validated measurement


export const MEASUREMENT_KIND = {
    estimate: 0,
    measured: 1,
    restatement: 2,
    verification: 3,
} as const;

export const MEASUREMENT_KIND_LABELS = [
    "Estimate",
    "Measured",
    "Restatement",
    "Verification",
] as const;

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
