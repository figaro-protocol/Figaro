/// Mempool — holds pending signed operations until they are assembled
/// into a batch.
///
/// Pre-checks are advisory only. The proof enforces all invariants.
/// Pre-checks exist to reject clearly invalid operations early and
/// avoid wasting prover compute. The attestation content gate is the
/// kernel's own `validate_attestation_content` — the exact function the
/// guest runs — so mempool acceptance and in-proof acceptance cannot
/// drift.
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{derive_commitment_ids, validate_attestation_content};
use figaro_kernel::types::*;

/// A submitted operation with its unique ID for tracking.
#[derive(Clone, Debug)]
pub struct PendingOp {
    pub id: u64,
    pub op: KernelOp,
}

/// Thread-safe operation mempool.
#[derive(Clone)]
pub struct Mempool {
    inner: Arc<Mutex<MempoolInner>>,
    chain_id: u64,
    verifying_contract: alloy_primitives::Address,
}

struct MempoolInner {
    pending: VecDeque<PendingOp>,
    next_id: u64,
}

impl Mempool {
    pub fn new(chain_id: u64, verifying_contract: alloy_primitives::Address) -> Self {
        Self {
            inner: Arc::new(Mutex::new(MempoolInner {
                pending: VecDeque::new(),
                next_id: 1,
            })),
            chain_id,
            verifying_contract,
        }
    }

    /// Submit a signed operation. Returns the operation ID or an error.
    pub async fn submit(&self, op: KernelOp) -> Result<u64, String> {
        // Pre-check: verify signatures are well-formed
        self.pre_check(&op)?;

        let mut inner = self.inner.lock().await;
        let id = inner.next_id;
        inner.next_id += 1;
        inner.pending.push_back(PendingOp { id, op });
        Ok(id)
    }

    /// Drain all pending operations for batch assembly.
    pub async fn drain(&self) -> Vec<PendingOp> {
        let mut inner = self.inner.lock().await;
        inner.pending.drain(..).collect()
    }

    /// Re-queue operations at the front of the mempool (e.g. after a
    /// failed prove or submission). Preserves original ordering.
    pub async fn requeue(&self, ops: Vec<PendingOp>) {
        let mut inner = self.inner.lock().await;
        for op in ops.into_iter().rev() {
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
                let (target_order_hash, target_process_id) =
                    derive_commitment_ids(&domain, target);
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
