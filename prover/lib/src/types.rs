use alloy_primitives::{Address, B256, U256};
use serde::{Deserialize, Serialize};

// ── Commitment (matches CommitmentTypes.sol) ──────────────────────

/// Fixed-size struct with 9 fields. No dynamic arrays.
/// Identical to the Solidity `CommitmentTypes.Commitment`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Commitment {
    pub process_id: B256,
    pub buyer: Address,
    pub seller: Address,
    pub currency: Address,
    pub payment: U256,
    pub expected_cumulative_value: U256,
    pub checkout_hash: B256,
    pub salt: U256,
    pub deadline: U256,
}

// ── Process state (matches FigaroCore.ProcessState) ───────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcessState {
    pub root_buyer: Address,
    pub currency: Address,
    pub cumulative_value: U256,
    pub active_order_count: u64,
}

// ── ECDSA signature ───────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Signature {
    pub v: u8,
    pub r: B256,
    pub s: B256,
}

// ── Attestation witness (hash-only, or plaintext for the in-proof clause gates) ──

/// How the attestation's `content` bytes relate to the clause spec —
/// the two content conventions the protocol carries today.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContentKind {
    /// A runtime witness: `content` is the ABI encoding of
    /// `content_json` under the spec's fields at the op's `stage`
    /// (`contentRef = keccak256(abi bytes)`).
    RuntimeWitness,
    /// A re-asserting attestation: `content` IS the committed
    /// canonical-JSON `clauseData` (`contentRef = keccak256(clauseData)`),
    /// re-anchoring the signed clause as runtime evidence.
    ReAssert,
}

/// What a batched attestation carries to prove its clause, in one of two
/// forms the attesting party picks.
///
/// **`HashOnly`, the default**, carries exactly what
/// `AttestationCoordinator.attestAsSeller` / `attestAsBuyer` take: the
/// `clauseDataHash` and the inclusion proof (the op carries `contentRef`).
/// The guest runs gate I alone — leaf
/// `keccak256(keccak256(clause_id ++ clause_data_hash))` opens against the
/// TARGET order's signed `checkout_hash`, as `_verifyInclusion` does — and
/// re-emits `content_ref` verbatim; no spec binding is committed. The
/// relay, and the proving network under `SP1_PROVER=network`, see the same
/// fingerprints the chain sees on the direct path, never the parties' data.
///
/// **`Plaintext`** is the party's explicit choice to have its content
/// checked inside the proof: it carries the spec, the content and the
/// committed clauseData in plaintext (`AttestationContentProof`), which
/// the relay receives and, under `SP1_PROVER=network`, forwards to the
/// proving network. The guest runs gates S, C and I and commits a
/// `SpecBinding`.
///
/// The reserved provenance leaf (`kernel::PROVENANCE_LEAF_KEY`): under
/// `HashOnly` the guest binds the leaf's hash and cannot read its bytes,
/// exactly as the coordinator cannot, so the attestation is accepted on
/// inclusion alone; the check that the bytes name the registered agreement
/// and assembly stays where it is, at the usage claim (`UsageCounter`, and
/// the guest's usage-claim path). Under `Plaintext` the guest keeps the
/// agreement format's byte check (`kernel::validate_attestation_content`).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum AttestationWitness {
    /// The coordinator's arguments: fingerprints only.
    HashOnly {
        /// `keccak256(clauseData)` — the committed clause's fingerprint,
        /// as the coordinator's `clauseDataHash`.
        clause_data_hash: B256,
        /// Sorted-pair Merkle proof binding the clause leaf to the target
        /// order's signed `checkout_hash`. Empty for a single-clause
        /// agreement, where the leaf is the root itself.
        inclusion_proof: Vec<B256>,
    },
    /// The plaintext form: the content checked inside the proof.
    Plaintext(AttestationContentProof),
}

