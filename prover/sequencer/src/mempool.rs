/// Mempool — holds pending signed operations until they are assembled
/// into a batch.
///
/// Pre-checks are advisory only. The proof enforces all invariants.
/// Pre-checks exist to reject clearly invalid operations early and
/// avoid wasting prover compute. The attestation content gate is the
/// mirror's own `validate_attestation_content` — the exact function the
/// guest runs — so mempool acceptance and in-proof acceptance cannot
/// drift.
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

use alloy_primitives::{keccak256, B256};

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{derive_commitment_ids, validate_attestation_content};
use figaro_kernel::types::*;

/// Default cap on pending operations. The mempool is a PUBLIC,
/// unauthenticated surface — it must be bounded.
pub const DEFAULT_MAX_PENDING_OPS: usize = 10_000;
/// Default cap on pending usage claims (their own queue, own cap).
pub const DEFAULT_MAX_PENDING_USAGE: usize = 10_000;

/// A submitted operation with its unique ID for tracking and its
/// semantic dedup key (see [`Mempool::op_key`]).
#[derive(Clone, Debug)]
pub struct PendingOp {
    pub id: u64,
    pub key: B256,
    pub op: KernelOp,
    /// When batch formation first deferred this operation ([`Mempool::defer`]);
    /// `None` until then. The time rides on the operation, so it is gone
    /// when the operation lands or is dead-lettered, a resubmission starts
    /// with none, and it is kept apart from the transient re-queue's count.
    pub deferred_since: Option<Instant>,
    /// The keys of the deferred operations this one was filtered behind
    /// ([`Mempool::refilter_behind_deferred`]): each one without which it no
    /// longer applies against the landed state — an order it names, or an
    /// earlier sub-order whose payment its cumulative value counts; past
    /// [`MAX_DEPENDENCY_RERUNS`] re-runs in a tick, every deferred or
    /// following commit of a process it touches that precedes it. It moved
    /// with them, and it is dead-lettered with any of them. Empty until
    /// then; it rides on the operation through its deferrals and is cleared
    /// when the operation is given back or re-queued.
    pub behind: Vec<B256>,
}

/// What [`Mempool::refilter_behind_deferred`] returns.
#[derive(Debug)]
pub struct Refiltered {
    /// The operations kept, in a working execution order.
    pub kept: Vec<PendingOp>,
    /// The operations that apply again once the deferred ones are restored,
    /// each marked with what it was filtered behind.
    pub follow: Vec<PendingOp>,
    /// The operations built on one dropped for good, each with its reason.
    pub dropped: Vec<(PendingOp, String)>,
    /// How many times the operation filter was run again to mark them.
    pub reruns: usize,
}

/// Result of an accepted submission.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Admission {
    pub id: u64,
    /// True when the same submission was already pending — the original
    /// acknowledgment is returned and nothing is enqueued twice.
    pub duplicate: bool,
}

/// Why a submission was refused. `Full` is a capacity signal (retry after
/// the next batch drains the queue); `Invalid` is a rejection of the
/// submission itself.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SubmitError {
    Invalid(String),
    Full,
}

impl std::fmt::Display for SubmitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SubmitError::Invalid(e) => write!(f, "{e}"),
            SubmitError::Full => write!(f, "mempool full — retry after the next batch resolves"),
        }
    }
}

/// Thread-safe operation mempool.
#[derive(Clone)]
pub struct Mempool {
    inner: Arc<Mutex<MempoolInner>>,
    chain_id: u64,
    verifying_contract: alloy_primitives::Address,
    max_pending_ops: usize,
    max_pending_usage: usize,
    max_requeues: u32,
    defer_window: Duration,
}

struct MempoolInner {
    pending: VecDeque<PendingOp>,
    /// Dedup index over the pending op queue: semantic key → assigned id.
    /// Cleared on drain — idempotency covers the pending window; once a
    /// batch resolves, a re-submission is dropped by the stateful assembler
    /// filter instead (the mirror state already carries the effect).
    index: HashMap<B256, u64>,
    /// Usage claims awaiting the next batch. Kept in their OWN queue, not
    /// interleaved with ops: a claim is not a FigaroCore operation, it changes
    /// no FigaroCore state, and the guest applies every claim after every op
    /// (against the post-state) so the two orderings are independent.
    pending_usage: VecDeque<UsageClaim>,
    /// Dedup index over pending usage claims (hash of the claim's
    /// canonical JSON). Cleared on drain, like `index`.
    usage_index: HashSet<B256>,
    /// How many times each pending key has been re-queued after a transient
    /// submission failure. Cleared on a fresh admission; consulted by
    /// `requeue`, which dead-letters a key past `max_requeues`.
    requeues: HashMap<B256, u32>,
    /// Operations batch formation deferred ([`Mempool::defer`]), in groups,
    /// oldest first: each group is a class of one tick's deferrals under
    /// the touched-process chain, an operation with what was filtered into an
    /// order behind it. They wait apart from `pending` and are drained again
    /// only into the room `pending` leaves empty, a group whole; their keys
    /// stay in `index`. A group decides what is drained together and nothing
    /// else: each operation expires on its own window.
    deferred: VecDeque<Vec<PendingOp>>,
    next_id: u64,
}

