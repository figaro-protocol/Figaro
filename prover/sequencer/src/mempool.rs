/// Mempool — holds pending signed operations until they are assembled
/// into a batch.
///
/// Pre-checks are advisory only. The proof enforces all invariants.
/// Pre-checks exist to reject clearly invalid operations early and
/// avoid wasting prover compute. The attestation content gate is the
/// kernel's own `validate_attestation_content` — the exact function the
/// guest runs — so mempool acceptance and in-proof acceptance cannot
/// drift.
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
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
}

/// Result of an accepted submission.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Admission {
    pub id: u64,
    /// True when the same artifact was already pending — the original
    /// acknowledgment is returned and nothing is enqueued twice.
    pub duplicate: bool,
}

/// Why a submission was refused. `Full` is a capacity signal (retry after
/// the next batch drains the queue); `Invalid` is a rejection of the
/// artifact itself.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SubmitError {
    Invalid(String),
    Full,
}

impl std::fmt::Display for SubmitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SubmitError::Invalid(e) => write!(f, "{e}"),
            SubmitError::Full => write!(f, "mempool full — retry after the next batch settles"),
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
}

struct MempoolInner {
    pending: VecDeque<PendingOp>,
    /// Dedup index over the pending op queue: semantic key → assigned id.
    /// Cleared on drain — idempotency covers the pending window; once a
    /// batch settles, a re-submission is dropped by the stateful assembler
    /// filter instead (the kernel state already carries the effect).
    index: HashMap<B256, u64>,
    /// Usage claims awaiting the next batch. Kept in their OWN queue, not
    /// interleaved with ops: a claim is not a kernel operation, it changes
    /// no kernel state, and the guest applies every claim after every op
    /// (against the post-state) so the two orderings are independent.
    pending_usage: VecDeque<UsageClaim>,
    /// Dedup index over pending usage claims (hash of the claim's
    /// canonical JSON). Cleared on drain, like `index`.
    usage_index: HashSet<B256>,
    next_id: u64,
}

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
    /// drains it (and is re-queued, cap-exempt, if settlement fails
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
                next_id: 1,
            })),
            chain_id,
            verifying_contract,
            max_pending_ops,
            max_pending_usage,
        }
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
        if inner.pending.len() >= self.max_pending_ops {
            return Err(SubmitError::Full);
        }
        let id = inner.next_id;
        inner.next_id += 1;
        inner.index.insert(key, id);
        inner.pending.push_back(PendingOp { id, key, op });
        Ok(Admission {
            id,
            duplicate: false,
        })
    }

    /// Semantic dedup key: the on-chain identity of the op's effect, not
    /// its byte encoding — so a re-signed duplicate (ECDSA signatures are
    /// not unique per digest) still deduplicates.
    fn op_key(&self, op: &KernelOp) -> B256 {
        let domain = domain_separator(self.chain_id, self.verifying_contract);
        let mut buf: Vec<u8> = Vec::new();
        match op {
            KernelOp::Commit { commitment, .. } => {
                let (order_hash, _) = derive_commitment_ids(&domain, commitment);
                buf.extend_from_slice(b"commit");
                buf.extend_from_slice(order_hash.as_slice());
            }
            KernelOp::Resolve { process_id, .. } => {
                buf.extend_from_slice(b"resolve");
                buf.extend_from_slice(process_id.as_slice());
            }
            KernelOp::AttestAsSeller {
                target,
                clause_id,
                stage,
                content_ref,
                ..
            } => {
                let (order_hash, _) = derive_commitment_ids(&domain, target);
                buf.extend_from_slice(b"attest-seller");
                buf.extend_from_slice(order_hash.as_slice());
                buf.extend_from_slice(clause_id.as_slice());
                buf.push(*stage);
                buf.extend_from_slice(content_ref.as_slice());
            }
            KernelOp::AttestAsBuyer {
                target,
                clause_id,
                stage,
                content_ref,
                ..
            } => {
                let (order_hash, _) = derive_commitment_ids(&domain, target);
                buf.extend_from_slice(b"attest-buyer");
                buf.extend_from_slice(order_hash.as_slice());
                buf.extend_from_slice(clause_id.as_slice());
                buf.push(*stage);
                buf.extend_from_slice(content_ref.as_slice());
            }
        }
        keccak256(&buf)
    }

    /// Submit an RPGF usage claim for an order the batch path has settled.
    ///
    /// Claims are SUBMITTED, never derived here — exactly as attestation
    /// witnesses are. The sequencer holds no agreements: it sees commitment
    /// structs, whose `agreement_hash` is a root, not the sections. Whoever
    /// holds the agreement (the artifact's author, typically, since this is
    /// how their work gets counted) supplies the section fingerprint and the
    /// inclusion proof. Nothing is trusted either way — the guest re-proves
    /// settlement and inclusion, and the counter enforces the reward's own
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
        if claim.artifact == alloy_primitives::B256::ZERO {
            return Err(SubmitError::Invalid(
                "usage claim artifact is zero".to_string(),
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
        let mut inner = self.inner.lock().await;
        inner.index.clear();
        inner.pending.drain(..).collect()
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

    /// Re-queue operations at the front of the mempool (e.g. after a
    /// failed prove or submission). Preserves original ordering.
    /// Cap-exempt: these were already acknowledged.
    pub async fn requeue(&self, ops: Vec<PendingOp>) {
        let mut inner = self.inner.lock().await;
        for op in ops.into_iter().rev() {
            inner.index.insert(op.key, op.id);
            inner.pending.push_front(op);
        }
    }

    /// Number of pending operations.
    pub async fn len(&self) -> usize {
        self.inner.lock().await.pending.len()
    }

    /// Pre-check: verify EIP-712 signature validity and (for
    /// attestations) run the kernel's witness gates before accepting into
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
                buyer_sig,
                ..
            } => {
                let struct_hash = resolve_struct_hash(process_id);
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, buyer_sig)
                    .map_err(|e| format!("invalid resolve signature: {e}"))?;
                // Note: we can't check rootBuyer match without state — the
                // proof enforces this. Pre-check only verifies sig is valid.
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
                // The kernel's witness gates (spec identity, content,
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

/// Dedup key for a usage claim: hash of its canonical JSON. A claim has no
/// signature of its own (the guest re-proves everything), so byte identity
/// is the right notion of "same claim".
fn claim_key(claim: &UsageClaim) -> B256 {
    keccak256(serde_json::to_vec(claim).expect("UsageClaim serializes"))
}
