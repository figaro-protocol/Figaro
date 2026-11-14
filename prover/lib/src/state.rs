use crate::state_tree;
use crate::types::{KernelError, KernelStateSnapshot, ProcessState, StateWitness};
use alloy_primitives::{keccak256, B256};
use std::sync::Mutex;
use std::collections::{BTreeMap, BTreeSet};

/// A process leaf's tag in the state tree.
pub const PROCESS_TAG: u8 = 0x01;
/// An order leaf's tag: one leaf per order, its status.
pub const ORDER_TAG: u8 = 0x02;

/// A leaf's path in the state tree: `keccak256(tag ‖ key)`.
pub fn leaf_path(tag: u8, key: &B256) -> B256 {
    let mut data = [0u8; 33];
    data[0] = tag;
    data[1..].copy_from_slice(key.as_slice());
    keccak256(data)
}

/// A process leaf's value hash: `keccak256(root buyer ‖ currency ‖
/// cumulative value ‖ active order count)` — 20, 20, 32 and 8 bytes.
pub fn process_value_hash(ps: &ProcessState) -> B256 {
    let mut data = [0u8; 80];
    data[..20].copy_from_slice(ps.root_buyer.as_slice());
    data[20..40].copy_from_slice(ps.currency.as_slice());
    data[40..72].copy_from_slice(&ps.cumulative_value.to_be_bytes::<32>());
    data[72..80].copy_from_slice(&ps.active_order_count.to_be_bytes());
    keccak256(data)
}

/// An order leaf's value hash: `keccak256(status)` — 1 byte. The order's
/// hash, its key, already binds its process.
pub fn order_value_hash(status: u8) -> B256 {
    keccak256([status])
}

/// Working mirror state with indexed mappings — the FigaroCore mappings
/// only. Registry state (clauses, members, assemblies) is NOT mirrored:
/// registry mutations stay on the direct path, and the clause gates bind
/// witness specs to the live `ClauseRegistry` via the verifier-checked
/// spec bindings instead of proven registry state.
///
/// Two modes. The relay and the rebuild hold every entry (`new`,
/// `from_snapshot`): any key not in a map is absent. The guest holds only
/// the entries its batch touches (`from_witness`): an access to any other
/// key is `KernelError::UnwitnessedKey`, never an absence. Every access goes
/// through the accessors below, which also note the keys touched, so the
/// relay learns which entries a batch's witness must carry.
///
/// Uses BTreeMap for deterministic iteration order.
pub struct KernelState {
    // Private: every read and write goes through the accessors, which hold
    // the guest to its witness; a direct read would take an unwitnessed key
    // as absent.
    processes: BTreeMap<B256, ProcessState>,
    order_status: BTreeMap<B256, u8>,
    witnessed: Option<BTreeSet<(u8, B256)>>,
    touched: Mutex<BTreeSet<(u8, B256)>>,
}

impl Clone for KernelState {
    fn clone(&self) -> Self {
        Self {
            processes: self.processes.clone(),
            order_status: self.order_status.clone(),
            witnessed: self.witnessed.clone(),
            touched: Mutex::new(self.touched()),
        }
    }
}

impl KernelState {
    pub fn new() -> Self {
        Self {
            processes: BTreeMap::new(),
            order_status: BTreeMap::new(),
            witnessed: None,
            touched: Mutex::new(BTreeSet::new()),
        }
    }

    /// Export to a deterministic, serializable snapshot.
    pub fn to_snapshot(&self) -> KernelStateSnapshot {
        KernelStateSnapshot {
            processes: self.processes.iter().map(|(k, v)| (*k, v.clone())).collect(),
            order_status: self.order_status.iter().map(|(k, v)| (*k, *v)).collect(),
        }
    }

    /// Hydrate from a deterministic snapshot.
    pub fn from_snapshot(snap: &KernelStateSnapshot) -> Self {
        Self {
            processes: snap.processes.iter().cloned().collect(),
            order_status: snap.order_status.iter().cloned().collect(),
            witnessed: None,
            touched: Mutex::new(BTreeSet::new()),
        }
    }