impl MempoolInner {
    fn deferred_len(&self) -> usize {
        self.deferred.iter().map(Vec::len).sum()
    }
}

/// Re-queues a transiently failed op survives before it is dead-lettered.
/// Transient means the chain never evaluated the batch (transport trouble),
/// so the op is still valid — but an op that keeps failing to land is not
/// re-proved forever; after this many attempts it is surfaced on `/status`
/// and left for re-submission.
pub const DEFAULT_MAX_REQUEUES: u32 = 3;

/// The most times one batch formation runs the operation filter again to
/// mark what follows a deferred commit ([`Mempool::refilter_behind_deferred`]).
/// Each run is the filter over one drain group of at most `MAX_BATCH_OPS`
/// operations (100 by default) against that group's slice of the landed
/// state; 32 runs is the work of a third of a full drain's worth of
/// candidates judged exactly. Past it, a group is marked conservatively
/// instead: an operation that follows rides behind every deferred or
/// following commit of a process it touches that precedes it.
pub const MAX_DEPENDENCY_RERUNS: usize = 32;

/// How long an operation batch formation deferred waits, from its first
/// deferral, before it is dead-lettered. A bound in time, never in attempts:
/// a deferred operation is retried only when the queue leaves room, so an
/// attempt count would expire it early on an idle relay and never on a busy
/// one. Ten minutes covers a dependency queued past the drain's cut, or
/// carried by a batch still in flight, at the defaults.
pub const DEFAULT_DEFER_WINDOW: Duration = Duration::from_secs(600);

impl Mempool {
    pub fn new(chain_id: u64, verifying_contract: alloy_primitives::Address) -> Self {
        Self::with_caps(
            chain_id,
            verifying_contract,
            DEFAULT_MAX_PENDING_OPS,
            DEFAULT_MAX_PENDING_USAGE,
        )
    }

    /// Construct with explicit queue caps.
    ///
    /// Eviction policy (deterministic): **the arriving item is the one
    /// evicted** — at capacity, new submissions are refused with
    /// [`SubmitError::Full`]. An acknowledged submission is NEVER silently
    /// dropped: once an id is returned, the op stays queued until a batch
    /// drains it (and is re-queued, cap-exempt, if resolution fails
    /// transiently). Any evict-the-oldest policy would make the
    /// acknowledgment a lie on a public endpoint.
    pub fn with_caps(
        chain_id: u64,
        verifying_contract: alloy_primitives::Address,
        max_pending_ops: usize,
        max_pending_usage: usize,
    ) -> Self {
        Self {
            inner: Arc::new(Mutex::new(MempoolInner {
                pending: VecDeque::new(),
                index: HashMap::new(),
                pending_usage: VecDeque::new(),
                usage_index: HashSet::new(),
                requeues: HashMap::new(),
                deferred: VecDeque::new(),
                next_id: 1,
            })),
            chain_id,
            verifying_contract,
            max_pending_ops,
            max_pending_usage,
            max_requeues: DEFAULT_MAX_REQUEUES,
            defer_window: DEFAULT_DEFER_WINDOW,
        }
    }

    /// The deferral's window (see [`DEFAULT_DEFER_WINDOW`]).
    pub fn with_defer_window(mut self, window: Duration) -> Self {
        self.defer_window = window;
        self
    }

    /// The re-queue cap (see [`DEFAULT_MAX_REQUEUES`]).
    pub fn with_max_requeues(mut self, max_requeues: u32) -> Self {
        self.max_requeues = max_requeues;
        self
    }

    /// Submit a signed operation. Idempotent within the pending window:
    /// re-submitting an op with the same semantic key returns the original
    /// id with `duplicate: true` and enqueues nothing.
    pub async fn submit(&self, op: KernelOp) -> Result<Admission, SubmitError> {
        // Pre-check: verify signatures are well-formed
        self.pre_check(&op).map_err(SubmitError::Invalid)?;

        let key = self.op_key(&op);
        let mut inner = self.inner.lock().await;
        if let Some(&id) = inner.index.get(&key) {
            return Ok(Admission {
                id,
                duplicate: true,
            });
        }
        // A deferred operation is still pending: the cap bounds both.
        if inner.pending.len() + inner.deferred_len() >= self.max_pending_ops {
            return Err(SubmitError::Full);
        }
        let id = inner.next_id;
        inner.next_id += 1;
        inner.index.insert(key, id);
        inner.requeues.remove(&key);
        inner.pending.push_back(PendingOp {
            id,
            key,
            op,
            deferred_since: None,
            behind: Vec::new(),
        });
        Ok(Admission {
            id,
            duplicate: false,
        })
    }

