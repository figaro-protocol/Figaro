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
    },

    // ── SchemaRegistry ────────────────────────────────────────────

    /// Register a new schema. Batched equivalent of registerSchema().
    RegisterSchema {
        schema_id: B256,
        version: u64,
        uri_hash: B256,
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
    /// FIG emission: global settlement counter.
    pub emission_settlement_count: u64,
    /// FIG emission: total FIG emitted (wei).
    pub emission_total_emitted: U256,
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
    /// FIG token address. If Address::ZERO, emission is disabled.
    pub fig_token: Address,
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
