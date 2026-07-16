use crate::types::{KernelStateSnapshot, ProcessState};
use alloy_primitives::{B256, U256, keccak256};
use std::collections::BTreeMap;

/// Working kernel state with indexed mappings — the FigaroCore mappings
/// only. Registry state (clauses, sellers, assemblies) is NOT mirrored:
/// registry mutations stay on the direct path, and the clause gates bind
/// witness specs to the live `ClauseRegistry` via the verifier-checked
/// spec bindings instead of proven registry state.
///
/// Uses BTreeMap for deterministic iteration order.
#[derive(Clone)]
pub struct KernelState {
    pub processes: BTreeMap<B256, ProcessState>,
    pub order_status: BTreeMap<B256, u8>,
    pub order_process_id: BTreeMap<B256, B256>,
}

impl KernelState {
    pub fn new() -> Self {
        Self {
            processes: BTreeMap::new(),
            order_status: BTreeMap::new(),
            order_process_id: BTreeMap::new(),
        }
    }

    /// Export to a deterministic, serializable snapshot.
    pub fn to_snapshot(&self) -> KernelStateSnapshot {
        KernelStateSnapshot {
            processes: self.processes.iter().map(|(k, v)| (*k, v.clone())).collect(),
            order_status: self.order_status.iter().map(|(k, v)| (*k, *v)).collect(),
            order_process_id: self.order_process_id.iter().map(|(k, v)| (*k, *v)).collect(),
        }
    }

    /// Hydrate from a deterministic snapshot.
    pub fn from_snapshot(snap: &KernelStateSnapshot) -> Self {
        Self {
            processes: snap.processes.iter().cloned().collect(),
            order_status: snap.order_status.iter().cloned().collect(),
            order_process_id: snap.order_process_id.iter().cloned().collect(),
        }
    }

    /// Compute deterministic state root.
    ///
    /// `root = keccak256(processes_hash || status_hash || process_id_hash)`
    pub fn compute_root(&self) -> B256 {
        let ph = self.hash_processes();
        let sh = self.hash_order_status();
        let oh = self.hash_order_process_id();

        let mut data = Vec::with_capacity(96);
        data.extend_from_slice(ph.as_slice());
        data.extend_from_slice(sh.as_slice());
        data.extend_from_slice(oh.as_slice());
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
}

impl Default for KernelState {
    fn default() -> Self {
        Self::new()
    }
}