    /// Semantic dedup key: the on-chain identity of the op's effect, not
    /// its byte encoding — so a re-signed duplicate (ECDSA signatures are
    /// not unique per digest) still deduplicates.
    ///
    /// The key covers every input the proof or the verifier judges and
    /// admission cannot: a resolve's signer and its order list, a seller
    /// attestation's role order, an attestation's witness spec bytes (the
    /// guest requires them to hash to the clause key). Two submissions
    /// share a slot only when both are accepted or both are refused, so one
    /// that will be refused never makes the one that will be accepted a
    /// duplicate.
    fn op_key(&self, op: &KernelOp) -> B256 {
        let domain = domain_separator(self.chain_id, self.verifying_contract);
        let mut buf: Vec<u8> = Vec::new();
        match op {
            KernelOp::Commit { commitment, .. } => {
                let (order_hash, _) = derive_commitment_ids(&domain, commitment);
                buf.extend_from_slice(b"commit");
                buf.extend_from_slice(order_hash.as_slice());
            }
            KernelOp::Resolve {
                process_id,
                commitments,
                buyer_sig,
            } => {
                buf.extend_from_slice(b"resolve");
                buf.extend_from_slice(process_id.as_slice());
                // Admission checks that the signature recovers, never to
                // whom: the root buyer is state. The signer is in the key.
                let digest = typed_data_hash(&domain, &resolve_struct_hash(process_id));
                if let Ok(signer) = recover_signer(&digest, buyer_sig) {
                    buf.extend_from_slice(signer.as_slice());
                }
                // The signature covers the process id alone; the order list
                // rides unsigned and the proof refuses an incomplete one.
                for commitment in commitments {
                    let (order_hash, _) = derive_commitment_ids(&domain, commitment);
                    buf.extend_from_slice(order_hash.as_slice());
                }
            }
            KernelOp::AttestAsSeller {
                role,
                target,
                clause_id,
                stage,
                content_ref,
                proof,
                ..
            } => {
                let (order_hash, _) = derive_commitment_ids(&domain, target);
                // `role` rides unsigned: admission checks the signature
                // against `role.seller`, and whether that order is live in
                // the target's process is state.
                let (role_order_hash, _) = derive_commitment_ids(&domain, role);
                buf.extend_from_slice(b"attest-seller");
                buf.extend_from_slice(role_order_hash.as_slice());
                buf.extend_from_slice(order_hash.as_slice());
                buf.extend_from_slice(clause_id.as_slice());
                buf.push(*stage);
                buf.extend_from_slice(content_ref.as_slice());
                buf.extend_from_slice(keccak256(proof.spec_json.as_bytes()).as_slice());
            }
            KernelOp::AttestAsBuyer {
                target,
                clause_id,
                stage,
                content_ref,
                proof,
                ..
            } => {
                let (order_hash, _) = derive_commitment_ids(&domain, target);
                buf.extend_from_slice(b"attest-buyer");
                buf.extend_from_slice(order_hash.as_slice());
                buf.extend_from_slice(clause_id.as_slice());
                buf.push(*stage);
                buf.extend_from_slice(content_ref.as_slice());
                buf.extend_from_slice(keccak256(proof.spec_json.as_bytes()).as_slice());
            }
        }
        keccak256(&buf)
    }

