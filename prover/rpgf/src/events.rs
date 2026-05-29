use alloy_primitives::{Address, B256, U256};
use serde::{Deserialize, Serialize};

/// Mirrors `ClauseRegistry.ClauseRegistered` (also re-emitted by
/// `FigaroBatchVerifier`). The `registrar` field is the `clauseAuthor` —
/// the first-write-wins wallet that called `registerClause`, and the
/// recipient of any RPGF allocation for this clauseId. `family` is the
/// permanent family tag bound to the clause at registration; the RPGF
/// formula reads `family` (not `clause_id`) to decide Tier-1 weighting,
/// so a new clause joining an existing Tier-1 family inherits the boost
/// without redeploying the FIG system.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClauseRegisteredEvent {
    pub clause_id: B256,
    pub version: u64,
    pub uri_hash: B256,
    pub family: B256,
    pub registrar: Address,
}

/// Mirrors the kernel `OrderCreated` event. `chain_position` is 1-indexed:
/// root order = 1; sub-orders go deeper. Derivation from on-chain state
/// (via `parentOrderIds` traversal) is the off-chain decoder's job; the
/// aggregator library takes the resolved value as input.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct OrderCreatedEvent {
    pub order_hash: B256,
    pub process_id: B256,
    pub buyer: Address,
    pub seller: Address,
    pub currency: Address,
    pub payment: U256,
    pub cumulative_value: U256,
    pub chain_position: u32,
}

/// Mirrors the kernel `ProcessResolved` event. Used as the filter for
/// resolved-only attestation aggregation — only attestations whose
/// enclosing order's process appears here count toward the substrate-
/// broadening score (the V5 formula's resolved-only filter).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcessResolvedEvent {
    pub process_id: B256,
}

/// Mirrors `AttestationCoordinator.Attestation`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AttestationEvent {
    pub order_hash: B256,
    pub process_id: B256,
    pub attester: Address,
    pub clause_id: B256,
    pub stage: u8,
    pub content_ref: B256,
}

/// A complete window of events for a single tranche's aggregation. The
/// off-chain decoder collects events from the chain over the tranche
/// window, populates this struct, and feeds it to `build_tranche_input`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct EventStream {
    pub clauses_registered: Vec<ClauseRegisteredEvent>,
    pub orders_created: Vec<OrderCreatedEvent>,
    pub processes_resolved: Vec<ProcessResolvedEvent>,
    pub attestations: Vec<AttestationEvent>,
}
