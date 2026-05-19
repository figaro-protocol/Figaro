import type {
  Archetype,
  SchemaCategory,
  SchemaPopulationSource,
  SchemaSnapshot,
} from "../types.js";

export interface RandomFillerOptions {
  count: number;
  seed: number;
  // Per-category weighting (must sum to 1.0).
  // Default mirrors the real schema mix: ~70% committed-policy, ~12% sovereign-log,
  // ~12% runtime-measurement, ~6% zero (manifest-only / didn't launch).
  categoryWeights: {
    "committed-policy": number;
    "sovereign-log": number;
    "runtime-measurement": number;
    "zero": number;
  };
  orderCountRange: [number, number];
  diversityRatioRange: [number, number];
  bondedValueTokenRange: [number, number];
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

function toWei(tokenUnits: number): bigint {
  return BigInt(Math.round(tokenUnits * 1000)) * 10n ** 15n;
}

function pickCategory(rng: () => number, w: RandomFillerOptions["categoryWeights"]): SchemaCategory | "zero" {
  const r = rng();
  let acc = w["committed-policy"];
  if (r < acc) return "committed-policy";
  acc += w["sovereign-log"];
  if (r < acc) return "sovereign-log";
  acc += w["runtime-measurement"];
  if (r < acc) return "runtime-measurement";
  return "zero";
}

function zeroSnap(schemaId: string): SchemaSnapshot {
  return {
    schemaId,
    category: "committed-policy",
    resolvedAttestationCount: 0,
    distinctProcesses: 0,
    distinctAttestationStages: 0,
    distinctBuyers: 0,
    distinctSellers: 0,
    distinctBuyerSellerPairs: 0,
    distinctCurrencies: 0,
    totalEnclosingOrderBondedValueWei: 0n,
    totalEnclosingOrderPaymentWei: 0n,
    totalChainPositionWeight: 0,
    meanChainPosition: 0,
  };
}

function generate(options: RandomFillerOptions): Archetype[] {
  const rng = mulberry32(options.seed);
  const archetypes: Archetype[] = [];
  for (let i = 0; i < options.count; i++) {
    const cat = pickCategory(rng, options.categoryWeights);
    const schemaId = `random-${i.toString().padStart(3, "0")}`;
    if (cat === "zero") {
      archetypes.push({
        name: schemaId,
        description: `random — zero-attestation archetype (manifest-only or never-launched)`,
        snapshotsAtTranches: [zeroSnap(schemaId), zeroSnap(schemaId), zeroSnap(schemaId)],
      });
      continue;
    }

    const baseOrderCount = Math.max(1, Math.round(logUniform(rng, options.orderCountRange[0], options.orderCountRange[1])));
    const diversityRatio = uniform(rng, options.diversityRatioRange[0], options.diversityRatioRange[1]);
    const meanBondedTokens = logUniform(rng, options.bondedValueTokenRange[0], options.bondedValueTokenRange[1]);
    const meanBondedWei = toWei(meanBondedTokens);
    const meanPaymentWei = meanBondedWei / 2n; // payment ≈ half of bondedValue
    const meanChainPos = 1 + Math.floor(rng() * 3); // {1, 2, 3}

    // Category-aware attestations-per-order
    const attsPerOrder = cat === "sovereign-log"
      ? 4 + Math.floor(rng() * 5) // 4-8 lifecycle events
      : cat === "runtime-measurement"
        ? 1.5 + rng() * 2 // 1.5-3.5 measurements
        : 1 + rng() * 0.6; // 1-1.6 (Cluster A: buyer+seller attest)

    const distinctStages = cat === "sovereign-log"
      ? Math.min(8, Math.max(1, Math.floor(rng() * 8) + 1))
      : cat === "runtime-measurement"
        ? Math.min(4, Math.max(1, Math.floor(rng() * 4) + 1))
        : 1;

    const makeSnap = (countMul: number, divMul: number): SchemaSnapshot => {
      const orderCount = Math.round(baseOrderCount * countMul);
      const attestationCount = Math.round(orderCount * attsPerOrder);
      const distinctProcesses = Math.max(1, Math.round(orderCount * 0.85));
      const baseDiv = Math.max(1, Math.round(orderCount * diversityRatio));
      const distinctBuyers = Math.min(orderCount, Math.max(1, Math.round(baseDiv * divMul)));
      // Sellers can differ; assume similar diversity ratio but separate sampling
      const sellerDiversity = uniform(rng, 0.5, 1.0); // sellers slightly less diverse than buyers in some clusters
      const distinctSellers = Math.min(orderCount, Math.max(1, Math.round(baseDiv * divMul * sellerDiversity)));
      // Pairs ≤ min(buyers × sellers, orderCount)
      const distinctBuyerSellerPairs = Math.min(orderCount, Math.max(1, Math.round(distinctBuyers * sellerDiversity)));
      return {
        schemaId,
        category: cat,
        resolvedAttestationCount: attestationCount,
        distinctProcesses,
        distinctAttestationStages: distinctStages,
        distinctBuyers,
        distinctSellers,
        distinctBuyerSellerPairs,
        distinctCurrencies: 1 + Math.floor(rng() * 2),
        totalEnclosingOrderBondedValueWei: BigInt(orderCount) * meanBondedWei,
        totalEnclosingOrderPaymentWei: BigInt(orderCount) * meanPaymentWei,
        totalChainPositionWeight: orderCount * meanChainPos,
        meanChainPosition: meanChainPos,
      };
    };

    archetypes.push({
      name: schemaId,
      description: `random — cat=${cat}, baseOrderCount=${baseOrderCount}, divRatio=${diversityRatio.toFixed(2)}, bondedTokens=${meanBondedTokens.toFixed(1)}, attsPerOrder=${attsPerOrder.toFixed(1)}`,
      snapshotsAtTranches: [makeSnap(1.0, 1.0), makeSnap(4.0, 3.0), makeSnap(10.0, 5.0)],
    });
  }
  return archetypes;
}

export function randomFillerPopulation(
  partial: Partial<RandomFillerOptions> = {},
): SchemaPopulationSource {
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
    bondedValueTokenRange: [1, 100_000],
    ...partial,
  };
  const archetypes = generate(options);
  return {
    label: `random fillers (n=${options.count}, seed=${options.seed})`,
    schemas: () => archetypes,
  };
}

export function combinePopulations(
  ...sources: SchemaPopulationSource[]
): SchemaPopulationSource {
  return {
    label: sources.map((s) => s.label).join(" + "),
    schemas: () => sources.flatMap((s) => s.schemas()),
  };
}