/// The plaintext form of a batched attestation's witness
/// (`AttestationWitness::Plaintext`), sent only at the attesting party's
/// choice: the direct path, and the batch path's default
/// (`AttestationWitness::HashOnly`), bind hashes and validate no content
/// shape; this form has the content validated inside the proof.
///
/// In-proof gates (see `kernel::validate_attestation_content`):
///
///   S. Spec identity + binding — `spec_json` parses as a `ClauseSpec`
///      and `keccak256(spec_json bytes)`, hashed verbatim as pinned,
///      equals the op's `clause_id` (a clause key IS its spec's hash);
///      the pair is committed as a `SpecBinding` public value with both
///      fields equal. The on-chain verifier accepts the batch only if
///      every binding's fields are equal and
///      `ClauseRegistry.registered(clause_id)` — the registry is the
///      trust anchor, the vkey covers the ENGINE, and a caller cannot
///      weaken validation with a permissive spec.
///   C. Content — per `content_kind` (validate + generic-encode for a
///      runtime witness; clauseData hash + default-fields validation
///      for a re-assert). Binds `content_ref` to validated content.
///   I. Agreement inclusion — the sorted-pair Merkle `inclusion_proof`
///      verifies leaf `keccak256(clause_id ++ keccak256(clause_data))`
///      against the TARGET commitment's signed `checkout_hash`,
///      mirroring the coordinator's mandatory `_verifyInclusion`.
///
/// The one key the gates do not run for is the agreement format's
/// reserved provenance leaf (`kernel::PROVENANCE_LEAF_KEY`): it is not a
/// clause, so S and C give way to the format's own rule — `clause_data`
/// is the reproduction of the agreementHash and assemblyHash it carries, `content_ref` is
/// its keccak — and I runs as for any leaf; no spec binding is committed.
///
/// JSON crosses the SP1 stdin boundary as pre-serialized `String`s —
/// bincode (non-self-describing) cannot carry `serde_json::Value`, and
/// no field here may use `skip_serializing_if` (either desyncs the
/// guest's deserializer; see `tests/bincode_roundtrip.rs`).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AttestationContentProof {
    /// The clause's canonical spec JSON, as registered (exact bytes —
    /// `keccak256` of them must equal the registry's anchored
    /// `contentHash`).
    pub spec_json: String,
    /// The structured content the engine validates and (for a runtime
    /// witness) re-encodes to canonical ABI bytes.
    pub content_json: String,
    /// Canonical-JSON `clauseData` bytes (as a UTF-8 string) — the
    /// committed agreement clause this attestation declares against.
    pub clause_data: String,
    /// Sorted-pair Merkle proof binding the clause leaf to the target
    /// order's signed `checkout_hash`. Empty for a single-clause
    /// agreement, where the leaf is the root itself.
    pub inclusion_proof: Vec<B256>,
    /// Which content convention `content_ref` follows.
    pub content_kind: ContentKind,
}

// ── Batch operations ──────────────────────────────────────────────

