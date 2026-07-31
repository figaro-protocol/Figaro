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
    pub agreement_hash: B256,
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

// ── Attestation content proof (the in-proof clause gates) ─────────

/// How the attestation's `content` bytes relate to the clause spec —
/// the two content conventions the protocol carries today.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContentKind {
    /// A runtime witness: `content` is the ABI encoding of
    /// `content_json` under the spec's fields at the op's `stage`
    /// (`contentRef = keccak256(abi bytes)`).
    RuntimeWitness,
    /// A re-asserting attestation: `content` IS the committed
    /// canonical-JSON `sectionData` (`contentRef = keccak256(sectionData)`),
    /// re-anchoring the signed section as runtime evidence.
    ReAssert,
}

/// The witness payload every batched attestation carries. The direct
/// path (AttestationCoordinator) merkle-binds and content-hash-binds but
/// validates no content shape; the batched path will not record content
/// it cannot validate, so the full proof is MANDATORY here.
///
/// In-proof gates (see `kernel::validate_attestation_content`):
///
///   S. Spec identity + binding — `spec_json` parses as a `ClauseSpec`
///      whose `keccak256(abi.encode(clauseId, version))` equals the op's
///      `clause_id`, and `keccak256(spec_json bytes)` is committed as a
///      `SpecBinding` public value. The on-chain verifier accepts the
///      batch only if every binding matches
///      `ClauseRegistry.contentHashOf(clause_id)` — the registry is the
///      trust anchor, the vkey covers the ENGINE, and a caller cannot
///      weaken validation with a permissive spec.
///   C. Content — per `content_kind` (validate + generic-encode for a
///      runtime witness; sectionData hash + default-fields validation
///      for a re-assert). Binds `content_ref` to validated content.
///   I. Agreement inclusion — the sorted-pair Merkle `inclusion_proof`
///      verifies leaf `keccak256(clause_id ++ keccak256(section_data))`
///      against the TARGET commitment's signed `agreement_hash`,
///      mirroring the coordinator's mandatory `_verifyInclusion`.
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
    /// Canonical-JSON `sectionData` bytes (as a UTF-8 string) — the
    /// committed agreement section this attestation declares against.
    pub section_data: String,
    /// Sorted-pair Merkle proof binding the section leaf to the target
    /// order's signed `agreement_hash`. Empty for a single-section
    /// agreement, where the leaf is the root itself.
    pub inclusion_proof: Vec<B256>,
    /// Which content convention `content_ref` follows.
    pub content_kind: ContentKind,
}

// ── Batch operations ──────────────────────────────────────────────

/// A single kernel operation within a proof batch.
///
/// Registry mutations (clause/seller/assembly registration) are NOT
/// batched: they are once-per-artifact ETH-staked intents (K4) that
/// don't fit ERC-20 position netting, carry no throughput concern, and
/// batching them would fork a second first-write-wins namespace. They
/// stay on the direct path; the batch covers the high-frequency kernel
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
    /// is replaced by an EIP-712 signature.
    Resolve {
        process_id: B256,
        commitments: Vec<Commitment>,
        buyer_sig: Signature,
    },

    // ── AttestationCoordinator ────────────────────────────────────
    /// Seller attestation. Batched equivalent of attestAsSeller():
    /// `role` proves seller identity + process membership; `target`
    /// carries the order being attested and the signed agreementHash
    /// the inclusion proof opens against. For same-order attestation
    /// the two commitments are identical.
    AttestAsSeller {
        role: Commitment,
        target: Commitment,
        clause_id: B256,
        stage: u8,
        content_ref: B256,
        /// Proves the caller is `role.seller` (replaces msg.sender).
        seller_sig: Signature,
        proof: AttestationContentProof,
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
        proof: AttestationContentProof,
    },
    // `attestViaResolver` is deliberately absent: its authority check is
    // a live `IRoleResolver.isAuthorized` contract call, which cannot
    // run inside the proof. Resolver-mediated attestations stay on the
    // direct path.
}

// ── Usage accrual (the RPGF bridge) ───────────────────────────────

