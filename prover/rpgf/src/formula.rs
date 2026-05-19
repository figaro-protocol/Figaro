use alloy_primitives::B256;
use sha3::{Digest, Keccak256};

use crate::types::SchemaSnapshot;

// ─── Tier-1 graph weighting ──────────────────────────────────────────
//
// Two dimensions, additive composition: w = 1 + (wCat-1) + (wTopo-1).
// Range 1.0–5.0.
//
// Mirrors `tier1Weight` in `sdk/scripts/rpgf-simulator/formula.ts`.
// Value/bond is deliberately not a dimension — the protocol's cost to
// move 1 unit equals its cost to move 1 trillion, and the substrate-
// broadening signal is the same per counterparty pair regardless of
// quanta. Value-weighting would import a TradFi "TVL matters" metric.

const CATEGORY_WEIGHT_TIER1: f64 = 3.0;
const CATEGORY_WEIGHT_DEFAULT: f64 = 1.0;
const TOPOLOGY_WEIGHT_MIN: f64 = 1.0;
const TOPOLOGY_WEIGHT_MAX: f64 = 3.0;

/// Tier-1 category schemas. Hard-coded at deploy. Reversible only by a
/// new FIG-system deployment (since the minter is sealed via
/// `FigToken.renounceDeployerMint`).
fn is_tier1_category(schema_id: &B256) -> bool {
    let fulfilment_v2 = keccak256_str(b"figaro-fulfilment-v2");
    let geo_v2 = keccak256_str(b"figaro-geo-v2");
    *schema_id == fulfilment_v2 || *schema_id == geo_v2
}

fn keccak256_str(s: &[u8]) -> B256 {
    let hash = Keccak256::digest(s);
    B256::from_slice(&hash)
}

#[derive(Clone, Debug, PartialEq)]
pub struct WeightBreakdown {
    pub w_category: f64,
    pub w_topology: f64,
    pub total: f64,
}

pub fn tier1_weight(s: &SchemaSnapshot) -> WeightBreakdown {
    let w_category = if is_tier1_category(&s.schema_id) {
        CATEGORY_WEIGHT_TIER1
    } else {
        CATEGORY_WEIGHT_DEFAULT
    };

    let mean_chain_pos = s.mean_chain_position_x1e6 as f64 / 1_000_000.0;
    let w_topology = mean_chain_pos.max(TOPOLOGY_WEIGHT_MIN).min(TOPOLOGY_WEIGHT_MAX);

    let total = 1.0 + (w_category - 1.0) + (w_topology - 1.0);
    WeightBreakdown { w_category, w_topology, total }
}

/// V5 score: w_tier1 × processCount^α × pairs^(1-α).
///
/// processCount and pairs are the deploy-frozen default count and
/// diversity terms per the audit recommendation in sdk/scripts/
/// rpgf-simulator. Other variants explored in the simulator are not
/// implemented here — the SP1 program commits to one formula at
/// deploy and lives with it for the 2/5/9-year tranche window.
pub fn score(s: &SchemaSnapshot, alpha_num: u32, alpha_den: u32) -> f64 {
    let c = s.distinct_processes as f64;
    let d = s.distinct_buyer_seller_pairs as f64;
    if c <= 0.0 || d <= 0.0 {
        return 0.0;
    }
    let alpha = alpha_num as f64 / alpha_den as f64;
    let w = tier1_weight(s).total;
    w * c.powf(alpha) * d.powf(1.0 - alpha)
}