    /// Submit an RPGF usage claim for an order the batch path has resolved.
    ///
    /// Claims are SUBMITTED, never derived here — exactly as attestation
    /// witnesses are. The sequencer holds no agreements: it sees commitment
    /// structs, whose `agreement_hash` is a root, not the sections. Whoever
    /// holds the agreement (the author of the clause or assembly, typically,
    /// since this is how their work gets counted) supplies the section
    /// fingerprint and the
    /// inclusion proof. Nothing is trusted either way — the guest re-proves
    /// resolution and inclusion, and the counter enforces the reward's own
    /// gates on chain.
    ///
    /// Only the two cheap stateless checks run here; everything else is
    /// state-dependent and belongs to the proof.
    ///
    /// Idempotent within the pending window (keyed by the claim's canonical
    /// JSON): a duplicate returns the current pending count and enqueues
    /// nothing. Bounded by `max_pending_usage` with the same
    /// evict-the-newcomer policy as ops.
    pub async fn submit_usage_claim(&self, claim: UsageClaim) -> Result<usize, SubmitError> {
        if claim.clause_or_assembly == alloy_primitives::B256::ZERO {
            return Err(SubmitError::Invalid(
                "usage claim clause-or-assembly is zero".to_string(),
            ));
        }
        if claim.order.agreement_hash == alloy_primitives::B256::ZERO {
            return Err(SubmitError::Invalid(
                "usage claim order carries no agreement hash".to_string(),
            ));
        }
        let key = claim_key(&claim);
        let mut inner = self.inner.lock().await;
        if inner.usage_index.contains(&key) {
            return Ok(inner.pending_usage.len());
        }
        if inner.pending_usage.len() >= self.max_pending_usage {
            return Err(SubmitError::Full);
        }
        inner.usage_index.insert(key);
        inner.pending_usage.push_back(claim);
        Ok(inner.pending_usage.len())
    }

    /// Drain all pending operations for batch assembly. Clears the dedup
    /// index: idempotency covers the pending window only.
    pub async fn drain(&self) -> Vec<PendingOp> {
        self.drain_up_to(usize::MAX).await
    }

    /// Drain at most `max` operations, oldest first, for one batch: the
    /// queue first, then the deferred groups, oldest first, each whole, into
    /// the room the queue left — a deferred operation never displaces a
    /// queued one. The rest stay where they were, deduplicated as before; the
    /// drained ones leave the dedup index.
    pub async fn drain_up_to(&self, max: usize) -> Vec<PendingOp> {
        let mut inner = self.inner.lock().await;
        let take = max.min(inner.pending.len());
        let mut drained: Vec<PendingOp> = inner.pending.drain(..take).collect();
        let mut room = max - take;
        if room > 0 && !inner.deferred.is_empty() {
            let mut waiting = VecDeque::with_capacity(inner.deferred.len());
            while let Some(group) = inner.deferred.pop_front() {
                if group.len() <= room {
                    room -= group.len();
                    drained.extend(group);
                } else {
                    waiting.push_back(group);
                }
            }
            inner.deferred = waiting;
        }
        for op in &drained {
            inner.index.remove(&op.key);
        }
        drained
    }

    /// Defer the operations batch formation could not use this tick — one
    /// that applies against no order of its drain, a commit whose funding
    /// could not be read, and what was filtered into an order behind either
    /// — apart from the queue (drained again only into the room the queue
    /// leaves, [`Mempool::drain_up_to`]), in drain groups: operations share a
    /// group when a chain of them, each touching a process the next touches,
    /// joins them (`touched_processes`). The groups decide what is drained
    /// together and nothing else. Each operation keeps the time it was first
    /// deferred; one deferred for the window or longer since then is not
    /// deferred but returned, with the reason, for the caller to
    /// dead-letter, and so is what was filtered behind it
    /// ([`PendingOp::behind`]), transitively — never the rest of its group.
    /// Deferring spends nothing of the re-queue's count. A copy resubmitted
    /// while the operation was drained is dropped: the deferred one holds the
    /// key, and a resubmission is a duplicate of it. Cap-exempt: these were
    /// already acknowledged.
    pub async fn defer(&self, mut ops: Vec<PendingOp>, now: Instant) -> Vec<(PendingOp, String)> {
        for op in &mut ops {
            op.deferred_since.get_or_insert(now);
        }
        let (ops, expired) = self.take_expired(ops, now);
        let groups = self.group_by_process(ops);
        let mut inner = self.inner.lock().await;
        for group in groups {
            for op in &group {
                if inner.index.contains_key(&op.key) {
                    inner.pending.retain(|queued| queued.key != op.key);
                }
                inner.index.insert(op.key, op.id);
            }
            inner.deferred.push_back(group);
        }
        expired
    }

    /// Take every deferred operation whose window has passed since its own
    /// first deferral, retried or not, and what was filtered behind it,
    /// transitively, for the caller to dead-letter; their keys are freed.
    /// What is left of a group is grouped again, in the group's place. An
    /// operation and what was filtered behind it touch a common process, so
    /// they share a group, and each group is judged alone.
    pub async fn expire_deferred(&self, now: Instant) -> Vec<(PendingOp, String)> {
        let mut inner = self.inner.lock().await;
        let mut expired = Vec::new();
        let groups = std::mem::take(&mut inner.deferred);
        for group in groups {
            let (kept, gone) = self.take_expired(group, now);
            for (op, _) in &gone {
                inner.index.remove(&op.key);
            }
            if gone.is_empty() {
                inner.deferred.push_back(kept);
            } else {
                inner.deferred.extend(self.group_by_process(kept));
            }
            expired.extend(gone);
        }
        expired
    }

