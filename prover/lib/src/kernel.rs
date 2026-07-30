use alloy_primitives::{Address, B256, U256, keccak256};
use std::collections::{BTreeMap, BTreeSet};

use crate::eip712::{
    attest_buyer_struct_hash, attest_seller_struct_hash, commitment_struct_hash,
    compute_order_hash, domain_separator, recover_signer, resolve_struct_hash, typed_data_hash,
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

// ── Clause identity ───────────────────────────────────────────────

/// The on-chain clause key: `keccak256(abi.encode(clauseId, version))`
/// exactly as `ClauseRegistry.registerClause` computes it.
/// `abi.encode(string, uint64)` = [offset 0x40][version word][len][data,
/// right-padded to a 32-byte boundary].
pub fn clause_id_hash(clause_id: &str, version: u64) -> B256 {
    let name = clause_id.as_bytes();
    let padded_len = name.len().div_ceil(32) * 32;
    let mut data = Vec::with_capacity(96 + padded_len);
    data.extend_from_slice(&U256::from(0x40u64).to_be_bytes::<32>());
    data.extend_from_slice(&U256::from(version).to_be_bytes::<32>());
    data.extend_from_slice(&U256::from(name.len() as u64).to_be_bytes::<32>());
    data.extend_from_slice(name);
    data.resize(96 + padded_len, 0);
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

// ── Attestation helpers ───────────────────────────────────────────

/// Derive a commitment's (orderHash, processId) pair from its struct
/// alone — the same derivation the coordinator and kernel apply. Public
/// so the sequencer's stateless mempool pre-checks share it (one
/// derivation, no drift).
pub fn derive_commitment_ids(domain: &B256, c: &Commitment) -> (B256, B256) {
    let struct_hash = commitment_struct_hash(c);
    let process_id = if c.process_id == B256::ZERO {
        // Root order: processId is the EIP-712 digest of the commitment.
        typed_data_hash(domain, &struct_hash)
    } else {
        c.process_id
    };
    let order_hash = compute_order_hash(&process_id, &struct_hash);
    (order_hash, process_id)
}

/// Mirror of `AttestationCoordinator._requireKnownCommitment`: derive the
/// (orderHash, processId) pair from a commitment and require the order to
/// be ACTIVE (committed, unresolved). Attestation is runtime evidence
/// within an open process — the evidence window closes at resolution.
fn require_known_active_commitment(
    state: &KernelState,
    domain: &B256,
    c: &Commitment,
) -> Result<(B256, B256), KernelError> {
    let (order_hash, process_id) = derive_commitment_ids(domain, c);
    match state.order_status.get(&order_hash).copied().unwrap_or(0) {
        0 => Err(KernelError::UnknownOrder),
        1 => Ok((order_hash, process_id)),
        _ => Err(KernelError::OrderResolved),
    }
}

// ── In-proof clause gates (figaro-clause engine) ──────────────────

/// Run the witness gates for one attestation and return the spec binding
/// the batch commits for on-chain verification.
///
///   Gate S — spec identity: `spec_json` parses as a `ClauseSpec` whose
///     `keccak256(abi.encode(clauseId, version))` equals the op's
///     `clause_id`. The binding `(clause_id, keccak256(spec_json))` is
///     returned for the public-values commitment; the on-chain verifier
///     accepts the batch only if it matches
///     `ClauseRegistry.contentHashOf(clause_id)` — so the constraint set
///     is anchored by the registry, not by anything compiled in, and a
///     caller cannot weaken validation with a permissive spec.
///   Gate C — content: for a `RuntimeWitness`, `content_json` validates
///     at the op's stage, the generic encoder derives canonical ABI
///     bytes from it (the cross-form binding — the bytes are derived
///     FROM the JSON, so they describe the same content by
///     construction), and `keccak256(bytes) == content_ref`. For a
///     `ReAssert`, the content IS the committed `section_data`
///     (`content_ref == keccak256(section_data)`), which must itself
///     validate against the spec's default fields.
///   Gate I — agreement inclusion: leaf
///     `keccak256(clause_id ++ keccak256(section_data))` opens against
///     the target's signed `agreement_hash` via the sorted-pair Merkle
///     `inclusion_proof` — mandatory for every mode, mirroring the
///     coordinator.
/// Public so the sequencer's mempool pre-checks run the EXACT gate the
/// guest will run — advisory there, enforced here; one implementation,
/// no drift.
pub fn validate_attestation_content(
    proof: &AttestationContentProof,
    content_ref: &B256,
    clause_id: &B256,
    stage: u8,
    agreement_hash: &B256,
) -> Result<SpecBinding, KernelError> {
    // ── Gate S: witness spec parses + its identity matches the op ──
    let spec_value: serde_json::Value = serde_json::from_str(&proof.spec_json)
        .map_err(|e| KernelError::ClauseSpecParseFailed(format!("spec not valid JSON: {e}")))?;
    let parsed = match figaro_clause::parse_clause_spec(&spec_value) {
        figaro_clause::ParseClauseSpecResult::Ok(s) => s,
        figaro_clause::ParseClauseSpecResult::Err(errors) => {
            let first = errors
                .first()
                .map(|e| format!("{}: {}", e.path, e.message))
                .unwrap_or_else(|| "unknown parse error".to_string());
            return Err(KernelError::ClauseSpecParseFailed(first));
        }
    };
    if clause_id_hash(&parsed.clause_id, parsed.version) != *clause_id {
        return Err(KernelError::SpecIdentityMismatch(*clause_id));
    }
    let binding = SpecBinding {
        clause_id: *clause_id,
        spec_hash: keccak256(proof.spec_json.as_bytes()),
    };

    // ── Gate C: content satisfies the spec and hashes to content_ref ──
    match proof.content_kind {
        ContentKind::RuntimeWitness => {
            let content: serde_json::Value = serde_json::from_str(&proof.content_json)
                .map_err(|e| {
                    KernelError::ContentEncodingFailed(format!("content_json not valid JSON: {e}"))
                })?;
            let options = figaro_clause::ValidateOptions { stage: Some(stage) };
            if let figaro_clause::ValidationResult::Err(errors) =
                figaro_clause::validate_content(&content, &parsed, options)
            {
                let first = errors
                    .first()
                    .map(|e| format!("{}: {}", e.path, e.message))
                    .unwrap_or_else(|| "unknown validation error".to_string());
                return Err(KernelError::ClauseContentInvalid(first));
            }
            let derived = figaro_clause::encode_content_from_spec(
                &parsed,
                &content,
                figaro_clause::EncodeOptions { stage: Some(stage) },
            )
            .map_err(|e| KernelError::ContentEncodingFailed(e.to_string()))?;
            if keccak256(derived.as_slice()) != *content_ref {
                return Err(KernelError::ContentHashMismatch);
            }
        }
        ContentKind::ReAssert => {
            // The content IS the committed sectionData — re-anchored as
            // runtime evidence. It must be the signing-time content, so
            // it validates against the spec's DEFAULT fields.
            if keccak256(proof.section_data.as_bytes()) != *content_ref {
                return Err(KernelError::ContentHashMismatch);
            }
            let section: serde_json::Value = serde_json::from_str(&proof.section_data)
                .map_err(|e| {
                    KernelError::ClauseContentInvalid(format!("section_data not valid JSON: {e}"))
                })?;
            if let figaro_clause::ValidationResult::Err(errors) = figaro_clause::validate_content(
                &section,
                &parsed,
                figaro_clause::ValidateOptions::default(),
            ) {
                let first = errors
                    .first()
                    .map(|e| format!("{}: {}", e.path, e.message))
                    .unwrap_or_else(|| "unknown validation error".to_string());
                return Err(KernelError::ClauseContentInvalid(first));
            }
        }
    }

    // ── Gate I: the clause is a leaf of the signed agreement ──
    // Leaf = keccak256(keccak256(clauseId ++ keccak256(sectionData))) —
    // double-hashed for leaf/node domain separation, mirroring
    // AttestationCoordinator._verifyInclusion (mandatory, every mode).
    let section_data_hash = keccak256(proof.section_data.as_bytes());
    let mut leaf_preimage = [0u8; 64];
    leaf_preimage[..32].copy_from_slice(clause_id.as_slice());
    leaf_preimage[32..].copy_from_slice(section_data_hash.as_slice());
    let leaf = keccak256(keccak256(leaf_preimage));
    if !crate::merkle::verify_inclusion(&proof.inclusion_proof, *agreement_hash, leaf) {
        return Err(KernelError::InvalidInclusionProof);
    }

    Ok(binding)
}

// ── attestAsSeller ────────────────────────────────────────────────

/// Apply a seller attestation. Matches the authorization logic in
/// `AttestationCoordinator.attestAsSeller()` with msg.sender replaced
/// by EIP-712 signature verification: `role` proves seller identity +
/// process; `target` carries the attested order and the agreementHash
/// the inclusion proof opens against.
#[allow(clippy::too_many_arguments)]
fn apply_attest_as_seller(
    state: &KernelState,
    domain: &B256,
    role: &Commitment,
    target: &Commitment,
    clause_id: &B256,
    stage: u8,
    content_ref: &B256,
    seller_sig: &Signature,
    proof: &AttestationContentProof,
    events: &mut Vec<AttestationEventData>,
    bindings: &mut BTreeSet<SpecBinding>,
) -> Result<(), KernelError> {
    // ── Role + target must be committed, active, same process ──
    let (_role_order_hash, role_process_id) =
        require_known_active_commitment(state, domain, role)?;
    let (target_order_hash, target_process_id) =
        require_known_active_commitment(state, domain, target)?;
    if role_process_id != target_process_id {
        return Err(KernelError::ProcessMismatch);
    }

    // ── Recover signer (replaces msg.sender); must be role.seller ──
    let struct_hash =
        attest_seller_struct_hash(&target_order_hash, clause_id, stage, content_ref);
    let digest = typed_data_hash(domain, &struct_hash);
    let attester = recover_signer(&digest, seller_sig)?;
    if role.seller != attester {
        return Err(KernelError::NotAuthorized);
    }

    // ── Witness gates: spec identity, content, agreement inclusion ──
    // The inclusion proof opens against the TARGET's agreementHash —
    // the clause being declared lives in the target's signed contract.
    let binding =
        validate_attestation_content(proof, content_ref, clause_id, stage, &target.agreement_hash)?;
    bindings.insert(binding);

    events.push(AttestationEventData {
        order_hash: target_order_hash,
        process_id: target_process_id,
        attester,
        clause_id: *clause_id,
        stage,
        content_ref: *content_ref,
    });

    Ok(())
}

// ── attestAsBuyer ─────────────────────────────────────────────────

/// Apply a buyer attestation. Matches the authorization logic in
/// `AttestationCoordinator.attestAsBuyer()`: the attester must be
/// `target.buyer` (== the process rootBuyer by commit invariant), and
/// the inclusion proof opens against the target's agreementHash —
/// mandatory, exactly as on the direct path.
#[allow(clippy::too_many_arguments)]
fn apply_attest_as_buyer(
    state: &KernelState,
    domain: &B256,
    target: &Commitment,
    clause_id: &B256,
    stage: u8,
    content_ref: &B256,
    buyer_sig: &Signature,
    proof: &AttestationContentProof,
    events: &mut Vec<AttestationEventData>,
    bindings: &mut BTreeSet<SpecBinding>,
) -> Result<(), KernelError> {
    // ── Target must be committed and active ──
    let (target_order_hash, target_process_id) =
        require_known_active_commitment(state, domain, target)?;

    // ── Recover signer; must be target.buyer ──
    let struct_hash = attest_buyer_struct_hash(
        &target_process_id,
        &target_order_hash,
        clause_id,
        stage,
        content_ref,
    );
    let digest = typed_data_hash(domain, &struct_hash);
    let attester = recover_signer(&digest, buyer_sig)?;
    if target.buyer != attester {
        return Err(KernelError::NotAuthorized);
    }

    // ── Witness gates ──
    let binding =
        validate_attestation_content(proof, content_ref, clause_id, stage, &target.agreement_hash)?;
    bindings.insert(binding);

    events.push(AttestationEventData {
        order_hash: target_order_hash,
        process_id: target_process_id,
        attester,
        clause_id: *clause_id,
        stage,
        content_ref: *content_ref,
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
        data.extend_from_slice(e.clause_id.as_slice());
        data.push(e.stage);
        data.extend_from_slice(e.content_ref.as_slice());
    }
    keccak256(&data)
}

/// Deterministic hash of the deduplicated, sorted spec bindings.
/// Per-binding record: clauseId(32) ++ specHash(32).
pub fn compute_spec_bindings_hash(bindings: &[SpecBinding]) -> B256 {
    let mut data = Vec::with_capacity(bindings.len() * 64);
    for b in bindings {
        data.extend_from_slice(b.clause_id.as_slice());
        data.extend_from_slice(b.spec_hash.as_slice());
    }
    keccak256(&data)
}

// ── Usage accrual (the RPGF bridge) ───────────────────────────────

/// Deterministic hash of the batch's usage accrual, mirrored byte for
/// byte by `FigaroBatchVerifier._hashUsage`:
///
/// ```text
/// period(1) ++ provenanceClause(32)
///   ++ len(accruals)(8) ++ [artifact(32) ++ c(8) ++ d(8)]*
///   ++ len(sellers)(8)  ++ [seller(20)]*
/// ```
///
/// BOTH LENGTHS ARE PREFIXED, and they must be: an accrual record is 48
/// bytes and a seller 20, so 5 accruals and 12 sellers occupy the same
/// span. Without the prefixes a submitter could re-split the same
/// preimage into a different (accruals, sellers) pair — writing accruals
/// whose sellers were never stake-checked.
pub fn compute_usage_accrual_hash(
    period: u8,
    provenance_clause: &B256,
    accruals: &[UsageAccrual],
    sellers: &[Address],
) -> B256 {
    let mut data = Vec::with_capacity(49 + accruals.len() * 48 + sellers.len() * 20);
    data.push(period);
    data.extend_from_slice(provenance_clause.as_slice());
    data.extend_from_slice(&(accruals.len() as u64).to_be_bytes());
    for a in accruals {
        data.extend_from_slice(a.artifact.as_slice());
        data.extend_from_slice(&a.c.to_be_bytes());
        data.extend_from_slice(&a.d.to_be_bytes());
    }
    data.extend_from_slice(&(sellers.len() as u64).to_be_bytes());
    for s in sellers {
        data.extend_from_slice(s.as_slice());
    }
    keccak256(&data)
}

/// The canonical-JSON bytes of an assembly-provenance section,
/// reproduced from the compositionHash alone — the Rust twin of
/// `UsageCounter._toLowerHexString`'s use in `recordAssemblyUsage`.
/// Reproduction, never parsing: a wrong compositionHash derives a leaf
/// that is simply not in the tree.
fn provenance_section_bytes(composition_hash: &B256) -> Vec<u8> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = Vec::with_capacity(87);
    out.extend_from_slice(b"{\"compositionHash\":\"0x");
    for byte in composition_hash.as_slice() {
        out.push(HEX[(byte >> 4) as usize]);
        out.push(HEX[(byte & 0x0f) as usize]);
    }
    out.extend_from_slice(b"\"}");
    out
}

/// Credit RPGF usage for orders the BATCH path has settled.
///
/// Every claim is proved, never trusted — the same two facts
/// `UsageCounter.recordClauseUsage` proves on the direct path:
///   1. the order is real and RESOLVED in this batch's post-state, and
///   2. the artifact was committed in the agreement both parties signed
///      (merkle inclusion against `agreement_hash`).
///
/// Two facts the guest CANNOT prove are declared and anchored on-chain
/// instead: whether each seller holds a live MembersRegistry stake, and
/// whether an artifact is excluded from scoring. Both are live chain
/// state; the verifier checks them before writing, in the shape
/// `_checkSpecBindings` already established.
///
/// Returns the touched artifacts' CUMULATIVE `(c, d)` and the distinct
/// sellers behind them.
fn apply_usage_claims(
    state: &mut KernelState,
    domain: &B256,
    claims: &[UsageClaim],
    period: u8,
    provenance_clause: &B256,
) -> Result<(Vec<UsageAccrual>, Vec<Address>), KernelError> {
    let mut touched: BTreeSet<B256> = BTreeSet::new();
    let mut sellers: BTreeSet<Address> = BTreeSet::new();

    for claim in claims {
        let (order_hash, process_id) = derive_commitment_ids(domain, &claim.order);

        // 1. SETTLED, not merely known. Usage is what a finished process
        //    leaves behind; an open process has not yet added value.
        if state.order_status.get(&order_hash).copied().unwrap_or(0) != 2 {
            return Err(KernelError::UsageOrderNotResolved(order_hash));
        }

        // 2. The artifact was committed in the signed agreement. A
        //    clause proves its own leaf; an assembly proves the
        //    PROVENANCE leaf whose section content IS the
        //    compositionHash.
        let (leaf_key, section_hash) = match &claim.kind {
            UsageClaimKind::Clause { section_hash } => (claim.artifact, *section_hash),
            UsageClaimKind::Assembly => (
                *provenance_clause,
                keccak256(provenance_section_bytes(&claim.artifact)),
            ),
        };
        let mut leaf_preimage = [0u8; 64];
        leaf_preimage[..32].copy_from_slice(leaf_key.as_slice());
        leaf_preimage[32..].copy_from_slice(section_hash.as_slice());
        let leaf = keccak256(keccak256(leaf_preimage));
        if !crate::merkle::verify_inclusion(
            &claim.inclusion_proof,
            claim.order.agreement_hash,
            leaf,
        ) {
            return Err(KernelError::UsageInvalidInclusionProof);
        }

        // 3. Once ever, whatever the period — the counted set rides the
        //    state root, so this holds ACROSS batches, not just within
        //    one. A duplicate is a sequencer fault and fails loudly
        //    rather than being silently dropped.
        if !state.usage_counted.insert((claim.artifact, process_id)) {
            return Err(KernelError::UsageAlreadyCounted {
                artifact: claim.artifact,
                process_id,
            });
        }

        // 4. Accrue. Every admitted claim feeds `c`; the first from each
        //    pair in this period also feeds `d`.
        let mut pair_preimage = [0u8; 40];
        pair_preimage[..20].copy_from_slice(claim.order.buyer.as_slice());
        pair_preimage[20..].copy_from_slice(claim.order.seller.as_slice());
        let pair_key = keccak256(pair_preimage);
        let first_from_pair = state
            .usage_pair_seen
            .insert((claim.artifact, period, pair_key));

        let entry = state
            .usage_accrual
            .entry((claim.artifact, period))
            .or_insert((0, 0));
        entry.0 = entry.0.checked_add(1).ok_or(KernelError::Overflow)?;
        if first_from_pair {
            entry.1 = entry.1.checked_add(1).ok_or(KernelError::Overflow)?;
        }

        touched.insert(claim.artifact);
        sellers.insert(claim.order.seller);
    }

    let accruals = touched
        .into_iter()
        .map(|artifact| {
            let (c, d) = state.usage_accrual[&(artifact, period)];
            UsageAccrual { artifact, c, d }
        })
        .collect();

    Ok((accruals, sellers.into_iter().collect()))
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
    let mut spec_bindings: BTreeSet<SpecBinding> = BTreeSet::new();

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
            KernelOp::AttestAsSeller {
                role,
                target,
                clause_id,
                stage,
                content_ref,
                seller_sig,
                proof,
            } => {
                apply_attest_as_seller(
                    &state,
                    &domain,
                    role,
                    target,
                    clause_id,
                    *stage,
                    content_ref,
                    seller_sig,
                    proof,
                    &mut attestation_events,
                    &mut spec_bindings,
                )?;
            }
            KernelOp::AttestAsBuyer {
                target,
                clause_id,
                stage,
                content_ref,
                buyer_sig,
                proof,
            } => {
                apply_attest_as_buyer(
                    &state,
                    &domain,
                    target,
                    clause_id,
                    *stage,
                    content_ref,
                    buyer_sig,
                    proof,
                    &mut attestation_events,
                    &mut spec_bindings,
                )?;
            }
        }
    }

    // ── RPGF usage accrual ────────────────────────────────────────
    // Runs AFTER every operation, against the post-state, so a process
    // resolved by this very batch can be credited in the same batch.
    let (usage_accruals, usage_sellers) = apply_usage_claims(
        &mut state,
        &domain,
        &input.usage_claims,
        input.usage_period,
        &input.provenance_clause,
    )?;

    let new_root = state.compute_root();
    let positions = tracker.net_positions();
    let ops_hash = compute_positions_hash(&positions);
    let att_hash = compute_attestation_events_hash(&attestation_events);
    let bindings: Vec<SpecBinding> = spec_bindings.into_iter().collect();
    let bindings_hash = compute_spec_bindings_hash(&bindings);
    let usage_hash = compute_usage_accrual_hash(
        input.usage_period,
        &input.provenance_clause,
        &usage_accruals,
        &usage_sellers,
    );

    let batch_events = BatchEvents {
        attestations: attestation_events,
        spec_bindings: bindings,
        usage_accruals,
        usage_sellers,
        usage_period: input.usage_period,
    };

    Ok((
        PublicValues {
            prev_state_root: prev_root,
            new_state_root: new_root,
            chain_id: input.chain_id,
            verifying_contract: input.verifying_contract,
            token_ops_hash: ops_hash,
            attestation_events_hash: att_hash,
            spec_bindings_hash: bindings_hash,
            usage_accrual_hash: usage_hash,
        },
        positions,
        batch_events,
        state,
    ))
}
