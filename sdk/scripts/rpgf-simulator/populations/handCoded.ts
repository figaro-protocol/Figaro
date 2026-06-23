import type {
  Archetype,
  ClauseCategory,
  ClausePopulationSource,
  ClauseSnapshot,
} from "../types.js";

// Mirrors script/Deploy.s.sol family assignments (primary category of
// each clause's Layer-A spec). Hypothetical clauses pick a default that
// keeps them out of the Tier-1 boost.
const FAMILY_BY_CLAUSE: Readonly<Record<string, string>> = {
  "figaro-commerce-v1": "commerce",
  "figaro-consent-v1": "consent",
  "figaro-geo-v2": "geo",
  "figaro-modalities-v1": "coordination",
  "figaro-ghg-protocol-v1": "emissions",
  "figaro-ghg-iso-14064-v1": "emissions",
  "figaro-ghg-pas-2050-v1": "emissions",
  "figaro-ghg-en-16258-v1": "emissions",
  "figaro-ghg-custom-v1": "emissions",
  "figaro-ghg-measurement-v1": "emissions",
  "figaro-offset-policy-v1": "emissions",
  "figaro-proximity-policy-v1": "proximity",
  "figaro-proximity-proof-v1": "proximity",
  "figaro-merchant-process-v1": "seller-process",
  "figaro-courier-process-v1": "seller-process",
  "figaro-arbitration-kleros-v1": "arbitration",
  "figaro-applicable-law-v1": "jurisdiction",
  "figaro-topology-v1": "topology",
};

function familyFor(clauseId: string): string {
  return FAMILY_BY_CLAUSE[clauseId] ?? "unknown";
}

interface SnapInputs {
  clauseId: string;
  category: ClauseCategory;
  orderCount: number;
  attsPerOrder: number;
  distinctBuyers: number;
  distinctSellers: number;
  distinctBuyerSellerPairs: number;
  distinctAttestationStages?: number;
  meanChainPosition: number;
}

function snap(inp: SnapInputs): ClauseSnapshot {
  return {
    clauseId: inp.clauseId,
    family: familyFor(inp.clauseId),
    category: inp.category,
    resolvedAttestationCount: Math.round(inp.orderCount * inp.attsPerOrder),
    distinctProcesses: Math.max(1, Math.round(inp.orderCount * 0.85)),
    distinctAttestationStages: inp.distinctAttestationStages ?? 1,
    distinctBuyers: inp.distinctBuyers,
    distinctSellers: inp.distinctSellers,
    distinctBuyerSellerPairs: inp.distinctBuyerSellerPairs,
    totalChainPositionWeight: inp.orderCount * inp.meanChainPosition,
    meanChainPosition: inp.meanChainPosition,
  };
}

function zero(clauseId: string, category: ClauseCategory): ClauseSnapshot {
  return {
    clauseId,
    family: familyFor(clauseId),
    category,
    resolvedAttestationCount: 0,
    distinctProcesses: 0,
    distinctAttestationStages: 0,
    distinctBuyers: 0,
    distinctSellers: 0,
    distinctBuyerSellerPairs: 0,
    totalChainPositionWeight: 0,
    meanChainPosition: 0,
  };
}

