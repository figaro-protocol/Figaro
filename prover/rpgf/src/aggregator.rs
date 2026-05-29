use alloy_primitives::U256;

use crate::formula::score;
use crate::merkle::build_merkle_root;
use crate::types::{TrancheInput, TrancheOutput};

/// Aggregate a per-tranche batch of clause snapshots into a Merkle
/// root over (clauseAuthor, amount) leaves. Implements the V5 formula
/// + 15% iterative water-filling cap, matching the TypeScript
/// reference in `sdk/scripts/rpgf-simulator/`.
pub fn aggregate(input: &TrancheInput) -> TrancheOutput {
    // 1. Score each snapshot.
    let scores: Vec<f64> = input
        .snapshots
        .iter()
        .map(|s| score(s, input.alpha_numerator, input.alpha_denominator))
        .collect();

    let total_score: f64 = scores.iter().sum();

    // 2. Shares pro-rata.
    let mut shares: Vec<f64> = if total_score > 0.0 {
        scores.iter().map(|s| s / total_score).collect()
    } else {
        vec![0.0; scores.len()]
    };

    // 3. Iterative water-filling cap.
    let cap_share = input.cap_numerator as f64 / input.cap_denominator as f64;
    apply_cap(&mut shares, cap_share);

    // 4. Convert shares to FIG amounts. Parts-per-million scaling so
    //    the bigint budget multiplies cleanly.
    let amounts: Vec<U256> = shares
        .iter()
        .map(|s| {
            let scaled = (s * 1_000_000.0).round() as u64;
            input.tranche_budget_wei * U256::from(scaled) / U256::from(1_000_000u64)
        })
        .collect();

    // 5. Build Merkle root over (clauseAuthor, amount) leaves.
    let leaves: Vec<_> = input
        .snapshots
        .iter()
        .zip(amounts.iter())
        .map(|(s, a)| (s.clause_author, *a))
        .collect();
    let merkle_root = build_merkle_root(&leaves);

    let total_allocated_wei: U256 = amounts.iter().fold(U256::ZERO, |acc, a| acc + *a);

    TrancheOutput {
        tranche_index: input.tranche_index,
        merkle_root,
        total_allocated_wei,
        clause_count: input.snapshots.len() as u32,
    }
}

/// Iterative water-filling: any share above `cap_share` is truncated
/// to `cap_share`; the excess is redistributed pro-rata across
/// under-cap shares. Converges to fixpoint (a redistribution can push
/// another share above the cap). Mirrors `applyCap` in
/// `sdk/scripts/rpgf-simulator/formula.ts`.
fn apply_cap(shares: &mut [f64], cap_share: f64) {
    if cap_share <= 0.0 || cap_share >= 1.0 || shares.is_empty() {
        return;
    }

    for _ in 0..50 {
        let mut excess = 0.0;
        let mut under_mass = 0.0;
        for &s in shares.iter() {
            if s > cap_share {
                excess += s - cap_share;
            } else {
                under_mass += s;
            }
        }
        if excess < 1e-12 {
            break;
        }
        if under_mass < 1e-12 {
            // Degenerate: every share is at or above the cap. Truncate
            // them all to the cap and stop. The excess (sum of
            // shares - n × cap_share) goes unallocated by design —
            // the cap is meant to bound concentration, not to ensure
            // full budget consumption.
            for s in shares.iter_mut() {
                if *s > cap_share {
                    *s = cap_share;
                }
            }
            break;
        }
        for s in shares.iter_mut() {
            if *s > cap_share {
                *s = cap_share;
            } else {
                *s += excess * (*s / under_mass);
            }
        }
    }
}
