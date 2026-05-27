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

// ── Attestation content (Layer B validator payload) ───────────────

/// Optional content payload attached to an attestation op so the SP1
/// prover can prove — inside the proof — that the on-chain `content_ref`
/// hashes a content blob that satisfies the schema's spec.
///
/// When `content_proof: Some(_)` on an `AttestAsSeller` / `AttestAsBuyer`
/// op, the kernel enforces:
///
///   1. The op's `schema_id` is one of the runtime-attestable protocol
///      schemas — its canonical spec is compiled into the prover binary
///      (`figaro_schema::embedded_spec_json`), looked up by `schema_id`,
///      never supplied by the caller.
///   2. `validate_content(content_json, embedded_spec, stage)` returns
///      Ok — the structured form passes the Layer B validator.
///   3. `encode_content_for_schema(schemaId, content_json)` produces ABI
///      bytes byte-for-byte identical to viem's encoders in
///      `sdk/src/schemas/encode.ts`. The encoder is the cross-form
///      binding — it derives the canonical byte form *from* the JSON, so
///      no separate `content_bytes` field can disagree with `content_json`.
///   4. `keccak256(derived_bytes) == content_ref` — binds the derived
///      bytes (which Layer C will decode) to the on-chain commitment.
///   5. For seller attestations, the schema's section is a clause of the
///      order's signed `agreement_hash`: a sorted-pair Merkle inclusion
///      proof (`inclusion_proof`) verifies the section leaf against the
///      `agreement_hash` carried in the role commitment. The leaf is
///      `keccak256(schemaId ++ keccak256(sectionData))`; for a
///      cross-checking schema `keccak256(sectionData) == content_ref`, so
///      the leaf needs no extra input, while a non-cross-checking schema
///      carries its canonical-JSON `section_data` explicitly.
///
/// Because the spec is looked up by `schema_id` rather than carried on
/// the wire, the constraint set every attestation is checked against is
/// covered by the program verification key — a caller cannot weaken
/// validation by supplying a permissive spec.
///
/// When `content_proof: None` the attestation is treated as
/// content-opaque (the on-chain validator gate runs at settlement time
/// on Layer C).
///
/// `content_json` is carried as a pre-serialized JSON string because
/// SP1's input deserializer (bincode v1) does not support the
/// `deserialize_any` path that `serde_json::Value` requires.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AttestationContentProof {
    /// The structured JSON form Layer B validates against the embedded
    /// schema spec and re-encodes to ABI bytes via the per-schema
    /// encoder. Carried as a JSON-serialized string for zkVM compatibility.
    pub content_json: String,
    /// Sorted-pair Merkle proof binding the schema's section leaf to the
    /// order's signed `agreement_hash` (Gate 5). Empty for a single-section
    /// agreement, where `agreement_hash` is itself the leaf. Verified only
    /// for seller attestations; ignored for buyer attestations.
    pub inclusion_proof: Vec<B256>,
    /// Canonical-JSON `sectionData` bytes (as a UTF-8 string) for a
    /// non-cross-checking (Category-1) schema, whose committed `sectionData`
    /// is not the ABI content form. `None` for cross-checking (Category-2)
    /// schemas, where the leaf is derived from `content_ref` directly.
    pub section_data: Option<String>,
}

// ── Batch operations ──────────────────────────────────────────────

/// A single kernel operation within a proof batch.
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

    /// Seller attestation. Batched equivalent of attestAsSeller()
    /// where msg.sender check is replaced by an EIP-712 signature.
    AttestAsSeller {
        role_commitment: Commitment,
        order_hash: B256,
        schema_id: B256,
        stage: u8,
        content_ref: B256,
        /// Proves the caller is the seller of role_commitment.
        seller_sig: Signature,
        /// Optional Layer B content payload. When present, the kernel
        /// runs the schema-validation gate before emitting the event.
        /// Note: no `skip_serializing_if` — bincode is non-self-
        /// describing, so skipping a field desyncs the deserializer.
        /// `None` always emits one byte (the Option discriminant).
        content_proof: Option<AttestationContentProof>,
    },

    /// Buyer attestation. Batched equivalent of attestAsBuyer()
    /// where msg.sender check is replaced by an EIP-712 signature.
    AttestAsBuyer {
        process_id: B256,
        order_hash: B256,
        schema_id: B256,
        stage: u8,
        content_ref: B256,
        /// Proves the caller is the root buyer of the process.
        buyer_sig: Signature,
        /// Optional Layer B content payload. When present, the kernel
        /// runs the schema-validation gate before emitting the event.
        /// Note: no `skip_serializing_if` — bincode is non-self-
        /// describing, so skipping a field desyncs the deserializer.
        /// `None` always emits one byte (the Option discriminant).
        content_proof: Option<AttestationContentProof>,
    },

    // ── SchemaRegistry ────────────────────────────────────────────

    /// Register a new schema. Batched equivalent of registerSchema().
    RegisterSchema {
        schema_id: B256,
        version: u64,
        uri_hash: B256,
        /// keccak256 of the family slug (e.g. keccak256("geo")). Permanently
        /// bound to the schema; consumed by RPGF Tier-1 weighting.
        family: B256,
        /// EIP-712 authorization from the registrar.
        registrar_sig: Signature,
    },

    /// Declare mechanism→schema binding. Batched equivalent of
    /// setMechanismSchema().
    SetMechanismSchema {
        schema_id: B256,
        /// EIP-712 authorization from the mechanism contract.
        mechanism_sig: Signature,
    },

    // ── OperatorRegistry ──────────────────────────────────────────

    /// Register a new operator. Batched equivalent of register().
    /// Role is not an on-chain field — a seller's role is whatever their
    /// catalogue (referenced by `metadata_uri`) declares through its archetype.
    RegisterOperator {
        metadata_uri: String,
        /// EIP-712 authorization from the operator.
        operator_sig: Signature,
    },

    /// Update an operator's metadata URI. Batched equivalent of updateProfile().
    /// Caller-only: only the registered operator may update its own profile.
    /// The deposit and lock period are spam-protection knobs and are not
    /// disturbed; discovery indexers compute "current metadata URI" as the
    /// most-recent OperatorRegistered or OperatorProfileUpdated event for
    /// an address.
    UpdateProfile {
        metadata_uri: String,
        /// EIP-712 authorization from the operator.
        operator_sig: Signature,
    },
}

