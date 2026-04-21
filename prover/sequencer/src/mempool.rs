/// Mempool — holds pending signed operations until they are assembled
/// into a batch.
///
/// Pre-checks are advisory only. The proof enforces all invariants.
/// Pre-checks exist to reject clearly invalid operations early and
/// avoid wasting prover compute.
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

use figaro_kernel::eip712::*;
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

    /// Pre-check: verify EIP-712 signature validity before accepting
    /// into the mempool. This catches malformed or mis-signed operations
    /// early to avoid wasting prover compute.
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
                role_commitment,
                order_hash,
                schema_id,
                stage,
                content_ref,
                seller_sig,
            } => {
                let struct_hash = attest_seller_struct_hash(
                    order_hash, schema_id, *stage, content_ref,
                );
                let digest = typed_data_hash(&domain, &struct_hash);
                let recovered = recover_signer(&digest, seller_sig)
                    .map_err(|e| format!("invalid attest-seller signature: {e}"))?;
                if recovered != role_commitment.seller {
                    return Err("attest-seller sig does not match role_commitment.seller".into());
                }
                Ok(())
            }
            KernelOp::AttestAsBuyer {
                process_id,
                order_hash,
                schema_id,
                stage,
                content_ref,
                buyer_sig,
            } => {
                let struct_hash = attest_buyer_struct_hash(
                    process_id, order_hash, schema_id, *stage, content_ref,
                );
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, buyer_sig)
                    .map_err(|e| format!("invalid attest-buyer signature: {e}"))?;
                Ok(())
            }
            KernelOp::RegisterSchema {
                schema_id,
                version,
                uri_hash,
                registrar_sig,
            } => {
                let struct_hash = register_schema_struct_hash(schema_id, *version, uri_hash);
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, registrar_sig)
                    .map_err(|e| format!("invalid register-schema signature: {e}"))?;
                Ok(())
            }
            KernelOp::SetMechanismSchema {
                schema_id,
                mechanism_sig,
            } => {
                let struct_hash = set_mechanism_schema_struct_hash(schema_id);
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, mechanism_sig)
                    .map_err(|e| format!("invalid set-mechanism-schema signature: {e}"))?;
                Ok(())
            }
            KernelOp::RegisterOperator {
                role,
                metadata_uri,
                operator_sig,
            } => {
                let struct_hash =
                    register_operator_struct_hash(*role as u8, metadata_uri);
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, operator_sig)
                    .map_err(|e| format!("invalid register-operator signature: {e}"))?;
                Ok(())
            }
            KernelOp::UpdateOperator {
                role,
                metadata_uri,
                operator_sig,
            } => {
                let struct_hash =
                    update_operator_struct_hash(*role as u8, metadata_uri);
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, operator_sig)
                    .map_err(|e| format!("invalid update-operator signature: {e}"))?;
                Ok(())
            }
            KernelOp::DeactivateOperator { operator_sig } => {
                let struct_hash = deactivate_operator_struct_hash();
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, operator_sig)
                    .map_err(|e| format!("invalid deactivate-operator signature: {e}"))?;
                Ok(())
            }
            KernelOp::ReactivateOperator { operator_sig } => {
                let struct_hash = reactivate_operator_struct_hash();
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, operator_sig)
                    .map_err(|e| format!("invalid reactivate-operator signature: {e}"))?;
                Ok(())
            }
        }
    }
}
