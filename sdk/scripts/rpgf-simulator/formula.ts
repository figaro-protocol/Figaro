import type {
  Archetype,
  AuthorAllocation,
  CountVariant,
  DiversityVariant,
  SchemaSnapshot,
  TrancheIndex,
  TrancheRanking,
} from "./types.js";
import { TRANCHE_BUDGETS_FIG } from "./types.js";

// ─── Tier-1 graph weighting ──────────────────────────────────────────
// Deploy-frozen weights expressing the protocol's prior about which
// public graphs are load-bearing for the substrate. Three dimensions:
//   1. Category — schemas in {fulfilment, geo} carry the tier-1
//      category boost. topology participates via the chain-depth signal,
//      not as a category (it has no runtime attestations of its own).
//   2. Topology — every schema's attestations are embedded in orders
//      with a chain position. Schemas attested in multi-party (deeper)
//      orders contribute more to the topology graph; the topology
//      weight scales with mean chain position.
//   3. Value/bond — schemas whose enclosing orders carry high bonded
//      value contribute more to the value/bond graph; weight scales
//      with log10 of mean bonded value per process.
//
// Composition is ADDITIVE: w = 1 + (wCat-1) + (wTopo-1) + (wVal-1).
// Each tier-1 dimension adds independently; no dimension can produce
// a multiplier alone, but a schema strong on all three reaches ~7x.

const TIER1_CATEGORY_SCHEMAS: ReadonlySet<string> = new Set([
  "figaro-fulfilment-v2",
  "figaro-geo-v2",
]);

const CATEGORY_WEIGHT_TIER1 = 3.0;
const CATEGORY_WEIGHT_DEFAULT = 1.0;

const TOPOLOGY_WEIGHT_MIN = 1.0;
const TOPOLOGY_WEIGHT_MAX = 3.0;

const VALUE_REFERENCE_TOKENS = 100;
const VALUE_WEIGHT_MIN = 1.0;
const VALUE_WEIGHT_MAX = 3.0;

export interface WeightBreakdown {
  wCategory: number;
  wTopology: number;
  wValue: number;
  total: number;
}

export function tier1Weight(s: SchemaSnapshot): WeightBreakdown {
  const wCategory = TIER1_CATEGORY_SCHEMAS.has(s.schemaId)
    ? CATEGORY_WEIGHT_TIER1
    : CATEGORY_WEIGHT_DEFAULT;

  const wTopology = Math.min(
    TOPOLOGY_WEIGHT_MAX,
    Math.max(TOPOLOGY_WEIGHT_MIN, s.meanChainPosition),
  );

  const meanBondedTokens = s.distinctProcesses > 0
    ? Number(s.totalEnclosingOrderBondedValueWei / BigInt(s.distinctProcesses) / 10n ** 15n) / 1000
    : 0;
  const wValue = meanBondedTokens > 0
    ? Math.min(
        VALUE_WEIGHT_MAX,
        Math.max(VALUE_WEIGHT_MIN, 1 + Math.log10(meanBondedTokens / VALUE_REFERENCE_TOKENS)),
      )
    : VALUE_WEIGHT_MIN;

  const total = 1 + (wCategory - 1) + (wTopology - 1) + (wValue - 1);
  return { wCategory, wTopology, wValue, total };
}

function countValue(s: SchemaSnapshot, variant: CountVariant): number {
  switch (variant) {
    case "raw":
      return s.resolvedAttestationCount;
    case "processCount":
      return s.distinctProcesses;
    case "bondedValue":
      return Number(s.totalEnclosingOrderBondedValueWei / 10n ** 15n) / 1000;
    case "paymentValue":
      return Number(s.totalEnclosingOrderPaymentWei / 10n ** 15n) / 1000;
    case "chainPosition":
      return s.totalChainPositionWeight;
  }
}

function diversityValue(s: SchemaSnapshot, variant: DiversityVariant): number {
  switch (variant) {
    case "pairs":
      return s.distinctBuyerSellerPairs;
    case "buyers":
      return s.distinctBuyers;
    case "sellers":
      return s.distinctSellers;
  }
}

export function score(
  s: SchemaSnapshot,
  alpha: number,
  countVariant: CountVariant,
  diversityVariant: DiversityVariant,
): number {
  const c = countValue(s, countVariant);
  const d = diversityValue(s, diversityVariant);
  if (c <= 0 || d <= 0) return 0;
  const w = tier1Weight(s).total;
  return w * Math.pow(c, alpha) * Math.pow(d, 1 - alpha);
}

export function rankTranche(
  archetypes: readonly Archetype[],
  trancheIndex: TrancheIndex,
  alpha: number,
  countVariant: CountVariant,
  diversityVariant: DiversityVariant,
): TrancheRanking {
  const budgetFig = TRANCHE_BUDGETS_FIG[trancheIndex];

  const scored = archetypes.map((a) => ({
    archetype: a,
    snapshot: a.snapshotsAtTranches[trancheIndex],
    score: score(a.snapshotsAtTranches[trancheIndex], alpha, countVariant, diversityVariant),
  }));

  const totalScore = scored.reduce((acc, x) => acc + x.score, 0);

  const allocations: AuthorAllocation[] = scored.map(({ archetype, snapshot, score: s }) => {
    const share = totalScore > 0 ? s / totalScore : 0;
    const shareScaled = BigInt(Math.round(share * 1_000_000));
    const allocatedFig = (budgetFig * shareScaled) / 1_000_000n;
    return {
      schemaName: archetype.name,
      schemaId: snapshot.schemaId,
      category: snapshot.category,
      score: s,
      share,
      allocatedFig,
    };
  });

  allocations.sort((a, b) => b.score - a.score);

  return {
    trancheIndex,
    alpha,
    countVariant,
    diversityVariant,
    budgetFig,
    allocations,
  };
}

// Iterative water-filling: any schema whose share exceeds capShare is
// truncated to capShare; the excess is redistributed pro-rata across
// under-cap schemas. Iterates to fixpoint.
export function applyCap(ranking: TrancheRanking, capShare: number): TrancheRanking {
  if (capShare <= 0 || capShare >= 1) return ranking;
  if (ranking.allocations.length === 0) return ranking;

  let shares = ranking.allocations.map((a) => a.share);

  for (let iter = 0; iter < 50; iter++) {
    let excess = 0;
    let underMass = 0;
    for (const sh of shares) {
      if (sh > capShare) excess += sh - capShare;
      else underMass += sh;
    }
    if (excess < 1e-12) break;
    if (underMass < 1e-12) break;
    shares = shares.map((sh) => (sh > capShare ? capShare : sh + excess * (sh / underMass)));
  }

  const newAllocations: AuthorAllocation[] = ranking.allocations.map((a, i) => {
    const share = shares[i] ?? 0;
    const shareScaled = BigInt(Math.round(share * 1_000_000));
    const allocatedFig = (ranking.budgetFig * shareScaled) / 1_000_000n;
    return { ...a, share, allocatedFig };
  });

  return { ...ranking, allocations: newAllocations };
}
