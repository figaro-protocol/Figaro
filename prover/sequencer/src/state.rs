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

    /// The root buyer of a process the state holds.
    pub async fn root_buyer(&self, process_id: &B256) -> Option<alloy_primitives::Address> {
        self.inner.read().await.state.processes.get(process_id).map(|p| p.root_buyer)
    }

    /// Whether the state holds the order committed and not yet resolved.
    pub async fn order_active(&self, order_hash: &B256) -> bool {
        self.inner.read().await.state.order_status.get(order_hash).copied() == Some(1)
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
    /// The root the batch was built on: the verifier's root it can land on.
    pub prev_root: B256,
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
        inner.next.retain(|n| n.prev_root == root && n.root != root);
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

// ── A relay started on another relay's `GET /state` ───────────────
//
// `formal/RelayState.tla`, `Takeover` (`TakeoverChecksRoot`): a stopped
// relay adopts a served state only when its root is the verifier's, and a
// kept file that holds the verifier's root is never written over — a stale
// relay serves a stale state, and the file it would replace may be the
// only copy of the state behind the verifier's root.

/// What a relay does with the state another relay serves, read against
/// the verifier's root. `served_root` is recomputed from the served body;
/// `header_root` is what the serving relay's `x-figaro-state-root` header
/// claims, a claim and never the decision; `holds_verifier_state` says
/// whether this relay already holds the state behind the verifier's root,
/// in its kept file or in its journal ([`held_state_for`]).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Takeover {
    /// The served state is the one behind the verifier's root and this
    /// relay does not hold it: the served state becomes the kept state.
    Adopt,
    /// This relay already holds the state behind the verifier's root — in
    /// the kept file, or in the journal as a batch of its own that landed,
    /// whose record is still to be published: nothing is written, whatever
    /// was served, and the relay starts on what it holds.
    KeptStands,
    /// The header names a root other than the body's: the serving relay is
    /// not one to start on. Nothing is written.
    HeaderDisagrees { header: B256, computed: B256 },
    /// The served root is not the verifier's. Nothing is written.
    Refused { served: B256, verifier: B256 },
}

/// The decision, from whether this relay holds the verifier's state, the
/// served header's root (if any), the served body's recomputed root, and
/// the verifier's.
pub fn takeover(
    holds_verifier_state: bool,
    header_root: Option<B256>,
    served_root: B256,
    verifier_root: B256,
) -> Takeover {
    if holds_verifier_state {
        return Takeover::KeptStands;
    }
    if let Some(header) = header_root {
        if header != served_root {
            return Takeover::HeaderDisagrees { header, computed: served_root };
        }
    }
    if served_root != verifier_root {
        return Takeover::Refused { served: served_root, verifier: verifier_root };
    }
    Takeover::Adopt
}

/// Why a relay started on a served state must not start. Nothing was
/// written in any case.
#[derive(Debug)]
pub enum TakeoverRefused {
    /// The decision ([`Takeover::HeaderDisagrees`] or [`Takeover::Refused`]).
    Decided(Takeover),
    /// The served state was adopted but could not be written as the kept
    /// state: the kept file is as it was.
    NotWritten(std::io::Error),
}

/// The takeover step the relay runs at startup, under one read of the
/// verifier's root: decide ([`takeover`]) from what this relay holds
/// ([`held_state_for`]) and the served state, write the served state as the
/// kept state only on [`Takeover::Adopt`], and return the mirror the relay
/// runs on — the adopted state, or the one it held — with the decision.
pub async fn take_over_from_served(
    store: &StateStore,
    mirror: &StateMirror,
    verifier_root: B256,
    served: KernelStateSnapshot,
    header_root: Option<B256>,
) -> Result<(StateMirror, Takeover), TakeoverRefused> {
    let served_mirror = StateMirror::from_snapshot(served.clone());
    let served_root = served_mirror.state_root().await;
    let holds = held_state_for(mirror, store, verifier_root).await.is_some();
    match takeover(holds, header_root, served_root, verifier_root) {
        Takeover::Adopt => {
            store
                .keep(served_root, &served)
                .await
                .map_err(TakeoverRefused::NotWritten)?;
            Ok((served_mirror, Takeover::Adopt))
        }
        Takeover::KeptStands => Ok((mirror.clone(), Takeover::KeptStands)),
        refused => Err(TakeoverRefused::Decided(refused)),
    }
}

/// The most a served state may be: a peer that serves more is refused, the
/// body read no further than the limit.
pub const MAX_SERVED_STATE_BYTES: usize = 1 << 30;

/// The state another relay serves at `<base_url>/state`, and the root its
/// header claims. The body is the kept-state file's format; its root is
/// recomputed by the caller (`StateMirror::from_snapshot`). A header that
/// is there and does not read as a root is an error, like a body that does
/// not parse: a peer that serves either is not one to start on.
pub async fn fetch_served_state(
    base_url: &str,
) -> Result<(KernelStateSnapshot, Option<B256>), String> {
    fetch_served_state_within(base_url, MAX_SERVED_STATE_BYTES).await
}

/// [`fetch_served_state`] under a given size limit.
pub async fn fetch_served_state_within(
    base_url: &str,
    max_bytes: usize,
) -> Result<(KernelStateSnapshot, Option<B256>), String> {
    use alloy::transports::http::reqwest;
    let url = format!("{}/state", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("GET {url}: {e}"))?;
    let response = client.get(&url).send().await.map_err(|e| format!("GET {url}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("GET {url}: HTTP {}", response.status()));
    }
    let header = response
        .headers()
        .get("x-figaro-state-root")
        .map(|v| {
            v.to_str()
                .map_err(|e| format!("GET {url}: the x-figaro-state-root header is not text: {e}"))
                .and_then(|v| {
                    v.parse::<B256>().map_err(|e| {
                        format!("GET {url}: the x-figaro-state-root header does not parse: {e}")
                    })
                })
        })
        .transpose()?;
    if let Some(length) = response.content_length() {
        if length > max_bytes as u64 {
            return Err(format!("GET {url}: the served state is {length} bytes, over the {max_bytes}-byte limit"));
        }
    }
    let mut response = response;
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("GET {url}: {e}"))? {
        if body.len() + chunk.len() > max_bytes {
            return Err(format!("GET {url}: the served state exceeds the {max_bytes}-byte limit"));
        }
        body.extend_from_slice(&chunk);
    }
    let snapshot = serde_json::from_slice::<KernelStateSnapshot>(&body)
        .map_err(|e| format!("GET {url}: the served state does not parse: {e}"))?;
    Ok((snapshot, header))
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
