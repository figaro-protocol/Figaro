use crate::types::{KernelStateSnapshot, ProcessState};
use alloy_primitives::{Address, B256, U256, keccak256};
use std::collections::BTreeMap;

/// Working kernel state with indexed mappings.
/// Uses BTreeMap for deterministic iteration order.
#[derive(Clone)]
pub struct KernelState {
    // FigaroCore
    pub processes: BTreeMap<B256, ProcessState>,
    pub order_status: BTreeMap<B256, u8>,
    pub order_process_id: BTreeMap<B256, B256>,
    // SchemaRegistry
    pub schemas_registered: BTreeMap<B256, bool>,
    // OperatorRegistry — dedup guard only (web2-strip 2026-04-26).
    // Lifecycle flags + role storage removed; role + metadata travel only
    // in the OperatorRegistered event.
    pub operators_registered: BTreeMap<Address, bool>,
    // FIG emission
    pub emission_settlement_count: u64,
    pub emission_total_emitted: U256,
}

impl KernelState {
    pub fn new() -> Self {
        Self {
            processes: BTreeMap::new(),
            order_status: BTreeMap::new(),
            order_process_id: BTreeMap::new(),
            schemas_registered: BTreeMap::new(),
            operators_registered: BTreeMap::new(),
            emission_settlement_count: 0,
            emission_total_emitted: U256::ZERO,
        }
    }

    /// Export to a deterministic, serializable snapshot.
    pub fn to_snapshot(&self) -> KernelStateSnapshot {
        KernelStateSnapshot {
            processes: self.processes.iter().map(|(k, v)| (*k, v.clone())).collect(),
            order_status: self.order_status.iter().map(|(k, v)| (*k, *v)).collect(),
            order_process_id: self.order_process_id.iter().map(|(k, v)| (*k, *v)).collect(),
            schemas_registered: self.schemas_registered.iter().map(|(k, v)| (*k, *v)).collect(),
            operators_registered: self
                .operators_registered
                .iter()
                .map(|(k, v)| (*k, *v))
                .collect(),
            emission_settlement_count: self.emission_settlement_count,
            emission_total_emitted: self.emission_total_emitted,
        }
    }

    /// Hydrate from a deterministic snapshot.
    pub fn from_snapshot(snap: &KernelStateSnapshot) -> Self {
        Self {
            processes: snap.processes.iter().cloned().collect(),
            order_status: snap.order_status.iter().cloned().collect(),
            order_process_id: snap.order_process_id.iter().cloned().collect(),
            schemas_registered: snap.schemas_registered.iter().cloned().collect(),
            operators_registered: snap.operators_registered.iter().cloned().collect(),
            emission_settlement_count: snap.emission_settlement_count,
            emission_total_emitted: snap.emission_total_emitted,
        }
    }

    /// Compute deterministic state root.
    ///
    /// `root = keccak256(processes_hash || status_hash || process_id_hash
    ///                    || schemas_hash || operators_hash || emission_hash)`
    pub fn compute_root(&self) -> B256 {
        let ph = self.hash_processes();
        let sh = self.hash_order_status();
        let oh = self.hash_order_process_id();
        let sch = self.hash_schemas();
        let oph = self.hash_operators_registered();
        let emh = self.hash_emission();

        let mut data = Vec::with_capacity(192);
        data.extend_from_slice(ph.as_slice());
        data.extend_from_slice(sh.as_slice());
        data.extend_from_slice(oh.as_slice());
        data.extend_from_slice(sch.as_slice());
        data.extend_from_slice(oph.as_slice());
        data.extend_from_slice(emh.as_slice());
        keccak256(&data)
    }

    fn hash_processes(&self) -> B256 {
        let mut data = Vec::new();
        for (k, v) in &self.processes {
            data.extend_from_slice(k.as_slice());
            // ABI-encode each field as 32-byte words.
            let mut buyer_word = [0u8; 32];
            buyer_word[12..].copy_from_slice(v.root_buyer.as_slice());
            data.extend_from_slice(&buyer_word);

            let mut currency_word = [0u8; 32];
            currency_word[12..].copy_from_slice(v.currency.as_slice());
            data.extend_from_slice(&currency_word);

            data.extend_from_slice(&v.cumulative_value.to_be_bytes::<32>());
            data.extend_from_slice(&U256::from(v.active_order_count).to_be_bytes::<32>());
        }
        keccak256(&data)
    }

    fn hash_order_status(&self) -> B256 {
        let mut data = Vec::new();
        for (k, v) in &self.order_status {
            data.extend_from_slice(k.as_slice());
            data.push(*v);
        }
        keccak256(&data)
    }

    fn hash_order_process_id(&self) -> B256 {
        let mut data = Vec::new();
        for (k, v) in &self.order_process_id {
            data.extend_from_slice(k.as_slice());
            data.extend_from_slice(v.as_slice());
        }
        keccak256(&data)
    }

    fn hash_schemas(&self) -> B256 {
        let mut data = Vec::new();
        for (k, v) in &self.schemas_registered {
            data.extend_from_slice(k.as_slice());
            data.push(if *v { 1 } else { 0 });
        }
        keccak256(&data)
    }

    fn hash_operators_registered(&self) -> B256 {
        let mut data = Vec::new();
        for (k, v) in &self.operators_registered {
            let mut addr_word = [0u8; 32];
            addr_word[12..].copy_from_slice(k.as_slice());
            data.extend_from_slice(&addr_word);
            data.push(if *v { 1 } else { 0 });
        }
        keccak256(&data)
    }

    fn hash_emission(&self) -> B256 {
        let mut data = Vec::with_capacity(40);
        data.extend_from_slice(&self.emission_settlement_count.to_be_bytes());
        data.extend_from_slice(&self.emission_total_emitted.to_be_bytes::<32>());
        keccak256(&data)
    }
}

impl Default for KernelState {
    fn default() -> Self {
        Self::new()
    }
}
