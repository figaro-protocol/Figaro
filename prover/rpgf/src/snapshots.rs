use std::collections::{HashMap, HashSet};

use alloy_primitives::{Address, B256, U256};

use crate::events::{AttestationEvent, EventStream, OrderCreatedEvent};
use crate::types::{SchemaSnapshot, TrancheInput};

/// Per-schema running totals during a single aggregation pass.
#[derive(Default)]
struct SchemaAccumulator {
    attestation_count: u64,
    processes: HashSet<B256>,
    buyers: HashSet<Address>,
    sellers: HashSet<Address>,
    pairs: HashSet<(Address, Address)>,
    stages: HashSet<u8>,
    total_chain_position_weight: u64,
}

impl SchemaAccumulator {
    fn add(&mut self, order: &OrderCreatedEvent, attestation: &AttestationEvent) {
        self.attestation_count += 1;
        self.processes.insert(order.process_id);
        self.buyers.insert(order.buyer);
        self.sellers.insert(order.seller);
        self.pairs.insert((order.buyer, order.seller));
        self.stages.insert(attestation.stage);
        self.total_chain_position_weight += order.chain_position as u64;
    }

    fn into_snapshot(self, schema_id: B256, schema_author: Address, family: B256) -> SchemaSnapshot {
        let attestation_count = self.attestation_count;
        let mean_chain_position_x1e6 = if attestation_count > 0 {
            (self.total_chain_position_weight.saturating_mul(1_000_000)) / attestation_count
        } else {
            0
        };
        SchemaSnapshot {
            schema_id,
            schema_author,
            family,
            resolved_attestation_count: attestation_count,
            distinct_processes: self.processes.len() as u64,
            distinct_attestation_stages: self.stages.len() as u8,
            distinct_buyers: self.buyers.len() as u64,
            distinct_sellers: self.sellers.len() as u64,
            distinct_buyer_seller_pairs: self.pairs.len() as u64,
            total_chain_position_weight: self.total_chain_position_weight,
            mean_chain_position_x1e6,
        }
    }
}

/// Turn a window of on-chain events into the `TrancheInput` consumed by
/// the SP1 program. Pure function: deterministic for any given input
/// `EventStream`. Order-of-events insensitive — all aggregation is via
/// `HashMap`/`HashSet`, and the result is sorted by `schema_id` so
/// downstream Merkle-root construction is also deterministic.
///
/// Filter chain:
/// 1. An attestation only counts if its `order_hash` resolves to a
///    known `OrderCreated`.
/// 2. The enclosing order's `process_id` must appear in
///    `processes_resolved` — matches the V5 formula's resolved-only
///    filter.
/// 3. Each per-schema accumulator records distinct buyers / sellers /
///    pairs / processes / stages plus a chain-position-weight sum.
/// 4. `schema_author` is looked up from `schemas_registered`. If the
///    schema's registration event is missing from the stream, the
///    accumulated allocation is attributed to `Address::ZERO` —
///    documented signal that the upstream decoder is incomplete.
///
/// Schemas with no resolved attestations in the window do NOT produce a
/// snapshot — they receive zero allocation by absence rather than by a
/// zero-valued entry.
pub fn build_tranche_input(
    events: &EventStream,
    tranche_index: u8,
    tranche_budget_wei: U256,
    alpha_numerator: u32,
    alpha_denominator: u32,
    cap_numerator: u32,
    cap_denominator: u32,
) -> TrancheInput {
    let order_by_hash: HashMap<B256, &OrderCreatedEvent> = events
        .orders_created
        .iter()
        .map(|o| (o.order_hash, o))
        .collect();

    let resolved_processes: HashSet<B256> = events
        .processes_resolved
        .iter()
        .map(|p| p.process_id)
        .collect();

    let schema_author: HashMap<B256, Address> = events
        .schemas_registered
        .iter()
        .map(|s| (s.schema_id, s.registrar))
        .collect();

    let schema_family: HashMap<B256, B256> = events
        .schemas_registered
        .iter()
        .map(|s| (s.schema_id, s.family))
        .collect();

    let mut per_schema: HashMap<B256, SchemaAccumulator> = HashMap::new();

    for att in &events.attestations {
        let order = match order_by_hash.get(&att.order_hash) {
            Some(o) => *o,
            None => continue,
        };
        if !resolved_processes.contains(&order.process_id) {
            continue;
        }
        per_schema.entry(att.schema_id).or_default().add(order, att);
    }

    let mut snapshots: Vec<SchemaSnapshot> = per_schema
        .into_iter()
        .map(|(schema_id, acc)| {
            let author = schema_author.get(&schema_id).copied().unwrap_or(Address::ZERO);
            let family = schema_family.get(&schema_id).copied().unwrap_or(B256::ZERO);
            acc.into_snapshot(schema_id, author, family)
        })
        .collect();

    snapshots.sort_by_key(|s| s.schema_id);

    TrancheInput {
        tranche_index,
        tranche_budget_wei,
        alpha_numerator,
        alpha_denominator,
        cap_numerator,
        cap_denominator,
        snapshots,
    }
}