// ── State snapshot (deterministic, sorted) ────────────────────────

/// Serializable state snapshot. Entries must be sorted by key
/// for deterministic root computation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KernelStateSnapshot {
    pub processes: Vec<(B256, ProcessState)>,
    pub order_status: Vec<(B256, u8)>,
    pub order_process_id: Vec<(B256, B256)>,
    /// SchemaRegistry: registered schemas (dedup guard).
    pub schemas_registered: Vec<(B256, bool)>,
    /// OperatorRegistry: dedup guard per operator address. Lifecycle flags
    /// removed (web2-strip 2026-04-26) — operator availability is
    /// signal-by-availability, not registry state. Role + metadata travel
    /// in the OperatorRegistered event only.
    pub operators_registered: Vec<(Address, bool)>,
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
    /// Hash of schema events emitted in this batch.
    pub schema_events_hash: B256,
    /// Hash of operator events emitted in this batch.
    pub operator_events_hash: B256,
}

/// An attestation event proven by the batch. The on-chain verifier
/// re-emits these as Attestation events on AttestationCoordinator.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AttestationEventData {
    pub order_hash: B256,
    pub process_id: B256,
    pub attester: Address,
    pub schema_id: B256,
    pub stage: u8,
    pub content_ref: B256,
}

/// A schema registration event proven by the batch.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SchemaEventData {
    pub schema_id: B256,
    pub version: u64,
    pub uri_hash: B256,
    pub family: B256,
    pub registrar: Address,
}

/// A mechanism schema declaration event proven by the batch.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MechanismSchemaEventData {
    pub mechanism: Address,
    pub schema_id: B256,
}

/// An operator registry event proven by the batch.
///
/// Two variants:
///   - `Registered`     — first registration of an address (mirrors `OperatorRegistry.OperatorRegistered`).
///   - `ProfileUpdated` — metadata URI replacement by a registered operator
///     (mirrors `OperatorRegistry.OperatorProfileUpdated`).
///
/// Lifecycle flags (deactivate / reactivate) are signal-by-availability,
/// not registry state.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum OperatorEventData {
    Registered {
        operator: Address,
        metadata_uri: String,
    },
    ProfileUpdated {
        operator: Address,
        metadata_uri: String,
    },
}

/// Collected side-effect events from batch execution.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchEvents {
    pub attestations: Vec<AttestationEventData>,
    pub schemas: Vec<SchemaEventData>,
    pub mechanism_schemas: Vec<MechanismSchemaEventData>,
    pub operators: Vec<OperatorEventData>,
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

// ── Errors (match FigaroCore.sol error types) ─────────────────────

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
    // AttestationCoordinator errors
    NotAuthorized,
    ProcessMismatch,
    UnknownOrder,
    // SchemaRegistry errors
    SchemaAlreadyRegistered(B256),
    SchemaNotRegistered(B256),
    // OperatorRegistry errors
    OperatorAlreadyRegistered,
    OperatorNotRegistered,
    // Layer B (figaro-schema) gates on AttestationContentProof
    /// An attestation under a content-bearing protocol schema (one with an
    /// embedded spec) carried a non-zero `content_ref` but no
    /// `content_proof`. The batched path will not record content it cannot
    /// validate, so the proof is mandatory for these schemas.
    ContentProofRequired,
    ContentHashMismatch,
    SchemaSpecParseFailed(String),
    SchemaContentInvalid(String),
    /// The schemaId has no Rust ABI encoder registered, so the kernel
    /// cannot derive content_bytes from content_json. Either the schema
    /// is too new or the caller is attempting to attest under a
    /// non-runtime schemaId (e.g. `figaro-topology-v1`).
    SchemaEncoderMissing(String),
    /// `encode_content_for_schema` failed for a reason other than
    /// missing schema (bad field type, unknown enum value, etc.).
    ContentEncodingFailed(String),
    /// Gate 5: the content proof's sorted-pair Merkle `inclusion_proof`
    /// does not verify the schema's section leaf against the order's
    /// signed `agreement_hash` — the attested clause was not part of the
    /// agreement both parties signed.
    InvalidInclusionProof,
    /// Gate 5: a non-cross-checking (Category-1) schema's content proof
    /// omitted `section_data`, so the agreement Merkle leaf cannot be
    /// derived (its `sectionData` is not the ABI content form).
    MissingSectionData,
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
            Self::SchemaAlreadyRegistered(h) => write!(f, "SchemaAlreadyRegistered({h})"),
            Self::SchemaNotRegistered(h) => write!(f, "SchemaNotRegistered({h})"),
            other => write!(f, "{other:?}"),
        }
    }
}

impl std::error::Error for KernelError {}
