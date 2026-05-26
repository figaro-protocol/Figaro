use alloy_primitives::{Address, B256, U256, keccak256};
use std::collections::{BTreeMap, BTreeSet};

use crate::eip712::{
    attest_buyer_struct_hash, attest_seller_struct_hash, commitment_struct_hash,
    compute_order_hash, domain_separator,
    recover_signer, register_operator_struct_hash,
    register_schema_struct_hash, resolve_struct_hash, set_mechanism_schema_struct_hash,
    typed_data_hash, update_profile_struct_hash,
};
use crate::state::KernelState;
use crate::types::*;

// ── Token flow tracker ────────────────────────────────────────────

/// Accumulates deposit and payout amounts per (token, user) across
/// all operations in a batch.
struct TokenTracker {
    deposits: BTreeMap<(Address, Address), U256>,
    payouts: BTreeMap<(Address, Address), U256>,
}

impl TokenTracker {
    fn new() -> Self {
        Self {
            deposits: BTreeMap::new(),
            payouts: BTreeMap::new(),
        }
    }

    fn deposit(&mut self, token: Address, user: Address, amount: U256) {
        let entry = self.deposits.entry((token, user)).or_insert(U256::ZERO);
        *entry = entry
            .checked_add(amount)
            .expect("deposit accumulator overflow");
    }

    fn payout(&mut self, token: Address, user: Address, amount: U256) {
        let entry = self.payouts.entry((token, user)).or_insert(U256::ZERO);
        *entry = entry
            .checked_add(amount)
            .expect("payout accumulator overflow");
    }

    fn net_positions(&self) -> Vec<NetPosition> {
        let mut keys = BTreeSet::new();
        for k in self.deposits.keys() {
            keys.insert(*k);
        }
        for k in self.payouts.keys() {
            keys.insert(*k);
        }
        keys.into_iter()
            .map(|(token, user)| NetPosition {
                token,
                user,
                deposit: self
                    .deposits
                    .get(&(token, user))
                    .copied()
                    .unwrap_or(U256::ZERO),
                payout: self
                    .payouts
                    .get(&(token, user))
                    .copied()
                    .unwrap_or(U256::ZERO),
            })
            .collect()
    }
}

/// Deterministic hash of net positions for inclusion in public values.
pub fn compute_positions_hash(positions: &[NetPosition]) -> B256 {
    let mut data = Vec::new();
    for p in positions {
        data.extend_from_slice(p.token.as_slice());
        data.extend_from_slice(p.user.as_slice());
        data.extend_from_slice(&p.deposit.to_be_bytes::<32>());
        data.extend_from_slice(&p.payout.to_be_bytes::<32>());
    }
    keccak256(&data)
}

// ── commit ────────────────────────────────────────────────────────

