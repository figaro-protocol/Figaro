import type {
  Archetype,
  ClauseCategory,
  ClausePopulationSource,
  ClauseSnapshot,
} from "../types.js";

export interface RandomFillerOptions {
  count: number;
  seed: number;
  // Per-category weighting (must sum to 1.0). Default mirrors the real
  // clause mix: ~70% committed-policy, ~12% sovereign-log,
  // ~12% runtime-measurement, ~6% zero (agreement-only / never-launched).
  categoryWeights: {
    "committed-policy": number;
    "sovereign-log": number;
    "runtime-measurement": number;
    "zero": number;
  };
  orderCountRange: [number, number];
  diversityRatioRange: [number, number];
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function logUniform(rng: () => number, min: number, max: number): number {
  const lnMin = Math.log(Math.max(min, 1));
  const lnMax = Math.log(Math.max(max, 1));
  return Math.exp(lnMin + rng() * (lnMax - lnMin));
}

function uniform(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function pickCategory(rng: () => number, w: RandomFillerOptions["categoryWeights"]): ClauseCategory | "zero" {
  const r = rng();
  let acc = w["committed-policy"];
  if (r < acc) return "committed-policy";
  acc += w["sovereign-log"];
  if (r < acc) return "sovereign-log";
  acc += w["runtime-measurement"];
  if (r < acc) return "runtime-measurement";
  return "zero";
}

function zeroSnap(clauseId: string): ClauseSnapshot {
  return {
    clauseId,
    family: "unknown",
    category: "committed-policy",
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

function generate(options: RandomFillerOptions): Archetype[] {
  const rng = mulberry32(options.seed);
  const archetypes: Archetype[] = [];
  for (let i = 0; i < options.count; i++) {
    const cat = pickCategory(rng, options.categoryWeights);
    const clauseId = `random-${i.toString().padStart(3, "0")}`;
    if (cat === "zero") {
      archetypes.push({
        name: clauseId,
        description: `random — zero-attestation archetype (agreement-only or never-launched)`,
        snapshotsAtTranches: [zeroSnap(clauseId), zeroSnap(clauseId), zeroSnap(clauseId)],
      });
      continue;
    }

    const baseOrderCount = Math.max(1, Math.round(logUniform(rng, options.orderCountRange[0], options.orderCountRange[1])));
    const diversityRatio = uniform(rng, options.diversityRatioRange[0], options.diversityRatioRange[1]);
    const meanChainPos = 1 + Math.floor(rng() * 3); // {1, 2, 3}

    const attsPerOrder = cat === "sovereign-log"
      ? 4 + Math.floor(rng() * 5) // 4-8
      : cat === "runtime-measurement"
        ? 1.5 + rng() * 2 // 1.5-3.5
        : 1 + rng() * 0.6; // 1-1.6

    const distinctStages = cat === "sovereign-log"
      ? Math.min(8, Math.max(1, Math.floor(rng() * 8) + 1))
      : cat === "runtime-measurement"
        ? Math.min(4, Math.max(1, Math.floor(rng() * 4) + 1))
        : 1;

    const makeSnap = (countMul: number, divMul: number): ClauseSnapshot => {
      const orderCount = Math.round(baseOrderCount * countMul);
      const attestationCount = Math.round(orderCount * attsPerOrder);
      const distinctProcesses = Math.max(1, Math.round(orderCount * 0.85));
      const baseDiv = Math.max(1, Math.round(orderCount * diversityRatio));
      const distinctBuyers = Math.min(orderCount, Math.max(1, Math.round(baseDiv * divMul)));
      const sellerDiversity = uniform(rng, 0.5, 1.0);
      const distinctSellers = Math.min(orderCount, Math.max(1, Math.round(baseDiv * divMul * sellerDiversity)));
      const distinctBuyerSellerPairs = Math.min(orderCount, Math.max(1, Math.round(distinctBuyers * sellerDiversity)));
      return {
        clauseId,
        family: "random",
        category: cat,
        resolvedAttestationCount: attestationCount,
        distinctProcesses,
        distinctAttestationStages: distinctStages,
        distinctBuyers,
        distinctSellers,
        distinctBuyerSellerPairs,
        totalChainPositionWeight: orderCount * meanChainPos,
        meanChainPosition: meanChainPos,
      };
    };

    archetypes.push({
      name: clauseId,
      description: `random — cat=${cat}, baseOrderCount=${baseOrderCount}, divRatio=${diversityRatio.toFixed(2)}, attsPerOrder=${attsPerOrder.toFixed(1)}, chainPos=${meanChainPos}`,
      snapshotsAtTranches: [makeSnap(1.0, 1.0), makeSnap(4.0, 3.0), makeSnap(10.0, 5.0)],
    });
  }
  return archetypes;
}

export function randomFillerPopulation(
  partial: Partial<RandomFillerOptions> = {},
): ClausePopulationSource {
  const options: RandomFillerOptions = {
    count: 50,
    seed: 42,
    categoryWeights: {
      "committed-policy": 0.70,
      "sovereign-log": 0.12,
      "runtime-measurement": 0.12,
      "zero": 0.06,
    },
    orderCountRange: [10, 50_000],
    diversityRatioRange: [0.05, 0.95],
    ...partial,
  };
  const archetypes = generate(options);
  return {
    label: `random fillers (n=${options.count}, seed=${options.seed})`,
    clauses: () => archetypes,
  };
}

export function combinePopulations(
  ...sources: ClausePopulationSource[]
): ClausePopulationSource {
  return {
    label: sources.map((s) => s.label).join(" + "),
    clauses: () => sources.flatMap((s) => s.clauses()),
  };
}