/// A single FigaroCore operation within a proof batch.
///
/// Registry mutations (clause/seller/agreement/assembly registration) are NOT
/// batched: they are once-per-key ETH-staked intents (K4)
/// that don't fit ERC-20 position netting, carry no throughput concern, and
/// batching them would fork a second first-write-wins namespace. They
/// stay on the direct path; the batch covers the high-frequency FigaroCore
/// + attestation surface.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum KernelOp {
    /// Dual-signed commitment. Matches FigaroCore.commit().
    Commit {
        commitment: Commitment,
        buyer_sig: Signature,
        seller_sig: Signature,
    },
    /// Buyer-authorized resolution. Batched equivalent of
    /// FigaroCore.resolveProcess() where msg.sender == rootBuyer
    /// is replaced by an EIP-712 signature over the process id and the
    /// cumulative value the buyer accepts: the authorization applies only
    /// while the process holds that value, so it resolves exactly the prefix
    /// of the process whose cumulative value the buyer signed — a value not
    /// yet reached pre-authorizes exactly the orders that bring it there.
    Resolve {
        process_id: B256,
        cumulative_value: U256,
        commitments: Vec<Commitment>,
        buyer_sig: Signature,
    },

    // ── AttestationCoordinator ────────────────────────────────────
    /// Seller attestation. Batched equivalent of attestAsSeller():
    /// authorized by `target.seller` — a seller attests about a clause of
    /// its own order; `target` carries that order and the signed
    /// checkoutHash the inclusion proof opens against.
    AttestAsSeller {
        target: Commitment,
        clause_id: B256,
        stage: u8,
        content_ref: B256,
        /// Proves the caller is `target.seller` (replaces msg.sender).
        seller_sig: Signature,
        proof: AttestationWitness,
    },

    /// Buyer attestation. Batched equivalent of attestAsBuyer():
    /// authorized by `target.buyer` (== the process rootBuyer by commit
    /// invariant).
    AttestAsBuyer {
        target: Commitment,
        clause_id: B256,
        stage: u8,
        content_ref: B256,
        /// Proves the caller is `target.buyer` (replaces msg.sender).
        buyer_sig: Signature,
        proof: AttestationWitness,
    },
    // These are the coordinator's two attestation modes, as on the
    // direct path: a party attests for itself, and its signature here
    // proves the caller the direct path reads from `msg.sender`. No
    // other party files an attestation on an order.
}

// ── Usage accrual (the RPGF bridge) ───────────────────────────────

/// Which family — clause, agreement or assembly — a usage claim credits,
/// and the witness each needs. Mirrors `UsageCounter.recordClauseUsage`,
/// `recordAgreementUsage` and `recordAssemblyUsage` — the same leaf
/// convention and the same sorted-pair proof, differing in how the leaf is
/// identified.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum UsageClaimKind {
    /// Clause usage. The leaf key IS the clause, and the clause's
    /// committed bytes are supplied as a FINGERPRINT — the preimage
    /// never enters the batch, exactly as on the direct path.
    Clause { clause_data_hash: B256 },
    /// Agreement usage; the claim's key is the registered agreementHash.
    /// The leaf is the reserved PROVENANCE leaf, a constant of the
    /// agreement format, and its bytes are REPRODUCED from both keys rather
    /// than supplied: `{"agreementHash":"0x…","assemblyHash":"0x…"}`, the
    /// assemblyHash of the assembly whose agreement the order instantiates. A
    /// wrong key on either side derives a leaf that is simply not in the
    /// tree.
    Agreement { assembly_hash: B256 },
    /// Assembly usage; the claim's key is the assemblyHash. The
    /// provenance leaf is proved exactly as for an agreement claim, from
    /// `agreement_hash` and the assemblyHash; then the agreement's leaf
    /// `keccak256(keccak256(ASSEMBLY_LEAF_DOMAIN ‖ agreement_hash ‖ slot_content_hash))` is proved
    /// under the assemblyHash by `membership_proof`, with the same
    /// sorted-pair verifier — the assembly's root is a merkle tree over its
    /// order slots.
    Assembly {
        agreement_hash: B256,
        slot_content_hash: B256,
        membership_proof: Vec<B256>,
    },
}

/// The reward family of a clause key, as the accrual carries it.
pub const USAGE_KIND_CLAUSE: u8 = 0;
/// The reward family of an assembly key, as the accrual carries it.
pub const USAGE_KIND_ASSEMBLY: u8 = 1;
/// The reward family of an agreement hash, as the accrual carries it.
pub const USAGE_KIND_AGREEMENT: u8 = 2;

impl UsageClaimKind {
    /// The family this claim credits: `USAGE_KIND_CLAUSE`,
    /// `USAGE_KIND_ASSEMBLY` or `USAGE_KIND_AGREEMENT`. A registry accepts
    /// any bytes32, so keys of two families can be the same word; every
    /// count and accrual is keyed by (kind, key) and the families never
    /// merge.
    pub fn code(&self) -> u8 {
        match self {
            Self::Clause { .. } => USAGE_KIND_CLAUSE,
            Self::Agreement { .. } => USAGE_KIND_AGREEMENT,
            Self::Assembly { .. } => USAGE_KIND_ASSEMBLY,
        }
    }
}