    /// The guest's state: the witnessed entries only. A key carried twice is
    /// refused.
    pub fn from_witness(w: &StateWitness) -> Result<Self, KernelError> {
        let mut state = Self::new();
        let mut keys = BTreeSet::new();
        for (id, ps) in &w.processes {
            if !keys.insert((PROCESS_TAG, *id)) {
                return Err(KernelError::DuplicateWitnessEntry);
            }
            if let Some(ps) = ps {
                state.processes.insert(*id, ps.clone());
            }
        }
        for (hash, order) in &w.orders {
            if !keys.insert((ORDER_TAG, *hash)) {
                return Err(KernelError::DuplicateWitnessEntry);
            }
            if let Some(status) = order {
                state.order_status.insert(*hash, *status);
            }
        }
        state.witnessed = Some(keys);
        Ok(state)
    }

    fn touch(&self, tag: u8, key: &B256) -> Result<(), KernelError> {
        if let Some(witnessed) = &self.witnessed {
            if !witnessed.contains(&(tag, *key)) {
                return Err(KernelError::UnwitnessedKey);
            }
        }
        self.touched.lock().unwrap_or_else(|e| e.into_inner()).insert((tag, *key));
        Ok(())
    }

    /// The processes of a full state (the relay's, a test's); `None` for the
    /// guest's witnessed state, whose maps hold only what it was given.
    pub fn full_processes(&self) -> Option<&BTreeMap<B256, ProcessState>> {
        self.witnessed.is_none().then_some(&self.processes)
    }

    /// The keys every access so far has touched.
    pub fn touched(&self) -> BTreeSet<(u8, B256)> {
        self.touched.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn process(&self, id: &B256) -> Result<Option<&ProcessState>, KernelError> {
        self.touch(PROCESS_TAG, id)?;
        Ok(self.processes.get(id))
    }

    pub fn process_mut(&mut self, id: &B256) -> Result<Option<&mut ProcessState>, KernelError> {
        self.touch(PROCESS_TAG, id)?;
        Ok(self.processes.get_mut(id))
    }

    pub fn insert_process(&mut self, id: B256, ps: ProcessState) -> Result<(), KernelError> {
        self.touch(PROCESS_TAG, &id)?;
        self.processes.insert(id, ps);
        Ok(())
    }

    /// An order's status, 0 when it is absent.
    pub fn order_status_of(&self, order_hash: &B256) -> Result<u8, KernelError> {
        self.touch(ORDER_TAG, order_hash)?;
        Ok(self.order_status.get(order_hash).copied().unwrap_or(0))
    }

    /// An order's new status: a committed order's first, a known order's next.
    pub fn set_order_status(&mut self, order_hash: B256, status: u8) -> Result<(), KernelError> {
        self.touch(ORDER_TAG, &order_hash)?;
        self.order_status.insert(order_hash, status);
        Ok(())
    }

    /// The value hash of the leaf at (tag, key) in this state, `None` when
    /// absent.
    pub fn leaf_value_hash(&self, tag: u8, key: &B256) -> Option<B256> {
        match tag {
            PROCESS_TAG => self.processes.get(key).map(process_value_hash),
            _ => self.order_status.get(key).map(|status| order_value_hash(*status)),
        }
    }

    /// Every leaf of the state tree: path → value hash.
    pub fn leaves(&self) -> BTreeMap<B256, B256> {
        let mut leaves = BTreeMap::new();
        for (id, ps) in &self.processes {
            leaves.insert(leaf_path(PROCESS_TAG, id), process_value_hash(ps));
        }
        for (hash, status) in &self.order_status {
            leaves.insert(leaf_path(ORDER_TAG, hash), order_value_hash(*status));
        }
        leaves
    }

    /// The witness of `keys` against this (full) state: each entry's value
    /// and the tree's proof for their paths.
    pub fn witness_for(&self, keys: &BTreeSet<(u8, B256)>) -> StateWitness {
        let mut processes = Vec::new();
        let mut orders = Vec::new();
        for (tag, key) in keys {
            if *tag == PROCESS_TAG {
                processes.push((*key, self.processes.get(key).cloned()));
            } else {
                orders.push((*key, self.order_status.get(key).copied()));
            }
        }
        let mut paths: Vec<B256> = keys.iter().map(|(t, k)| leaf_path(*t, k)).collect();
        paths.sort();
        StateWitness { processes, orders, proof: state_tree::prove(&self.leaves(), &paths) }
    }

    /// The state root: the root of the state tree over every entry this
    /// state holds (`crate::state_tree`). Meaningful for a full state; the
    /// guest computes its roots from the witness.
    pub fn compute_root(&self) -> B256 {
        state_tree::root(&self.leaves())
    }
}

impl Default for KernelState {
    fn default() -> Self {
        Self::new()
    }
}
