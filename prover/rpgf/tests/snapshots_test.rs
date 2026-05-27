use alloy_primitives::{address, Address, B256, U256};
use figaro_rpgf::events::{
    AttestationEvent, EventStream, OrderCreatedEvent, ProcessResolvedEvent, SchemaRegisteredEvent,
};
use figaro_rpgf::{aggregate, build_tranche_input};
use sha3::{Digest, Keccak256};

fn schema_id(s: &[u8]) -> B256 {
    B256::from_slice(&Keccak256::digest(s))
}

fn family_for(schema: &[u8]) -> B256 {
    // Mirror script/Deploy.s.sol family assignments for the schemas
    // referenced in these tests. Open namespace — any keccak slug works
    // on-chain; the test fixtures pick canonical ones.
    let slug: &[u8] = match schema {
        b"figaro-commerce-v1" => b"commerce",
        b"figaro-geo-v2" => b"geo",
        b"figaro-fulfilment-v2" => b"fulfilment",
        b"hypothetical-wash-v1" => b"test-family",
        _ => b"test-family",
    };
    B256::from_slice(&Keccak256::digest(slug))
}

fn schema_reg(schema: &[u8], registrar: Address) -> SchemaRegisteredEvent {
    SchemaRegisteredEvent {
        schema_id: schema_id(schema),
        version: 1,
        uri_hash: B256::ZERO,
        family: family_for(schema),
        registrar,
    }
}

fn order(
    order_hash_seed: u8,
    process_id: B256,
    buyer: Address,
    seller: Address,
    chain_position: u32,
) -> OrderCreatedEvent {
    let mut h = [0u8; 32];
    h[31] = order_hash_seed;
    OrderCreatedEvent {
        order_hash: B256::from(h),
        process_id,
        buyer,
        seller,
        currency: Address::ZERO,
        payment: U256::from(100u64),
        cumulative_value: U256::from(200u64),
        chain_position,
    }
}

fn proc(seed: u8) -> B256 {
    let mut h = [0u8; 32];
    h[31] = seed;
    B256::from(h)
}

fn att(order_hash_seed: u8, process_id: B256, attester: Address, schema: &[u8], stage: u8) -> AttestationEvent {
    let mut h = [0u8; 32];
    h[31] = order_hash_seed;
    AttestationEvent {
        order_hash: B256::from(h),
        process_id,
        attester,
        schema_id: schema_id(schema),
        stage,
        content_ref: B256::ZERO,
    }
}

fn budget_y2() -> U256 {
    U256::from(300_000_000u64) * U256::from(10u64).pow(U256::from(18))
}

fn default_tranche(events: &EventStream) -> figaro_rpgf::types::TrancheInput {
    build_tranche_input(events, 0, budget_y2(), 33, 100, 15, 100)
}

#[test]
fn empty_stream_produces_empty_snapshots() {
    let stream = EventStream::default();
    let input = default_tranche(&stream);
    assert_eq!(input.snapshots.len(), 0);
    assert_eq!(input.tranche_index, 0);
    assert_eq!(input.alpha_numerator, 33);
}

#[test]
fn unresolved_attestations_are_filtered_out() {
    let alice = address!("1111111111111111111111111111111111111111");
    let bob = address!("2222222222222222222222222222222222222222");
    let p = proc(1);

    let stream = EventStream {
        schemas_registered: vec![schema_reg(b"figaro-commerce-v1", alice)],
        orders_created: vec![order(1, p, alice, bob, 1)],
        processes_resolved: vec![], // ← process never resolved
        attestations: vec![att(1, p, alice, b"figaro-commerce-v1", 1)],
    };

    let input = default_tranche(&stream);
    assert_eq!(input.snapshots.len(), 0, "no resolved processes → no snapshots");
}

#[test]
fn unknown_order_hash_is_filtered_out() {
    let alice = address!("1111111111111111111111111111111111111111");
    let p = proc(1);

    let stream = EventStream {
        schemas_registered: vec![schema_reg(b"figaro-commerce-v1", alice)],
        orders_created: vec![], // ← no orders
        processes_resolved: vec![ProcessResolvedEvent { process_id: p }],
        attestations: vec![att(1, p, alice, b"figaro-commerce-v1", 1)],
    };

    let input = default_tranche(&stream);
    assert_eq!(input.snapshots.len(), 0);
}

