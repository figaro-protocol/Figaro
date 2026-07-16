/// Local state mirror — tracks the kernel state by replaying batches.
///
/// The sequencer maintains a local copy of the kernel state so it can:
/// 1. Supply `prev_state` to the prover
/// 2. Perform state-dependent pre-checks
/// 3. Detect divergence from on-chain state root
use std::sync::Arc;
use tokio::sync::RwLock;

use alloy_primitives::B256;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::KernelStateSnapshot;

/// Thread-safe wrapper around the local kernel state.
#[derive(Clone)]
pub struct StateMirror {
    inner: Arc<RwLock<StateMirrorInner>>,
}

struct StateMirrorInner {
    state: KernelState,
    state_root: B256,
}

impl StateMirror {
    /// Create a new state mirror from a genesis (empty) state.
    pub fn genesis() -> Self {
        let state = KernelState::default();
        let state_root = state.compute_root();
        Self {
            inner: Arc::new(RwLock::new(StateMirrorInner { state, state_root })),
        }
    }

    /// Create from an existing snapshot (e.g., loaded from disk or synced from chain).
    pub fn from_snapshot(snapshot: KernelStateSnapshot) -> Self {
        let state = KernelState::from_snapshot(&snapshot);
        let state_root = state.compute_root();
        Self {
            inner: Arc::new(RwLock::new(StateMirrorInner { state, state_root })),
        }
    }

    /// Get the current state root.
    pub async fn state_root(&self) -> B256 {
        self.inner.read().await.state_root
    }

    /// Export the current state as a snapshot (for BatchInput.prev_state).
    pub async fn snapshot(&self) -> KernelStateSnapshot {
        self.inner.read().await.state.to_snapshot()
    }

    /// Advance the local state by applying a batch.
    /// Updates both the state and the cached state root.
    pub async fn advance(&self, new_state: KernelState) {
        let new_root = new_state.compute_root();
        let mut inner = self.inner.write().await;
        inner.state = new_state;
        inner.state_root = new_root;
    }
}
