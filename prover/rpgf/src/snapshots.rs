use std::collections::{HashMap, HashSet};

use alloy_primitives::{Address, B256, U256};

use crate::events::{AttestationEvent, EventStream, OrderCreatedEvent};
use crate::types::{ClauseSnapshot, TrancheInput};

/// Per-clause running totals during a single aggregation pass.
#[derive(Default)]
struct ClauseAccumulator {
    attestation_count: u64,
    processes: HashSet<B256>,
    buyers: HashSet<Address>,
    sellers: HashSet<Address>,
    pairs: HashSet<(Address, Address)>,
    stages: HashSet<u8>,
    total_chain_position_weight: u64,
}

impl ClauseAccumulator {
    fn add(&mut self, order: &OrderCreatedEvent, attestation: &AttestationEvent) {
        self.attestation_count += 1;
        self.processes.insert(order.process_id);
        self.buyers.insert(order.buyer);
        self.sellers.insert(order.seller);
        self.pairs.insert((order.buyer, order.seller));
        self.stages.insert(attestation.stage);
        self.total_chain_position_weight += order.chain_position as u64;
    }

    fn into_snapshot(self, clause_id: B256, clause_author: Address, family: B256) -> ClauseSnapshot {
        let attestation_count = self.attestation_count;
        let mean_chain_position_x1e6 = if attestation_count > 0 {
            (self.total_chain_position_weight.saturating_mul(1_000_000)) / attestation_count
        } else {
            0
        };
        ClauseSnapshot {
            clause_id,
            clause_author,
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
/// `HashMap`/`HashSet`, and the result is sorted by `clause_id` so
/// downstream Merkle-root construction is also deterministic.
///
/// Filter chain:
/// 1. An attestation only counts if its `order_hash` resolves to a
///    known `OrderCreated`.
/// 2. The enclosing order's `process_id` must appear in
///    `processes_resolved` — matches the V5 formula's resolved-only
///    filter.
/// 3. Each per-clause accumulator records distinct buyers / sellers /
///    pairs / processes / stages plus a chain-position-weight sum.
/// 4. `clause_author` is looked up from `clauses_registered`. If the
///    clause's registration event is missing from the stream, the
///    accumulated allocation is attributed to `Address::ZERO` —
///    documented signal that the upstream decoder is incomplete.
///
/// Clauses with no resolved attestations in the window do NOT produce a
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

    let clause_author: HashMap<B256, Address> = events
        .clauses_registered
        .iter()
        .map(|s| (s.clause_id, s.registrar))
        .collect();

    let clause_family: HashMap<B256, B256> = events
        .clauses_registered
        .iter()
        .map(|s| (s.clause_id, s.family))
        .collect();

    let mut per_clause: HashMap<B256, ClauseAccumulator> = HashMap::new();

    for att in &events.attestations {
        let order = match order_by_hash.get(&att.order_hash) {
            Some(o) => *o,
            None => continue,
        };
        if !resolved_processes.contains(&order.process_id) {
            continue;
        }
        per_clause.entry(att.clause_id).or_default().add(order, att);
    }

    let mut snapshots: Vec<ClauseSnapshot> = per_clause
        .into_iter()
        .map(|(clause_id, acc)| {
            let author = clause_author.get(&clause_id).copied().unwrap_or(Address::ZERO);
            let family = clause_family.get(&clause_id).copied().unwrap_or(B256::ZERO);
            acc.into_snapshot(clause_id, author, family)
        })
        .collect();

    snapshots.sort_by_key(|s| s.clause_id);

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