/// Apply a single commit operation. Matches `FigaroCore.commit()` exactly.
///
/// Returns `(processId, orderHash)`.
fn apply_commit(
    state: &mut KernelState,
    domain: &B256,
    c: &Commitment,
    buyer_sig: &Signature,
    seller_sig: &Signature,
    timestamp: u64,
    tracker: &mut TokenTracker,
) -> Result<(B256, B256), KernelError> {
    // ── Pre-checks ──
    if c.deadline < U256::from(timestamp) {
        return Err(KernelError::DeadlineExpired);
    }
    if c.payment.is_zero() {
        return Err(KernelError::ZeroPayment);
    }

    // ── EIP-712 digest ──
    let struct_hash = commitment_struct_hash(c);
    let digest = typed_data_hash(domain, &struct_hash);

    // ── Dual-signature verification ──
    let recovered_buyer = recover_signer(&digest, buyer_sig)?;
    if recovered_buyer != c.buyer {
        return Err(KernelError::InvalidBuyerSignature);
    }

    let recovered_seller = recover_signer(&digest, seller_sig)?;
    if recovered_seller != c.seller {
        return Err(KernelError::InvalidSellerSignature);
    }

    // ── Process ID derivation ──
    // Root: processId IS the EIP-712 digest (matches Solidity).
    let process_id = if c.process_id == B256::ZERO {
        digest
    } else {
        c.process_id
    };

    // ── Root vs sub-order ──
    if c.process_id == B256::ZERO {
        // Root order: create new process.
        if state.processes.contains_key(&process_id) {
            return Err(KernelError::ProcessAlreadyExists);
        }
        if c.expected_cumulative_value != c.payment {
            return Err(KernelError::InvalidRootCumulativeValue);
        }
        state.processes.insert(
            process_id,
            ProcessState {
                root_buyer: c.buyer,
                currency: c.currency,
                cumulative_value: c.payment,
                active_order_count: 1,
            },
        );
    } else {
        // Sub-order: extend existing process.
        let ps = state
            .processes
            .get_mut(&process_id)
            .ok_or(KernelError::UnknownProcess)?;
        if ps.active_order_count == 0 {
            return Err(KernelError::ProcessAlreadyResolved);
        }
        if c.buyer != ps.root_buyer {
            return Err(KernelError::NotProcessBuyer);
        }
        if c.currency != ps.currency {
            return Err(KernelError::CurrencyMismatch);
        }
        let actual = ps
            .cumulative_value
            .checked_add(c.payment)
            .ok_or(KernelError::Overflow)?;
        if c.expected_cumulative_value != actual {
            return Err(KernelError::CumulativeValueMismatch {
                expected: c.expected_cumulative_value,
                actual,
            });
        }
        ps.cumulative_value = actual;
        ps.active_order_count += 1;
    }

    // ── Order hash and nullifier ──
    let order_hash = compute_order_hash(&process_id, &struct_hash);
    if state.order_status.get(&order_hash).copied().unwrap_or(0) != 0 {
        return Err(KernelError::DuplicateCommitment);
    }
    state.order_status.insert(order_hash, 1);
    state.order_process_id.insert(order_hash, process_id);

    // ── Token flows ──
    // Buyer bond = 2 × payment.
    let buyer_bond = c
        .payment
        .checked_mul(U256::from(2))
        .ok_or(KernelError::Overflow)?;
    // Seller bond = 2 × expectedCumulativeValue.
    let seller_bond = c
        .expected_cumulative_value
        .checked_mul(U256::from(2))
        .ok_or(KernelError::Overflow)?;

    tracker.deposit(c.currency, c.buyer, buyer_bond);
    tracker.deposit(c.currency, c.seller, seller_bond);

    Ok((process_id, order_hash))
}

// ── resolveProcess ────────────────────────────────────────────────

/// Apply a single resolve operation. Matches `FigaroCore.resolveProcess()`
/// except buyer authorization is via EIP-712 signature (batched equivalent
/// of `msg.sender == rootBuyer`).
fn apply_resolve(
    state: &mut KernelState,
    domain: &B256,
    process_id: &B256,
    commitments: &[Commitment],
    buyer_sig: &Signature,
    tracker: &mut TokenTracker,
) -> Result<(), KernelError> {
    let ps = state
        .processes
        .get(process_id)
        .ok_or(KernelError::UnknownProcess)?;

    // ── Buyer authorization via EIP-712 signature ──
    let resolve_hash = resolve_struct_hash(process_id);
    let digest = typed_data_hash(domain, &resolve_hash);
    let recovered = recover_signer(&digest, buyer_sig)?;
    if recovered != ps.root_buyer {
        return Err(KernelError::NotProcessBuyer);
    }

    // ── Pre-checks ──
    if ps.active_order_count == 0 {
        return Err(KernelError::NoActiveOrders);
    }
    if commitments.len() as u64 != ps.active_order_count {
        return Err(KernelError::IncompleteOrderList {
            required: ps.active_order_count,
            provided: commitments.len() as u64,
        });
    }

    let currency = ps.currency;
    let buyer = ps.root_buyer;

    // ── Per-order resolution ──
    for c in commitments {
        let struct_hash = commitment_struct_hash(c);
        let order_hash = compute_order_hash(process_id, &struct_hash);

        if state.order_status.get(&order_hash).copied().unwrap_or(0) != 1 {
            return Err(KernelError::OrderNotCommitted(order_hash));
        }

        // Seller payout = expectedCumulativeValue × 2 + payment.
        let seller_payout = c
            .expected_cumulative_value
            .checked_mul(U256::from(2))
            .ok_or(KernelError::Overflow)?
            .checked_add(c.payment)
            .ok_or(KernelError::Overflow)?;
        // Buyer payout = payment.
        let buyer_payout = c.payment;

        tracker.payout(currency, c.seller, seller_payout);
        tracker.payout(currency, buyer, buyer_payout);

        state.order_status.insert(order_hash, 2);
    }

    // ── Finalize process ──
    let ps = state.processes.get_mut(process_id).unwrap();
    ps.active_order_count = 0;

    Ok(())
}