/// A claim that one RESOLVED order used one clause, agreement or assembly.
/// The guest proves it against the batch's own post-state and the order's
/// signed `checkout_hash`; nothing here is taken on the sequencer's word.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UsageClaim {
    /// The order's commitment struct, exactly as signed.
    pub order: Commitment,
    /// The key the claim credits, each family's own registry key: the
    /// clause key (keccak256 of the spec's pinned bytes), the agreementHash,
    /// or the assemblyHash — never a new identifier.
    pub clause_or_assembly: B256,
    pub kind: UsageClaimKind,
    /// Sorted-pair Merkle proof of the clause leaf against the order's
    /// signed `checkout_hash`.
    pub inclusion_proof: Vec<B256>,
}

/// One use a batch carries to `UsageCounter`: a RESOLVED batch-path process
/// that used a clause, agreement or assembly under its (kind, key), and the
/// seller of the order the claim proved it through. The counter counts it
/// exactly as a direct call counts a use — the same tally, the same
/// counted-process set, the same per-period seller set — so a use is a use
/// whichever way its process reached the chain. The guest gives each
/// (kind, key, process) once per batch.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct BatchUse {
    pub clause_or_assembly: B256,
    /// `USAGE_KIND_CLAUSE`, `USAGE_KIND_ASSEMBLY` or
    /// `USAGE_KIND_AGREEMENT`, from the claim's own `UsageClaimKind`.
    pub kind: u8,
    /// The process, its id derived under the verifier's EIP-712 domain.
    pub process_id: B256,
    /// The seller of the order the claim was proved through.
    pub seller: Address,
}

// ── State snapshot (deterministic, sorted) ────────────────────────

/// Serializable state snapshot — the FigaroCore mappings. Entries must be
/// sorted by key for deterministic root computation.
///
/// No usage state lives here: `UsageCounter` holds the one counted-process
/// set and the one seller set for both routes, and skips a use whose process
/// it has already counted, so the guest proves each claim against the
/// orders' state and leaves the counting to the chain.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KernelStateSnapshot {
    pub processes: Vec<(B256, ProcessState)>,
    pub order_status: Vec<(B256, u8)>,
    pub order_process_id: Vec<(B256, B256)>,
}

// ── SP1 I/O types ─────────────────────────────────────────────────

/// Input to the SP1 prover program.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchInput {
    pub chain_id: u64,
    pub verifying_contract: Address,
    pub block_timestamp: u64,
    pub operations: Vec<KernelOp>,
    pub prev_state: KernelStateSnapshot,
    /// Usage to credit for orders RESOLVED IN THE BATCH PATH — including
    /// orders resolved by this very batch, since the claims are proved
    /// against the post-state.
    pub usage_claims: Vec<UsageClaim>,
    /// The accrual period every claim in this batch lands in. The guest
    /// takes it on trust and COMMITS it; the on-chain verifier requires
    /// it to equal `UsageCounter.currentPeriod()` at resolution, so the
    /// chain — never the sequencer's clock — decides which period a
    /// batch pays into. A batch proven just before a boundary and
    /// resolved just after is rejected and must be re-proven: loud, and
    /// far better than silently paying the wrong tranche.
    pub usage_period: u8,
    /// The reserved provenance leaf's key, a constant of the agreement
    /// format (`keccak256("figaro-agreement-provenance")`) mirrored by
    /// `UsageCounter.provenanceLeaf()`; the guest takes it as witness and
    /// the chain checks it. It is the leaf key an assembly claim proves
    /// against, COMMITTED in the usage hash, so a prover cannot nominate
    /// some clause whose clause happens to equal the provenance bytes.
    /// The attestation path does not read it: an attestation of the
    /// provenance leaf is recognized by the guest's own constant
    /// (`kernel::PROVENANCE_LEAF_KEY`), because the chain's check of this
    /// witness sits inside the verifier's accrual try/catch and cannot
    /// refuse a batch's attestations.
    pub provenance_leaf: B256,
}

