use crate::types::{KernelStateSnapshot, ProcessState};
use alloy_primitives::{B256, U256, keccak256};
use std::collections::{BTreeMap, BTreeSet};

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
    /// (artifact, processId) already counted for RPGF on the batch path.
    /// Under the root because idempotence is guest-owned — see
    /// `KernelStateSnapshot`.
    pub usage_counted: BTreeSet<(B256, B256)>,
    /// (artifact, period, pairKey) — breadth counted per period.
    pub usage_pair_seen: BTreeSet<(B256, u8, B256)>,
    /// (artifact, period) → (c, d), the running batch-path accrual.
    pub usage_accrual: BTreeMap<(B256, u8), (u64, u64)>,
}

impl KernelState {
    pub fn new() -> Self {
        Self {
            processes: BTreeMap::new(),
            order_status: BTreeMap::new(),
            order_process_id: BTreeMap::new(),
            usage_counted: BTreeSet::new(),
            usage_pair_seen: BTreeSet::new(),
            usage_accrual: BTreeMap::new(),
        }
    }

    /// Export to a deterministic, serializable snapshot.
    pub fn to_snapshot(&self) -> KernelStateSnapshot {
        KernelStateSnapshot {
            processes: self.processes.iter().map(|(k, v)| (*k, v.clone())).collect(),
            order_status: self.order_status.iter().map(|(k, v)| (*k, *v)).collect(),
            order_process_id: self.order_process_id.iter().map(|(k, v)| (*k, *v)).collect(),
            usage_counted: self.usage_counted.iter().copied().collect(),
            usage_pair_seen: self.usage_pair_seen.iter().copied().collect(),
            usage_accrual: self.usage_accrual.iter().map(|(k, v)| (*k, *v)).collect(),
        }
    }

    /// Hydrate from a deterministic snapshot.
    pub fn from_snapshot(snap: &KernelStateSnapshot) -> Self {
        Self {
            processes: snap.processes.iter().cloned().collect(),
            order_status: snap.order_status.iter().cloned().collect(),
            order_process_id: snap.order_process_id.iter().cloned().collect(),
            usage_counted: snap.usage_counted.iter().copied().collect(),
            usage_pair_seen: snap.usage_pair_seen.iter().copied().collect(),
            usage_accrual: snap.usage_accrual.iter().copied().collect(),
        }
    }

    /// Compute deterministic state root.
    ///
    /// `root = keccak256(processes_hash || status_hash || process_id_hash
    ///                   || usage_hash)`
    ///
    /// The usage leg is what makes batch-path idempotence provable: the
    /// counted set, the per-period pair set, and the running accrual are
    /// all bound by the root, so a replayed claim cannot produce a valid
    /// transition from the current root.
    pub fn compute_root(&self) -> B256 {
        let ph = self.hash_processes();
        let sh = self.hash_order_status();
        let oh = self.hash_order_process_id();
        let uh = self.hash_usage();

        let mut data = Vec::with_capacity(128);
        data.extend_from_slice(ph.as_slice());
        data.extend_from_slice(sh.as_slice());
        data.extend_from_slice(oh.as_slice());
        data.extend_from_slice(uh.as_slice());
        keccak256(&data)
    }

    /// Hash the three usage maps into one word. Each section is
    /// length-prefixed so the concatenation cannot be re-split — the
    /// records are 64, 65 and 49 bytes wide, which without the prefixes
    /// would admit collisions between different splits.
    fn hash_usage(&self) -> B256 {
        let mut data = Vec::new();

        data.extend_from_slice(&(self.usage_counted.len() as u64).to_be_bytes());
        for (artifact, process_id) in &self.usage_counted {
            data.extend_from_slice(artifact.as_slice());
            data.extend_from_slice(process_id.as_slice());
        }

        data.extend_from_slice(&(self.usage_pair_seen.len() as u64).to_be_bytes());
        for (artifact, period, pair_key) in &self.usage_pair_seen {
            data.extend_from_slice(artifact.as_slice());
            data.push(*period);
            data.extend_from_slice(pair_key.as_slice());
        }

        data.extend_from_slice(&(self.usage_accrual.len() as u64).to_be_bytes());
        for ((artifact, period), (c, d)) in &self.usage_accrual {
            data.extend_from_slice(artifact.as_slice());
            data.push(*period);
            data.extend_from_slice(&c.to_be_bytes());
            data.extend_from_slice(&d.to_be_bytes());
        }

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