    /// Split `ops` into those that stay and those past the window since their
    /// own first deferral, with what was filtered behind one of those,
    /// transitively, each with its reason. The kept keep their order.
    fn take_expired(&self, ops: Vec<PendingOp>, now: Instant) -> (Vec<PendingOp>, Vec<(PendingOp, String)>) {
        let late = |op: &PendingOp| {
            op.deferred_since
                .is_some_and(|since| now.saturating_duration_since(since) >= self.defer_window)
        };
        let mut gone: HashSet<B256> = ops.iter().filter(|op| late(op)).map(|op| op.key).collect();
        loop {
            let more: Vec<B256> = ops
                .iter()
                .filter(|op| !gone.contains(&op.key) && op.behind.iter().any(|k| gone.contains(k)))
                .map(|op| op.key)
                .collect();
            if more.is_empty() {
                break;
            }
            gone.extend(more);
        }
        let mut kept = Vec::with_capacity(ops.len());
        let mut expired = Vec::new();
        for op in ops {
            if !gone.contains(&op.key) {
                kept.push(op);
            } else if late(&op) {
                expired.push((op, self.expiry_reason()));
            } else {
                let why = format!(
                    "filtered at batch formation behind an operation dead-lettered at its deferral window: {}",
                    self.expiry_reason()
                );
                expired.push((op, why));
            }
        }
        (kept, expired)
    }

    /// The processes an operation touches: a commit's own (a root order's
    /// derived from its struct), a resolve's, an attestation's role and
    /// target orders' processes.
    fn touched_processes(&self, op: &KernelOp) -> Vec<B256> {
        let domain = domain_separator(self.chain_id, self.verifying_contract);
        let process = |c: &Commitment| derive_commitment_ids(&domain, c).1;
        match op {
            KernelOp::Commit { commitment, .. } => vec![process(commitment)],
            KernelOp::Resolve { process_id, .. } => vec![*process_id],
            KernelOp::AttestAsSeller { role, target, .. } => vec![process(role), process(target)],
            KernelOp::AttestAsBuyer { target, .. } => vec![process(target)],
        }
    }

    /// [`crate::assembler::refilter_after_drops`], with each operation that
    /// follows the `deferred` ones marked with what it was filtered behind
    /// ([`PendingOp::behind`]).
    pub fn refilter_behind_deferred(
        &self,
        block_timestamp: u64,
        prev_state: &KernelStateSnapshot,
        valid: Vec<PendingOp>,
        deferred: &[PendingOp],
    ) -> Refiltered {
        let (kept, mut follow, dropped) = crate::assembler::refilter_after_drops(
            self.chain_id,
            self.verifying_contract,
            block_timestamp,
            prev_state,
            valid,
            deferred,
        );
        let reruns = self.mark_behind(block_timestamp, prev_state, &kept, &mut follow, deferred);
        Refiltered { kept, follow, dropped, reruns }
    }

