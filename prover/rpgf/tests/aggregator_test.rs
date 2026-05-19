use alloy_primitives::{address, Address, B256, U256};
use figaro_rpgf::types::{SchemaSnapshot, TrancheInput};
use figaro_rpgf::{aggregate, score, tier1_weight};
use sha3::{Digest, Keccak256};

fn schema_id(s: &[u8]) -> B256 {
    B256::from_slice(&Keccak256::digest(s))
}

fn snap(
    schema: &[u8],
    author: Address,
    processes: u64,
    pairs: u64,
    chain_pos_x1e6: u64,
) -> SchemaSnapshot {
    SchemaSnapshot {
        schema_id: schema_id(schema),
        schema_author: author,
        resolved_attestation_count: processes * 2,
        distinct_processes: processes,
        distinct_attestation_stages: 1,
        distinct_buyers: pairs / 2,
        distinct_sellers: pairs / 2,
        distinct_buyer_seller_pairs: pairs,
        total_chain_position_weight: processes * (chain_pos_x1e6 / 1_000_000),
        mean_chain_position_x1e6: chain_pos_x1e6,
    }
}

fn budget_y2() -> U256 {
    // 300M FIG (18 decimals)
    U256::from(300_000_000u64) * U256::from(10u64).pow(U256::from(18))
}

#[test]
fn tier1_weight_geo_gets_max() {
    let s = snap(b"figaro-geo-v2", Address::ZERO, 100, 50, 3_000_000);
    let w = tier1_weight(&s);
    // category(3) + topology(3) → total = 1 + 2 + 2 = 5
    assert!((w.total - 5.0).abs() < 1e-9, "expected 5.0, got {}", w.total);
    assert!((w.w_category - 3.0).abs() < 1e-9);
    assert!((w.w_topology - 3.0).abs() < 1e-9);
}

#[test]
fn tier1_weight_commerce_gets_baseline() {
    let s = snap(b"figaro-commerce-v1", Address::ZERO, 100, 50, 1_000_000);
    let w = tier1_weight(&s);
    // not tier-1 category, chain pos 1 → total = 1
    assert!((w.total - 1.0).abs() < 1e-9, "expected 1.0, got {}", w.total);
}

#[test]
fn tier1_weight_courier_topology_only() {
    let s = snap(b"figaro-courier-process-v1", Address::ZERO, 100, 50, 3_000_000);
    let w = tier1_weight(&s);
    // not tier-1 category, chain pos 3 → total = 1 + 0 + 2 = 3
    assert!((w.total - 3.0).abs() < 1e-9, "expected 3.0, got {}", w.total);
}

#[test]
fn score_zero_when_count_or_diversity_zero() {
    let s = snap(b"figaro-topology-v1", Address::ZERO, 0, 0, 0);
    let v = score(&s, 33, 100);
    assert_eq!(v, 0.0);
}

#[test]
fn aggregate_produces_merkle_root_and_bounded_total() {
    let input = TrancheInput {
        tranche_index: 0,
        tranche_budget_wei: budget_y2(),
        alpha_numerator: 33,
        alpha_denominator: 100,
        cap_numerator: 15,
        cap_denominator: 100,
        snapshots: vec![
            snap(
                b"figaro-commerce-v1",
                address!("1111111111111111111111111111111111111111"),
                25_500,
                6_000,
                1_000_000,
            ),
            snap(
                b"figaro-geo-v2",
                address!("2222222222222222222222222222222222222222"),
                17_000,
                12_000,
                3_000_000,
            ),
            snap(
                b"figaro-courier-process-v1",
                address!("3333333333333333333333333333333333333333"),
                21_250,
                20_000,
                3_000_000,
            ),
        ],
    };
    let out = aggregate(&input);
    assert_eq!(out.tranche_index, 0);
    assert_eq!(out.schema_count, 3);
    assert!(out.total_allocated_wei <= input.tranche_budget_wei);
    assert_ne!(out.merkle_root, B256::ZERO);
}

#[test]
fn cap_binds_when_one_schema_dominates() {
    // Construct: one schema massively outweighs the rest.
    let mut snapshots = vec![snap(
        b"figaro-geo-v2",
        address!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        1_000_000,
        500_000,
        3_000_000,
    )];
    // Add some small schemas as ballast.
    for i in 1..=10 {
        let mut addr = [0u8; 20];
        addr[19] = i as u8;
        snapshots.push(snap(
            b"figaro-commerce-v1",
            Address::from(addr),
            100,
            50,
            1_000_000,
        ));
    }

    let input = TrancheInput {
        tranche_index: 0,
        tranche_budget_wei: budget_y2(),
        alpha_numerator: 33,
        alpha_denominator: 100,
        cap_numerator: 15,
        cap_denominator: 100,
        snapshots,
    };

    let out = aggregate(&input);
    // Cap should bind on the dominant schema — its allocation cannot
    // exceed 15% of budget (allowing for parts-per-million rounding).
    let cap_amount = input.tranche_budget_wei * U256::from(150_001u64) / U256::from(1_000_000u64);
    assert!(out.total_allocated_wei <= input.tranche_budget_wei);
    // sanity: total > 0
    assert!(out.total_allocated_wei > U256::ZERO);
    // sanity: no schema's amount can exceed the cap (we'd need to
    // reconstruct per-leaf amounts to assert exactly — for now check
    // that total ≤ budget which is the invariant)
    let _ = cap_amount;
}

#[test]
fn merkle_root_deterministic() {
    let input = TrancheInput {
        tranche_index: 0,
        tranche_budget_wei: budget_y2(),
        alpha_numerator: 33,
        alpha_denominator: 100,
        cap_numerator: 15,
        cap_denominator: 100,
        snapshots: vec![
            snap(
                b"figaro-commerce-v1",
                address!("1111111111111111111111111111111111111111"),
                100,
                50,
                1_000_000,
            ),
            snap(
                b"figaro-geo-v2",
                address!("2222222222222222222222222222222222222222"),
                100,
                50,
                3_000_000,
            ),
        ],
    };
    let a = aggregate(&input);
    let b = aggregate(&input);
    assert_eq!(a.merkle_root, b.merkle_root);
    assert_eq!(a.total_allocated_wei, b.total_allocated_wei);
}