// ── Layer B content-proof gate (figaro-schema) ────────────────────

/// Verify an optional `AttestationContentProof` against the on-chain
/// `content_ref` and the schema declared in the op's `schema_id`.
///
/// When `proof` is `None` this is a no-op (content-opaque attestation).
/// When `Some`, the kernel asserts:
///
///   1. `schema_id` is one of the runtime-attestable protocol schemas —
///      its canonical spec is compiled into the prover binary
///      (`figaro_schema::embedded_spec_json`). The spec is looked up by
///      `schema_id`, never supplied by the caller, so the constraint set
///      is covered by the program verification key.
///   2. `validate_content(content_json, embedded_spec, stage)` succeeds.
///   3. `encode_content_for_schema(schemaId, content_json)` derives the
///      canonical ABI byte form from the JSON — the cross-form binding:
///      the bytes Layer C decodes are derived from the JSON Layer B
///      validates, so they describe the same content by construction.
///   4. `keccak256(derived_bytes) == content_ref` — binds the derived
///      bytes to the on-chain commitment value.
///   5. When `agreement_hash` is `Some` (seller attestations), the
///      schema's section is a clause of the order's signed agreement: the
///      sorted-pair Merkle `inclusion_proof` verifies the section leaf
///      against `agreement_hash`. The leaf is `keccak256(schemaId ++
///      keccak256(sectionData))`; a cross-checking schema's `sectionData`
///      is the ABI content form, so `keccak256(sectionData) == content_ref`
///      and the leaf needs no extra input. A non-cross-checking schema
///      carries its canonical-JSON `section_data` in the proof.
///      Buyer attestations pass `agreement_hash: None` and skip this gate —
///      a buyer's evidence is the kernel event log, not an agreement clause.
///
/// Any failure halts batch execution.
fn validate_attestation_content(
    proof: Option<&crate::types::AttestationContentProof>,
    content_ref: &B256,
    schema_id: &B256,
    stage: u8,
    agreement_hash: Option<&B256>,
) -> Result<(), KernelError> {
    let Some(proof) = proof else {
        // A content-opaque attestation (content_ref == 0) needs no proof.
        // A content-bearing attestation (content_ref != 0) under a
        // protocol schema the kernel can validate MUST carry one — else
        // the batched path would record unvalidated content that the
        // direct path's validator gate would have rejected.
        if *content_ref != B256::ZERO
            && figaro_schema::embedded_spec_json(schema_id).is_some()
        {
            return Err(KernelError::ContentProofRequired);
        }
        return Ok(());
    };

    // ── Gate 0: parse the wire-form content JSON ──
    let content_json_value: serde_json::Value = serde_json::from_str(&proof.content_json)
        .map_err(|e| KernelError::ContentEncodingFailed(format!("content_json not valid JSON: {e}")))?;

    // ── Gate 1: look up the canonical embedded spec for this schemaId ──
    // The spec is compiled into the binary, not carried on the wire, so a
    // caller cannot weaken validation with a permissive spec. A schemaId
    // with no embedded spec is not a runtime-attestable protocol schema.
    let spec_json = figaro_schema::embedded_spec_json(schema_id)
        .ok_or_else(|| KernelError::SchemaEncoderMissing(format!("{schema_id}")))?;
    let spec_value: serde_json::Value = serde_json::from_str(spec_json)
        .map_err(|e| KernelError::SchemaSpecParseFailed(format!("embedded spec not valid JSON: {e}")))?;
    let parsed = match figaro_schema::parse_schema_spec(&spec_value) {
        figaro_schema::ParseSchemaSpecResult::Ok(s) => s,
        figaro_schema::ParseSchemaSpecResult::Err(errors) => {
            let first = errors
                .first()
                .map(|e| format!("{}: {}", e.path, e.message))
                .unwrap_or_else(|| "unknown parse error".to_string());
            return Err(KernelError::SchemaSpecParseFailed(first));
        }
    };

    // ── Gate 2: content satisfies the spec at the given stage ──
    let options = figaro_schema::ValidateOptions { stage: Some(stage) };
    match figaro_schema::validate_content(&content_json_value, &parsed, options) {
        figaro_schema::ValidationResult::Ok => (),
        figaro_schema::ValidationResult::Err(errors) => {
            let first = errors
                .first()
                .map(|e| format!("{}: {}", e.path, e.message))
                .unwrap_or_else(|| "unknown validation error".to_string());
            return Err(KernelError::SchemaContentInvalid(first));
        }
    }

    // ── Gate 3: re-derive canonical ABI bytes from the JSON ──
    let derived_bytes = figaro_schema::encode_content_for_schema(
        &parsed.schema_id,
        &content_json_value,
    )
    .map_err(|e| match e {
        figaro_schema::EncodeError::UnsupportedSchema(id) => KernelError::SchemaEncoderMissing(id),
        other => KernelError::ContentEncodingFailed(other.to_string()),
    })?;

    // ── Gate 4: derived bytes hash to the on-chain content_ref ──
    let computed = keccak256(derived_bytes.as_slice());
    if &computed != content_ref {
        return Err(KernelError::ContentHashMismatch);
    }

    // ── Gate 5: the schema clause is in the order's signed agreement ──
    // Seller attestations bind to the role commitment's agreement_hash;
    // buyer attestations pass None and skip this gate.
    if let Some(agreement_hash) = agreement_hash {
        // The agreement Merkle leaf is keccak256(schemaId ++ sectionDataHash).
        // For a cross-checking (Category-2) schema the committed sectionData
        // is the ABI content form, so sectionDataHash == content_ref. A
        // non-cross-checking schema carries its canonical-JSON section_data.
        // `cross_checks` is read off the already-parsed embedded spec (its
        // block tier) — no parallel table to drift from the JSON.
        let cross_checks = parsed.cross_checks();
        let section_data_hash = if cross_checks {
            *content_ref
        } else {
            let section_data = proof
                .section_data
                .as_ref()
                .ok_or(KernelError::MissingSectionData)?;
            keccak256(section_data.as_bytes())
        };
        let mut leaf_preimage = [0u8; 64];
        leaf_preimage[..32].copy_from_slice(schema_id.as_slice());
        leaf_preimage[32..].copy_from_slice(section_data_hash.as_slice());
        let leaf = keccak256(leaf_preimage);
        if !crate::merkle::verify_inclusion(&proof.inclusion_proof, *agreement_hash, leaf) {
            return Err(KernelError::InvalidInclusionProof);
        }
    }

    Ok(())
}