    /// Mark, on each of `follow`, the operations it was filtered behind:
    /// each commit among `deferred` and the rest of `follow` without which it
    /// no longer applies. Only a commit is a candidate: only a commit creates
    /// a process, an order or a step of a process's cumulative value, the
    /// state holds no attestation, and taking out a resolve never makes
    /// another operation fail. Judged by the filter itself — the operation
    /// filter run again over each candidate's drain group with the candidate
    /// taken out — so the edge is the semantic dependency, whatever the
    /// operation names: a sub-order whose cumulative value counts an earlier
    /// sub-order's payment rides behind that sub-order, though it names only
    /// the process; an operation that applies without the candidate is never
    /// marked behind it. Each re-run reads the group's slice of the landed
    /// state (`group_state`), never the whole of it. At most
    /// [`MAX_DEPENDENCY_RERUNS`] re-runs: a group whose candidates would
    /// pass the cap is marked conservatively instead — an operation that
    /// follows rides behind every deferred or following commit of a process
    /// it touches that precedes it (any such commit, for an operation that
    /// is not a commit; one of lower cumulative value, for a commit). That
    /// mark can only join an operation to commits of its own processes.
    /// Added to what it already carries; transitive edges are followed at
    /// expiry. Returns the number of re-runs.
    fn mark_behind(
        &self,
        block_timestamp: u64,
        prev_state: &KernelStateSnapshot,
        kept: &[PendingOp],
        follow: &mut [PendingOp],
        deferred: &[PendingOp],
    ) -> usize {
        if follow.is_empty() {
            return 0;
        }
        let domain = domain_separator(self.chain_id, self.verifying_contract);
        let follow_keys: HashSet<B256> = follow.iter().map(|p| p.key).collect();
        let is_commit = |p: &PendingOp| matches!(p.op, KernelOp::Commit { .. });
        let candidates: HashSet<B256> = deferred
            .iter()
            .chain(follow.iter())
            .filter(|p| is_commit(p))
            .map(|p| p.key)
            .collect();
        let all: Vec<PendingOp> = kept.iter().chain(deferred).chain(follow.iter()).cloned().collect();
        let mut reruns = 0;
        let mut edges: HashMap<B256, Vec<B256>> = HashMap::new();
        for group in self.group_by_process(all) {
            if !group.iter().any(|p| follow_keys.contains(&p.key)) {
                continue;
            }
            let group_candidates: Vec<&PendingOp> =
                group.iter().filter(|p| candidates.contains(&p.key)).collect();
            if reruns + group_candidates.len() > MAX_DEPENDENCY_RERUNS {
                // Past the cap: the conservative mark.
                for f in group.iter().filter(|p| follow_keys.contains(&p.key)) {
                    let touched: HashSet<B256> = self.touched_processes(&f.op).into_iter().collect();
                    for c in &group_candidates {
                        if c.key != f.key && commit_precedes(&domain, &c.op, &f.op, &touched) {
                            edges.entry(f.key).or_default().push(c.key);
                        }
                    }
                }
                continue;
            }
            let state = group_state(prev_state, &group.iter().flat_map(|p| self.touched_processes(&p.op)).collect());
            for x in group_candidates {
                reruns += 1;
                let without: Vec<PendingOp> =
                    group.iter().filter(|p| p.key != x.key).cloned().collect();
                let (applies, _) = crate::assembler::filter_applicable_ops(
                    self.chain_id,
                    self.verifying_contract,
                    block_timestamp,
                    &state,
                    without,
                );
                let applies: HashSet<B256> = applies.iter().map(|p| p.key).collect();
                for f in group.iter().filter(|p| follow_keys.contains(&p.key) && p.key != x.key) {
                    if !applies.contains(&f.key) {
                        edges.entry(f.key).or_default().push(x.key);
                    }
                }
            }
        }
        for p in follow.iter_mut() {
            for key in edges.remove(&p.key).unwrap_or_default() {
                if !p.behind.contains(&key) {
                    p.behind.push(key);
                }
            }
        }
        reruns
    }

    /// Partition `ops` into groups that touch a common process, transitively:
    /// two operations share a group when a chain of operations, each touching
    /// a process the next touches, joins them. Groups are ordered by their
    /// first operation, and each keeps the operations' order.
    fn group_by_process(&self, ops: Vec<PendingOp>) -> Vec<Vec<PendingOp>> {
        // Each group: the processes it touches, and its operations' positions.
        let mut groups: Vec<(HashSet<B256>, Vec<usize>)> = Vec::new();
        for (at, op) in ops.iter().enumerate() {
            let touched: HashSet<B256> = self.touched_processes(&op.op).into_iter().collect();
            let mut joined = (touched, vec![at]);
            let mut kept = Vec::with_capacity(groups.len());
            for group in groups {
                if group.0.is_disjoint(&joined.0) {
                    kept.push(group);
                } else {
                    joined.0.extend(group.0);
                    joined.1.extend(group.1);
                }
            }
            kept.push(joined);
            groups = kept;
        }
        for group in &mut groups {
            group.1.sort_unstable();
        }
        groups.sort_unstable_by_key(|group| group.1[0]);
        let mut slots: Vec<Option<PendingOp>> = ops.into_iter().map(Some).collect();
        groups
            .into_iter()
            .map(|(_, at)| at.into_iter().filter_map(|i| slots[i].take()).collect())
            .collect()
    }

    fn expiry_reason(&self) -> String {
        format!(
            "deferred at batch formation and not applied within {}s of its first deferral — its dependency never came, or its funding could not be read; dead-lettered, re-submittable",
            self.defer_window.as_secs()
        )
    }

    /// Drain all pending usage claims for batch assembly.
    pub async fn drain_usage(&self) -> Vec<UsageClaim> {
        let mut inner = self.inner.lock().await;
        inner.usage_index.clear();
        inner.pending_usage.drain(..).collect()
    }

    /// Re-queue usage claims at the front (e.g. after a failed prove).
    /// Cap-exempt: these were already acknowledged.
    pub async fn requeue_usage(&self, claims: Vec<UsageClaim>) {
        let mut inner = self.inner.lock().await;
        for claim in claims.into_iter().rev() {
            inner.usage_index.insert(claim_key(&claim));
            inner.pending_usage.push_front(claim);
        }
    }

