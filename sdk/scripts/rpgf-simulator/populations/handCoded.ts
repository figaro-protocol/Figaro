import type { Archetype, SchemaPopulationSource, SchemaSnapshot } from "../types.js";

function snap(
  schemaId: string,
  resolvedAttestationCount: number,
  distinctAttestors: number,
  meanBondedValueWei: bigint,
  meanChainPosition: number,
): SchemaSnapshot {
  return {
    schemaId,
    resolvedAttestationCount,
    distinctAttestors,
    totalBondedValueWei: BigInt(resolvedAttestationCount) * meanBondedValueWei,
    totalChainPositionWeight: resolvedAttestationCount * meanChainPosition,
  };
}

// token units (18 decimals) → wei, with milli-token precision
const T = (n: number) => BigInt(Math.round(n * 1000)) * 10n ** 15n;

const ARCHETYPES: readonly Archetype[] = [
  {
    name: "commerce-core",
    description: "High-volume retail / restaurant attestations. Daily commerce.",
    snapshotsAtTranches: [
      snap("figaro-commerce-v1", 50_000, 5_000, T(100), 1),
      snap("figaro-commerce-v1", 200_000, 20_000, T(100), 1),
      snap("figaro-commerce-v1", 500_000, 50_000, T(100), 1),
    ],
  },
  {
    name: "coffee-purchase",
    description: "Micro-purchases. Very high vol, moderate diversity (regulars), tiny stakes.",
    snapshotsAtTranches: [
      snap("hypothetical-coffee-v1", 100_000, 2_000, T(5), 1),
      snap("hypothetical-coffee-v1", 400_000, 5_000, T(5), 1),
      snap("hypothetical-coffee-v1", 1_000_000, 10_000, T(5), 1),
    ],
  },
  {
    name: "M&A-escrow-niche",
    description: "Rare, very-high-stakes attestations. Narrow audience.",
    snapshotsAtTranches: [
      snap("hypothetical-ma-escrow-v1", 10, 8, T(10_000_000), 1),
      snap("hypothetical-ma-escrow-v1", 30, 20, T(10_000_000), 1),
      snap("hypothetical-ma-escrow-v1", 60, 40, T(10_000_000), 1),
    ],
  },
  {
    name: "GHG-disclosure-corporate",
    description: "Corporate emissions disclosure. Moderate vol, high diversity, mid stakes.",
    snapshotsAtTranches: [
      snap("figaro-ghg-protocol-v1", 500, 300, T(50_000), 2),
      snap("figaro-ghg-protocol-v1", 3_000, 2_000, T(50_000), 2),
      snap("figaro-ghg-protocol-v1", 10_000, 5_000, T(50_000), 2),
    ],
  },
  {
    name: "courier-process",
    description: "Sovereign log for courier operators. High vol, mid diversity.",
    snapshotsAtTranches: [
      snap("figaro-courier-process-v1", 30_000, 500, T(50), 3),
      snap("figaro-courier-process-v1", 150_000, 2_000, T(50), 3),
      snap("figaro-courier-process-v1", 500_000, 5_000, T(50), 3),
    ],
  },
  {
    name: "geo-shipping",
    description: "Geo manifest. Multi-party shipping, high vol, high diversity.",
    snapshotsAtTranches: [
      snap("figaro-geo-v2", 30_000, 4_000, T(200), 3),
      snap("figaro-geo-v2", 150_000, 15_000, T(200), 3),
      snap("figaro-geo-v2", 400_000, 40_000, T(200), 3),
    ],
  },
  {
    name: "consent-onetime",
    description: "Beta/ToS acceptances. Huge vol, max diversity, zero stakes.",
    snapshotsAtTranches: [
      snap("figaro-consent-v1", 5_000, 5_000, 0n, 1),
      snap("figaro-consent-v1", 30_000, 30_000, 0n, 1),
      snap("figaro-consent-v1", 100_000, 100_000, 0n, 1),
    ],
  },
  {
    name: "jurisdiction-baseline",
    description: "Applicable law / forum / language clause. Mid vol, mid diversity.",
    snapshotsAtTranches: [
      snap("figaro-jurisdiction-v1", 5_000, 1_000, T(500), 1),
      snap("figaro-jurisdiction-v1", 25_000, 5_000, T(500), 1),
      snap("figaro-jurisdiction-v1", 80_000, 15_000, T(500), 1),
    ],
  },
  {
    name: "topology-decorative",
    description: "Manifest-only DAG clause — no runtime attestations. Tests zero-score case.",
    snapshotsAtTranches: [
      snap("figaro-topology-v1", 0, 0, 0n, 0),
      snap("figaro-topology-v1", 0, 0, 0n, 0),
      snap("figaro-topology-v1", 0, 0, 0n, 0),
    ],
  },
  {
    name: "wash-pump-attempt",
    description: "Sybil — one author with two wallets pumping volume. Tests breadth-weighting.",
    snapshotsAtTranches: [
      snap("hypothetical-wash-v1", 50_000, 2, T(100), 1),
      snap("hypothetical-wash-v1", 100_000, 2, T(100), 1),
      snap("hypothetical-wash-v1", 200_000, 2, T(100), 1),
    ],
  },
  {
    name: "handoff-physical",
    description: "Physical-exchange clause. Mid vol, mid diversity.",
    snapshotsAtTranches: [
      snap("figaro-handoff-v1", 8_000, 1_500, T(100), 1),
      snap("figaro-handoff-v1", 40_000, 8_000, T(100), 1),
      snap("figaro-handoff-v1", 120_000, 25_000, T(100), 1),
    ],
  },
  {
    name: "fulfilment-method",
    description: "Fulfilment-method enum. High vol, high diversity.",
    snapshotsAtTranches: [
      snap("figaro-fulfilment-v1", 25_000, 4_000, T(100), 1),
      snap("figaro-fulfilment-v1", 120_000, 18_000, T(100), 1),
      snap("figaro-fulfilment-v1", 350_000, 45_000, T(100), 1),
    ],
  },
  {
    name: "proximity-policy",
    description: "Committed proximity band. Mid vol, niche diversity.",
    snapshotsAtTranches: [
      snap("figaro-proximity-policy-v1", 2_000, 200, T(1_000), 1),
      snap("figaro-proximity-policy-v1", 15_000, 1_500, T(1_000), 1),
      snap("figaro-proximity-policy-v1", 50_000, 5_000, T(1_000), 1),
    ],
  },
  {
    name: "proximity-proof",
    description: "Runtime proximity attestation. High vol, mid diversity.",
    snapshotsAtTranches: [
      snap("figaro-proximity-proof-v1", 4_000, 100, T(1_000), 1),
      snap("figaro-proximity-proof-v1", 30_000, 800, T(1_000), 1),
      snap("figaro-proximity-proof-v1", 100_000, 3_000, T(1_000), 1),
    ],
  },
  {
    name: "niche-specialty-launch",
    description: "Late-launch schema (registered year 4). Tests time-of-entry effect.",
    snapshotsAtTranches: [
      snap("hypothetical-specialty-v1", 0, 0, 0n, 0),
      snap("hypothetical-specialty-v1", 500, 300, T(10_000), 2),
      snap("hypothetical-specialty-v1", 5_000, 3_000, T(10_000), 2),
    ],
  },
  {
    name: "ghg-iso-14064",
    description: "ISO 14064 standard variant. Mid vol, mid diversity, high stakes.",
    snapshotsAtTranches: [
      snap("figaro-ghg-iso-14064-v1", 200, 100, T(100_000), 2),
      snap("figaro-ghg-iso-14064-v1", 1_500, 800, T(100_000), 2),
      snap("figaro-ghg-iso-14064-v1", 6_000, 3_000, T(100_000), 2),
    ],
  },
  {
    name: "merchant-process",
    description: "Sovereign log for merchants. High vol, mid diversity.",
    snapshotsAtTranches: [
      snap("figaro-merchant-process-v1", 20_000, 1_000, T(100), 2),
      snap("figaro-merchant-process-v1", 100_000, 4_000, T(100), 2),
      snap("figaro-merchant-process-v1", 350_000, 12_000, T(100), 2),
    ],
  },
];

export const handCodedPopulation: SchemaPopulationSource = {
  label: "hand-coded archetypes (17)",
  schemas: () => ARCHETYPES,
};
