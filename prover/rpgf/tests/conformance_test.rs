// Conformance harness — shared canonical input with
// test/fig/RpgfMinterConformance.t.sol. Both languages compute the same
// Merkle root from the same (clause_author, amount) leaves and the same
// per-author allocations. If both pass, the Rust → Solidity contract
// holds byte-for-byte across the full pipeline.
//
// The canonical input is engineered so every clause's pre-cap share
// exceeds the 15% cap — all 4 clauses are equally scored, so each
// settles at exactly 15% = 45M ether. Total allocated = 180M ether,
// 60% of the 300M FIG Y2 tranche budget. The remaining 40% stays
// unallocated by design (the cap is meant to stop concentration, not
// to ensure full budget consumption).

use alloy_primitives::{address, Address, B256, U256};
use figaro_rpgf::aggregate;
use figaro_rpgf::types::{ClauseSnapshot, TrancheInput};

fn clause_id_byte(b: u8) -> B256 {
    let mut bytes = [0u8; 32];
    bytes[31] = b;
    B256::from(bytes)
}

fn canonical_snapshot(clause_byte: u8, author: Address) -> ClauseSnapshot {
    ClauseSnapshot {
        clause_id: clause_id_byte(clause_byte),
        clause_author: author,
        // family is B256::ZERO so wCategory = 1.0 (zero is not a Tier-1
        // family hash). All four clauses equally weighted.
        family: B256::ZERO,
        resolved_attestation_count: 200,
        distinct_processes: 100,
        distinct_attestation_stages: 1,
        distinct_buyers: 50,
        distinct_sellers: 50,
        distinct_buyer_seller_pairs: 50,
        total_chain_position_weight: 200,
        // Mean chain pos 1.0 → wTopology = 1.0 (baseline). Weight = 1.0
        // overall — all four clauses equally weighted.
        mean_chain_position_x1e6: 1_000_000,
    }
}

fn canonical_input() -> TrancheInput {
    let author_a = address!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    let author_b = address!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    let author_c = address!("cccccccccccccccccccccccccccccccccccccccc");
    let author_d = address!("dddddddddddddddddddddddddddddddddddddddd");

    TrancheInput {
        tranche_index: 0,
        tranche_budget_wei: U256::from(300_000_000u64) * U256::from(10u64).pow(U256::from(18)),
        alpha_numerator: 33,
        alpha_denominator: 100,
        cap_numerator: 15,
        cap_denominator: 100,
        snapshots: vec![
            canonical_snapshot(1, author_a),
            canonical_snapshot(2, author_b),
            canonical_snapshot(3, author_c),
            canonical_snapshot(4, author_d),
        ],
    }
}

#[test]
fn conformance_amounts_at_cap_are_45m_each() {
    let input = canonical_input();
    let output = aggregate(&input);

    let expected_per_author = U256::from(45_000_000u64) * U256::from(10u64).pow(U256::from(18));
    let expected_total = expected_per_author * U256::from(4u64);

    assert_eq!(output.clause_count, 4);
    assert_eq!(
        output.total_allocated_wei, expected_total,
        "4 × 45M ether = 180M ether total"
    );
}

#[test]
fn conformance_merkle_root_matches_foundry_hardcode() {
    let input = canonical_input();
    let output = aggregate(&input);

    // Canonical Merkle root committed by both implementations. Computed
    // from sorted-pair Keccak256 over the 4 leaves
    //   keccak256(authorX || 45_000_000 ether)
    // in clause_id-sort order (A, B, C, D since their clauseIds are
    // bytes32(1), bytes32(2), bytes32(3), bytes32(4)).
    //
    // The same value is hardcoded as EXPECTED_ROOT in
    // test/fig/RpgfMinterConformance.t.sol. If either side ever
    // disagrees with this constant the conformance is broken.
    let expected_root: B256 = "0x7de1fc7dc27443aa3efe86f5da98a2d3f18d31f8ca1e612da4a91c8cce497fec"
        .parse()
        .unwrap();

    assert_eq!(output.merkle_root, expected_root, "merkle root drift");
}