/// Public values committed by the SP1 program.
/// The on-chain verifier checks these.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PublicValues {
    pub prev_state_root: B256,
    pub new_state_root: B256,
    pub chain_id: u64,
    pub verifying_contract: Address,
    /// Hash of net token positions. The on-chain verifier uses this
    /// to confirm the token operations list submitted alongside the proof.
    pub token_ops_hash: B256,
    /// Hash of attestation events emitted in this batch.
    /// The on-chain verifier re-emits these events.
    pub attestation_events_hash: B256,
    /// Hash of the deduplicated (clause key, witness-spec hash) bindings
    /// the in-proof clause gates validated against — both fields equal.
    /// The on-chain verifier checks each binding's fields are equal and
    /// its key `ClauseRegistry.registered` before accepting the batch.
    pub spec_bindings_hash: B256,
    /// Hash of the batch's designer-reward uses — the period, the
    /// provenance leaf's key and every (kind, key, process, seller) use.
    /// The on-chain verifier re-derives it from calldata and hands the uses
    /// to `UsageCounter`, which counts each one that passes the gates a
    /// direct call meets: a live `MembersRegistry` stake for its seller, a
    /// live registration for its key in `ClauseRegistry`,
    /// `AgreementRegistry` or `AssemblyRegistry`, and a process not yet
    /// counted under that key.
    pub usage_accrual_hash: B256,
    /// The clock the guest checked every commitment deadline against
    /// (`input.block_timestamp`). It is COMMITTED here so the on-chain verifier
    /// can bound it against the real `block.timestamp` at resolution: a
    /// prover-chosen time is otherwise unconstrained, and `settleBatch` is
    /// permissionless, so an unbounded clock lets a caller pick `0` and bond a
    /// signed commitment whose deadline has long passed — one the direct path
    /// rejects with `DeadlineExpired`. Bounding it here makes the guest's
    /// deadline gate real.
    pub block_timestamp: u64,
    /// `keccak256` of the batch's operation stream (`operation_stream`): every
    /// commit and resolve the batch applied, whole, and every usage claim.
    /// The on-chain verifier takes the stream as calldata and refuses a batch
    /// whose bytes do not hash to this word, so a batch cannot land without
    /// publishing what rebuilds the state behind its root.
    pub operations_hash: B256,
}

impl PublicValues {
    /// The ONE byte layout of the public values: 10 × 32-byte ABI words,
    /// exactly what `FigaroBatchVerifier._decodePV` abi.decodes. The guest
    /// commits these bytes, the host submits them, and the on-chain SP1
    /// verifier hashes the submission against the proof's committed digest —
    /// so a second encoding anywhere is a `ProofInvalid` by construction.
    pub fn abi_encode(&self) -> Vec<u8> {
        let mut data = Vec::with_capacity(320);
        data.extend_from_slice(self.prev_state_root.as_slice());
        data.extend_from_slice(self.new_state_root.as_slice());
        let mut chain_word = [0u8; 32];
        chain_word[24..].copy_from_slice(&self.chain_id.to_be_bytes());
        data.extend_from_slice(&chain_word);
        let mut addr_word = [0u8; 32];
        addr_word[12..].copy_from_slice(self.verifying_contract.as_slice());
        data.extend_from_slice(&addr_word);
        data.extend_from_slice(self.token_ops_hash.as_slice());
        data.extend_from_slice(self.attestation_events_hash.as_slice());
        data.extend_from_slice(self.spec_bindings_hash.as_slice());
        data.extend_from_slice(self.usage_accrual_hash.as_slice());
        let mut ts_word = [0u8; 32];
        ts_word[24..].copy_from_slice(&self.block_timestamp.to_be_bytes());
        data.extend_from_slice(&ts_word);
        data.extend_from_slice(self.operations_hash.as_slice());
        data
    }