#[test]
fn single_resolved_attestation_produces_correct_snapshot() {
    let alice = address!("1111111111111111111111111111111111111111");
    let bob = address!("2222222222222222222222222222222222222222");
    let p = proc(1);
    let author = address!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    let stream = EventStream {
        schemas_registered: vec![schema_reg(b"figaro-commerce-v1", author)],
        orders_created: vec![order(1, p, alice, bob, 1)],
        processes_resolved: vec![ProcessResolvedEvent { process_id: p }],
        attestations: vec![att(1, p, alice, b"figaro-commerce-v1", 1)],
    };

    let input = default_tranche(&stream);
    assert_eq!(input.snapshots.len(), 1);
    let s = &input.snapshots[0];
    assert_eq!(s.schema_id, schema_id(b"figaro-commerce-v1"));
    assert_eq!(s.schema_author, author);
    assert_eq!(s.resolved_attestation_count, 1);
    assert_eq!(s.distinct_processes, 1);
    assert_eq!(s.distinct_buyers, 1);
    assert_eq!(s.distinct_sellers, 1);
    assert_eq!(s.distinct_buyer_seller_pairs, 1);
    assert_eq!(s.mean_chain_position_x1e6, 1_000_000);
}

#[test]
fn distinct_pairs_counted_correctly() {
    // One schema, three orders with three distinct buyer-seller pairs.
    let alice = address!("1111111111111111111111111111111111111111");
    let bob = address!("2222222222222222222222222222222222222222");
    let carol = address!("3333333333333333333333333333333333333333");
    let dave = address!("4444444444444444444444444444444444444444");
    let p = proc(1);
    let author = address!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    let stream = EventStream {
        schemas_registered: vec![schema_reg(b"figaro-fulfilment-v2", author)],
        orders_created: vec![
            order(1, p, alice, bob, 1),
            order(2, p, alice, carol, 1),
            order(3, p, dave, carol, 1),
        ],
        processes_resolved: vec![ProcessResolvedEvent { process_id: p }],
        attestations: vec![
            att(1, p, alice, b"figaro-fulfilment-v2", 1),
            att(2, p, alice, b"figaro-fulfilment-v2", 1),
            att(3, p, dave, b"figaro-fulfilment-v2", 1),
        ],
    };

    let input = default_tranche(&stream);
    assert_eq!(input.snapshots.len(), 1);
    let s = &input.snapshots[0];
    assert_eq!(s.resolved_attestation_count, 3);
    assert_eq!(s.distinct_buyers, 2, "alice + dave");
    assert_eq!(s.distinct_sellers, 2, "bob + carol");
    assert_eq!(
        s.distinct_buyer_seller_pairs, 3,
        "(alice,bob), (alice,carol), (dave,carol)"
    );
}

#[test]
fn sybil_repeat_pair_counts_only_once_for_diversity() {
    // Same buyer-seller pair attesting 5 times under one schema —
    // pairs should remain 1 regardless of attestation count.
    let alice = address!("1111111111111111111111111111111111111111");
    let bob = address!("2222222222222222222222222222222222222222");
    let p = proc(1);
    let author = address!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    let mut orders = Vec::new();
    let mut atts = Vec::new();
    for i in 1u8..=5 {
        orders.push(order(i, p, alice, bob, 1));
        atts.push(att(i, p, alice, b"hypothetical-wash-v1", 1));
    }

    let stream = EventStream {
        schemas_registered: vec![schema_reg(b"hypothetical-wash-v1", author)],
        orders_created: orders,
        processes_resolved: vec![ProcessResolvedEvent { process_id: p }],
        attestations: atts,
    };

    let input = default_tranche(&stream);
    assert_eq!(input.snapshots[0].resolved_attestation_count, 5);
    assert_eq!(input.snapshots[0].distinct_buyers, 1);
    assert_eq!(input.snapshots[0].distinct_sellers, 1);
    assert_eq!(input.snapshots[0].distinct_buyer_seller_pairs, 1);
}

