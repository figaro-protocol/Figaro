/// Local state mirror — tracks the guest state by replaying batches.
///
/// The sequencer maintains a local copy of the guest state so it can:
/// 1. Supply `prev_state` to the prover
/// 2. Perform state-dependent pre-checks
/// 3. Detect divergence from on-chain state root
///
/// The verifier holds a root; this state is the root's preimage, and a bond
/// committed on the batch path is refunded only by a batch built on it. So
/// the state is kept on disk ([`StateStore`]): every state a batch of this
/// relay can make the verifier's is written before that batch is sent and
/// held for as long as the batch can land, and the relay builds only on a
/// held state whose root is the verifier's ([`held_state_for`]).
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::sync::{Mutex, RwLock};
use tracing::warn;

use alloy_primitives::B256;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::KernelStateSnapshot;
use serde::{Deserialize, Serialize};

use crate::archive::BatchRecord;

/// Thread-safe wrapper around the local guest state.
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

// ── The state on disk ─────────────────────────────────────────────

/// The state one batch produces, held from before the batch is sent for as
/// long as the batch can land.
///
/// A batch can land without this relay: `settleBatch` is permissionless and
/// a sent transaction's proof is public, so a batch the chain refused once
/// (a bond that did not fund) can be sent again by anyone while the
/// verifier's root is the batch's previous root. Its state is therefore
/// never dropped because a transaction failed — only because the verifier's
/// root has moved off that previous root ([`StateStore::keep`]).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NextState {
    /// The root the verifier holds once the batch lands.
    pub root: B256,
    pub state: KernelStateSnapshot,
    /// What the batch publishes once it lands. `batch` and `resolution_tx`
    /// are set then.
    pub record: BatchRecord,
}

/// The relay's state on disk: the kept state at `path`, and beside it a
/// journal (`<path>.next.jsonl`) of the states of batches that can still
/// land. With no path both live in memory and a restart loses them.
#[derive(Clone)]
pub struct StateStore {
    inner: Arc<Mutex<StateStoreInner>>,
}

struct StateStoreInner {
    path: Option<PathBuf>,
    next: Vec<NextState>,
}

fn next_journal(path: &Path) -> PathBuf {
    let mut name = path.to_path_buf().into_os_string();
    name.push(".next.jsonl");
    name.into()
}

/// Write `bytes` to `path` whole or not at all: a sibling file, synced,
/// renamed over it, and the directory synced so the rename survives a power
/// loss.
async fn write_whole(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut tmp = path.to_path_buf().into_os_string();
    tmp.push(".tmp");
    let tmp: PathBuf = tmp.into();
    let mut file = tokio::fs::File::create(&tmp).await?;
    file.write_all(bytes).await?;
    file.sync_all().await?;
    drop(file);
    tokio::fs::rename(&tmp, path).await?;
    let dir = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };
    tokio::fs::File::open(dir).await?.sync_all().await
}

impl StateStore {
    /// Open the store and read what it holds: the kept state, if any, is
    /// returned for the mirror to start from; the journal's states stay in
    /// the store. A file that is there and cannot be read whole is an
    /// error, never a silent start from less than this host holds: both
    /// files are written whole, so a record that does not parse is damage.
    pub async fn open(path: Option<PathBuf>) -> Result<(Self, Option<KernelStateSnapshot>), String> {
        let mut kept = None;
        let mut next = Vec::new();
        if let Some(path) = &path {
            match tokio::fs::read(path).await {
                Ok(bytes) => {
                    kept = Some(serde_json::from_slice(&bytes).map_err(|e| {
                        format!("the state file {} does not parse: {e}", path.display())
                    })?);
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => {
                    return Err(format!("the state file {} cannot be read: {e}", path.display()))
                }
            }
            let journal = next_journal(path);
            match tokio::fs::read_to_string(&journal).await {
                Ok(contents) => {
                    for line in contents.lines().filter(|l| !l.trim().is_empty()) {
                        next.push(serde_json::from_str::<NextState>(line).map_err(|e| {
                            format!(
                                "the next-state journal {} does not parse: {e}",
                                journal.display()
                            )
                        })?);
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => {
                    return Err(format!(
                        "the next-state journal {} cannot be read: {e}",
                        journal.display()
                    ))
                }
            }
        }
        let store = Self {
            inner: Arc::new(Mutex::new(StateStoreInner { path, next })),
        };
        Ok((store, kept))
    }

    /// Hold the state a batch produces. Called BEFORE the batch is sent; an
    /// error here means the batch must not be sent.
    ///
    /// A root already held stays as it is: the root binds the state.
    pub async fn hold_next(&self, entry: NextState) -> std::io::Result<()> {
        let mut inner = self.inner.lock().await;
        if inner.next.iter().any(|n| n.root == entry.root) {
            return Ok(());
        }
        inner.next.push(entry);
        if let Err(e) = inner.write_journal().await {
            inner.next.pop();
            return Err(e);
        }
        Ok(())
    }

    /// The held next state with this root, if any.
    pub async fn next_for(&self, root: B256) -> Option<NextState> {
        let inner = self.inner.lock().await;
        inner.next.iter().find(|n| n.root == root).cloned()
    }

    /// Roots of the held next states.
    pub async fn next_roots(&self) -> Vec<B256> {
        self.inner.lock().await.next.iter().map(|n| n.root).collect()
    }

    /// Make `state`, whose root is `root` and is the verifier's, the kept
    /// state. An error means the kept file is not written and every held
    /// state stays held.
    ///
    /// Once it is written the journal keeps exactly the states that can
    /// still land: those of batches built on `root`. A batch built on any
    /// other root can no longer be accepted by the verifier.
    pub async fn keep(&self, root: B256, state: &KernelStateSnapshot) -> std::io::Result<()> {
        let mut inner = self.inner.lock().await;
        if let Some(path) = inner.path.clone() {
            let bytes = serde_json::to_vec(state).map_err(std::io::Error::other)?;
            write_whole(&path, &bytes).await?;
        }
        inner.next.retain(|n| n.record.prev_state_root == root && n.root != root);
        if let Err(e) = inner.write_journal().await {
            // The kept file is the state; a journal that still lists states
            // which can no longer land costs disk, not correctness.
            warn!(%e, "could not rewrite the next-state journal");
        }
        Ok(())
    }
}

impl StateStoreInner {
    async fn write_journal(&self) -> std::io::Result<()> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        let mut bytes = Vec::new();
        for entry in &self.next {
            serde_json::to_writer(&mut bytes, entry).map_err(std::io::Error::other)?;
            bytes.push(b'\n');
        }
        write_whole(&next_journal(path), &bytes).await
    }
}

/// Which held state has the verifier's root.
#[derive(Clone, Debug)]
pub enum Held {
    /// The mirror's own state.
    Current,
    /// The state of a batch this relay built: the batch landed.
    Next(Box<NextState>),
}

/// Find the held state whose root is `root`, the verifier's. `None` means
/// this relay does not hold the state behind the verifier's root and must
/// not build on what it has.
pub async fn held_state_for(mirror: &StateMirror, store: &StateStore, root: B256) -> Option<Held> {
    if mirror.state_root().await == root {
        return Some(Held::Current);
    }
    store.next_for(root).await.map(|next| Held::Next(Box::new(next)))
}