const ARCHETYPES: readonly Archetype[] = [
  // ─── Cluster A — committed-policy (12 of 17 real clauses) ────────────
  {
    name: "commerce-core",
    description: "High-volume retail. Cluster A. Buyer+seller attest commerce clause.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-commerce-v1", category: "committed-policy", orderCount: 30_000, attsPerOrder: 1.5, distinctBuyers: 4_000, distinctSellers: 2_000, distinctBuyerSellerPairs: 6_000, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-commerce-v1", category: "committed-policy", orderCount: 120_000, attsPerOrder: 1.5, distinctBuyers: 18_000, distinctSellers: 10_000, distinctBuyerSellerPairs: 30_000, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-commerce-v1", category: "committed-policy", orderCount: 350_000, attsPerOrder: 1.5, distinctBuyers: 50_000, distinctSellers: 30_000, distinctBuyerSellerPairs: 100_000, meanChainPosition: 1 }),
    ],
  },
  {
    name: "consent-onetime",
    description: "Broad cryptographic acceptance of off-chain docs. Cluster A.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-consent-v1", category: "committed-policy", orderCount: 5_000, attsPerOrder: 2.0, distinctBuyers: 4_000, distinctSellers: 3_000, distinctBuyerSellerPairs: 4_500, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-consent-v1", category: "committed-policy", orderCount: 25_000, attsPerOrder: 2.0, distinctBuyers: 20_000, distinctSellers: 15_000, distinctBuyerSellerPairs: 22_000, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-consent-v1", category: "committed-policy", orderCount: 80_000, attsPerOrder: 2.0, distinctBuyers: 70_000, distinctSellers: 50_000, distinctBuyerSellerPairs: 75_000, meanChainPosition: 1 }),
    ],
  },
  {
    name: "modality-choice",
    description: "Single-select modality choice. Cluster A.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-modalities-v1", category: "committed-policy", orderCount: 20_000, attsPerOrder: 1.4, distinctBuyers: 4_000, distinctSellers: 3_000, distinctBuyerSellerPairs: 12_000, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-modalities-v1", category: "committed-policy", orderCount: 100_000, attsPerOrder: 1.4, distinctBuyers: 18_000, distinctSellers: 15_000, distinctBuyerSellerPairs: 60_000, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-modalities-v1", category: "committed-policy", orderCount: 300_000, attsPerOrder: 1.4, distinctBuyers: 45_000, distinctSellers: 40_000, distinctBuyerSellerPairs: 200_000, meanChainPosition: 1 }),
    ],
  },
  {
    name: "geo-shipping",
    description: "Multi-party transport. Cluster A, chain depth 3.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-geo-v2", category: "committed-policy", orderCount: 20_000, attsPerOrder: 1.3, distinctBuyers: 3_000, distinctSellers: 5_000, distinctBuyerSellerPairs: 12_000, meanChainPosition: 3 }),
      snap({ clauseId: "figaro-geo-v2", category: "committed-policy", orderCount: 100_000, attsPerOrder: 1.3, distinctBuyers: 12_000, distinctSellers: 18_000, distinctBuyerSellerPairs: 60_000, meanChainPosition: 3 }),
      snap({ clauseId: "figaro-geo-v2", category: "committed-policy", orderCount: 280_000, attsPerOrder: 1.3, distinctBuyers: 30_000, distinctSellers: 45_000, distinctBuyerSellerPairs: 180_000, meanChainPosition: 3 }),
    ],
  },
  {
    name: "ghg-protocol-corporate",
    description: "GHG Protocol Corporate Standard. Cluster A.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-ghg-protocol-v1", category: "committed-policy", orderCount: 400, attsPerOrder: 1.0, distinctBuyers: 250, distinctSellers: 200, distinctBuyerSellerPairs: 350, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-ghg-protocol-v1", category: "committed-policy", orderCount: 2_500, attsPerOrder: 1.0, distinctBuyers: 1_500, distinctSellers: 1_200, distinctBuyerSellerPairs: 2_200, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-ghg-protocol-v1", category: "committed-policy", orderCount: 8_000, attsPerOrder: 1.0, distinctBuyers: 4_000, distinctSellers: 3_000, distinctBuyerSellerPairs: 6_500, meanChainPosition: 2 }),
    ],
  },
  {
    name: "ghg-iso-14064-corporate",
    description: "ISO 14064 sister. Cluster A.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-ghg-iso-14064-v1", category: "committed-policy", orderCount: 150, attsPerOrder: 1.0, distinctBuyers: 80, distinctSellers: 100, distinctBuyerSellerPairs: 130, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-ghg-iso-14064-v1", category: "committed-policy", orderCount: 1_200, attsPerOrder: 1.0, distinctBuyers: 700, distinctSellers: 800, distinctBuyerSellerPairs: 1_000, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-ghg-iso-14064-v1", category: "committed-policy", orderCount: 5_000, attsPerOrder: 1.0, distinctBuyers: 2_500, distinctSellers: 2_500, distinctBuyerSellerPairs: 4_000, meanChainPosition: 2 }),
    ],
  },
  {
    name: "ghg-pas2050-product",
    description: "PAS 2050 sister. Cluster A.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-ghg-pas-2050-v1", category: "committed-policy", orderCount: 80, attsPerOrder: 1.0, distinctBuyers: 50, distinctSellers: 70, distinctBuyerSellerPairs: 75, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-ghg-pas-2050-v1", category: "committed-policy", orderCount: 600, attsPerOrder: 1.0, distinctBuyers: 400, distinctSellers: 500, distinctBuyerSellerPairs: 550, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-ghg-pas-2050-v1", category: "committed-policy", orderCount: 2_500, attsPerOrder: 1.0, distinctBuyers: 1_500, distinctSellers: 1_800, distinctBuyerSellerPairs: 2_200, meanChainPosition: 2 }),
    ],
  },
  {
    name: "ghg-en-16258-transport",
    description: "EN 16258 transport-emissions sister. Cluster A.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-ghg-en-16258-v1", category: "committed-policy", orderCount: 200, attsPerOrder: 1.0, distinctBuyers: 100, distinctSellers: 150, distinctBuyerSellerPairs: 170, meanChainPosition: 3 }),
      snap({ clauseId: "figaro-ghg-en-16258-v1", category: "committed-policy", orderCount: 1_500, attsPerOrder: 1.0, distinctBuyers: 800, distinctSellers: 1_000, distinctBuyerSellerPairs: 1_300, meanChainPosition: 3 }),
      snap({ clauseId: "figaro-ghg-en-16258-v1", category: "committed-policy", orderCount: 6_000, attsPerOrder: 1.0, distinctBuyers: 3_000, distinctSellers: 3_500, distinctBuyerSellerPairs: 5_000, meanChainPosition: 3 }),
    ],
  },
  {
    name: "ghg-custom-rare",
    description: "Custom/non-standard GHG. Cluster A.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-ghg-custom-v1", category: "committed-policy", orderCount: 30, attsPerOrder: 1.0, distinctBuyers: 20, distinctSellers: 25, distinctBuyerSellerPairs: 28, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-ghg-custom-v1", category: "committed-policy", orderCount: 150, attsPerOrder: 1.0, distinctBuyers: 100, distinctSellers: 120, distinctBuyerSellerPairs: 140, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-ghg-custom-v1", category: "committed-policy", orderCount: 500, attsPerOrder: 1.0, distinctBuyers: 350, distinctSellers: 400, distinctBuyerSellerPairs: 450, meanChainPosition: 2 }),
    ],
  },
  {
    name: "jurisdiction-baseline",
    description: "Off-chain dispute jurisdiction. Cluster A.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-arbitration-kleros-v1", category: "committed-policy", orderCount: 4_000, attsPerOrder: 1.4, distinctBuyers: 1_000, distinctSellers: 800, distinctBuyerSellerPairs: 2_000, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-arbitration-kleros-v1", category: "committed-policy", orderCount: 20_000, attsPerOrder: 1.4, distinctBuyers: 5_000, distinctSellers: 4_000, distinctBuyerSellerPairs: 12_000, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-arbitration-kleros-v1", category: "committed-policy", orderCount: 70_000, attsPerOrder: 1.4, distinctBuyers: 15_000, distinctSellers: 12_000, distinctBuyerSellerPairs: 50_000, meanChainPosition: 1 }),
    ],
  },
  {
    name: "proximity-policy",
    description: "Committed proximity-verification policy. Cluster A.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-proximity-policy-v1", category: "committed-policy", orderCount: 1_500, attsPerOrder: 1.2, distinctBuyers: 200, distinctSellers: 150, distinctBuyerSellerPairs: 600, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-proximity-policy-v1", category: "committed-policy", orderCount: 12_000, attsPerOrder: 1.2, distinctBuyers: 1_500, distinctSellers: 1_000, distinctBuyerSellerPairs: 5_000, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-proximity-policy-v1", category: "committed-policy", orderCount: 40_000, attsPerOrder: 1.2, distinctBuyers: 5_000, distinctSellers: 3_000, distinctBuyerSellerPairs: 18_000, meanChainPosition: 1 }),
    ],
  },
  {
    name: "offset-policy",
    description: "Carbon-offset provider policy. Cluster A.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-offset-policy-v1", category: "committed-policy", orderCount: 800, attsPerOrder: 1.2, distinctBuyers: 200, distinctSellers: 150, distinctBuyerSellerPairs: 500, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-offset-policy-v1", category: "committed-policy", orderCount: 5_000, attsPerOrder: 1.2, distinctBuyers: 1_500, distinctSellers: 1_000, distinctBuyerSellerPairs: 3_500, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-offset-policy-v1", category: "committed-policy", orderCount: 18_000, attsPerOrder: 1.2, distinctBuyers: 5_000, distinctSellers: 3_000, distinctBuyerSellerPairs: 12_000, meanChainPosition: 1 }),
    ],
  },

  // ─── Cluster B — sovereign-log (2 of 17 real clauses) ──────────────
  {
    name: "merchant-process",
    description: "Sovereign-log for merchants. Cluster B, many events per process (6 lifecycle).",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-merchant-process-v1", category: "sovereign-log", orderCount: 15_000, attsPerOrder: 5.0, distinctBuyers: 12_000, distinctSellers: 1_000, distinctBuyerSellerPairs: 12_000, distinctAttestationStages: 6, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-merchant-process-v1", category: "sovereign-log", orderCount: 80_000, attsPerOrder: 5.0, distinctBuyers: 60_000, distinctSellers: 4_000, distinctBuyerSellerPairs: 60_000, distinctAttestationStages: 6, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-merchant-process-v1", category: "sovereign-log", orderCount: 250_000, attsPerOrder: 5.0, distinctBuyers: 150_000, distinctSellers: 12_000, distinctBuyerSellerPairs: 150_000, distinctAttestationStages: 6, meanChainPosition: 2 }),
    ],
  },
  {
    name: "courier-process",
    description: "Sovereign-log for couriers. Cluster B, more events per process (8 lifecycle).",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-courier-process-v1", category: "sovereign-log", orderCount: 25_000, attsPerOrder: 6.0, distinctBuyers: 20_000, distinctSellers: 500, distinctBuyerSellerPairs: 20_000, distinctAttestationStages: 8, meanChainPosition: 3 }),
      snap({ clauseId: "figaro-courier-process-v1", category: "sovereign-log", orderCount: 120_000, attsPerOrder: 6.0, distinctBuyers: 100_000, distinctSellers: 2_000, distinctBuyerSellerPairs: 100_000, distinctAttestationStages: 8, meanChainPosition: 3 }),
      snap({ clauseId: "figaro-courier-process-v1", category: "sovereign-log", orderCount: 400_000, attsPerOrder: 6.0, distinctBuyers: 250_000, distinctSellers: 5_000, distinctBuyerSellerPairs: 250_000, distinctAttestationStages: 8, meanChainPosition: 3 }),
    ],
  },

  // ─── Cluster C — runtime-measurement (2 of 17 real clauses) ────────
  {
    name: "ghg-measurement",
    description: "Runtime grams CO2e per delivery. Cluster C, multi-stage.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-ghg-measurement-v1", category: "runtime-measurement", orderCount: 300, attsPerOrder: 2.5, distinctBuyers: 150, distinctSellers: 200, distinctBuyerSellerPairs: 280, distinctAttestationStages: 4, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-ghg-measurement-v1", category: "runtime-measurement", orderCount: 2_000, attsPerOrder: 2.5, distinctBuyers: 1_000, distinctSellers: 1_500, distinctBuyerSellerPairs: 1_800, distinctAttestationStages: 4, meanChainPosition: 2 }),
      snap({ clauseId: "figaro-ghg-measurement-v1", category: "runtime-measurement", orderCount: 7_000, attsPerOrder: 2.5, distinctBuyers: 3_500, distinctSellers: 5_000, distinctBuyerSellerPairs: 6_000, distinctAttestationStages: 4, meanChainPosition: 2 }),
    ],
  },
  {
    name: "proximity-proof",
    description: "Per-handoff runtime proximity proof. Cluster C, multi-handoff per order.",
    snapshotsAtTranches: [
      snap({ clauseId: "figaro-proximity-proof-v1", category: "runtime-measurement", orderCount: 4_000, attsPerOrder: 1.5, distinctBuyers: 100, distinctSellers: 150, distinctBuyerSellerPairs: 200, distinctAttestationStages: 1, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-proximity-proof-v1", category: "runtime-measurement", orderCount: 30_000, attsPerOrder: 1.5, distinctBuyers: 800, distinctSellers: 1_000, distinctBuyerSellerPairs: 1_500, distinctAttestationStages: 1, meanChainPosition: 1 }),
      snap({ clauseId: "figaro-proximity-proof-v1", category: "runtime-measurement", orderCount: 100_000, attsPerOrder: 1.5, distinctBuyers: 3_000, distinctSellers: 4_000, distinctBuyerSellerPairs: 6_000, distinctAttestationStages: 1, meanChainPosition: 1 }),
    ],
  },

  // ─── topology — agreement-only, no attestations ─────────────────────
  {
    name: "topology-decorative",
    description: "DAG lineage clause. Agreement-only — no validator, no runtime attestations.",
    snapshotsAtTranches: [
      zero("figaro-topology-v1", "committed-policy"),
      zero("figaro-topology-v1", "committed-policy"),
      zero("figaro-topology-v1", "committed-policy"),
    ],
  },

  // ─── Hypothetical edge-case archetypes ─────────────────────────────
  {
    name: "M&A-escrow-niche",
    description: "Hypothetical. Rare narrow-audience escrow. Cluster A, 8 pairs — tests narrow-audience case.",
    snapshotsAtTranches: [
      snap({ clauseId: "hypothetical-ma-escrow-v1", category: "committed-policy", orderCount: 8, attsPerOrder: 1.6, distinctBuyers: 6, distinctSellers: 8, distinctBuyerSellerPairs: 8, meanChainPosition: 1 }),
      snap({ clauseId: "hypothetical-ma-escrow-v1", category: "committed-policy", orderCount: 25, attsPerOrder: 1.6, distinctBuyers: 18, distinctSellers: 22, distinctBuyerSellerPairs: 25, meanChainPosition: 1 }),
      snap({ clauseId: "hypothetical-ma-escrow-v1", category: "committed-policy", orderCount: 55, attsPerOrder: 1.6, distinctBuyers: 38, distinctSellers: 45, distinctBuyerSellerPairs: 55, meanChainPosition: 1 }),
    ],
  },
  {
    name: "wash-pump-attempt",
    description: "Hypothetical. Sybil-by-wallet: 2 buyer wallets x 2 seller wallets = 4 pairs.",
    snapshotsAtTranches: [
      snap({ clauseId: "hypothetical-wash-v1", category: "committed-policy", orderCount: 50_000, attsPerOrder: 1.5, distinctBuyers: 2, distinctSellers: 2, distinctBuyerSellerPairs: 4, meanChainPosition: 1 }),
      snap({ clauseId: "hypothetical-wash-v1", category: "committed-policy", orderCount: 100_000, attsPerOrder: 1.5, distinctBuyers: 2, distinctSellers: 2, distinctBuyerSellerPairs: 4, meanChainPosition: 1 }),
      snap({ clauseId: "hypothetical-wash-v1", category: "committed-policy", orderCount: 200_000, attsPerOrder: 1.5, distinctBuyers: 2, distinctSellers: 2, distinctBuyerSellerPairs: 4, meanChainPosition: 1 }),
    ],
  },
  {
    name: "niche-specialty-launch",
    description: "Hypothetical. Late-launch clause (registered year 4). Tests time-of-entry effect.",
    snapshotsAtTranches: [
      zero("hypothetical-specialty-v1", "committed-policy"),
      snap({ clauseId: "hypothetical-specialty-v1", category: "committed-policy", orderCount: 400, attsPerOrder: 1.4, distinctBuyers: 250, distinctSellers: 300, distinctBuyerSellerPairs: 380, meanChainPosition: 2 }),
      snap({ clauseId: "hypothetical-specialty-v1", category: "committed-policy", orderCount: 4_000, attsPerOrder: 1.4, distinctBuyers: 2_500, distinctSellers: 3_000, distinctBuyerSellerPairs: 3_500, meanChainPosition: 2 }),
    ],
  },
];

export const handCodedPopulation: ClausePopulationSource = {
  label: "hand-coded archetypes (17 real + 3 hypothetical)",
  clauses: () => ARCHETYPES,
};