// ── attestAsSeller ────────────────────────────────────────────────

/// Apply a seller attestation. Matches the authorization logic in
/// `AttestationCoordinator.attestAsSeller()` with msg.sender replaced
/// by EIP-712 signature verification.
fn apply_attest_as_seller(
    state: &KernelState,
    domain: &B256,
    role_commitment: &Commitment,
    order_hash: &B256,
    schema_id: &B256,
    stage: u8,
    content_ref: &B256,
    seller_sig: &Signature,
    content_proof: Option<&crate::types::AttestationContentProof>,
    events: &mut Vec<AttestationEventData>,
) -> Result<(), KernelError> {
    // ── Layer B gate: validate content against schema (no-op if absent) ──
    // Gate 5 binds the schema clause to the role commitment's agreement.
    validate_attestation_content(
        content_proof,
        content_ref,
        schema_id,
        stage,
        Some(&role_commitment.agreement_hash),
    )?;

    // ── Recover signer (replaces msg.sender) ──
    let struct_hash = attest_seller_struct_hash(order_hash, schema_id, stage, content_ref);
    let digest = typed_data_hash(domain, &struct_hash);
    let attester = recover_signer(&digest, seller_sig)?;

    // ── Verify role commitment exists in state (_requireKnownCommitment) ──
    let role_process_id = if role_commitment.process_id == B256::ZERO {
        // Root order: processId is the EIP-712 digest of the commitment
        let commit_struct = commitment_struct_hash(role_commitment);
        typed_data_hash(domain, &commit_struct)
    } else {
        role_commitment.process_id
    };
    let role_struct = commitment_struct_hash(role_commitment);
    let role_order_hash = compute_order_hash(&role_process_id, &role_struct);

    if state.order_status.get(&role_order_hash).copied().unwrap_or(0) == 0 {
        return Err(KernelError::UnknownOrder);
    }

    // ── Verify caller is seller of roleCommitment ──
    if role_commitment.seller != attester {
        return Err(KernelError::NotAuthorized);
    }

    // ── Process matching ──
    let process_id = if role_order_hash == *order_hash {
        // Same-order attestation
        role_process_id
    } else {
        // Cross-order: verify target order exists in same process
        let target_pid = state
            .order_process_id
            .get(order_hash)
            .copied()
            .ok_or(KernelError::UnknownOrder)?;
        if target_pid == B256::ZERO {
            return Err(KernelError::UnknownOrder);
        }
        if target_pid != role_process_id {
            return Err(KernelError::ProcessMismatch);
        }
        role_process_id
    };

    events.push(AttestationEventData {
        order_hash: *order_hash,
        process_id,
        attester,
        schema_id: *schema_id,
        stage,
        content_ref: *content_ref,
    });

    Ok(())
}

