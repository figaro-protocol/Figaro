use alloy_primitives::{Address, B256, U256};
use serde::{Deserialize, Serialize};

/// Cumulative state of attestations under a single schemaId at a tranche
/// timestamp. The aggregator receives one of these per schema in the
/// population for a given tranche. Values are pre-aggregated by an
/// off-chain sequencer / indexer; the SP1 proof attests to the V5-formula
/// computation over these inputs, not to the inputs themselves.
///
/// Mirrors the TypeScript `SchemaSnapshot` in
/// `sdk/scripts/rpgf-simulator/types.ts`. Value-related fields are
/// deliberately omitted — the coordination protocol is value-agnostic.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SchemaSnapshot {
    pub schema_id: B256,
    /// First-write-wins binder from SchemaRegistry — receives the FIG.
    pub schema_author: Address,

    pub resolved_attestation_count: u64,
    pub distinct_processes: u64,
    pub distinct_attestation_stages: u8,

    pub distinct_buyers: u64,
    pub distinct_sellers: u64,
    pub distinct_buyer_seller_pairs: u64,

    pub total_chain_position_weight: u64,
    /// Fixed-point: actual mean × 1_000_000. e.g. chain pos 3.0 = 3_000_000.
    pub mean_chain_position_x1e6: u64,
}

/// Input to the aggregator: a per-tranche batch of schema snapshots
/// plus the deploy-frozen formula parameters.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrancheInput {
    pub tranche_index: u8,
    pub tranche_budget_wei: U256,
    /// α as a fraction. Default V5: 33 / 100.
    pub alpha_numerator: u32,
    pub alpha_denominator: u32,
    /// Per-author cap as a fraction. Default V5: 15 / 100.
    pub cap_numerator: u32,
    pub cap_denominator: u32,
    pub snapshots: Vec<SchemaSnapshot>,
}

/// Public values committed by the SP1 program. The new minter contract
/// reads these on-chain to verify (tranche_index, merkle_root,
/// total_allocated_wei) against the proof.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrancheOutput {
    pub tranche_index: u8,
    pub merkle_root: B256,
    pub total_allocated_wei: U256,
    pub schema_count: u32,
}
