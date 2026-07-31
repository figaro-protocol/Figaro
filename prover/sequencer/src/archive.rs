/// Publication archive — the batch universe's mirror of what the kernel
/// PUBLISHES.
///
/// `FigaroCore` does two things for an order: it settles it, and it
/// publishes it. `OrderCommitted` / `OrderSeller` / `OrderCurrency` carry
/// the whole commitment struct; `OrderResolved` / `ProcessResolved` carry
/// the resolution facts; and the two signatures that admitted the order sit
/// in the commit transaction's calldata, readable by anyone. A batch
/// settles the same trade but publishes none of it: `FigaroBatchVerifier`'s
/// public values carry no order hashes, its storage is `stateRoot` +
/// `batchCount`, and `BatchSettled` names no order. Batched trade is
/// therefore publicly invisible per-order unless a relay mirrors the
/// publication role — which is what this module does.
///
/// **Nothing here is authority.** Every field a relay publishes is
/// verifiable by the reader against the chain: the commitment struct hashes
/// to the order hash under the verifier's EIP-712 domain, the signatures
/// recover to the buyer and seller in that same struct, the payout figures
/// are `resolution_payouts` of the signed struct, and the batch that
/// carried it is anchored by its state-root transition on chain. So
/// publication inherits exactly the submission posture: a relay can omit or
/// delay, never forge.
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::Arc;

use alloy_primitives::{Address, B256, U256};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::warn;

use figaro_kernel::eip712::domain_separator;
use figaro_kernel::kernel::{derive_commitment_ids, resolution_payouts};
use figaro_kernel::types::{Commitment, KernelOp, Signature};

/// Default cap on retained settled batches. The archive is a PUBLIC,
/// unauthenticated surface on a long-running process — it must be bounded.
pub const DEFAULT_MAX_BATCHES: usize = 10_000;
/// Default page size for the range read.
pub const DEFAULT_PAGE_LIMIT: usize = 10;
/// Hard ceiling on page size. A batch record carries every commitment
/// struct and signature it settled, so a page is bounded in records, and
/// each record is bounded by `MAX_BATCH_OPS`.
pub const MAX_PAGE_LIMIT: usize = 50;

// ── Records — one per kernel event family ─────────────────────────

/// The batch-path form of `OrderCommitted` + `OrderSeller` +
/// `OrderCurrency`, PLUS the two signatures the kernel leaves in calldata.
/// `commitment` is the struct exactly as signed (so `process_id` is zero
/// for a root order); `process_id` is the derived one the kernel keys by.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderRecord {
    pub order_hash: B256,
    pub process_id: B256,
    pub commitment: Commitment,
    pub buyer_signature: Signature,
    pub seller_signature: Signature,
}

/// The batch-path form of `OrderResolved(orderHash, processId,
/// sellerPayout, buyerPayout)`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderResolution {
    pub order_hash: B256,
    pub seller: Address,
    pub seller_payout: U256,
    pub buyer_payout: U256,
}

/// The batch-path form of `ProcessResolved(processId, buyer, orderCount)`,
/// plus the buyer signature that authorized it (the batched equivalent of
/// `msg.sender == rootBuyer`) and the per-order legs.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProcessResolution {
    pub process_id: B256,
    pub buyer: Address,
    pub order_count: u64,
    pub buyer_signature: Signature,
    pub orders: Vec<OrderResolution>,
}

/// One settled batch, as published. `batch` is this RELAY's own settled
/// sequence number (a cursor, not a protocol identity — a different relay
/// numbers its batches differently). The chain-anchored identity is
/// `new_state_root` + `settlement_tx`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchRecord {
    pub batch: u64,
    pub chain_id: u64,
    pub verifying_contract: Address,
    pub prev_state_root: B256,
    pub new_state_root: B256,
    /// `None` for a dry run (no verifier configured) — the batch proved
    /// but was never settled, and the reader must be told so.
    pub settlement_tx: Option<B256>,
    pub block_timestamp: u64,
    pub commits: Vec<OrderRecord>,
    pub resolutions: Vec<ProcessResolution>,
}

// ── Views — what the read routes return ───────────────────────────

/// Where a fact was published, so the reader can go anchor it on chain.
#[derive(Clone, Debug, Serialize)]
pub struct BatchRef {
    pub batch: u64,
    pub chain_id: u64,
    pub verifying_contract: Address,
    pub prev_state_root: B256,
    pub new_state_root: B256,
    pub settlement_tx: Option<B256>,
    pub block_timestamp: u64,
}

