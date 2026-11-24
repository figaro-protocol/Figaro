use alloy_primitives::{Address, Bytes, B256, U256};
use serde::{Deserialize, Serialize};

// ── Commitment (matches CommitmentTypes.sol) ──────────────────────

/// Fixed-size struct with 9 fields. No dynamic arrays.
/// Identical to the Solidity `CommitmentTypes.Commitment`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Commitment {
    pub process_id: B256,
    pub buyer: Address,
    pub seller: Address,
    pub token: Address,
    pub payment: U256,
    pub running_total: U256,
    pub checkout_hash: B256,
    pub salt: U256,
    pub commit_deadline: U256,
}

// ── Process state (matches FigaroCore.ProcessState) ───────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProcessState {
    pub root_buyer: Address,
    pub token: Address,
    pub running_total: U256,
    pub active_order_count: u64,
}

// ── ECDSA signature ───────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Signature {
    pub v: u8,
    pub r: B256,
    pub s: B256,
}

// ── Attestation witness ───────────────────────────────────────────

/// What a batched attestation carries to prove its clause: exactly what
/// `AttestationCoordinator.attestAsSeller` / `attestAsBuyer` take, the
/// `clauseDataHash` and the inclusion proof (the op carries `contentRef`).
/// The guest runs one gate, the coordinator's: the leaf
/// `keccak256(keccak256(clause_id ++ clause_data_hash))` opens against the
/// TARGET order's signed `checkout_hash`, as `_verifyInclusion` does, and
/// `content_ref` is re-emitted as signed. The relay, and the proving network
/// under `SP1_PROVER=network`, see the fingerprints the chain sees on the
/// direct path, never the parties' data. The guest reads no clause, no spec
/// and no content: whether content is well formed is a reader's check
/// against the spec the clause key names, on this path as on the direct one.
///
/// The reserved provenance leaf (`kernel::PROVENANCE_LEAF_KEY`) is attested
/// like any leaf, on inclusion alone, as the coordinator accepts it; the
/// check that its bytes name the registered agreement and process design is
/// made at the usage claim (`UsageCounter`, and the guest's usage-claim path).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AttestationWitness {
    /// `keccak256(clauseData)`, the committed clause's fingerprint, as the
    /// coordinator's `clauseDataHash`.
    pub clause_data_hash: B256,
    /// Sorted-pair Merkle proof binding the clause leaf to the target
    /// order's signed `checkout_hash`. Empty for a single-clause
    /// agreement, where the leaf is the root itself.
    pub inclusion_proof: Vec<B256>,
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
        running_total: U256,
        commitments: Vec<Commitment>,
        buyer_sig: Signature,
    },
    /// Resolution authorized by the buyer's wallet code: `authorization`
    /// is bytes the buyer's own account code validates for the
    /// `ResolveProcess(processId, runningTotal)` digest (ERC-1271
    /// `isValidSignature`), the batched equivalent of a `resolveProcess`
    /// call that code installed on the buyer's wallet makes as
    /// `msg.sender == rootBuyer` — an EIP-7702 delegation carrying the
    /// wallet's own guardian authorization, which can resolve after the
    /// key is lost. The guest cannot run the wallet's code: it checks the
    /// process, the value and the order list exactly as for `Resolve` and
    /// nothing about the bytes, and publishes them in the operation stream
    /// (public value 8). `FigaroBatchVerifier.settleBatch` derives the
    /// digest under its own domain, requires the buyer's account to have
    /// code, calls its `isValidSignature`, and refuses the whole batch on any
    /// other answer: the proven root holds the resolve, so it never drops alone.
    ResolveByWalletCode {
        process_id: B256,
        running_total: U256,
        commitments: Vec<Commitment>,
        authorization: Bytes,
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

    /// An attestation authorized by the attesting party's wallet code: the
    /// batched equivalent of an `attestAsSeller` or `attestAsBuyer` call
    /// that code installed on the party's wallet makes from the party's
    /// address, which can attest after the key is lost. `role` names the
    /// party (`target.seller` or `target.buyer`); `authorization` is bytes
    /// that party's own account code validates (ERC-1271
    /// `isValidSignature`) for the same `AttestSeller` / `AttestBuyer`
    /// digest the signed form signs. The guest cannot run the code: it runs
    /// every check of the signed form but the signer's recovery, leaves the
    /// attestation OUT of the attestation events (public value 5 carries the
    /// signed attestations only), and publishes the entry in the operation
    /// stream (`0x05`, public value 8). `FigaroBatchVerifier.settleBatch` asks the
    /// party's code and emits the coordinator's `Attestation` event only on
    /// the magic value; on any other answer, or when the party's account
    /// has no code, the whole batch reverts by name, so a batch that lands
    /// carries the attestation of every `0x05` entry.
    AttestByWalletCode {
        role: AttesterRole,
        target: Commitment,
        clause_id: B256,
        stage: u8,
        content_ref: B256,
        authorization: Bytes,
        proof: AttestationWitness,
    },
    // These are the coordinator's two attestation modes, as on the direct
    // path: a party attests for itself. The signed forms carry the party's
    // ECDSA signature in place of the `msg.sender` the direct path reads;
    // the wallet-code form carries bytes the party's own code validates, in
    // place of a call that code makes from the party's address. No other
    // party files an attestation on an order.
}

