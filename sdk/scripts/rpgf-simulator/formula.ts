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

function countValue(s: SchemaSnapshot, variant: CountVariant): number {
  switch (variant) {
    case "raw":
      return s.resolvedAttestationCount;
    case "processCount":
      return s.distinctProcesses;
    case "bondedValue":
      // wei → whole-token units, preserving milli-token precision via the
      // bigint intermediate so very-high-stakes archetypes don't overflow
      // Number when summed.
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
  return Math.pow(c, alpha) * Math.pow(d, 1 - alpha);
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
// under-cap schemas. Iterates to fixpoint. Pure post-processing — does
// not change ranking order or scores.
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