    /// Number of pending usage claims.
    pub async fn usage_len(&self) -> usize {
        self.inner.lock().await.pending_usage.len()
    }

    /// Give operations back to the front of the mempool, in their order,
    /// untried: a batch cut to the block's gas budget returns the operations
    /// it did not take, and they wait for the next tick as if never drained.
    /// No attempt is counted — nothing was sent.
    /// An operation resubmitted meanwhile (the drain had freed its key) is
    /// dropped from where it was queued: the copy given back stands at the
    /// front, in the order the operations behind it were filtered into. The
    /// resubmission's id then names nothing; the operation lands under the
    /// id it was first given, and a submitter follows it by its key.
    pub async fn give_back(&self, ops: Vec<PendingOp>) {
        let mut inner = self.inner.lock().await;
        for mut op in ops.into_iter().rev() {
            op.behind.clear();
            if inner.index.contains_key(&op.key) {
                inner.pending.retain(|queued| queued.key != op.key);
            }
            inner.index.insert(op.key, op.id);
            inner.pending.push_front(op);
        }
    }

    /// Re-queue operations at the front of the mempool after a transient
    /// submission failure. Preserves original ordering. Cap-exempt: these
    /// were already acknowledged. An op re-queued more than `max_requeues`
    /// times is not re-queued but returned, with the reason, for the caller
    /// to dead-letter — a batch that never lands is not re-proved forever.
    /// A copy resubmitted meanwhile is dropped, as [`Mempool::give_back`]
    /// drops one.
    pub async fn requeue(&self, ops: Vec<PendingOp>) -> Vec<(PendingOp, String)> {
        let mut inner = self.inner.lock().await;
        let mut dropped = Vec::new();
        for mut op in ops.into_iter().rev() {
            op.behind.clear();
            let attempts = inner.requeues.entry(op.key).or_insert(0);
            *attempts += 1;
            if *attempts > self.max_requeues {
                let attempts = *attempts - 1;
                inner.requeues.remove(&op.key);
                dropped.push((
                    op,
                    format!(
                        "re-queued {attempts} times after transient submission failures without landing; dead-lettered, re-submittable"
                    ),
                ));
                continue;
            }
            if inner.index.contains_key(&op.key) {
                inner.pending.retain(|queued| queued.key != op.key);
            }
            inner.index.insert(op.key, op.id);
            inner.pending.push_front(op);
        }
        dropped.reverse();
        dropped
    }

    /// Number of pending operations, the deferred among them.
    pub async fn len(&self) -> usize {
        let inner = self.inner.lock().await;
        inner.pending.len() + inner.deferred_len()
    }