/// The party a wallet-code attestation speaks for, the role byte of the
/// stream's `0x05` entry: the target order's seller (`0x00`) or its buyer
/// (`0x01`). A wallet that is both on one order attests once per role, each
/// under its own digest type.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AttesterRole {
    Seller,
    Buyer,
}

impl AttesterRole {
    /// The role byte the stream carries.
    pub fn code(self) -> u8 {
        match self {
            AttesterRole::Seller => 0x00,
            AttesterRole::Buyer => 0x01,
        }
    }

    /// The role a stream byte names; `None` for any other byte.
    pub fn from_code(b: u8) -> Option<Self> {
        match b {
            0x00 => Some(AttesterRole::Seller),
            0x01 => Some(AttesterRole::Buyer),
            _ => None,
        }
    }

    /// The party of `target` this role names.
    pub fn party(self, target: &Commitment) -> Address {
        match self {
            AttesterRole::Seller => target.seller,
            AttesterRole::Buyer => target.buyer,
        }
    }
}

// ── Usage accrual (the RPGF bridge) ───────────────────────────────

/// Which family — clause, agreement or assembly — a usage claim credits,
/// and the witness each needs. Mirrors `UsageCounter.recordClauseUsage`,
/// `recordAgreementUsage` and `recordProcessDesignUsage` — the same leaf
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
    /// than supplied: `{"agreementHash":"0x…","processDesignHash":"0x…"}`, the
    /// processDesignHash of the assembly whose agreement the order instantiates. A
    /// wrong key on either side derives a leaf that is simply not in the
    /// tree.
    Agreement { process_design_hash: B256 },
    /// Assembly usage; the claim's key is the processDesignHash. The
    /// provenance leaf is proved exactly as for an agreement claim, from
    /// `agreement_hash` and the processDesignHash; then the agreement's leaf
    /// `keccak256(keccak256(PROCESS_LEAF_DOMAIN ‖ agreement_hash ‖ agreement_content_hash))` is proved
    /// under the processDesignHash by `membership_proof`, with the same
    /// sorted-pair verifier — the assembly's root is a merkle tree over its
    /// order slots.
    Process {
        agreement_hash: B256,
        agreement_content_hash: B256,
        membership_proof: Vec<B256>,
    },
}

/// The reward family of a clause key, as the accrual carries it.
pub const USAGE_KIND_CLAUSE: u8 = 0;
/// The reward family of an assembly key, as the accrual carries it.
pub const USAGE_KIND_PROCESS: u8 = 1;
/// The reward family of an agreement hash, as the accrual carries it.
pub const USAGE_KIND_AGREEMENT: u8 = 2;

