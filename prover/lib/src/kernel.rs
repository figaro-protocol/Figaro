use alloy_primitives::{Address, B256, U256, b256, keccak256};
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

    // Accumulation overflow is a rejectable input, not a crash: a batch whose
    // bonds sum past U256 (a self-dealing commit with a huge payment reaches it)
    // must fail as `KernelError::Overflow` — the same way `apply_commit`'s bond
    // math already does — so the sequencer's batch loop rejects the op instead
    // of panicking on `.expect()` and taking the relay down for free.
    fn deposit(&mut self, token: Address, user: Address, amount: U256) -> Result<(), KernelError> {
        let entry = self.deposits.entry((token, user)).or_insert(U256::ZERO);
        *entry = entry.checked_add(amount).ok_or(KernelError::Overflow)?;
        Ok(())
    }

    fn payout(&mut self, token: Address, user: Address, amount: U256) -> Result<(), KernelError> {
        let entry = self.payouts.entry((token, user)).or_insert(U256::ZERO);
        *entry = entry.checked_add(amount).ok_or(KernelError::Overflow)?;
        Ok(())
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

    tracker.deposit(c.currency, c.buyer, buyer_bond)?;
    tracker.deposit(c.currency, c.seller, seller_bond)?;

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

        let (seller_payout, buyer_payout) = resolution_payouts(c)?;

        tracker.payout(currency, c.seller, seller_payout)?;
        tracker.payout(currency, buyer, buyer_payout)?;

        state.order_status.insert(order_hash, 2);
    }

    // ── Finalize process ──
    let ps = state.processes.get_mut(process_id).unwrap();
    ps.active_order_count = 0;

    Ok(())
}

/// The two payout legs one order releases at resolution — the batch-path
/// equivalent of `FigaroCore.OrderResolved(sellerPayout, buyerPayout)`.
///
/// Seller payout = `expectedCumulativeValue × 2 + payment` (the seller's
/// own 2× bond back, plus what the buyer pays). Buyer payout = `payment`
/// (the remainder of the buyer's 2× bond).
///
/// Public so a relay can PUBLISH the same per-order facts FigaroCore emits
/// without re-deriving the arithmetic: `apply_resolve` is the only other
/// caller, so the published figure and the resolved figure cannot drift.
pub fn resolution_payouts(c: &Commitment) -> Result<(U256, U256), KernelError> {
    let seller_payout = c
        .expected_cumulative_value
        .checked_mul(U256::from(2))
        .ok_or(KernelError::Overflow)?
        .checked_add(c.payment)
        .ok_or(KernelError::Overflow)?;
    Ok((seller_payout, c.payment))
}

// ── Attestation helpers ───────────────────────────────────────────

/// Derive a commitment's (orderHash, processId) pair from its struct
/// alone — the same derivation the coordinator and FigaroCore apply. Public
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

/// The key of the agreement format's reserved PROVENANCE leaf,
/// `keccak256("figaro-agreement-provenance")` — the leaf that links an
/// order's agreement to the registered agreement and the assembly order slot it
/// instantiates. It is a constant of the agreement format, never a clause,
/// agreement or assembly key: no spec describes it and no registry
/// credits anything under it. Every leaf of an agreement is
/// `keccak256(keccak256(key ‖ keccak256(clauseData)))` (`docs/CLAUSES.md`
/// § "Every clause is a merkle leaf"); this one's clauseData is
/// `{"agreementHash":"0x<64 lowercase hex>","assemblyHash":"0x<64 lowercase hex>"}`.
/// `UsageCounter.provenanceLeaf` holds the same constant on chain.
pub const PROVENANCE_LEAF_KEY: B256 =
    b256!("26dc18a2251a8f4629ada6df88b7c98553e011c08682d28ce5bb51a441227dc6");