impl From<&BatchRecord> for BatchRef {
    fn from(r: &BatchRecord) -> Self {
        Self {
            batch: r.batch,
            chain_id: r.chain_id,
            verifying_contract: r.verifying_contract,
            prev_state_root: r.prev_state_root,
            new_state_root: r.new_state_root,
            settlement_tx: r.settlement_tx,
            block_timestamp: r.block_timestamp,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct CommitView {
    pub commitment: Commitment,
    pub buyer_signature: Signature,
    pub seller_signature: Signature,
    pub batch: BatchRef,
}

#[derive(Clone, Debug, Serialize)]
pub struct ResolutionView {
    pub seller: Address,
    pub seller_payout: U256,
    pub buyer_payout: U256,
    pub batch: BatchRef,
}

/// One order as published. Either leg may be absent: `commit` is `None`
/// when the committing batch has aged out of retention, `resolution` is
/// `None` while the process is still open.
#[derive(Clone, Debug, Serialize)]
pub struct OrderView {
    pub order_hash: B256,
    pub process_id: B256,
    pub commit: Option<CommitView>,
    pub resolution: Option<ResolutionView>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProcessResolutionView {
    pub buyer: Address,
    pub order_count: u64,
    pub buyer_signature: Signature,
    pub batch: BatchRef,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProcessView {
    pub process_id: B256,
    pub orders: Vec<OrderView>,
    pub resolution: Option<ProcessResolutionView>,
}

/// The retention window, so a consumer can tell absence from eviction and
/// detect a gap before replaying.
#[derive(Clone, Copy, Debug, Serialize)]
pub struct RetentionWindow {
    pub first_batch: Option<u64>,
    pub last_batch: Option<u64>,
    pub retained_batches: usize,
    pub max_batches: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct BatchPage {
    pub batches: Vec<BatchRecord>,
    /// Pass as `from` to continue; `None` means the page reached the end
    /// of what this relay has settled.
    pub next_cursor: Option<u64>,
    pub retained: RetentionWindow,
}

// ── Archive ───────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct ArchiveConfig {
    /// Append-only JSONL journal. `None` = in-memory only (lost on
    /// restart).
    pub path: Option<PathBuf>,
    pub max_batches: usize,
}

impl Default for ArchiveConfig {
    fn default() -> Self {
        Self {
            path: None,
            max_batches: DEFAULT_MAX_BATCHES,
        }
    }
}

#[derive(Default)]
struct ProcessIndexEntry {
    /// Batches that committed one of this process's orders, ascending.
    commit_batches: Vec<u64>,
    resolution_batch: Option<u64>,
}

struct ArchiveInner {
    batches: BTreeMap<u64, BatchRecord>,
    /// order hash → the batch that COMMITTED it.
    commit_index: HashMap<B256, u64>,
    /// order hash → the batch that RESOLVED it.
    resolve_index: HashMap<B256, u64>,
    process_index: HashMap<B256, ProcessIndexEntry>,
    /// Lines appended since the journal was last rewritten — the rotation
    /// trigger.
    appended_since_rotate: usize,
}

/// Thread-safe publication archive.
#[derive(Clone)]
pub struct Archive {
    inner: Arc<Mutex<ArchiveInner>>,
    config: ArchiveConfig,
}

impl Archive {
    fn new(config: ArchiveConfig) -> Self {
        Self {
            inner: Arc::new(Mutex::new(ArchiveInner {
                batches: BTreeMap::new(),
                commit_index: HashMap::new(),
                resolve_index: HashMap::new(),
                process_index: HashMap::new(),
                appended_since_rotate: 0,
            })),
            config: ArchiveConfig {
                max_batches: config.max_batches.max(1),
                ..config
            },
        }
    }

    /// An archive with no journal: answers for this process's lifetime and
    /// forgets on restart. What a dry-run relay gets, and what the tests use.
    pub fn in_memory(max_batches: usize) -> Self {
        Self::new(ArchiveConfig {
            path: None,
            max_batches,
        })
    }

    /// Open an archive, replaying the journal if one is configured.
    ///
    /// A journal line that fails to parse ends the replay: the only way to
    /// produce one is a torn append, which can only be the tail. The
    /// surviving prefix is kept and the file is rewritten from it.
    pub async fn open(config: ArchiveConfig) -> Self {
        let archive = Self::new(config);

        let Some(path) = archive.config.path.clone() else {
            return archive;
        };
        let Ok(contents) = tokio::fs::read_to_string(&path).await else {
            return archive; // no journal yet — first run
        };

        let mut torn = false;
        let mut replayed = 0usize;
        {
            let mut inner = archive.inner.lock().await;
            for line in contents.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<BatchRecord>(line) {
                    Ok(record) => {
                        inner.insert(record);
                        replayed += 1;
                    }
                    Err(e) => {
                        warn!(?path, %e, "archive journal ends in a torn record — replay stops here");
                        torn = true;
                        break;
                    }
                }
            }
            inner.evict_to(archive.config.max_batches);
        }
        if replayed > 0 {
            tracing::info!(?path, replayed, "archive journal replayed");
        }
        // A torn tail or an over-long journal is repaired by rewriting the
        // retained window; otherwise the file already IS the window.
        if torn || replayed > archive.config.max_batches {
            archive.rewrite_journal().await;
        } else {
            archive.inner.lock().await.appended_since_rotate = replayed;
        }
        archive
    }

    /// Publish one settled batch. Never fails the caller: a journal write
    /// error is logged, and the in-memory archive still answers. Settlement
    /// already happened on chain — a publication problem must not look like
    /// a settlement problem.
    pub async fn record(&self, record: BatchRecord) {
        let line = match serde_json::to_string(&record) {
            Ok(l) => Some(l),
            Err(e) => {
                warn!(%e, "batch record failed to serialize — publishing in memory only");
                None
            }
        };
        let rotate = {
            let mut inner = self.inner.lock().await;
            inner.insert(record);
            inner.evict_to(self.config.max_batches);
            inner.appended_since_rotate += 1;
            inner.appended_since_rotate > self.config.max_batches
        };

        let Some(path) = self.config.path.clone() else {
            return;
        };
        if rotate {
            self.rewrite_journal().await;
            return;
        }
        let Some(line) = line else { return };
        if let Err(e) = append_line(&path, &line).await {
            warn!(?path, %e, "archive journal append failed — record kept in memory only");
        }
    }

    /// Rewrite the journal from the retained window (rotation / repair).
    /// Written to a sibling temp file and renamed, so a crash mid-rewrite
    /// leaves the previous journal intact.
    async fn rewrite_journal(&self) {
        let Some(path) = self.config.path.clone() else {
            return;
        };
        let body = {
            let inner = self.inner.lock().await;
            let mut body = String::new();
            for record in inner.batches.values() {
                match serde_json::to_string(record) {
                    Ok(line) => {
                        body.push_str(&line);
                        body.push('\n');
                    }
                    Err(e) => warn!(%e, "skipping unserializable record during rotation"),
                }
            }
            body
        };
        let tmp = path.with_extension("jsonl.tmp");
        let write = async {
            tokio::fs::write(&tmp, body.as_bytes()).await?;
            tokio::fs::rename(&tmp, &path).await
        };
        match write.await {
            // The journal now IS the window, so the rotation counter
            // restarts: a rewrite costs O(window) and buys `max_batches`
            // cheap appends, which is what keeps the file under 2× the
            // window without rewriting it on every batch.
            Ok(()) => self.inner.lock().await.appended_since_rotate = 0,
            Err(e) => warn!(?path, %e, "archive journal rotation failed — continuing in memory"),
        }
    }

    /// One order, by the order hash the kernel keys by.
    pub async fn order(&self, order_hash: B256) -> Option<OrderView> {
        let inner = self.inner.lock().await;
        inner.order_view(order_hash)
    }

    /// One process: its orders and the resolution facts.
    pub async fn process(&self, process_id: B256) -> Option<ProcessView> {
        let inner = self.inner.lock().await;
        let entry = inner.process_index.get(&process_id)?;

        let mut orders: Vec<OrderView> = Vec::new();
        for batch in &entry.commit_batches {
            let Some(record) = inner.batches.get(batch) else {
                continue;
            };
            for commit in &record.commits {
                if commit.process_id == process_id {
                    if let Some(view) = inner.order_view(commit.order_hash) {
                        orders.push(view);
                    }
                }
            }
        }
        // An order whose commit aged out but whose resolution is retained
        // still belongs to the process — publish the leg that survived.
        if let Some(batch) = entry.resolution_batch {
            if let Some(record) = inner.batches.get(&batch) {
                for resolution in &record.resolutions {
                    if resolution.process_id != process_id {
                        continue;
                    }
                    for leg in &resolution.orders {
                        if orders.iter().any(|o| o.order_hash == leg.order_hash) {
                            continue;
                        }
                        if let Some(view) = inner.order_view(leg.order_hash) {
                            orders.push(view);
                        }
                    }
                }
            }
        }

        let resolution = entry.resolution_batch.and_then(|batch| {
            let record = inner.batches.get(&batch)?;
            let found = record
                .resolutions
                .iter()
                .find(|r| r.process_id == process_id)?;
            Some(ProcessResolutionView {
                buyer: found.buyer,
                order_count: found.order_count,
                buyer_signature: found.buyer_signature.clone(),
                batch: BatchRef::from(record),
            })
        });

        Some(ProcessView {
            process_id,
            orders,
            resolution,
        })
    }

    /// A bounded page of settled batches, for an indexer replaying the
    /// batch universe the way it replays kernel logs.
    pub async fn range(&self, from: Option<u64>, limit: Option<usize>) -> BatchPage {
        let limit = limit.unwrap_or(DEFAULT_PAGE_LIMIT).clamp(1, MAX_PAGE_LIMIT);
        let inner = self.inner.lock().await;
        let start = from.unwrap_or(0);
        let batches: Vec<BatchRecord> = inner
            .batches
            .range(start..)
            .take(limit)
            .map(|(_, r)| r.clone())
            .collect();
        let next_cursor = match batches.last() {
            Some(last) => {
                let next = last.batch + 1;
                inner.batches.range(next..).next().map(|_| next)
            }
            None => None,
        };
        BatchPage {
            batches,
            next_cursor,
            retained: inner.window(self.config.max_batches),
        }
    }

    pub async fn window(&self) -> RetentionWindow {
        self.inner.lock().await.window(self.config.max_batches)
    }

    /// The highest batch number this relay has published — the seed for
    /// its settled-batch counter across a restart.
    pub async fn last_batch(&self) -> Option<u64> {
        self.inner.lock().await.batches.keys().next_back().copied()
    }

    pub async fn len(&self) -> usize {
        self.inner.lock().await.batches.len()
    }

    pub async fn is_empty(&self) -> bool {
        self.len().await == 0
    }
}

impl ArchiveInner {
    fn insert(&mut self, record: BatchRecord) {
        let batch = record.batch;
        if let Some(previous) = self.batches.remove(&batch) {
            self.unindex(&previous);
        }
        for commit in &record.commits {
            self.commit_index.insert(commit.order_hash, batch);
            let entry = self.process_index.entry(commit.process_id).or_default();
            if !entry.commit_batches.contains(&batch) {
                entry.commit_batches.push(batch);
                entry.commit_batches.sort_unstable();
            }
        }
        for resolution in &record.resolutions {
            for leg in &resolution.orders {
                self.resolve_index.insert(leg.order_hash, batch);
            }
            let entry = self.process_index.entry(resolution.process_id).or_default();
            entry.resolution_batch = Some(batch);
        }
        self.batches.insert(batch, record);
    }

    fn evict_to(&mut self, max_batches: usize) {
        while self.batches.len() > max_batches {
            let Some((&oldest, _)) = self.batches.iter().next() else {
                break;
            };
            let record = self.batches.remove(&oldest).expect("just read");
            self.unindex(&record);
        }
    }

    fn unindex(&mut self, record: &BatchRecord) {
        let batch = record.batch;
        for commit in &record.commits {
            if self.commit_index.get(&commit.order_hash) == Some(&batch) {
                self.commit_index.remove(&commit.order_hash);
            }
            if let Some(entry) = self.process_index.get_mut(&commit.process_id) {
                entry.commit_batches.retain(|b| *b != batch);
            }
        }
        for resolution in &record.resolutions {
            for leg in &resolution.orders {
                if self.resolve_index.get(&leg.order_hash) == Some(&batch) {
                    self.resolve_index.remove(&leg.order_hash);
                }
            }
            if let Some(entry) = self.process_index.get_mut(&resolution.process_id) {
                if entry.resolution_batch == Some(batch) {
                    entry.resolution_batch = None;
                }
            }
        }
        self.process_index
            .retain(|_, e| !e.commit_batches.is_empty() || e.resolution_batch.is_some());
    }

    fn order_view(&self, order_hash: B256) -> Option<OrderView> {
        let commit = self.commit_index.get(&order_hash).and_then(|batch| {
            let record = self.batches.get(batch)?;
            let found = record.commits.iter().find(|c| c.order_hash == order_hash)?;
            Some((
                found.process_id,
                CommitView {
                    commitment: found.commitment.clone(),
                    buyer_signature: found.buyer_signature.clone(),
                    seller_signature: found.seller_signature.clone(),
                    batch: BatchRef::from(record),
                },
            ))
        });

        let resolution = self.resolve_index.get(&order_hash).and_then(|batch| {
            let record = self.batches.get(batch)?;
            record.resolutions.iter().find_map(|r| {
                let leg = r.orders.iter().find(|o| o.order_hash == order_hash)?;
                Some((
                    r.process_id,
                    ResolutionView {
                        seller: leg.seller,
                        seller_payout: leg.seller_payout,
                        buyer_payout: leg.buyer_payout,
                        batch: BatchRef::from(record),
                    },
                ))
            })
        });

        let process_id = match (&commit, &resolution) {
            (Some((pid, _)), _) => *pid,
            (None, Some((pid, _))) => *pid,
            (None, None) => return None,
        };

        Some(OrderView {
            order_hash,
            process_id,
            commit: commit.map(|(_, v)| v),
            resolution: resolution.map(|(_, v)| v),
        })
    }

    fn window(&self, max_batches: usize) -> RetentionWindow {
        RetentionWindow {
            first_batch: self.batches.keys().next().copied(),
            last_batch: self.batches.keys().next_back().copied(),
            retained_batches: self.batches.len(),
            max_batches,
        }
    }
}

async fn append_line(path: &PathBuf, line: &str) -> std::io::Result<()> {
    use tokio::io::AsyncWriteExt;
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await?;
    file.write_all(line.as_bytes()).await?;
    file.write_all(b"\n").await?;
    file.flush().await
}

// ── Building a record from the ops a batch settled ────────────────

/// Project the ops a batch settled into the two publication families the
/// kernel emits: per-order commitments (with their signatures) and
/// per-process resolutions (with their per-order payout legs).
///
/// Attestations are deliberately absent: `FigaroBatchVerifier` RE-EMITS
/// every batched attestation as an on-chain `Attestation` event, so that
/// family is already published by the chain and needs no relay mirror.
/// This function covers exactly the families the kernel publishes that the
/// batch path does not.
///
/// No new crypto: order hashes come from `figaro_kernel`'s own
/// `derive_commitment_ids`, payouts from its own `resolution_payouts` —
/// the same functions the proof runs.
pub fn publication_from_ops(
    chain_id: u64,
    verifying_contract: Address,
    ops: &[KernelOp],
) -> (Vec<OrderRecord>, Vec<ProcessResolution>) {
    let domain = domain_separator(chain_id, verifying_contract);
    let mut commits = Vec::new();
    let mut resolutions = Vec::new();

    for op in ops {
        match op {
            KernelOp::Commit {
                commitment,
                buyer_sig,
                seller_sig,
            } => {
                let (order_hash, process_id) = derive_commitment_ids(&domain, commitment);
                commits.push(OrderRecord {
                    order_hash,
                    process_id,
                    commitment: commitment.clone(),
                    buyer_signature: buyer_sig.clone(),
                    seller_signature: seller_sig.clone(),
                });
            }
            KernelOp::Resolve {
                process_id,
                commitments,
                buyer_sig,
            } => {
                let orders = commitments
                    .iter()
                    .filter_map(|c| {
                        let (order_hash, _) = derive_commitment_ids(&domain, c);
                        // An overflowing payout cannot settle, so it cannot
                        // reach publication; skip rather than invent one.
                        let (seller_payout, buyer_payout) = resolution_payouts(c).ok()?;
                        Some(OrderResolution {
                            order_hash,
                            seller: c.seller,
                            seller_payout,
                            buyer_payout,
                        })
                    })
                    .collect::<Vec<_>>();
                resolutions.push(ProcessResolution {
                    process_id: *process_id,
                    // The kernel verified every order's buyer against the
                    // process root buyer at commit, so any leg carries it.
                    buyer: commitments.first().map(|c| c.buyer).unwrap_or_default(),
                    order_count: orders.len() as u64,
                    buyer_signature: buyer_sig.clone(),
                    orders,
                });
            }
            KernelOp::AttestAsSeller { .. } | KernelOp::AttestAsBuyer { .. } => {}
        }
    }

    (commits, resolutions)
}