impl UsageClaimKind {
    /// The family this claim credits: `USAGE_KIND_CLAUSE`,
    /// `USAGE_KIND_PROCESS` or `USAGE_KIND_AGREEMENT`. A registry accepts
    /// any bytes32, so keys of two families can be the same word; every
    /// count and accrual is keyed by (kind, key) and the families never
    /// merge.
    pub fn code(&self) -> u8 {
        match self {
            Self::Clause { .. } => USAGE_KIND_CLAUSE,
            Self::Agreement { .. } => USAGE_KIND_AGREEMENT,
            Self::Process { .. } => USAGE_KIND_PROCESS,
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
    /// clause key (keccak256 of the spec without `block`), the agreementHash,
    /// or the processDesignHash — never a new identifier.
    pub clause_or_process: B256,
    pub kind: UsageClaimKind,
    /// Sorted-pair Merkle proof of the clause leaf against the order's
    /// signed `checkout_hash`.
    pub inclusion_proof: Vec<B256>,
}

/// One use a batch carries to `UsageCounter`: a RESOLVED batch-path process
/// that used a clause, agreement or assembly under its (kind, key), and the
/// seller of the order the claim proved it through. The counter counts it
/// exactly as a direct call counts a use — the same tally, the same
/// counted-seller set, the same per-period seller set — so a use is a use
/// whichever way its process reached the chain. The guest gives each
/// (kind, key, process, seller) once per batch.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct BatchUse {
    pub clause_or_process: B256,
    /// `USAGE_KIND_CLAUSE`, `USAGE_KIND_PROCESS` or
    /// `USAGE_KIND_AGREEMENT`, from the claim's own `UsageClaimKind`.
    pub kind: u8,
    /// The process, its id derived under the verifier's EIP-712 domain.
    pub process_id: B256,
    /// The seller of the order the claim was proved through.
    pub seller: Address,
}

// ── State snapshot ────────────────────────────────────────────────

/// Serializable state snapshot — the FigaroCore mappings, the relay's whole
/// state. Its root is the state tree's over every entry
/// (`KernelState::compute_root`), whatever the entries' order; the guest
/// never receives it, only a `StateWitness` of the entries a batch touches.
///
/// No usage state lives here: `UsageCounter` holds the one counted-seller
/// set and the one period-seller set for both routes, and skips a use whose
/// seller of the process it has already counted under the key, so the guest
/// proves each claim against the orders' state and leaves the counting to
/// the chain.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KernelStateSnapshot {
    pub processes: Vec<(B256, ProcessState)>,
    pub order_status: Vec<(B256, u8)>,
}

// ── Batch inputs ──────────────────────────────────────────────────

/// The relay's native batch input, with the whole previous state; the guest
/// reads `GuestInput`, the same batch with a witness in its place.
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
    /// takes it on trust and COMMITS it; `UsageCounter.applyBatchAccrual`
    /// requires it to equal `currentPeriod()` at resolution, so the
    /// chain — never the sequencer's clock — decides which period a
    /// batch pays into. A batch proven just before a boundary and
    /// resolved just after still lands: `FigaroBatchVerifier.settleBatch`
    /// calls the counter inside a try, emits `BatchAccrualSkipped`, and
    /// its uses are not counted, never paid into the wrong period.
    pub usage_period: u8,
}

/// The entries a batch reads or writes, with their values before the batch,
/// and the previous tree's proof for them (`crate::state_tree`). The guest
/// computes each entry's path from its key itself.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StateWitness {
    /// Process id → its state, `None` when absent.
    pub processes: Vec<(B256, Option<ProcessState>)>,
    /// Order hash → its status, `None` when absent.
    pub orders: Vec<(B256, Option<u8>)>,
    /// The previous tree's items for these entries, in descent order.
    pub proof: Vec<crate::state_tree::ProofItem>,
}

/// What the guest program reads: a batch with the witness of the entries it
/// touches in place of the whole previous state (`BatchInput`, the relay's
/// native input, carries the whole state).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GuestInput {
    pub chain_id: u64,
    pub verifying_contract: Address,
    pub block_timestamp: u64,
    pub operations: Vec<KernelOp>,
    pub prev_witness: StateWitness,
    pub usage_claims: Vec<UsageClaim>,
    pub usage_period: u8,
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
    /// Hash of the batch's designer-reward uses — the period, the
    /// provenance leaf's key and every (kind, key, process, seller) use.
    /// The on-chain verifier re-derives it from calldata and hands the uses
    /// to `UsageCounter`, which counts each one that passes the gates a
    /// direct call meets: a live `MembersRegistry` stake for its seller, a
    /// live registration for its key in `ClauseRegistry`,
    /// `AgreementRegistry` or `ProcessRegistry`, and a process not yet
    /// counted under that key.
    pub usage_accrual_hash: B256,
    /// The clock the guest checked every commitment deadline against
    /// (`input.block_timestamp`). It is COMMITTED here so the on-chain verifier
    /// can hold it to the chain: `settleBatch` refuses a clock later than its
    /// block and bounds no age of it, and it logs the clock so a rebuild
    /// replays each commit at the time its proof used. A prover-chosen clock
    /// bonds no expired commitment: the verifier reads each commit's deadline
    /// in the stream and refuses one before its block with `DeadlineExpired`,
    /// as the direct path does.
    pub block_timestamp: u64,
    /// `keccak256` of the batch's operation stream (`operation_stream`): every
    /// commit and resolve the batch applied, whole, every wallet-code
    /// attestation, and every usage claim. The on-chain verifier takes the
    /// stream as calldata and refuses a batch whose bytes do not hash to this
    /// word, so a batch cannot land without publishing what rebuilds its root.
    pub operations_hash: B256,
}