// ── attestAsBuyer ─────────────────────────────────────────────────

/// Apply a buyer attestation. Matches the authorization logic in
/// `AttestationCoordinator.attestAsBuyer()`.
fn apply_attest_as_buyer(
    state: &KernelState,
    domain: &B256,
    process_id: &B256,
    order_hash: &B256,
    schema_id: &B256,
    stage: u8,
    content_ref: &B256,
    buyer_sig: &Signature,
    content_proof: Option<&crate::types::AttestationContentProof>,
    events: &mut Vec<AttestationEventData>,
) -> Result<(), KernelError> {
    // ── Layer B gate: validate content against schema (no-op if absent) ──
    // A buyer's evidence is the kernel event log, not an agreement clause —
    // pass agreement_hash: None so Gate 5 (agreement inclusion) is skipped.
    validate_attestation_content(content_proof, content_ref, schema_id, stage, None)?;

    // ── Recover signer ──
    let struct_hash =
        attest_buyer_struct_hash(process_id, order_hash, schema_id, stage, content_ref);
    let digest = typed_data_hash(domain, &struct_hash);
    let attester = recover_signer(&digest, buyer_sig)?;

    // ── Verify attester is root buyer ──
    let ps = state
        .processes
        .get(process_id)
        .ok_or(KernelError::UnknownOrder)?;
    if ps.root_buyer == Address::ZERO {
        return Err(KernelError::UnknownOrder);
    }
    if ps.root_buyer != attester {
        return Err(KernelError::NotAuthorized);
    }

    // ── Verify target order belongs to this process ──
    let target_pid = state
        .order_process_id
        .get(order_hash)
        .copied()
        .ok_or(KernelError::UnknownOrder)?;
    if target_pid == B256::ZERO {
        return Err(KernelError::UnknownOrder);
    }
    if target_pid != *process_id {
        return Err(KernelError::ProcessMismatch);
    }

    events.push(AttestationEventData {
        order_hash: *order_hash,
        process_id: *process_id,
        attester,
        schema_id: *schema_id,
        stage,
        content_ref: *content_ref,
    });

    Ok(())
}

