import type { Archetype, SchemaPopulationSource, SchemaSnapshot } from "../types.js";

export interface RandomFillerOptions {
  count: number;
  seed: number;
  // Log-uniform sampling of the Y2 attestation count.
  countRange: [number, number];
  // Uniform sampling of diversity:count ratio (1.0 = every attestor distinct).
  diversityRatioRange: [number, number];
  // Log-uniform sampling of mean bondedValue per attestation, in token units.
  bondedValueTokenRange: [number, number];
}

// Deterministic seeded PRNG so runs are reproducible.
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

function generate(options: RandomFillerOptions): Archetype[] {
  const rng = mulberry32(options.seed);
  const archetypes: Archetype[] = [];
  for (let i = 0; i < options.count; i++) {
    const baseCount = Math.max(1, Math.round(logUniform(rng, options.countRange[0], options.countRange[1])));
    const diversityRatio = uniform(rng, options.diversityRatioRange[0], options.diversityRatioRange[1]);
    const baseDiversity = Math.max(1, Math.round(baseCount * diversityRatio));
    const meanBondedTokens = logUniform(
      rng,
      options.bondedValueTokenRange[0],
      options.bondedValueTokenRange[1],
    );
    const meanBondedWei = toWei(meanBondedTokens);
    const meanChainPos = 1 + Math.floor(rng() * 3); // {1, 2, 3}

    const makeSnap = (countMul: number, divMul: number): SchemaSnapshot => {
      const count = Math.round(baseCount * countMul);
      // diversity grows slower than count; cap at count.
      const diversity = Math.min(count, Math.max(1, Math.round(baseDiversity * divMul)));
      return {
        schemaId: `random-${i.toString().padStart(3, "0")}`,
        resolvedAttestationCount: count,
        totalBondedValueWei: BigInt(count) * meanBondedWei,
        totalChainPositionWeight: count * meanChainPos,
        distinctAttestors: diversity,
      };
    };

    archetypes.push({
      name: `random-${i.toString().padStart(3, "0")}`,
      description: `random — baseCount=${baseCount}, divRatio=${diversityRatio.toFixed(2)}, bondedTokens=${meanBondedTokens.toFixed(1)}, chainPos=${meanChainPos}`,
      snapshotsAtTranches: [
        makeSnap(1.0, 1.0),
        makeSnap(4.0, 3.0),
        makeSnap(10.0, 5.0),
      ],
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
    countRange: [10, 50_000],
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