/// The key of an assembly root's terms leaf,
/// `keccak256("figaro-assembly-terms")` — the leaf over the assembly-scoped
/// clauses, beside one leaf per order slot. A constant of the format, never
/// a registration and never an agreementHash, so the terms leaf can never
/// pass as an order slot. `UsageCounter.assemblyTermsLeaf` holds the same
/// constant on chain.
pub const ASSEMBLY_TERMS_LEAF_KEY: B256 =
    b256!("efe0eaa5bce6c7b996059fedd6d0e4827f99c474563f43ff55e6e593e5915860");

/// Whether `key` is one of the format's two reserved leaf keys, refused
/// wherever a key is taken: as a usage claim's key of any kind, and as the
/// agreementHash of an assembly claim's agreement position.
pub fn is_reserved_key(key: &B256) -> bool {
    *key == PROVENANCE_LEAF_KEY || *key == ASSEMBLY_TERMS_LEAF_KEY
}

/// The agreement format's rule for an attestation of the reserved
/// provenance leaf. The leaf's content is fixed by the format, so the
/// guest REPRODUCES it rather than validating it against a spec: the
/// committed bytes must be exactly `provenance_leaf_bytes` of the
/// agreementHash and assemblyHash they carry, `content_ref` must be their keccak (as a
/// clause's clauseDataHash), and the leaf over them must open against the
/// signed `checkout_hash`. `spec_json`, `content_json` and `content_kind`
/// are not consulted, and no spec binding is emitted: there is no registry
/// entry to anchor.
fn validate_provenance_attestation(
    proof: &AttestationContentProof,
    content_ref: &B256,
    checkout_hash: &B256,
) -> Result<(), KernelError> {
    let bytes = proof.clause_data.as_bytes();
    if bytes.len() != PROVENANCE_LEAF_LEN
        || !bytes.starts_with(PROVENANCE_AGREEMENT_PREFIX)
    {
        return Err(KernelError::ProvenanceLeafNotCanonical);
    }
    let first = PROVENANCE_AGREEMENT_PREFIX.len();
    let second = first + 64 + PROVENANCE_ASSEMBLY_INFIX.len();
    let word = |at: usize| {
        alloy_primitives::hex::decode(&bytes[at..at + 64])
            .ok()
            .map(|raw| B256::from_slice(&raw))
            .ok_or(KernelError::ProvenanceLeafNotCanonical)
    };
    let agreement_hash = word(first)?;
    let assembly_hash = word(second)?;
    if provenance_leaf_bytes(&agreement_hash, &assembly_hash) != bytes {
        return Err(KernelError::ProvenanceLeafNotCanonical);
    }

    let clause_data_hash = keccak256(bytes);
    if clause_data_hash != *content_ref {
        return Err(KernelError::ContentHashMismatch);
    }

    let leaf = format_leaf(&PROVENANCE_LEAF_KEY, &clause_data_hash);
    if !crate::merkle::verify_inclusion(&proof.inclusion_proof, *checkout_hash, leaf) {
        return Err(KernelError::InvalidInclusionProof);
    }
    Ok(())
}