// ── registerSchema ────────────────────────────────────────────────

fn apply_register_schema(
    state: &mut KernelState,
    domain: &B256,
    schema_id: &B256,
    version: u64,
    uri_hash: &B256,
    registrar_sig: &Signature,
    events: &mut Vec<SchemaEventData>,
) -> Result<(), KernelError> {
    // ── Dedup guard ──
    if state.schemas_registered.get(schema_id).copied().unwrap_or(false) {
        return Err(KernelError::SchemaAlreadyRegistered(*schema_id));
    }

    // ── Recover registrar address ──
    let struct_hash = register_schema_struct_hash(schema_id, version, uri_hash);
    let digest = typed_data_hash(domain, &struct_hash);
    let registrar = recover_signer(&digest, registrar_sig)?;

    state.schemas_registered.insert(*schema_id, true);

    events.push(SchemaEventData {
        schema_id: *schema_id,
        version,
        uri_hash: *uri_hash,
        registrar,
    });

    Ok(())
}

// ── setMechanismSchema ────────────────────────────────────────────

fn apply_set_mechanism_schema(
    state: &KernelState,
    domain: &B256,
    schema_id: &B256,
    mechanism_sig: &Signature,
    events: &mut Vec<MechanismSchemaEventData>,
) -> Result<(), KernelError> {
    // ── Schema must be registered ──
    if !state.schemas_registered.get(schema_id).copied().unwrap_or(false) {
        return Err(KernelError::SchemaNotRegistered(*schema_id));
    }

    // ── Recover mechanism address ──
    let struct_hash = set_mechanism_schema_struct_hash(schema_id);
    let digest = typed_data_hash(domain, &struct_hash);
    let mechanism = recover_signer(&digest, mechanism_sig)?;

    events.push(MechanismSchemaEventData {
        mechanism,
        schema_id: *schema_id,
    });

    Ok(())
}

// ── OperatorRegistry operations ──────────────────────────────────
//
// Two operator-registry mutations survive in the batched kernel:
//
//   - RegisterOperator: sets the dedup guard and emits Registered.
//   - UpdateProfile:    requires the dedup guard to already be set and emits
//                       ProfileUpdated. Deposit + lock period are not touched.
//
// Lifecycle flags (deactivate / reactivate) and on-chain role tracking
// stay out of the kernel — operator availability is signal-by-availability,
// and the seller's role is whatever their catalogue (referenced by
// metadata_uri) declares through its archetype.

fn apply_register_operator(
    state: &mut KernelState,
    domain: &B256,
    metadata_uri: &str,
    operator_sig: &Signature,
    events: &mut Vec<OperatorEventData>,
) -> Result<(), KernelError> {
    let struct_hash = register_operator_struct_hash(metadata_uri);
    let digest = typed_data_hash(domain, &struct_hash);
    let operator = recover_signer(&digest, operator_sig)?;

    // Dedup guard
    if state
        .operators_registered
        .get(&operator)
        .copied()
        .unwrap_or(false)
    {
        return Err(KernelError::OperatorAlreadyRegistered);
    }

    state.operators_registered.insert(operator, true);

    events.push(OperatorEventData::Registered {
        operator,
        metadata_uri: metadata_uri.to_string(),
    });

    Ok(())
}