/// Which of the two artifact families a usage claim credits, and the
/// witness each needs. Mirrors `UsageCounter.recordClauseUsage` /
/// `recordAssemblyUsage` — same leaf convention, same proof, one step
/// different in how the section is identified.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum UsageClaimKind {
    /// Clause usage. The leaf key IS the artifact, and the section's
    /// committed bytes are supplied as a FINGERPRINT — the preimage
    /// never enters the batch, exactly as on the direct path.
    Clause { section_hash: B256 },
    /// Assembly usage. The leaf key is the PROVENANCE clause (never the
    /// artifact — a compositionHash is not a leaf key), and the section
    /// bytes are REPRODUCED from the artifact rather than supplied:
    /// `{"compositionHash":"0x…"}`. A wrong compositionHash derives a
    /// leaf that is simply not in the tree.
    Assembly,
}

/// A claim that one SETTLED order used one artifact. The guest proves
/// it against the batch's own post-state and the order's signed
/// `agreement_hash`; nothing here is taken on the sequencer's word.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UsageClaim {
    /// The order's commitment struct, exactly as signed.
    pub order: Commitment,
    /// Clause idHash or assembly compositionHash — the same identity
    /// each family's own registry uses, never a new identifier.
    pub artifact: B256,
    pub kind: UsageClaimKind,
    /// Sorted-pair Merkle proof of the section leaf against the order's
    /// signed `agreement_hash`.
    pub inclusion_proof: Vec<B256>,
}

/// One artifact's accrual AFTER this batch — the CUMULATIVE `(c, d)` for
/// the batch path in `period`, not a delta. The verifier overwrites the
/// counter's batch-side slot with it, so the on-chain write is O(distinct
/// artifacts in the batch) and carries no per-process storage at all.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct UsageAccrual {
    pub artifact: B256,
    /// Distinct settled processes that used this artifact (batch path).
    pub c: u64,
    /// Distinct staked sellers in this period (batch path).
    pub d: u64,
}

// ── State snapshot (deterministic, sorted) ────────────────────────

/// Serializable state snapshot — the kernel mappings, plus the usage
/// accrual state the RPGF bridge proves against. Entries must be sorted
/// by key for deterministic root computation.
///
/// USAGE STATE LIVES IN THE PROVEN STATE, and it has to: the guest owns
/// idempotence, but a process resolved in batch N is still RESOLVED in
/// batch N+1's snapshot, so a batch-local dedup set would let the same
/// trade be claimed again in every later batch. Carrying the sets under
/// the state root makes "already counted" part of the proven transition
/// — the same guarantee `UsageCounter.processCounted` gives the direct
/// path, at zero on-chain storage.
///
/// Guest-owned idempotence is SAFE because the two settlement universes
/// are DISJOINT: a batch-settled process never acquires kernel status,
/// and a kernel-settled one is never in a batch, so no process can be
/// counted on both paths. Pairs MAY overlap across the two, which is
/// exactly why the counter sums the two SCORES and never their
/// components.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KernelStateSnapshot {
    pub processes: Vec<(B256, ProcessState)>,
    pub order_status: Vec<(B256, u8)>,
    pub order_process_id: Vec<(B256, B256)>,
    /// (artifact, processId) already counted — global, not per period,
    /// mirroring `UsageCounter.processCounted`.
    pub usage_counted: Vec<(B256, B256)>,
    /// (artifact, period, seller) — breadth counts distinct staked
    /// sellers PER PERIOD, mirroring `UsageCounter.sellerSeen`.
    pub usage_seller_seen: Vec<(B256, u8, Address)>,
    /// (artifact, period) → (c, d) — the running batch-path accrual the
    /// verifier writes out.
    pub usage_accrual: Vec<((B256, u8), (u64, u64))>,
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
    /// Usage to credit for orders SETTLED IN THE BATCH PATH — including
    /// orders resolved by this very batch, since the claims are proved
    /// against the post-state.
    pub usage_claims: Vec<UsageClaim>,
    /// The accrual period every claim in this batch lands in. The guest
    /// takes it on trust and COMMITS it; the on-chain verifier requires
    /// it to equal `UsageCounter.currentPeriod()` at settlement, so the
    /// chain — never the sequencer's clock — decides which period a
    /// batch pays into. A batch proven just before a boundary and
    /// settled just after is rejected and must be re-proven: loud, and
    /// far better than silently paying the wrong tranche.
    pub usage_period: u8,
    /// `figaro-assembly-provenance`'s clause key, the leaf key an
    /// assembly claim proves against. COMMITTED in the usage hash and
    /// checked on-chain against `UsageCounter.provenanceClause`, so a
    /// prover cannot nominate some other clause whose 32-byte section
    /// happens to equal an assembly's hash.
    pub provenance_clause: B256,
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
    /// Hash of the deduplicated (clause key → witness-spec hash)
    /// bindings the in-proof clause gates validated against. The
    /// on-chain verifier checks each binding against
    /// `ClauseRegistry.contentHashOf` before accepting the batch.
    pub spec_bindings_hash: B256,
    /// Hash of the batch's RPGF usage accrual — the period, the
    /// provenance-clause key, the per-artifact cumulative `(c, d)`, and
    /// the distinct sellers the accrual rests on. The on-chain verifier
    /// re-derives it from calldata, anchors every seller against
    /// `MembersRegistry.registered` and every artifact against
    /// `UsageCounter.excludedArtifact`, then writes the accrual.
    pub usage_accrual_hash: B256,
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

