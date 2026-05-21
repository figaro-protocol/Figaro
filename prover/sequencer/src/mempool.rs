/// Mempool — holds pending signed operations until they are assembled
/// into a batch.
///
/// Pre-checks are advisory only. The proof enforces all invariants.
/// Pre-checks exist to reject clearly invalid operations early and
/// avoid wasting prover compute.
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

use alloy_primitives::{keccak256, B256};

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
                content_proof,
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
                pre_check_attest_content(
                    content_proof.as_ref(),
                    content_ref,
                    schema_id,
                    *stage,
                    Some(&role_commitment.agreement_hash),
                )?;
                Ok(())
            }
            KernelOp::AttestAsBuyer {
                process_id,
                order_hash,
                schema_id,
                stage,
                content_ref,
                buyer_sig,
                content_proof,
            } => {
                let struct_hash = attest_buyer_struct_hash(
                    process_id, order_hash, schema_id, *stage, content_ref,
                );
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, buyer_sig)
                    .map_err(|e| format!("invalid attest-buyer signature: {e}"))?;
                pre_check_attest_content(
                    content_proof.as_ref(),
                    content_ref,
                    schema_id,
                    *stage,
                    None,
                )?;
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
                metadata_uri,
                operator_sig,
            } => {
                let struct_hash = register_operator_struct_hash(metadata_uri);
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, operator_sig)
                    .map_err(|e| format!("invalid register-operator signature: {e}"))?;
                Ok(())
            }
            KernelOp::UpdateProfile {
                metadata_uri,
                operator_sig,
            } => {
                let struct_hash = update_profile_struct_hash(metadata_uri);
                let digest = typed_data_hash(&domain, &struct_hash);
                recover_signer(&digest, operator_sig)
                    .map_err(|e| format!("invalid update-profile signature: {e}"))?;
                Ok(())
            }
        }
    }
}

/// Mempool-side mirror of the kernel's Layer B content gate
/// (`validate_attestation_content` in `figaro_kernel::kernel`). Returns
/// `Ok` when no `content_proof` is present (content-opaque path) or when
/// every gate passes. Returns a human-readable rejection string
/// otherwise so the same op never reaches the prover.
///
/// `agreement_hash` is `Some` for seller attestations (Gate 5 — agreement
/// inclusion) and `None` for buyer attestations, which skip Gate 5.
fn pre_check_attest_content(
    proof: Option<&AttestationContentProof>,
    content_ref: &B256,
    schema_id: &B256,
    stage: u8,
    agreement_hash: Option<&B256>,
) -> Result<(), String> {
    let Some(proof) = proof else {
        // Mirror the kernel: a content-bearing attestation (non-zero
        // content_ref) under a protocol schema the kernel can validate
        // must carry a content_proof.
        if *content_ref != B256::ZERO
            && figaro_schema::embedded_spec_json(schema_id).is_some()
        {
            return Err(format!(
                "attestation under content-bearing schema {schema_id} requires a content_proof"
            ));
        }
        return Ok(());
    };

    // ── Gate 0: parse the wire-form content JSON ──
    let content_json_value: serde_json::Value = serde_json::from_str(&proof.content_json)
        .map_err(|e| format!("content_proof content_json is not valid JSON: {e}"))?;

    // ── Gate 1: look up the canonical embedded spec for this schemaId ──
    let spec_json = figaro_schema::embedded_spec_json(schema_id).ok_or_else(|| {
        format!("schema_id {schema_id} is not a runtime-attestable protocol schema")
    })?;
    let spec_value: serde_json::Value = serde_json::from_str(spec_json)
        .map_err(|e| format!("embedded schema spec is not valid JSON: {e}"))?;
    let parsed = match figaro_schema::parse_schema_spec(&spec_value) {
        figaro_schema::ParseSchemaSpecResult::Ok(s) => s,
        figaro_schema::ParseSchemaSpecResult::Err(errors) => {
            let first = errors
                .first()
                .map(|e| format!("{}: {}", e.path, e.message))
                .unwrap_or_else(|| "unknown parse error".to_string());
            return Err(format!("embedded schema spec failed to parse: {first}"));
        }
    };

    // ── Gate 2: content satisfies the spec at the given stage ──
    let options = figaro_schema::ValidateOptions { stage: Some(stage) };
    if let figaro_schema::ValidationResult::Err(errors) =
        figaro_schema::validate_content(&content_json_value, &parsed, options)
    {
        let first = errors
            .first()
            .map(|e| format!("{}: {}", e.path, e.message))
            .unwrap_or_else(|| "unknown validation error".to_string());
        return Err(format!("content_proof content_json failed validation: {first}"));
    }

    // ── Gate 3: re-derive canonical ABI bytes from the JSON ──
    let derived =
        figaro_schema::encode_content_for_schema(&parsed.schema_id, &content_json_value)
            .map_err(|e| format!("content_proof canonical encoding failed: {e}"))?;

    // ── Gate 4: derived bytes hash to the on-chain content_ref ──
    if &keccak256(derived.as_slice()) != content_ref {
        return Err(
            "content_proof canonical-encoding hash does not match op.content_ref".into(),
        );
    }

    // ── Gate 5: the schema clause is in the order's signed agreement ──
    // Mirrors the kernel: seller attestations bind to the role commitment's
    // agreement_hash; buyer attestations pass None and skip this gate.
    if let Some(agreement_hash) = agreement_hash {
        // `cross_checks` is read off the already-parsed embedded spec (its
        // block tier), mirroring the kernel — no parallel table to drift.
        let cross_checks = parsed.cross_checks();
        let section_data_hash = if cross_checks {
            *content_ref
        } else {
            let section_data = proof.section_data.as_ref().ok_or_else(|| {
                format!(
                    "content_proof for non-cross-checking schema {schema_id} omits section_data"
                )
            })?;
            keccak256(section_data.as_bytes())
        };
        let mut leaf_preimage = [0u8; 64];
        leaf_preimage[..32].copy_from_slice(schema_id.as_slice());
        leaf_preimage[32..].copy_from_slice(section_data_hash.as_slice());
        let leaf = keccak256(leaf_preimage);
        if !figaro_kernel::merkle::verify_inclusion(&proof.inclusion_proof, *agreement_hash, leaf) {
            return Err(
                "content_proof inclusion proof does not verify against the order's agreement_hash"
                    .into(),
            );
        }
    }
    Ok(())
}