#[test]
fn multi_schema_produces_multi_snapshots() {
    let alice = address!("1111111111111111111111111111111111111111");
    let bob = address!("2222222222222222222222222222222222222222");
    let p = proc(1);
    let author_a = address!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    let author_b = address!("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

    let stream = EventStream {
        schemas_registered: vec![
            schema_reg(b"figaro-commerce-v1", author_a),
            schema_reg(b"figaro-geo-v2", author_b),
        ],
        orders_created: vec![order(1, p, alice, bob, 3)],
        processes_resolved: vec![ProcessResolvedEvent { process_id: p }],
        attestations: vec![
            att(1, p, alice, b"figaro-commerce-v1", 1),
            att(1, p, alice, b"figaro-geo-v2", 1),
        ],
    };

    let input = default_tranche(&stream);
    assert_eq!(input.snapshots.len(), 2);

    let commerce = input
        .snapshots
        .iter()
        .find(|s| s.schema_id == schema_id(b"figaro-commerce-v1"))
        .unwrap();
    let geo = input
        .snapshots
        .iter()
        .find(|s| s.schema_id == schema_id(b"figaro-geo-v2"))
        .unwrap();

    assert_eq!(commerce.schema_author, author_a);
    assert_eq!(geo.schema_author, author_b);
    assert_eq!(commerce.mean_chain_position_x1e6, 3_000_000);
    assert_eq!(geo.mean_chain_position_x1e6, 3_000_000);
}

#[test]
fn missing_schema_registration_falls_back_to_zero_address() {
    let alice = address!("1111111111111111111111111111111111111111");
    let bob = address!("2222222222222222222222222222222222222222");
    let p = proc(1);

    let stream = EventStream {
        schemas_registered: vec![], // ← author unknown
        orders_created: vec![order(1, p, alice, bob, 1)],
        processes_resolved: vec![ProcessResolvedEvent { process_id: p }],
        attestations: vec![att(1, p, alice, b"figaro-commerce-v1", 1)],
    };

    let input = default_tranche(&stream);
    assert_eq!(input.snapshots.len(), 1);
    assert_eq!(input.snapshots[0].schema_author, Address::ZERO);
}

#[test]
fn snapshots_sorted_by_schema_id_for_determinism() {
    let alice = address!("1111111111111111111111111111111111111111");
    let bob = address!("2222222222222222222222222222222222222222");
    let p = proc(1);
    let author = address!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    let stream = EventStream {
        schemas_registered: vec![
            schema_reg(b"figaro-commerce-v1", author),
            schema_reg(b"figaro-geo-v2", author),
            schema_reg(b"figaro-fulfilment-v2", author),
        ],
        orders_created: vec![order(1, p, alice, bob, 1)],
        processes_resolved: vec![ProcessResolvedEvent { process_id: p }],
        attestations: vec![
            att(1, p, alice, b"figaro-geo-v2", 1),
            att(1, p, alice, b"figaro-commerce-v1", 1),
            att(1, p, alice, b"figaro-fulfilment-v2", 1),
        ],
    };

    // Two runs should produce identical TrancheInput (modulo allocations
    // of references). We verify ordering by checking schema_id is sorted.
    let input = default_tranche(&stream);
    for i in 1..input.snapshots.len() {
        assert!(
            input.snapshots[i - 1].schema_id < input.snapshots[i].schema_id,
            "snapshots must be sorted by schema_id"
        );
    }
}

#[test]
fn end_to_end_aggregate_consumes_built_input() {
    // The library's two halves compose: build_tranche_input → aggregate.
    let alice = address!("1111111111111111111111111111111111111111");
    let bob = address!("2222222222222222222222222222222222222222");
    let p = proc(1);
    let author = address!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    let stream = EventStream {
        schemas_registered: vec![schema_reg(b"figaro-geo-v2", author)],
        orders_created: vec![order(1, p, alice, bob, 3)],
        processes_resolved: vec![ProcessResolvedEvent { process_id: p }],
        attestations: vec![att(1, p, alice, b"figaro-geo-v2", 1)],
    };

    let input = default_tranche(&stream);
    let output = aggregate(&input);

    assert_eq!(output.tranche_index, 0);
    assert_eq!(output.schema_count, 1);
    // Single-schema population → pre-cap share is 100%; the 15% cap
    // binds and total allocated = 15% of the budget. The remaining
    // 85% goes unallocated (cap is meant to bound concentration, not
    // to ensure full budget consumption).
    let expected = input.tranche_budget_wei * U256::from(15u64) / U256::from(100u64);
    assert_eq!(output.total_allocated_wei, expected);
    assert_ne!(output.merkle_root, B256::ZERO);
}