    /// Inverse of `abi_encode` — the only sanctioned way to read a committed
    /// public-values stream. Strict: the length and every pad byte must hold.
    pub fn abi_decode(data: &[u8]) -> Result<Self, String> {
        if data.len() != 320 {
            return Err(format!("public values must be 320 bytes, got {}", data.len()));
        }
        let word = |i: usize| -> [u8; 32] { data[i * 32..(i + 1) * 32].try_into().unwrap() };
        let chain_word = word(2);
        if chain_word[..24] != [0u8; 24] {
            return Err("chain_id word has nonzero padding".into());
        }
        let addr_word = word(3);
        if addr_word[..12] != [0u8; 12] {
            return Err("verifying_contract word has nonzero padding".into());
        }
        let ts_word = word(8);
        if ts_word[..24] != [0u8; 24] {
            return Err("block_timestamp word has nonzero padding".into());
        }
        Ok(Self {
            prev_state_root: B256::from(word(0)),
            new_state_root: B256::from(word(1)),
            chain_id: u64::from_be_bytes(chain_word[24..].try_into().unwrap()),
            verifying_contract: Address::from_slice(&addr_word[12..]),
            token_ops_hash: B256::from(word(4)),
            attestation_events_hash: B256::from(word(5)),
            spec_bindings_hash: B256::from(word(6)),
            usage_accrual_hash: B256::from(word(7)),
            block_timestamp: u64::from_be_bytes(ts_word[24..].try_into().unwrap()),
            operations_hash: B256::from(word(9)),
        })
    }
}

/// An attestation event proven by the batch. The on-chain verifier
/// re-emits these as Attestation events.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AttestationEventData {
    pub order_hash: B256,
    pub process_id: B256,
    pub attester: Address,
    pub clause_id: B256,
    pub stage: u8,
    pub content_ref: B256,
}

/// One (clause key, witness-spec hash) binding used by the batch's
/// clause gates. `spec_hash` is `keccak256` of the exact witness spec
/// bytes and `clause_id` is the clause key, which Gate S requires to be
/// that same hash — the two fields are equal; the layout keeps both.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct SpecBinding {
    pub clause_id: B256,
    pub spec_hash: B256,
}

/// Collected side-effect data from batch execution.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchEvents {
    pub attestations: Vec<AttestationEventData>,
    /// Deduplicated, sorted — the verifier checks each against the
    /// live ClauseRegistry.
    pub spec_bindings: Vec<SpecBinding>,
    /// The batch's uses, one per (kind, key, process), in the order of the
    /// claims. Empty when the batch carries no usage claims.
    pub uses: Vec<BatchUse>,
    /// The period the uses land in, echoed from the batch input and
    /// committed in `usage_accrual_hash`.
    pub usage_period: u8,
}

/// Net token position per (token, user) across the batch.
/// The on-chain verifier reconciles deposits and payouts from this list.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NetPosition {
    pub token: Address,
    pub user: Address,
    /// Total tokens the user must have deposited for commits in this batch.
    pub deposit: U256,
    /// Total tokens the user receives from resolutions in this batch.
    pub payout: U256,
}

// ── Errors (match FigaroCore.sol / AttestationCoordinator.sol) ────

