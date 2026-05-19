import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCap, rankTranche } from "./formula.js";
import { handCodedPopulation } from "./populations/handCoded.js";
import { combinePopulations, randomFillerPopulation } from "./populations/random.js";
import type {
  CountVariant,
  SchemaPopulationSource,
  TrancheIndex,
  TrancheRanking,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALPHA_GRID = [0.0, 0.1, 0.2, 0.3, 0.33, 0.4, 0.5, 0.66, 0.8, 1.0];
const VARIANTS: readonly CountVariant[] = ["raw", "bondedValue", "chainPosition"];
const TRANCHES: readonly TrancheIndex[] = [0, 1, 2];
const TRANCHE_LABELS = ["Y2 (300M FIG)", "Y5 (200M FIG)", "Y9 (100M FIG)"] as const;

const ALPHA_DEFAULT = 0.33;
const CAP_SHARE = 0.15;

function formatFig(amount: bigint): string {
  const whole = amount / 10n ** 18n;
  if (whole >= 1_000_000n) return `${(Number(whole) / 1_000_000).toFixed(2)}M`;
  if (whole >= 1_000n) return `${(Number(whole) / 1_000).toFixed(1)}K`;
  return whole.toString();
}

function printRanking(r: TrancheRanking, topN = 10) {
  const top = r.allocations.slice(0, topN);
  console.log(
    `\n=== ${TRANCHE_LABELS[r.trancheIndex]} | α=${r.alpha} | count=${r.variant} | cap=${(CAP_SHARE * 100).toFixed(0)}% ===`,
  );
  console.log("Rank  Schema                          Score          Share   Allocation");
  top.forEach((a, i) => {
    const rank = String(i + 1).padStart(4);
    const name = a.schemaName.padEnd(30);
    const sc = a.score.toExponential(3).padStart(11);
    const share = `${(a.share * 100).toFixed(2)}%`.padStart(7);
    const alloc = formatFig(a.allocatedFig).padStart(8);
    console.log(`${rank}  ${name}  ${sc}  ${share}  ${alloc} FIG`);
  });
}

function printCapComparison(r: TrancheRanking, capShare: number, topN = 12) {
  const capped = applyCap(r, capShare);
  const top = r.allocations.slice(0, topN);
  console.log(
    `\n--- Cap effect | ${TRANCHE_LABELS[r.trancheIndex]} | α=${r.alpha} | count=${r.variant} | cap=${(capShare * 100).toFixed(0)}% ---`,
  );
  console.log(
    "Rank  Schema                       uncapped share   capped share   uncap FIG   capped FIG",
  );
  top.forEach((a, i) => {
    const rank = String(i + 1).padStart(4);
    const name = a.schemaName.padEnd(28);
    const usShare = `${(a.share * 100).toFixed(2)}%`.padStart(15);
    const cShare = `${(capped.allocations[i]!.share * 100).toFixed(2)}%`.padStart(13);
    const uAlloc = formatFig(a.allocatedFig).padStart(9);
    const cAlloc = formatFig(capped.allocations[i]!.allocatedFig).padStart(10);
    console.log(`${rank}  ${name}  ${usShare}  ${cShare}  ${uAlloc} FIG  ${cAlloc} FIG`);
  });
}

function printSensitivityTable(
  pop: SchemaPopulationSource,
  variant: CountVariant,
  trancheIndex: TrancheIndex,
  filterNames?: Set<string>,
) {
  console.log(
    `\n--- Sensitivity: rank vs α | tranche=${TRANCHE_LABELS[trancheIndex]} | count=${variant} ---`,
  );
  const schemas = pop.schemas();
  const rankAt = ALPHA_GRID.map((alpha) => {
    const r = rankTranche(schemas, trancheIndex, alpha, variant);
    const m = new Map<string, number>();
    r.allocations.forEach((a, i) => m.set(a.schemaName, i + 1));
    return { alpha, map: m };
  });

  const rows = filterNames ? schemas.filter((s) => filterNames.has(s.name)) : schemas;

  const header =
    "Schema                          " +
    ALPHA_GRID.map((a) => `α=${a.toFixed(2)}`.padStart(7)).join(" ");
  console.log(header);

  rows.forEach((s) => {
    const ranks = rankAt
      .map(({ map }) => String(map.get(s.name) ?? "-").padStart(7))
      .join(" ");
    console.log(`${s.name.padEnd(30)} ${ranks}`);
  });
}

function printStabilityCheck(
  archetypeOnly: SchemaPopulationSource,
  combined: SchemaPopulationSource,
  trancheIndex: TrancheIndex,
  alpha: number,
  variant: CountVariant,
) {
  console.log(
    `\n--- Archetype rank stability | archetypes-only vs combined | ${TRANCHE_LABELS[trancheIndex]} | α=${alpha} | count=${variant} ---`,
  );
  const rAlone = rankTranche(archetypeOnly.schemas(), trancheIndex, alpha, variant);
  const rCombined = rankTranche(combined.schemas(), trancheIndex, alpha, variant);

  const rankAlone = new Map<string, number>();
  rAlone.allocations.forEach((a, i) => rankAlone.set(a.schemaName, i + 1));
  const rankCombined = new Map<string, number>();
  rCombined.allocations.forEach((a, i) => rankCombined.set(a.schemaName, i + 1));

  console.log("Schema                          archetype-only rank   combined rank   Δ");
  archetypeOnly.schemas().forEach((s) => {
    const a = rankAlone.get(s.name) ?? 0;
    const c = rankCombined.get(s.name) ?? 0;
    const d = c - a;
    const dStr = d === 0 ? "0" : d > 0 ? `+${d}` : String(d);
    console.log(
      `${s.name.padEnd(30)}  ${String(a).padStart(19)}   ${String(c).padStart(13)}   ${dStr.padStart(3)}`,
    );
  });
}

function main() {
  const archetypes = handCodedPopulation;
  const fillers = randomFillerPopulation();
  const combined = combinePopulations(archetypes, fillers);

  console.log(`# RPGF simulator (combined population)`);
  console.log(`Archetypes: ${archetypes.schemas().length}`);
  console.log(`Random fillers: ${fillers.schemas().length}`);
  console.log(`Combined: ${combined.schemas().length}`);
  console.log(`Default α: ${ALPHA_DEFAULT}`);
  console.log(`Per-author cap: ${(CAP_SHARE * 100).toFixed(0)}% of tranche budget\n`);

  console.log(`## Default-α rankings (α=${ALPHA_DEFAULT}, cap=${CAP_SHARE * 100}%) — combined population`);
  const cappedRankings: TrancheRanking[] = [];
  for (const variant of VARIANTS) {
    for (const t of TRANCHES) {
      const raw = rankTranche(combined.schemas(), t, ALPHA_DEFAULT, variant);
      const capped = applyCap(raw, CAP_SHARE);
      cappedRankings.push(capped);
      printRanking(capped);
    }
  }

  console.log(`\n## Cap-effect comparison (Y2 tranche, α=${ALPHA_DEFAULT})`);
  for (const variant of VARIANTS) {
    const raw = rankTranche(combined.schemas(), 0, ALPHA_DEFAULT, variant);
    printCapComparison(raw, CAP_SHARE);
  }

  console.log(`\n## Sensitivity: rank vs α — archetype subset at Y2 (Y2 = 300M FIG tranche)`);
  const archetypeNames = new Set(archetypes.schemas().map((s) => s.name));
  for (const variant of VARIANTS) {
    printSensitivityTable(combined, variant, 0, archetypeNames);
  }

  console.log(`\n## Archetype-rank stability under random-filler noise (Y2)`);
  for (const variant of VARIANTS) {
    printStabilityCheck(archetypes, combined, 0, ALPHA_DEFAULT, variant);
  }

  const outPath = join(__dirname, "results.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        meta: {
          population: combined.label,
          archetypeCount: archetypes.schemas().length,
          fillerCount: fillers.schemas().length,
          defaultAlpha: ALPHA_DEFAULT,
          capShare: CAP_SHARE,
          alphaGrid: ALPHA_GRID,
          variants: VARIANTS,
        },
        defaultAlphaCappedRankings: cappedRankings.map((r) => ({
          tranche: r.trancheIndex,
          alpha: r.alpha,
          variant: r.variant,
          budgetFigWei: r.budgetFig.toString(),
          allocations: r.allocations.map((a) => ({
            schema: a.schemaName,
            schemaId: a.schemaId,
            score: a.score,
            share: a.share,
            allocatedFigWei: a.allocatedFig.toString(),
          })),
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nResults JSON written to ${outPath}`);
}

main();