    /// Pre-check: verify EIP-712 signature validity and (for
    /// attestations) run the mirror's witness gates before accepting into
    /// the mempool. State-dependent checks (order active, process match,
    /// root-buyer identity) cannot run here — the proof enforces them.
    fn pre_check(&self, op: &KernelOp) -> Result<(), String> {
        let domain = domain_separator(self.chain_id, self.verifying_contract);

        match op {
            KernelOp::Commit {
                commitment,
                buyer_sig,
                seller_sig,
            } => {
                let struct_hash = commitment_struct_hash(commitment);
                let digest = typed_data_hash(&domain, &struct_hash);
                let buyer_addr = recover_signer(&digest, buyer_sig)
                    .map_err(|e| format!("invalid buyer signature: {e}"))?;
                if buyer_addr != commitment.buyer {
                    return Err(format!(
                        "buyer sig mismatch: recovered {buyer_addr}, expected {}",
                        commitment.buyer
                    ));
                }
                let seller_addr = recover_signer(&digest, seller_sig)
                    .map_err(|e| format!("invalid seller signature: {e}"))?;
                if seller_addr != commitment.seller {
                    return Err(format!(
                        "seller sig mismatch: recovered {seller_addr}, expected {}",
                        commitment.seller
                    ));
                }
                Ok(())
            }
            KernelOp::Resolve {
                process_id,
                commitments,
                buyer_sig,
            } => {
                let struct_hash = resolve_struct_hash(process_id);
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, buyer_sig)
                    .map_err(|e| format!("invalid resolve signature: {e}"))?;
                // Note: we can't check rootBuyer match without state — the
                // proof enforces this. Pre-check only verifies sig is valid.
                // An order listed twice never applies, whatever the state:
                // the Core resolves the first listing and reads the second
                // as not committed (`OrderNotCommitted`). The list rides
                // unsigned, so this is refused here, never deferred.
                let mut listed = HashSet::with_capacity(commitments.len());
                for c in commitments {
                    let order_hash = compute_order_hash(process_id, &commitment_struct_hash(c));
                    if !listed.insert(order_hash) {
                        return Err(format!(
                            "resolve lists order {order_hash} twice — the Core resolves an order once and refuses the second listing (OrderNotCommitted)"
                        ));
                    }
                }
                Ok(())
            }
            KernelOp::AttestAsSeller {
                role,
                target,
                clause_id,
                stage,
                content_ref,
                seller_sig,
                proof,
            } => {
                let (target_order_hash, _target_process_id) =
                    derive_commitment_ids(&domain, target);
                let struct_hash =
                    attest_seller_struct_hash(&target_order_hash, clause_id, *stage, content_ref);
                let digest = typed_data_hash(&domain, &struct_hash);
                let recovered = recover_signer(&digest, seller_sig)
                    .map_err(|e| format!("invalid attest-seller signature: {e}"))?;
                if recovered != role.seller {
                    return Err("attest-seller sig does not match role.seller".into());
                }
                // The mirror's witness gates (spec identity, content,
                // agreement inclusion) — the same code the guest runs.
                validate_attestation_content(
                    proof,
                    content_ref,
                    clause_id,
                    *stage,
                    &target.agreement_hash,
                )
                .map_err(|e| format!("attestation witness gates rejected: {e}"))?;
                Ok(())
            }
            KernelOp::AttestAsBuyer {
                target,
                clause_id,
                stage,
                content_ref,
                buyer_sig,
                proof,
            } => {
                let (target_order_hash, target_process_id) = derive_commitment_ids(&domain, target);
                let struct_hash = attest_buyer_struct_hash(
                    &target_process_id,
                    &target_order_hash,
                    clause_id,
                    *stage,
                    content_ref,
                );
                let digest = typed_data_hash(&domain, &struct_hash);
                let recovered = recover_signer(&digest, buyer_sig)
                    .map_err(|e| format!("invalid attest-buyer signature: {e}"))?;
                if recovered != target.buyer {
                    return Err("attest-buyer sig does not match target.buyer".into());
                }
                validate_attestation_content(
                    proof,
                    content_ref,
                    clause_id,
                    *stage,
                    &target.agreement_hash,
                )
                .map_err(|e| format!("attestation witness gates rejected: {e}"))?;
                Ok(())
            }
        }
    }
}

/// Whether the commit `c` precedes `f` in a process `f` touches: `c` is a
/// commit of one of `touched`, and `f` is not a commit, or is one of lower
/// cumulative value in that process.
fn commit_precedes(domain: &B256, c: &KernelOp, f: &KernelOp, touched: &HashSet<B256>) -> bool {
    let KernelOp::Commit { commitment: c, .. } = c else {
        return false;
    };
    let process = derive_commitment_ids(domain, c).1;
    if !touched.contains(&process) {
        return false;
    }
    match f {
        KernelOp::Commit { commitment: f, .. } => c.expected_cumulative_value < f.expected_cumulative_value,
        _ => true,
    }
}

/// The slice of `state` an operation of these processes reads: the
/// processes, and the orders filed under them. The Core's rules read
/// nothing else for an operation — a commit reads its process and its own
/// order (an order's hash binds its process), an attestation its role and
/// target orders, a resolve its process and listed orders — and no
/// operation reads the usage state, so an operation applies against the
/// slice exactly as against the whole. One assumption: every key in
/// `order_status` is also in `order_process_id`, filed under the process its
/// hash binds. The Core mirror writes the two together (`apply_commit`) and
/// nothing removes either; the snapshot carries no serde defaults; and the
/// state root covers `order_process_id`, so every state the relay holds came
/// out of the Core mirror.
fn group_state(state: &KernelStateSnapshot, processes: &HashSet<B256>) -> KernelStateSnapshot {
    let orders: HashSet<B256> = state
        .order_process_id
        .iter()
        .filter(|(_, p)| processes.contains(p))
        .map(|(o, _)| *o)
        .collect();
    KernelStateSnapshot {
        processes: state.processes.iter().filter(|(p, _)| processes.contains(p)).cloned().collect(),
        order_status: state.order_status.iter().filter(|(o, _)| orders.contains(o)).cloned().collect(),
        order_process_id: state
            .order_process_id
            .iter()
            .filter(|(o, _)| orders.contains(o))
            .cloned()
            .collect(),
        usage_counted: Vec::new(),
        usage_seller_seen: Vec::new(),
        usage_accrual: Vec::new(),
    }
}

/// Dedup key for a usage claim: hash of its canonical JSON. A claim has no
/// signature of its own (the guest re-proves everything), so byte identity
/// is the right notion of "same claim".
fn claim_key(claim: &UsageClaim) -> B256 {
    keccak256(serde_json::to_vec(claim).expect("UsageClaim serializes"))
}