impl PublicValues {
    /// The ONE byte layout of the public values: 9 × 32-byte ABI words,
    /// exactly what `FigaroBatchVerifier._decodePV` abi.decodes. The guest
    /// commits these bytes, the host submits them, and the on-chain SP1
    /// verifier hashes the submission against the proof's committed digest —
    /// so a second encoding anywhere is a `ProofInvalid` by construction.
    pub fn abi_encode(&self) -> Vec<u8> {
        let mut data = Vec::with_capacity(288);
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
        if data.len() != 288 {
            return Err(format!(
                "public values must be 288 bytes, got {}",
                data.len()
            ));
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
        let ts_word = word(7);
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
            usage_accrual_hash: B256::from(word(6)),
            block_timestamp: u64::from_be_bytes(ts_word[24..].try_into().unwrap()),
            operations_hash: B256::from(word(8)),
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

/// Collected side-effect data from batch execution.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchEvents {
    pub attestations: Vec<AttestationEventData>,
    /// The batch's uses, one per (kind, key, process, seller), in the order of the
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
    RunningTotalMismatch {
        expected: U256,
        actual: U256,
    },
    NotProcessBuyer,
    TokenMismatch,
    OrderNotCommitted(B256),
    NoActiveOrders,
    IncompleteOrderList {
        required: u64,
        provided: u64,
    },
    /// The resolve authorization signs a cumulative value the process does
    /// not hold at application: an order committed after the buyer signed
    /// (or the buyer signed over a value the process has not reached).
    StaleResolveAuthorization {
        signed: U256,
        current: U256,
    },
    DuplicateCommitment,
    InvalidRootRunningTotal,
    ProcessAlreadyResolved,
    Overflow,
    InvalidSignature,
    // AttestationCoordinator gates
    NotAuthorized,
    UnknownOrder,
    /// Attestation against a resolved order — the evidence window closes
    /// at resolution (coordinator's `OrderAlreadyResolved` gate).
    OrderAlreadyResolved,
    /// The sorted-pair Merkle `inclusion_proof` does not verify
    /// the clause leaf against the target order's signed
    /// `checkout_hash` — the attested clause was not part of the
    /// agreement both parties signed.
    InvalidInclusionProof,
    // Usage accrual (the RPGF bridge)
    /// Usage was claimed for an order the batch path has not resolved.
    /// Usage is what a FINISHED process leaves behind — the inverse of
    /// the attestation gate, exactly as on the direct path.
    UsageOrderNotResolved(B256),
    /// The claimed clause is not a leaf of the order's signed
    /// agreement — for an agreement or assembly claim, the usual cause is
    /// an agreementHash or processDesignHash that does not match the committed
    /// provenance leaf — or, for an assembly claim, the agreement's leaf is not
    /// a leaf of the processDesignHash.
    UsageInvalidInclusionProof,
    /// A usage claim keyed on a reserved key of the format (the
    /// provenance leaf's or the assembly terms leaf's), or an assembly
    /// claim whose agreement position names one as its agreementHash. Neither key is
    /// ever a clause, an agreement or an assembly, so no claim is credited
    /// under it — the guest's mirror of the counter's refusal of both.
    ReservedKeyIsNotARegistration(B256),
    /// The guest's batch read or wrote an entry its witness does not carry:
    /// an entry left out is refused, never taken as absent.
    UnwitnessedKey,
    /// The witness carries one entry twice.
    DuplicateWitnessEntry,
    /// The witness does not prove its entries against the previous root.
    Witness(crate::state_tree::TreeError),
}

impl core::fmt::Display for KernelError {
    fn fmt(&self, f: &mut core::fmt::Formatter) -> core::fmt::Result {
        match self {
            Self::RunningTotalMismatch { expected, actual } => {
                write!(
                    f,
                    "RunningTotalMismatch(expected={expected}, actual={actual})"
                )
            }
            Self::IncompleteOrderList { required, provided } => {
                write!(
                    f,
                    "IncompleteOrderList(required={required}, provided={provided})"
                )
            }
            Self::StaleResolveAuthorization { signed, current } => {
                write!(
                    f,
                    "StaleResolveAuthorization(signed={signed}, current={current})"
                )
            }
            Self::OrderNotCommitted(h) => write!(f, "OrderNotCommitted({h})"),
            Self::UsageOrderNotResolved(h) => write!(f, "UsageOrderNotResolved({h})"),
            other => write!(f, "{other:?}"),
        }
    }
}

impl std::error::Error for KernelError {}