fn apply_update_profile(
    state: &KernelState,
    domain: &B256,
    metadata_uri: &str,
    operator_sig: &Signature,
    events: &mut Vec<OperatorEventData>,
) -> Result<(), KernelError> {
    let struct_hash = update_profile_struct_hash(metadata_uri);
    let digest = typed_data_hash(domain, &struct_hash);
    let operator = recover_signer(&digest, operator_sig)?;

    // Caller must already be registered. There is no path through which one
    // address can update another's metadata URI — the EIP-712 signature pins
    // the caller and the dedup-guard check pins them to a registered slot.
    if !state
        .operators_registered
        .get(&operator)
        .copied()
        .unwrap_or(false)
    {
        return Err(KernelError::OperatorNotRegistered);
    }

    events.push(OperatorEventData::ProfileUpdated {
        operator,
        metadata_uri: metadata_uri.to_string(),
    });

    Ok(())
}

// ── Event hashing ─────────────────────────────────────────────────

/// Deterministic hash of attestation events for inclusion in public values.
pub fn compute_attestation_events_hash(events: &[AttestationEventData]) -> B256 {
    let mut data = Vec::new();
    for e in events {
        data.extend_from_slice(e.order_hash.as_slice());
        data.extend_from_slice(e.process_id.as_slice());
        data.extend_from_slice(e.attester.as_slice());
        data.extend_from_slice(e.schema_id.as_slice());
        data.push(e.stage);
        data.extend_from_slice(e.content_ref.as_slice());
    }
    keccak256(&data)
}

/// Deterministic hash of schema events for inclusion in public values.
pub fn compute_schema_events_hash(
    schemas: &[SchemaEventData],
    mechanisms: &[MechanismSchemaEventData],
) -> B256 {
    let mut data = Vec::new();
    for e in schemas {
        data.extend_from_slice(e.schema_id.as_slice());
        data.extend_from_slice(&e.version.to_be_bytes());
        data.extend_from_slice(e.uri_hash.as_slice());
        data.extend_from_slice(e.registrar.as_slice());
    }
    for e in mechanisms {
        data.extend_from_slice(e.mechanism.as_slice());
        data.extend_from_slice(e.schema_id.as_slice());
    }
    keccak256(&data)
}

/// Deterministic hash of operator events for inclusion in public values.
/// Tagged-union encoding (matches Solidity `_hashOperatorEvents`):
///   0x01 Registered:    tag(1) + operator(20) + keccak256(metadata_uri)(32) = 53
///   0x02 ProfileUpdated: tag(1) + operator(20) + keccak256(metadata_uri)(32) = 53
pub fn compute_operator_events_hash(events: &[OperatorEventData]) -> B256 {
    let mut data = Vec::new();
    for e in events {
        let (tag, operator, metadata_uri) = match e {
            OperatorEventData::Registered { operator, metadata_uri } => (0x01u8, operator, metadata_uri),
            OperatorEventData::ProfileUpdated { operator, metadata_uri } => (0x02u8, operator, metadata_uri),
        };
        data.push(tag);
        data.extend_from_slice(operator.as_slice());
        data.extend_from_slice(&keccak256(metadata_uri.as_bytes()).0);
    }
    keccak256(&data)
}

// ── Batch execution ───────────────────────────────────────────────

/// Execute a full batch of kernel operations and return the
/// public values for on-chain verification plus net token positions
/// and side-effect events.
pub fn apply_batch(
    input: &BatchInput,
) -> Result<(PublicValues, Vec<NetPosition>, BatchEvents), KernelError> {
    let (pv, positions, events, _state) = apply_batch_inner(input)?;
    Ok((pv, positions, events))
}

/// Like `apply_batch`, but also returns the post-batch kernel state.
/// Used by the sequencer to advance its local state mirror.
pub fn apply_batch_with_state(
    input: &BatchInput,
) -> Result<(PublicValues, Vec<NetPosition>, BatchEvents, KernelState), KernelError> {
    apply_batch_inner(input)
}