/// One (clause key → witness-spec hash) binding used by the batch's
/// clause gates. `clause_id` is the on-chain key
/// `keccak256(abi.encode(clauseId, version))`; `spec_hash` is
/// `keccak256` of the exact witness spec bytes.
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
    /// Per-artifact cumulative accrual after this batch, sorted by
    /// artifact. Empty when the batch carries no usage claims.
    pub usage_accruals: Vec<UsageAccrual>,
    /// The distinct sellers of record behind those accruals, sorted.
    /// The verifier requires a LIVE MembersRegistry stake for each —
    /// the batch-path form of the direct path's per-record seller gate.
    pub usage_sellers: Vec<Address>,
    /// The period the accrual lands in, echoed from the batch input and
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
    DuplicateCommitment,
    InvalidRootCumulativeValue,
    ProcessAlreadyResolved,
    Overflow,
    InvalidSignature,
    // AttestationCoordinator gates
    NotAuthorized,
    ProcessMismatch,
    UnknownOrder,
    /// Attestation against a resolved order — the evidence window closes
    /// at resolution (coordinator's `OrderResolved` gate).
    OrderResolved,
    /// Gate I: the sorted-pair Merkle `inclusion_proof` does not verify
    /// the clause's section leaf against the target order's signed
    /// `agreement_hash` — the attested clause was not part of the
    /// agreement both parties signed.
    InvalidInclusionProof,
    // In-proof clause gates (figaro-clause engine)
    /// Gate S: the witness spec is not valid JSON / not a well-formed
    /// ClauseSpec.
    ClauseSpecParseFailed(String),
    /// Gate S: the witness spec's (clauseId, version) do not hash to the
    /// op's `clause_id` — the caller supplied a spec for a different
    /// clause.
    SpecIdentityMismatch(B256),
    /// Gate C: `content_json` (or a re-assert's `section_data`) fails
    /// the spec's validation.
    ClauseContentInvalid(String),
    /// Gate C: the generic encoder could not derive canonical ABI bytes
    /// (bad field type, malformed hex, undeclared enum value, …).
    ContentEncodingFailed(String),
    /// Gate C: the derived content bytes do not hash to `content_ref`.
    ContentHashMismatch,
    // Usage accrual (the RPGF bridge)
    /// Usage was claimed for an order the batch path has not settled.
    /// Usage is what a FINISHED process leaves behind — the inverse of
    /// the attestation gate, exactly as on the direct path.
    UsageOrderNotResolved(B256),
    /// This (artifact, process) pair was already counted in an earlier
    /// batch (or earlier in this one). Once ever, whatever the period —
    /// the guest's mirror of `UsageCounter.AlreadyCounted`.
    UsageAlreadyCounted { artifact: B256, process_id: B256 },
    /// The claimed section is not a leaf of the order's signed
    /// agreement — for an assembly claim, the usual cause is a
    /// compositionHash that does not match the committed provenance
    /// section.
    UsageInvalidInclusionProof,
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
            Self::OrderNotCommitted(h) => write!(f, "OrderNotCommitted({h})"),
            Self::SpecIdentityMismatch(h) => write!(f, "SpecIdentityMismatch({h})"),
            Self::UsageOrderNotResolved(h) => write!(f, "UsageOrderNotResolved({h})"),
            Self::UsageAlreadyCounted {
                artifact,
                process_id,
            } => write!(f, "UsageAlreadyCounted(artifact={artifact}, process={process_id})"),
            other => write!(f, "{other:?}"),
        }
    }
}

impl std::error::Error for KernelError {}