#[derive(Debug, Clone)]
pub enum KernelError {
    DeadlineExpired,
    InvalidBuyerSignature,
    InvalidSellerSignature,
    ZeroPayment,
    ProcessAlreadyExists,
    UnknownProcess,
    CumulativeValueMismatch { expected: U256, actual: U256 },
    NotProcessBuyer,
    CurrencyMismatch,
    OrderNotCommitted(B256),
    NoActiveOrders,
    IncompleteOrderList { required: u64, provided: u64 },
    /// The resolve authorization signs a cumulative value the process does
    /// not hold at application: an order committed after the buyer signed
    /// (or the buyer signed over a value the process has not reached).
    StaleResolveAuthorization { signed: U256, current: U256 },
    DuplicateCommitment,
    InvalidRootCumulativeValue,
    ProcessAlreadyResolved,
    Overflow,
    InvalidSignature,
    // AttestationCoordinator gates
    NotAuthorized,
    UnknownOrder,
    /// Attestation against a resolved order — the evidence window closes
    /// at resolution (coordinator's `OrderResolved` gate).
    OrderResolved,
    /// Gate I: the sorted-pair Merkle `inclusion_proof` does not verify
    /// the clause leaf against the target order's signed
    /// `checkout_hash` — the attested clause was not part of the
    /// agreement both parties signed.
    InvalidInclusionProof,
    // In-proof clause gates (figaro-clause engine)
    /// Gate S: the witness spec is not valid JSON / not a well-formed
    /// ClauseSpec.
    ClauseSpecParseFailed(String),
    /// Gate S: the witness spec's bytes do not hash to the op's
    /// `clause_id` — the caller supplied the spec of a different clause.
    SpecIdentityMismatch(B256),
    /// Gate C: `content_json` (or a re-assert's `clause_data`) fails
    /// the spec's validation.
    ClauseContentInvalid(String),
    /// Gate C: the generic encoder could not derive canonical ABI bytes
    /// (bad field type, malformed hex, undeclared enum value, …).
    ContentEncodingFailed(String),
    /// Gate C: the derived content bytes do not hash to `content_ref`.
    ContentHashMismatch,
    // Usage accrual (the RPGF bridge)
    /// Usage was claimed for an order the batch path has not resolved.
    /// Usage is what a FINISHED process leaves behind — the inverse of
    /// the attestation gate, exactly as on the direct path.
    UsageOrderNotResolved(B256),
    /// The claimed clause is not a leaf of the order's signed
    /// agreement — for an agreement or assembly claim, the usual cause is
    /// an agreementHash or assemblyHash that does not match the committed
    /// provenance leaf — or, for an assembly claim, the agreement's leaf is not
    /// a leaf of the assemblyHash.
    UsageInvalidInclusionProof,
    /// An attestation of the reserved provenance leaf whose bytes are not
    /// `{"agreementHash":"0x<64 lowercase hex>","assemblyHash":"0x<64 lowercase hex>"}`
    /// reproduced from the two keys they carry.
    ProvenanceLeafNotCanonical,
    /// A usage claim keyed on a reserved key of the format (the
    /// provenance leaf's or the assembly terms leaf's), or an assembly
    /// claim whose agreement position names one as its agreementHash. Neither key is
    /// ever a clause, an agreement or an assembly, so no claim is credited
    /// under it — the guest's mirror of the counter's refusal of both.
    ReservedKeyIsNotARegistration(B256),
}

impl core::fmt::Display for KernelError {
    fn fmt(&self, f: &mut core::fmt::Formatter) -> core::fmt::Result {
        match self {
            Self::CumulativeValueMismatch { expected, actual } => {
                write!(f, "CumulativeValueMismatch(expected={expected}, actual={actual})")
            }
            Self::IncompleteOrderList { required, provided } => {
                write!(f, "IncompleteOrderList(required={required}, provided={provided})")
            }
            Self::StaleResolveAuthorization { signed, current } => {
                write!(f, "StaleResolveAuthorization(signed={signed}, current={current})")
            }
            Self::OrderNotCommitted(h) => write!(f, "OrderNotCommitted({h})"),
            Self::SpecIdentityMismatch(h) => write!(f, "SpecIdentityMismatch({h})"),
            Self::UsageOrderNotResolved(h) => write!(f, "UsageOrderNotResolved({h})"),
            other => write!(f, "{other:?}"),
        }
    }
}

impl std::error::Error for KernelError {}