/// Internal batch execution returning (PublicValues, positions, events, state).
/// Both public entry points delegate to this.
fn apply_batch_inner(
    input: &BatchInput,
) -> Result<(PublicValues, Vec<NetPosition>, BatchEvents, KernelState), KernelError> {
    let domain = domain_separator(input.chain_id, input.verifying_contract);
    let mut state = KernelState::from_snapshot(&input.prev_state);
    let prev_root = state.compute_root();

    let mut tracker = TokenTracker::new();
    let mut attestation_events = Vec::new();
    let mut schema_events = Vec::new();
    let mut mechanism_schema_events = Vec::new();
    let mut operator_events = Vec::new();

    for op in &input.operations {
        match op {
            KernelOp::Commit {
                commitment,
                buyer_sig,
                seller_sig,
            } => {
                apply_commit(
                    &mut state,
                    &domain,
                    commitment,
                    buyer_sig,
                    seller_sig,
                    input.block_timestamp,
                    &mut tracker,
                )?;
            }
            KernelOp::Resolve {
                process_id,
                commitments,
                buyer_sig,
            } => {
                apply_resolve(
                    &mut state,
                    &domain,
                    process_id,
                    commitments,
                    buyer_sig,
                    &mut tracker,
                )?;
            }

            // ── Attestation ──
            KernelOp::AttestAsSeller {
                role_commitment,
                order_hash,
                schema_id,
                stage,
                content_ref,
                seller_sig,
                content_proof,
            } => {
                apply_attest_as_seller(
                    &state,
                    &domain,
                    role_commitment,
                    order_hash,
                    schema_id,
                    *stage,
                    content_ref,
                    seller_sig,
                    content_proof.as_ref(),
                    &mut attestation_events,
                )?;
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
                apply_attest_as_buyer(
                    &state,
                    &domain,
                    process_id,
                    order_hash,
                    schema_id,
                    *stage,
                    content_ref,
                    buyer_sig,
                    content_proof.as_ref(),
                    &mut attestation_events,
                )?;
            }

            // ── Schema ──
            KernelOp::RegisterSchema {
                schema_id,
                version,
                uri_hash,
                registrar_sig,
            } => {
                apply_register_schema(
                    &mut state,
                    &domain,
                    schema_id,
                    *version,
                    uri_hash,
                    registrar_sig,
                    &mut schema_events,
                )?;
            }
            KernelOp::SetMechanismSchema {
                schema_id,
                mechanism_sig,
            } => {
                apply_set_mechanism_schema(
                    &state,
                    &domain,
                    schema_id,
                    mechanism_sig,
                    &mut mechanism_schema_events,
                )?;
            }

            // ── Operator ──
            KernelOp::RegisterOperator {
                metadata_uri,
                operator_sig,
            } => {
                apply_register_operator(
                    &mut state,
                    &domain,
                    metadata_uri,
                    operator_sig,
                    &mut operator_events,
                )?;
            }
            KernelOp::UpdateProfile {
                metadata_uri,
                operator_sig,
            } => {
                apply_update_profile(
                    &state,
                    &domain,
                    metadata_uri,
                    operator_sig,
                    &mut operator_events,
                )?;
            }
        }
    }

    let new_root = state.compute_root();
    let positions = tracker.net_positions();
    let ops_hash = compute_positions_hash(&positions);
    let att_hash = compute_attestation_events_hash(&attestation_events);
    let sch_hash = compute_schema_events_hash(&schema_events, &mechanism_schema_events);
    let op_hash = compute_operator_events_hash(&operator_events);

    let batch_events = BatchEvents {
        attestations: attestation_events,
        schemas: schema_events,
        mechanism_schemas: mechanism_schema_events,
        operators: operator_events,
    };

    Ok((
        PublicValues {
            prev_state_root: prev_root,
            new_state_root: new_root,
            chain_id: input.chain_id,
            verifying_contract: input.verifying_contract,
            token_ops_hash: ops_hash,
            attestation_events_hash: att_hash,
            schema_events_hash: sch_hash,
            operator_events_hash: op_hash,
        },
        positions,
        batch_events,
        state,
    ))
}
