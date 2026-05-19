import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCap, rankTranche, tier1Weight } from "./formula.js";
import { handCodedPopulation } from "./populations/handCoded.js";
import { combinePopulations, randomFillerPopulation } from "./populations/random.js";
import type {
  CountVariant,
  DiversityVariant,
  SchemaCategory,
  SchemaPopulationSource,
  TrancheIndex,
  TrancheRanking,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALPHA_GRID = [0.0, 0.1, 0.2, 0.3, 0.33, 0.4, 0.5, 0.66, 0.8, 1.0];
const TRANCHES: readonly TrancheIndex[] = [0, 1, 2];
const TRANCHE_LABELS = ["Y2 (300M FIG)", "Y5 (200M FIG)", "Y9 (100M FIG)"] as const;

const ALPHA_DEFAULT = 0.33;
const CAP_SHARE = 0.15;

// Default (count, diversity) combination — what V3 advocates.
const DEFAULT_COMBO: [CountVariant, DiversityVariant] = ["processCount", "pairs"];

// Additional combinations to compare at Y2.
const COMPARISON_COMBOS: ReadonlyArray<[CountVariant, DiversityVariant, string]> = [
  ["raw", "pairs", "raw events × pairs"],
  ["chainPosition", "pairs", "chainPosition × pairs"],
  ["processCount", "buyers", "processes × buyer-breadth"],
  ["processCount", "sellers", "processes × seller-breadth"],
];

function formatFig(amount: bigint): string {
  const whole = amount / 10n ** 18n;
  if (whole >= 1_000_000n) return `${(Number(whole) / 1_000_000).toFixed(2)}M`;
  if (whole >= 1_000n) return `${(Number(whole) / 1_000).toFixed(1)}K`;
  return whole.toString();
}

function comboLabel(cv: CountVariant, dv: DiversityVariant): string {
  return `count=${cv} × diversity=${dv}`;
}

function printRanking(r: TrancheRanking, topN = 12) {
  const top = r.allocations.slice(0, topN);
  console.log(
    `\n=== ${TRANCHE_LABELS[r.trancheIndex]} | α=${r.alpha} | ${comboLabel(r.countVariant, r.diversityVariant)} | cap=${(CAP_SHARE * 100).toFixed(0)}% ===`,
  );
  console.log(
    "Rank  Schema                          Cat  Score          Share   Allocation",
  );
  top.forEach((a, i) => {
    const rank = String(i + 1).padStart(4);
    const name = a.schemaName.padEnd(30);
    const cat = a.category === "committed-policy" ? "A " : a.category === "sovereign-log" ? "B " : "C ";
    const sc = a.score.toExponential(3).padStart(11);
    const share = `${(a.share * 100).toFixed(2)}%`.padStart(7);
    const alloc = formatFig(a.allocatedFig).padStart(8);
    console.log(`${rank}  ${name}  ${cat}   ${sc}  ${share}  ${alloc} FIG`);
  });
}

function printCapComparison(r: TrancheRanking, capShare: number, topN = 12) {
  const capped = applyCap(r, capShare);
  const top = r.allocations.slice(0, topN);
  console.log(
    `\n--- Cap effect | ${TRANCHE_LABELS[r.trancheIndex]} | α=${r.alpha} | ${comboLabel(r.countVariant, r.diversityVariant)} | cap=${(capShare * 100).toFixed(0)}% ---`,
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
  countVariant: CountVariant,
  diversityVariant: DiversityVariant,
  trancheIndex: TrancheIndex,
  filterNames?: Set<string>,
) {
  console.log(
    `\n--- Sensitivity: rank vs α | ${TRANCHE_LABELS[trancheIndex]} | ${comboLabel(countVariant, diversityVariant)} ---`,
  );
  const schemas = pop.schemas();
  const rankAt = ALPHA_GRID.map((alpha) => {
    const r = rankTranche(schemas, trancheIndex, alpha, countVariant, diversityVariant);
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

function printWeightBreakdown(pop: SchemaPopulationSource, trancheIndex: TrancheIndex) {
  console.log(
    `\n--- Tier-1 weight breakdown (${TRANCHE_LABELS[trancheIndex]} snapshot) ---`,
  );
  console.log(
    "Schema                          wCat   wTopo  total",
  );
  for (const a of pop.schemas()) {
    const s = a.snapshotsAtTranches[trancheIndex];
    const w = tier1Weight(s);
    const wc = w.wCategory.toFixed(2).padStart(6);
    const wt = w.wTopology.toFixed(2).padStart(6);
    const tot = w.total.toFixed(2).padStart(6);
    console.log(`${a.name.padEnd(30)} ${wc} ${wt} ${tot}`);
  }
}

function printClusterSummary(r: TrancheRanking) {
  console.log(
    `\n--- Cluster allocation share | ${TRANCHE_LABELS[r.trancheIndex]} | α=${r.alpha} | ${comboLabel(r.countVariant, r.diversityVariant)} ---`,
  );
  const totals: Record<SchemaCategory, { share: number; count: number }> = {
    "committed-policy": { share: 0, count: 0 },
    "sovereign-log": { share: 0, count: 0 },
    "runtime-measurement": { share: 0, count: 0 },
  };
  for (const a of r.allocations) {
    totals[a.category].share += a.share;
    totals[a.category].count += 1;
  }
  console.log("Cluster                         schemas   total share");
  for (const cat of ["committed-policy", "sovereign-log", "runtime-measurement"] as const) {
    const t = totals[cat];
    const label = cat === "committed-policy" ? "A (committed-policy)" : cat === "sovereign-log" ? "B (sovereign-log)" : "C (runtime-measurement)";
    console.log(
      `${label.padEnd(33)} ${String(t.count).padStart(3)}   ${(t.share * 100).toFixed(2).padStart(8)}%`,
    );
  }
}

function main() {
  const archetypes = handCodedPopulation;
  const fillers = randomFillerPopulation();
  const combined = combinePopulations(archetypes, fillers);

  console.log(`# RPGF simulator V4 — audit-derived variables + tier-1 graph weighting`);
  console.log(`Archetypes: ${archetypes.schemas().length} (17 real + 3 hypothetical)`);
  console.log(`Random fillers: ${fillers.schemas().length}`);
  console.log(`Combined: ${combined.schemas().length}`);
  console.log(`Default α: ${ALPHA_DEFAULT}`);
  console.log(`Per-author cap: ${(CAP_SHARE * 100).toFixed(0)}%`);
  console.log(`Default combo: ${comboLabel(...DEFAULT_COMBO)} (audit's recommendation)`);
  console.log(`Tier-1 weight applied: category(fulfilment, geo) + topology(chainPosition). Value/bond removed — coordination protocol is value-agnostic.`);

  const [dCount, dDiv] = DEFAULT_COMBO;

  console.log(`\n## Tier-1 weight breakdown — archetypes`);
  printWeightBreakdown(archetypes, 0);

  console.log(`\n## Default combo (${comboLabel(dCount, dDiv)}) — all tranches, capped`);
  const cappedRankings: TrancheRanking[] = [];
  for (const t of TRANCHES) {
    const raw = rankTranche(combined.schemas(), t, ALPHA_DEFAULT, dCount, dDiv);
    const capped = applyCap(raw, CAP_SHARE);
    cappedRankings.push(capped);
    printRanking(capped);
  }

  console.log(`\n## Comparison combos at Y2 (α=${ALPHA_DEFAULT}, capped)`);
  for (const [cv, dv, label] of COMPARISON_COMBOS) {
    console.log(`\n# ${label}`);
    const raw = rankTranche(combined.schemas(), 0, ALPHA_DEFAULT, cv, dv);
    const capped = applyCap(raw, CAP_SHARE);
    printRanking(capped);
  }

  console.log(`\n## Cluster allocation share (Y2, α=${ALPHA_DEFAULT}, all combos)`);
  const defaultY2 = applyCap(
    rankTranche(combined.schemas(), 0, ALPHA_DEFAULT, dCount, dDiv),
    CAP_SHARE,
  );
  printClusterSummary(defaultY2);
  for (const [cv, dv] of COMPARISON_COMBOS) {
    const r = applyCap(
      rankTranche(combined.schemas(), 0, ALPHA_DEFAULT, cv, dv),
      CAP_SHARE,
    );
    printClusterSummary(r);
  }

  console.log(`\n## Cap effect at Y2 (default combo)`);
  const rawDefault = rankTranche(combined.schemas(), 0, ALPHA_DEFAULT, dCount, dDiv);
  printCapComparison(rawDefault, CAP_SHARE);

  console.log(`\n## Sensitivity vs α — archetype subset only (Y2)`);
  const archetypeNames = new Set(archetypes.schemas().map((s) => s.name));
  printSensitivityTable(combined, dCount, dDiv, 0, archetypeNames);
  for (const [cv, dv] of COMPARISON_COMBOS.slice(0, 3)) {
    printSensitivityTable(combined, cv, dv, 0, archetypeNames);
  }

  const outPath = join(__dirname, "results.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        meta: {
          version: "V4",
          population: combined.label,
          archetypeCount: archetypes.schemas().length,
          fillerCount: fillers.schemas().length,
          defaultAlpha: ALPHA_DEFAULT,
          capShare: CAP_SHARE,
          alphaGrid: ALPHA_GRID,
          defaultCombo: { count: dCount, diversity: dDiv },
        },
        defaultCappedRankings: cappedRankings.map((r) => ({
          tranche: r.trancheIndex,
          alpha: r.alpha,
          countVariant: r.countVariant,
          diversityVariant: r.diversityVariant,
          budgetFigWei: r.budgetFig.toString(),
          allocations: r.allocations.map((a) => ({
            schema: a.schemaName,
            schemaId: a.schemaId,
            category: a.category,
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
