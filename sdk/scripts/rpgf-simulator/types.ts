export type TrancheIndex = 0 | 1 | 2;

export const TRANCHE_BUDGETS_FIG: readonly [bigint, bigint, bigint] = [
  300_000_000n * 10n ** 18n,
  200_000_000n * 10n ** 18n,
  100_000_000n * 10n ** 18n,
];

// Per the audit (sdk/scripts/rpgf-simulator/audit), the 17 protocol clauses
// cluster into three populations with different natural attestation cadence.
// The category is a modeling input; ranking math is category-blind unless
// the count variant is processCount (which equalizes A vs B vs C).
export type ClauseCategory = "committed-policy" | "sovereign-log" | "runtime-measurement";

export type CountVariant =
  | "raw" //          resolvedAttestationCount — total attest events
  | "processCount" // distinctProcesses — category-equalized
  | "chainPosition"; // totalChainPositionWeight

export type DiversityVariant =
  | "pairs" //  distinctBuyerSellerPairs — bilateral relation breadth (default)
  | "buyers" // distinctBuyers — buyer-side breadth
  | "sellers"; // distinctSellers — seller-side breadth

export interface ClauseSnapshot {
  clauseId: string;
  /** Family slug — keys Tier-1 boost. e.g. "geo", "fulfilment", "commerce". */
  family: string;
  category: ClauseCategory;

  resolvedAttestationCount: number;
  distinctProcesses: number;
  distinctAttestationStages: number;

  distinctBuyers: number;
  distinctSellers: number;
  distinctBuyerSellerPairs: number;

  totalChainPositionWeight: number;
  meanChainPosition: number;
}

export interface Archetype {
  name: string;
  description: string;
  snapshotsAtTranches: readonly [ClauseSnapshot, ClauseSnapshot, ClauseSnapshot];
}

export interface ClausePopulationSource {
  label: string;
  clauses(): readonly Archetype[];
}

export interface AuthorAllocation {
  clauseName: string;
  clauseId: string;
  category: ClauseCategory;
  score: number;
  share: number;
  allocatedFig: bigint;
}

export interface TrancheRanking {
  trancheIndex: TrancheIndex;
  alpha: number;
  countVariant: CountVariant;
  diversityVariant: DiversityVariant;
  budgetFig: bigint;
  allocations: readonly AuthorAllocation[];
}