/// Run the witness gates for one attestation and return the spec binding
/// the batch commits for on-chain verification — or `None` for the
/// reserved provenance leaf, which the agreement format's own rule
/// (`validate_provenance_attestation`) verifies with no spec.
///
///   Gate S — spec identity: `spec_json` parses as a `ClauseSpec`, and
///     `keccak256` of its bytes, hashed verbatim as pinned, equals the
///     op's `clause_id` — a clause key IS the hash of its spec's pinned
///     bytes; the spec's own `clauseId` and `version` are presentation and
///     key nothing. The binding `(clause_id, keccak256(spec_json))`, both
///     fields equal, is returned for the public-values commitment; the
///     on-chain verifier accepts the batch only if they are equal and
///     `ClauseRegistry.registered(clause_id)` — so the constraint set is
///     anchored by the registry, not by anything compiled in, and a caller
///     cannot weaken validation with a permissive spec.
///   Gate C — content: for a `RuntimeWitness`, `content_json` validates
///     at the op's stage, the generic encoder derives canonical ABI
///     bytes from it (the cross-form binding — the bytes are derived
///     FROM the JSON, so they describe the same content by
///     construction), and `keccak256(bytes) == content_ref`. For a
///     `ReAssert`, the content IS the committed `clause_data`
///     (`content_ref == keccak256(clause_data)`), which must itself
///     validate against the spec's default fields.
///   Gate I — agreement inclusion: leaf
///     `keccak256(clause_id ++ keccak256(clause_data))` opens against
///     the target's signed `checkout_hash` via the sorted-pair Merkle
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
    checkout_hash: &B256,
) -> Result<Option<SpecBinding>, KernelError> {
    // The reserved provenance leaf is a fact of the agreement format, not
    // a clause: its key is the format's constant, never a registered id.
    if *clause_id == PROVENANCE_LEAF_KEY {
        validate_provenance_attestation(proof, content_ref, checkout_hash)?;
        return Ok(None);
    }

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
    let spec_hash = keccak256(proof.spec_json.as_bytes());
    if spec_hash != *clause_id {
        return Err(KernelError::SpecIdentityMismatch(*clause_id));
    }
    let binding = SpecBinding {
        clause_id: *clause_id,
        spec_hash,
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
            // The content IS the committed clauseData — re-anchored as
            // runtime evidence. It must be the signing-time content, so
            // it validates against the spec's DEFAULT fields.
            if keccak256(proof.clause_data.as_bytes()) != *content_ref {
                return Err(KernelError::ContentHashMismatch);
            }
            let clause_data: serde_json::Value = serde_json::from_str(&proof.clause_data)
                .map_err(|e| {
                    KernelError::ClauseContentInvalid(format!("clause_data not valid JSON: {e}"))
                })?;
            if let figaro_clause::ValidationResult::Err(errors) = figaro_clause::validate_content(
                &clause_data,
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
    // Leaf = keccak256(keccak256(clauseId ++ keccak256(clauseData))) —
    // double-hashed for leaf/node domain separation, mirroring
    // AttestationCoordinator._verifyInclusion (mandatory, every mode).
    let clause_data_hash = keccak256(proof.clause_data.as_bytes());
    let leaf = format_leaf(clause_id, &clause_data_hash);
    if !crate::merkle::verify_inclusion(&proof.inclusion_proof, *checkout_hash, leaf) {
        return Err(KernelError::InvalidInclusionProof);
    }

    Ok(Some(binding))
}

// ── attestAsSeller ────────────────────────────────────────────────

/// Apply a seller attestation. Matches the authorization logic in
/// `AttestationCoordinator.attestAsSeller()` with msg.sender replaced
/// by EIP-712 signature verification: the attester must be
/// `target.seller` — a seller attests about a clause of its own order —
/// and the inclusion proof opens against the target's checkoutHash.
#[allow(clippy::too_many_arguments)]
fn apply_attest_as_seller(
    state: &KernelState,
    domain: &B256,
    target: &Commitment,
    clause_id: &B256,
    stage: u8,
    content_ref: &B256,
    seller_sig: &Signature,
    proof: &AttestationContentProof,
    events: &mut Vec<AttestationEventData>,
    bindings: &mut BTreeSet<SpecBinding>,
) -> Result<(), KernelError> {
    // ── Target must be committed and active ──
    let (target_order_hash, target_process_id) =
        require_known_active_commitment(state, domain, target)?;

    // ── Recover signer (replaces msg.sender); must be target.seller ──
    let struct_hash =
        attest_seller_struct_hash(&target_order_hash, clause_id, stage, content_ref);
    let digest = typed_data_hash(domain, &struct_hash);
    let attester = recover_signer(&digest, seller_sig)?;
    if target.seller != attester {
        return Err(KernelError::NotAuthorized);
    }

    // ── Witness gates: spec identity, content, agreement inclusion ──
    let binding =
        validate_attestation_content(proof, content_ref, clause_id, stage, &target.checkout_hash)?;
    bindings.extend(binding);

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
/// the inclusion proof opens against the target's checkoutHash —
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
        validate_attestation_content(proof, content_ref, clause_id, stage, &target.checkout_hash)?;
    bindings.extend(binding);

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
/// period(1) ++ provenanceLeaf(32)
///   ++ len(accruals)(8) ++ [clauseOrAssembly(32) ++ kind(1) ++ c(8) ++ d(8)]*
///   ++ len(sellers)(8)  ++ [seller(20)]*
/// ```
///
/// Span `49 + 49n + 20m` for n accruals and m sellers. BOTH LENGTHS ARE
/// PREFIXED, and they must be: an accrual entry is 49 bytes and a seller
/// 20, so 20 accruals and 49 sellers occupy the same span. Without the prefixes a submitter could re-split the same
/// preimage into a different (accruals, sellers) pair — writing accruals
/// whose sellers were never stake-checked.
pub fn compute_usage_accrual_hash(
    period: u8,
    provenance_leaf: &B256,
    accruals: &[UsageAccrual],
    sellers: &[Address],
) -> B256 {
    let mut data = Vec::with_capacity(49 + accruals.len() * 49 + sellers.len() * 20);
    data.push(period);
    data.extend_from_slice(provenance_leaf.as_slice());
    data.extend_from_slice(&(accruals.len() as u64).to_be_bytes());
    for a in accruals {
        data.extend_from_slice(a.clause_or_assembly.as_slice());
        data.push(a.kind);
        data.extend_from_slice(&a.c.to_be_bytes());
        data.extend_from_slice(&a.d.to_be_bytes());
    }
    data.extend_from_slice(&(sellers.len() as u64).to_be_bytes());
    for s in sellers {
        data.extend_from_slice(s.as_slice());
    }
    keccak256(&data)
}

/// The provenance leaf's bytes before the agreementHash's hex digits.
const PROVENANCE_AGREEMENT_PREFIX: &[u8] = b"{\"agreementHash\":\"0x";
/// The bytes between the agreementHash's digits and the assemblyHash's.
const PROVENANCE_ASSEMBLY_INFIX: &[u8] = b"\",\"assemblyHash\":\"0x";
/// The bytes after the assemblyHash's digits.
const PROVENANCE_SUFFIX: &[u8] = b"\"}";
/// The provenance leaf's one length: two 64-digit words and the frame.
const PROVENANCE_LEAF_LEN: usize = PROVENANCE_AGREEMENT_PREFIX.len()
    + 64
    + PROVENANCE_ASSEMBLY_INFIX.len()
    + 64
    + PROVENANCE_SUFFIX.len();

/// The canonical-JSON bytes of the reserved provenance leaf's clause data,
/// `{"agreementHash":"0x…","assemblyHash":"0x…"}` with lowercase hex and
/// the keys in that order, reproduced from the two keys alone — the Rust
/// twin of `UsageCounter._toLowerHexString`'s use in `recordAgreementUsage`
/// and `recordAssemblyUsage`. Reproduction, never parsing: a wrong key on
/// either side derives a leaf that is simply not in the tree.
pub fn provenance_leaf_bytes(agreement_hash: &B256, assembly_hash: &B256) -> Vec<u8> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = Vec::with_capacity(PROVENANCE_LEAF_LEN);
    let push_word = |out: &mut Vec<u8>, word: &B256| {
        for byte in word.as_slice() {
            out.push(HEX[(byte >> 4) as usize]);
            out.push(HEX[(byte & 0x0f) as usize]);
        }
    };
    out.extend_from_slice(PROVENANCE_AGREEMENT_PREFIX);
    push_word(&mut out, agreement_hash);
    out.extend_from_slice(PROVENANCE_ASSEMBLY_INFIX);
    push_word(&mut out, assembly_hash);
    out.extend_from_slice(PROVENANCE_SUFFIX);
    out
}

/// A leaf of the agreement format, `keccak256(keccak256(key ‖ content_hash))`
/// — the one convention for a clause of an agreement and for an agreement's position in an
/// assembly's root.
fn format_leaf(key: &B256, content_hash: &B256) -> B256 {
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(key.as_slice());
    preimage[32..].copy_from_slice(content_hash.as_slice());
    keccak256(keccak256(preimage))
}

/// Credit designer-reward usage for orders the BATCH path has resolved.
///
/// Every claim is proved, never trusted — the same facts the counter's
/// `recordClauseUsage`, `recordAgreementUsage` and `recordAssemblyUsage`
/// prove on the direct path:
///   1. the order is real and RESOLVED in this batch's post-state,
///   2. the clause, or the provenance leaf naming the agreement and the
///      assembly, was committed in the agreement both parties signed
///      (merkle inclusion against `checkout_hash`), and
///   3. for an assembly, the order-slot leaf of the named agreement is a leaf of
///      the assemblyHash (merkle membership against the assembly root).
///
/// Two facts the guest CANNOT prove are declared and anchored on-chain
/// instead: whether each seller holds a live MembersRegistry stake, and
/// whether a clause, agreement or assembly holds a live registration. Both
/// are live chain state; the verifier checks them before writing, in the
/// shape `_checkSpecBindings` already established.
///
/// Returns the CUMULATIVE `(c, d)` of every (kind, key) touched, and the
/// distinct sellers behind them.
fn apply_usage_claims(
    state: &mut KernelState,
    domain: &B256,
    claims: &[UsageClaim],
    period: u8,
    provenance_leaf: &B256,
) -> Result<(Vec<UsageAccrual>, Vec<Address>), KernelError> {
    // (key, kind): claims of two kinds on the same bytes32 are two
    // accruals, never one.
    let mut touched: BTreeSet<(B256, u8)> = BTreeSet::new();
    let mut sellers: BTreeSet<Address> = BTreeSet::new();

    for claim in claims {
        // 0. The reserved keys (the provenance leaf's and the assembly
        //    terms leaf's) are constants of the format, never registrations:
        //    they name no clause, no agreement and no assembly, so nothing is
        //    credited under them, whatever kind the claim declares or
        //    whatever a registry holds at that bytes32. Nor is either ever
        //    the agreementHash of an agreement position — the terms leaf is not an
        //    agreement position. The counter refuses both by the same constants.
        if is_reserved_key(&claim.clause_or_assembly) {
            return Err(KernelError::ReservedKeyIsNotARegistration(claim.clause_or_assembly));
        }
        if let UsageClaimKind::Assembly { agreement_hash, .. } = &claim.kind {
            if is_reserved_key(agreement_hash) {
                return Err(KernelError::ReservedKeyIsNotARegistration(*agreement_hash));
            }
        }

        let (order_hash, process_id) = derive_commitment_ids(domain, &claim.order);
        let kind = claim.kind.code();

        // 1. RESOLVED, not merely known. Usage is what a finished process
        //    leaves behind; an open process has not yet added value.
        if state.order_status.get(&order_hash).copied().unwrap_or(0) != 2 {
            return Err(KernelError::UsageOrderNotResolved(order_hash));
        }

        // 2. The key was committed in the signed agreement. A clause
        //    proves its own leaf; an agreement and an assembly prove the
        //    PROVENANCE leaf, whose clause content is reproduced from the
        //    agreementHash and the assemblyHash together.
        let (leaf_key, clause_data_hash) = match &claim.kind {
            UsageClaimKind::Clause { clause_data_hash } => (claim.clause_or_assembly, *clause_data_hash),
            UsageClaimKind::Agreement { assembly_hash } => (
                *provenance_leaf,
                keccak256(provenance_leaf_bytes(&claim.clause_or_assembly, assembly_hash)),
            ),
            UsageClaimKind::Assembly { agreement_hash, .. } => (
                *provenance_leaf,
                keccak256(provenance_leaf_bytes(agreement_hash, &claim.clause_or_assembly)),
            ),
        };
        if !crate::merkle::verify_inclusion(
            &claim.inclusion_proof,
            claim.order.checkout_hash,
            format_leaf(&leaf_key, &clause_data_hash),
        ) {
            return Err(KernelError::UsageInvalidInclusionProof);
        }

        // 2b. An assembly also proves the agreement is one of its own
        //     agreements: the agreement's leaf opens under the assemblyHash with the same
        //     sorted-pair verifier. A failed membership proof refuses the
        //     claim as a failed inclusion proof does.
        if let UsageClaimKind::Assembly {
            agreement_hash,
            slot_content_hash,
            membership_proof,
        } = &claim.kind
        {
            if !crate::merkle::verify_inclusion(
                membership_proof,
                claim.clause_or_assembly,
                format_leaf(agreement_hash, slot_content_hash),
            ) {
                return Err(KernelError::UsageInvalidInclusionProof);
            }
        }

        // 3. Once ever, whatever the period — the counted set rides the
        //    state root, so this holds ACROSS batches, not just within
        //    one. A duplicate is a sequencer fault and fails loudly
        //    rather than being silently dropped.
        if !state
            .usage_counted
            .insert((kind, claim.clause_or_assembly, process_id))
        {
            return Err(KernelError::UsageAlreadyCounted {
                clause_or_assembly: claim.clause_or_assembly,
                process_id,
            });
        }

        // 4. Accrue. Every admitted claim feeds `c`; the first claim from
        //    each seller in this period also feeds `d` — breadth counts
        //    distinct STAKED sellers. The stake check
        //    itself is on-chain: the counter gates the declared seller
        //    list, so the guest counts and the chain prices.
        let first_seller = state
            .usage_seller_seen
            .insert((kind, claim.clause_or_assembly, period, claim.order.seller));

        let entry = state
            .usage_accrual
            .entry((kind, claim.clause_or_assembly, period))
            .or_insert((0, 0));
        entry.0 = entry.0.checked_add(1).ok_or(KernelError::Overflow)?;
        if first_seller {
            entry.1 = entry.1.checked_add(1).ok_or(KernelError::Overflow)?;
        }

        touched.insert((claim.clause_or_assembly, kind));
        sellers.insert(claim.order.seller);
    }

    let accruals = touched
        .into_iter()
        .map(|(clause_or_assembly, kind)| {
            let (c, d) = state.usage_accrual[&(kind, clause_or_assembly, period)];
            UsageAccrual {
                clause_or_assembly,
                kind,
                c,
                d,
            }
        })
        .collect();

    Ok((accruals, sellers.into_iter().collect()))
}

// ── Batch execution ───────────────────────────────────────────────

/// Execute a full batch of FigaroCore operations and return the
/// public values for on-chain verification plus net token positions
/// and side-effect events.
pub fn apply_batch(
    input: &BatchInput,
) -> Result<(PublicValues, Vec<NetPosition>, BatchEvents), KernelError> {
    let (pv, positions, events, _state) = apply_batch_inner(input)?;
    Ok((pv, positions, events))
}

/// Like `apply_batch`, but also returns the post-batch mirror state.
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
        &input.provenance_leaf,
    )?;

    let new_root = state.compute_root();
    let positions = tracker.net_positions();
    let ops_hash = compute_positions_hash(&positions);
    let att_hash = compute_attestation_events_hash(&attestation_events);
    let bindings: Vec<SpecBinding> = spec_bindings.into_iter().collect();
    let bindings_hash = compute_spec_bindings_hash(&bindings);
    let usage_hash = compute_usage_accrual_hash(
        input.usage_period,
        &input.provenance_leaf,
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
            block_timestamp: input.block_timestamp,
        },
        positions,
        batch_events,
        state,
    ))
}
