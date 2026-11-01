use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use alloy::network::EthereumWallet;
/// On-chain submitter — sends `settleBatch` transactions to the
/// FigaroBatchVerifier contract via alloy.
use alloy::primitives::{Address, Bytes, B256};
use alloy::providers::{Provider, ProviderBuilder};
use alloy::signers::local::PrivateKeySigner;
use alloy::sol;
use tracing::info;

use alloy::primitives::U256;
use figaro_kernel::types::{AttestationWitness, BatchEvents, Commitment, KernelOp, NetPosition, UsageClaim, UsageClaimKind};

use crate::mempool::PendingOp;
use crate::prover::ProveResult;

/// A resolve failure, classified. DETERMINISTIC means the chain evaluated the
/// transaction and rejected it — a revert reproduces on every retry, so
/// re-proving the identical batch burns minutes per attempt for the same
/// refusal (the ProofInvalid loop: three ~7-minute proofs before
/// DeadlineExpired poison-dropped the ops). Deterministic failures are
/// dead-lettered by the caller; transient transport trouble is re-queued.
#[derive(Debug)]
pub struct SettleError {
    pub message: String,
    pub deterministic: bool,
}

impl std::fmt::Display for SettleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

/// Whether a send-path error message is the chain speaking (a revert from
/// eth_estimateGas / eth_call) rather than transport trouble. String-keyed by
/// necessity — the JSON-RPC error arrives flattened through alloy's error
/// chain — on the one phrase every major client emits for an evaluated
/// rejection.
pub fn is_deterministic_send_error(message: &str) -> bool {
    message.contains("execution reverted")
}

/// How long one address's revocation refusals are counted together. One
/// revocation is indistinguishable from a wallet managing its approvals;
/// repetition within the window is the adversarial signal.
pub const REVOCATION_SIGNAL_WINDOW: Duration = Duration::from_secs(3600);

/// Counts, per address, the batch refusals its revoked approval caused.
/// Operational memory for the log signal only — exclusion itself needs no
/// state, because funding is re-read from the chain at every batch
/// formation, so a revoker is out of the next batch whether or not this
/// log survives a restart.
pub struct RevocationLog {
    window: Duration,
    hits: Mutex<HashMap<Address, Vec<Instant>>>,
}

impl RevocationLog {
    pub fn new(window: Duration) -> Self {
        Self { window, hits: Mutex::new(HashMap::new()) }
    }

    /// Record one refusal caused by `who`; returns how many refusals its
    /// address has caused within the window, this one included.
    pub fn record(&self, who: Address) -> usize {
        self.record_at(who, Instant::now())
    }

    pub fn record_at(&self, who: Address, at: Instant) -> usize {
        let mut hits = self.hits.lock().expect("revocation log poisoned");
        let v = hits.entry(who).or_default();
        v.retain(|t| at.saturating_duration_since(*t) < self.window);
        v.push(at);
        v.len()
    }
}

/// The EIP-712 verifying contract this relay admits and proves under. The
/// batch path's domain is the batch verifier's: the verifier recovers every
/// signature against its own address, so a relay that admitted under another
/// contract (`FigaroCore`, say) would admit signatures the verifier refuses
/// and refuse the ones it accepts. With a verifier configured,
/// `FIGARO_CORE_ADDRESS` must name it; the prove-only dry run (no verifier)
/// proves under whatever is set.
pub fn verifying_contract_for(verifier: Address, verifying_contract: Address) -> Result<Address, String> {
    if verifier == Address::ZERO || verifying_contract == verifier {
        return Ok(verifying_contract);
    }
    Err(format!(
        "FIGARO_CORE_ADDRESS ({verifying_contract:#x}) is not BATCH_VERIFIER_ADDRESS ({verifier:#x}): the batch path's EIP-712 verifying contract is the batch verifier"
    ))
}

/// The resolution transaction signer's key, from the environment and never
/// defaulted: a relay that fell back to a well-known devnet key would sign
/// `settleBatch` from an account anyone can drain, on any chain it was
/// pointed at. Unset and blank are the same refusal, so the process exits
/// at startup with the variable's name instead of running on a key it did
/// not choose.
pub fn signing_key_from_env(value: Option<String>) -> Result<String, String> {
    match value {
        Some(key) if !key.trim().is_empty() => Ok(key.trim().to_string()),
        _ => Err(
            "SEQUENCER_PRIVATE_KEY is unset: the relay signs settleBatch \
             transactions with it and has no default key"
                .to_string(),
        ),
    }
}

// ── Funding: a commit's bonds must pull, or the batch reverts ─────
//
// `settleBatch` pulls every position's deposit in one transaction; one
// buyer or seller whose balance or allowance no longer covers its bond
// reverts the whole batch — at a cost to them of nothing, repeatable. The
// relay therefore reads the two bonds' funding (balance and allowance to
// the verifier) when a commit arrives and again at batch formation, right
// before proving, against the latest block. The residual window is the
// proving time itself; a revert inside it is deterministic and dead-letters
// the batch once (see `is_deterministic_send_error`).

sol! {
    #[sol(rpc)]
    interface IERC20Funding {
        function balanceOf(address who) external view returns (uint256);
        function allowance(address owner, address spender) external view returns (uint256);
    }
}

/// Where the funding reads go: the chain, and the spender the bonds are
/// approved to (the batch verifier).
#[derive(Clone, Debug)]
pub struct FundingGate {
    pub rpc_url: String,
    pub verifier: Address,
}

/// A bond is funded when the wallet holds it AND has approved it to the
/// verifier — both, or the pull reverts.
pub fn commit_funded(balance: U256, allowance: U256, need: U256) -> bool {
    balance >= need && allowance >= need
}

/// Whether a funding drop is the conservative no-read kind rather than a
/// verified shortfall. Bound to the "funding unverifiable" reason
/// [`allocate_funding`] writes — the revert arm must not log a wallet whose
/// balance merely could not be read as a revoker.
pub fn is_unverifiable_drop(reason: &str) -> bool {
    reason.starts_with("funding unverifiable")
}

/// The two bonds a commit pulls: the buyer's 2 × payment, the seller's
/// 2 × cumulative value at its link — FigaroCore's arithmetic, saturating
/// only where FigaroCore would overflow (and refuse) anyway.
pub fn bonds_of(c: &Commitment) -> (U256, U256) {
    let two = U256::from(2u64);
    (
        c.payment.saturating_mul(two),
        c.expected_cumulative_value.saturating_mul(two),
    )
}

/// Read both parties' funding for one commit. The outer `Err` is a read
/// failure (the chain could not be asked); the inner `Err` is a verdict:
/// the named party does not fund its bond.
pub async fn check_commit_funding(
    gate: &FundingGate,
    c: &Commitment,
) -> Result<Result<(), String>, String> {
    let url = gate
        .rpc_url
        .parse()
        .map_err(|e| format!("invalid RPC_URL: {e}"))?;
    let provider = ProviderBuilder::new().connect_http(url);
    let token = IERC20Funding::new(c.currency, &provider);
    let (buyer_need, seller_need) = bonds_of(c);
    for (label, who, need) in [("buyer", c.buyer, buyer_need), ("seller", c.seller, seller_need)] {
        let balance = token
            .balanceOf(who)
            .call()
            .await
            .map_err(|e| format!("balanceOf({who}) read failed: {e}"))?;
        let allowance = token
            .allowance(who, gate.verifier)
            .call()
            .await
            .map_err(|e| format!("allowance({who}) read failed: {e}"))?;
        if !commit_funded(balance, allowance, need) {
            return Ok(Err(format!(
                "{label} {who} holds {balance} and allows {allowance} to the verifier; the bond needs {need}"
            )));
        }
    }
    Ok(Ok(()))
}

/// What one wallet holds and allows the verifier, in one token.
pub type Funds = (U256, U256);

/// Allocate each wallet's funds across the batch's commits, in order. A
/// batch pulls each party's bonds from ONE balance and ONE allowance, so a
/// commit funds only if the wallet still covers it after every commit kept
/// before it; one that does not is dropped with the reason and the party
/// that fails it, and the commits after it are judged on what is left. A
/// wallet missing from `funds` (its read failed) drops its commits
/// conservatively. Every other op passes.
pub fn allocate_funding(
    pending: Vec<PendingOp>,
    funds: &HashMap<(Address, Address), Funds>,
) -> (Vec<PendingOp>, Vec<(PendingOp, String, Address)>) {
    let mut committed: HashMap<(Address, Address), U256> = HashMap::new();
    let mut valid = Vec::with_capacity(pending.len());
    let mut dropped = Vec::new();
    for op in pending {
        let KernelOp::Commit { commitment: c, .. } = &op.op else {
            valid.push(op);
            continue;
        };
        let (buyer_need, seller_need) = bonds_of(c);
        // The two bonds of one commit draw on the same wallet when the buyer
        // is the seller.
        let mut need: Vec<(&'static str, Address, U256)> = vec![("buyer", c.buyer, buyer_need)];
        if c.seller == c.buyer {
            need[0].2 += seller_need;
        } else {
            need.push(("seller", c.seller, seller_need));
        }
        let mut verdict = Ok(());
        for (label, who, bond) in &need {
            let Some(&(balance, allowance)) = funds.get(&(c.currency, *who)) else {
                verdict = Err((format!("funding unverifiable, dropped conservatively: {label} {who}'s balance and allowance could not be read"), *who));
                break;
            };
            let before = committed.get(&(c.currency, *who)).copied().unwrap_or_default();
            if !commit_funded(balance, allowance, before + bond) {
                verdict = Err((format!(
                    "unfunded commitment: {label} {who} holds {balance} and allows {allowance} to the verifier; this batch already draws {before} and the bond needs {bond}"
                ), *who));
                break;
            }
        }
        match verdict {
            Ok(()) => {
                for (_, who, bond) in need {
                    *committed.entry((c.currency, who)).or_default() += bond;
                }
                valid.push(op);
            }
            Err((reason, who)) => dropped.push((op, reason, who)),
        }
    }
    (valid, dropped)
}

/// Batch-formation funding filter over the ops that passed the mirror's
/// trial-apply: each wallet's balance and allowance are read once, at the
/// latest block, and allocated across the batch's commits
/// ([`allocate_funding`]). A dropped commit is re-submittable once funded; a
/// read failure is returned as unverifiable ([`is_unverifiable_drop`]),
/// which formation defers — never proved against unverified funding. `None` (no verifier configured — a prove-only dry run) passes
/// everything through untouched.
pub async fn filter_funded_commits(
    gate: Option<&FundingGate>,
    pending: Vec<PendingOp>,
) -> (Vec<PendingOp>, Vec<(PendingOp, String, Address)>) {
    let Some(gate) = gate else {
        return (pending, Vec::new());
    };
    let mut wallets: Vec<(Address, Address)> = Vec::new();
    for op in &pending {
        if let KernelOp::Commit { commitment: c, .. } = &op.op {
            for who in [c.buyer, c.seller] {
                if !wallets.contains(&(c.currency, who)) {
                    wallets.push((c.currency, who));
                }
            }
        }
    }
    let mut funds = HashMap::new();
    if let Ok(url) = gate.rpc_url.parse() {
        let provider = ProviderBuilder::new().connect_http(url);
        for (currency, who) in wallets {
            let token = IERC20Funding::new(currency, &provider);
            let read = async {
                let balance = token.balanceOf(who).call().await.ok()?;
                let allowance = token.allowance(who, gate.verifier).call().await.ok()?;
                Some((balance, allowance))
            };
            if let Some(f) = read.await {
                funds.insert((currency, who), f);
            }
        }
    }
    allocate_funding(pending, &funds)
}

/// A plaintext attestation's clause key and the hash of the witness spec
/// bytes it carries — the guest requires them equal (Gate S) and the
/// verifier requires the key `registered(clauseKey)`; either failing
/// reverts the WHOLE batch. `None` for a hash-only attestation, which
/// commits no spec binding (the verifier checks no registry for it, as the
/// coordinator checks none), and for every other op.
pub fn attestation_spec(op: &KernelOp) -> Option<(alloy::primitives::B256, alloy::primitives::B256)> {
    match op {
        KernelOp::AttestAsSeller { clause_id, proof: AttestationWitness::Plaintext(proof), .. }
        | KernelOp::AttestAsBuyer { clause_id, proof: AttestationWitness::Plaintext(proof), .. } => {
            Some((*clause_id, alloy::primitives::keccak256(proof.spec_json.as_bytes())))
        }
        _ => None,
    }
}

/// Drop every attestation whose witness spec does not hash to its clause
/// key, or whose key the registry has not registered, before proving: one
/// such op reverts the whole batch on chain, and anyone can copy a landed
/// attestation with one byte of the spec changed. The registry is the
/// verifier's own (`clauseRegistry()`), read once per batch per clause; a
/// read failure drops conservatively. `None` (no verifier configured — a
/// prove-only dry run) passes everything through.
pub async fn filter_anchored_attestations(
    gate: Option<&FundingGate>,
    pending: Vec<PendingOp>,
) -> (Vec<PendingOp>, Vec<(PendingOp, String)>) {
    let Some(gate) = gate else {
        return (pending, Vec::new());
    };
    if !pending.iter().any(|p| attestation_spec(&p.op).is_some()) {
        return (pending, Vec::new());
    }
    let mut anchors: HashMap<alloy::primitives::B256, Option<bool>> = HashMap::new();
    let registry = match gate.rpc_url.parse() {
        Ok(url) => {
            let provider = ProviderBuilder::new().connect_http(url);
            IFigaroBatchVerifier::new(gate.verifier, &provider)
                .clauseRegistry()
                .call()
                .await
                .ok()
                .map(|r| (r, provider))
        }
        Err(_) => None,
    };
    let mut valid = Vec::with_capacity(pending.len());
    let mut dropped = Vec::new();
    for op in pending {
        let Some((clause, spec_hash)) = attestation_spec(&op.op) else {
            valid.push(op);
            continue;
        };
        if spec_hash != clause {
            dropped.push((
                op,
                format!("witness spec {spec_hash} does not hash to clause key {clause} — the guest would refuse the batch"),
            ));
            continue;
        }
        if let std::collections::hash_map::Entry::Vacant(slot) = anchors.entry(clause) {
            let registered = match &registry {
                Some((address, provider)) => IClauseRegistry::new(*address, provider)
                    .registered(clause)
                    .call()
                    .await
                    .ok(),
                None => None,
            };
            slot.insert(registered);
        }
        match anchors[&clause] {
            Some(true) => valid.push(op),
            Some(false) => dropped.push((
                op,
                format!("clause key {clause} is not registered — the verifier would revert the batch"),
            )),
            None => dropped.push((
                op,
                format!("the registry's record of clause {clause} could not be read — dropped conservatively"),
            )),
        }
    }
    (valid, dropped)
}

// ── Wallet-code resolves: the buyer's code must validate, or the batch reverts ──
//
// A resolve in the wallet-code form carries bytes the buyer's own account
// code validates (ERC-1271). The guest cannot run that code; the verifier
// asks it at resolution and reverts the WHOLE batch on any answer but the
// magic value. The relay therefore asks the same code the same question
// against the latest block — at the door and again at batch formation — as
// it reads a commit's funding: a liveness aid, never the gate. The question
// is the verifier's: `isValidSignature(digest, bytes)` from the verifier's
// address, the digest `ResolveProcess` under the verifier's domain over the
// process and the listed payments, the buyer the listed orders'. The call
// runs under `gas::WALLET_CODE_EXECUTION_GAS`, the gas this relay plans for
// the wallet's own code. The residual window is the proving time: code whose
// answer changes inside it reverts the batch, which the deterministic-revert
// arm names and dead-letters alone (`filter_wallet_code_resolves`).

sol! {
    #[sol(rpc)]
    interface IERC1271WalletCode {
        function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4);
    }
}

/// ERC-1271's magic value.
const ERC1271_MAGIC_VALUE: [u8; 4] = [0x16, 0x26, 0xba, 0x7e];

/// What the verifier asks the buyer's code about a wallet-code resolve: the
/// buyer (the listed orders'), the digest under the verifier's domain, and
/// the bytes. `None` for every other op, and for a resolve listing no order
/// (the guest refuses it).
pub fn wallet_code_question(
    chain_id: u64,
    verifier: Address,
    op: &KernelOp,
) -> Option<(Address, B256, Bytes)> {
    let KernelOp::ResolveByWalletCode { process_id, commitments, authorization, .. } = op else {
        return None;
    };
    let buyer = commitments.first()?.buyer;
    // The value the verifier derives: the listed payments' sum.
    let value = figaro_kernel::operation_stream::resolved_cumulative_value(commitments)?;
    let domain = figaro_kernel::eip712::domain_separator(chain_id, verifier);
    let digest = figaro_kernel::eip712::typed_data_hash(
        &domain,
        &figaro_kernel::eip712::resolve_struct_hash(process_id, &value),
    );
    Some((buyer, digest, authorization.clone()))
}

/// Ask a wallet-code resolve's buyer code, as the verifier will. The outer
/// `Err` is a read failure (the chain could not be asked); the inner `Err`
/// is a verdict: the account has no code, or its code does not answer with
/// the magic value under the gas this relay plans. Any other op passes.
pub async fn check_wallet_code_resolve(gate: &FundingGate, op: &KernelOp) -> Result<Result<(), String>, String> {
    if !matches!(op, KernelOp::ResolveByWalletCode { .. }) {
        return Ok(Ok(()));
    }
    let url = gate.rpc_url.parse().map_err(|e| format!("invalid RPC_URL: {e}"))?;
    let provider = ProviderBuilder::new().connect_http(url);
    let chain_id = provider.get_chain_id().await.map_err(|e| format!("chain id read failed: {e}"))?;
    let Some((buyer, digest, authorization)) = wallet_code_question(chain_id, gate.verifier, op) else {
        return Ok(Err("a wallet-code resolve listing no order, or whose payments overflow".to_string()));
    };
    let code = provider
        .get_code_at(buyer)
        .await
        .map_err(|e| format!("code read of {buyer} failed: {e}"))?;
    if code.is_empty() {
        return Ok(Err(format!(
            "buyer {buyer} has no account code to validate a wallet-code resolve — the verifier would revert the batch (BuyerHasNoCode)"
        )));
    }
    let answer = IERC1271WalletCode::new(buyer, &provider)
        .isValidSignature(digest, authorization)
        .from(gate.verifier)
        .gas(crate::gas::WALLET_CODE_EXECUTION_GAS)
        .call()
        .await;
    match answer {
        Ok(magic) if magic.0 == ERC1271_MAGIC_VALUE => Ok(Ok(())),
        Ok(other) => Ok(Err(format!(
            "buyer {buyer}'s code answered {other} for digest {digest}, not the ERC-1271 magic value — the verifier would revert the batch (WalletCodeAuthorizationRefused)"
        ))),
        Err(e) if is_deterministic_send_error(&e.to_string()) => Ok(Err(format!(
            "buyer {buyer}'s code reverted for digest {digest} under {} gas — the verifier would revert the batch (WalletCodeAuthorizationRefused)",
            crate::gas::WALLET_CODE_EXECUTION_GAS
        ))),
        Err(e) => Err(format!("isValidSignature read of {buyer} failed: {e}")),
    }
}

/// Drop every wallet-code resolve whose buyer's code does not validate it,
/// against the latest block, before proving: one such op reverts the whole
/// batch on chain. A read failure drops conservatively; a dropped resolve is
/// re-submittable. `None` (no verifier configured — a prove-only dry run)
/// passes everything through.
pub async fn filter_wallet_code_resolves(
    gate: Option<&FundingGate>,
    pending: Vec<PendingOp>,
) -> (Vec<PendingOp>, Vec<(PendingOp, String)>) {
    let Some(gate) = gate else {
        return (pending, Vec::new());
    };
    let mut valid = Vec::with_capacity(pending.len());
    let mut dropped = Vec::new();
    for op in pending {
        match check_wallet_code_resolve(gate, &op.op).await {
            Ok(Ok(())) => valid.push(op),
            Ok(Err(refused)) => dropped.push((op, refused)),
            Err(read) => dropped.push((op, format!("the buyer's code could not be asked, dropped conservatively: {read}"))),
        }
    }
    (valid, dropped)
}

/// The buyer a wallet-code resolve names: its listed orders' buyer. `None`
/// for every other op.
pub fn wallet_code_buyer(op: &KernelOp) -> Option<Address> {
    match op {
        KernelOp::ResolveByWalletCode { commitments, .. } => commitments.first().map(|c| c.buyer),
        _ => None,
    }
}

/// What the deterministic-revert arm does with a batch the chain refused, from
/// what its re-reads named: the operations it dead-letters, each with its
/// reason and, for an address the adversarial signal counts, that address;
/// the operations it re-queues; and whether no one was named, so the whole
/// batch is dead-lettered.
#[derive(Debug, Default)]
pub struct RevertVerdict {
    pub dead: Vec<(PendingOp, String, Option<Address>)>,
    pub requeue: Vec<PendingOp>,
    pub whole: bool,
}

/// Decide the refused batch's fate. `still` is what the re-reads did not
/// name, `revoked` the operations of a verified revoker, `unverifiable` those
/// whose funding could not be read, `code_refused` the wallet-code resolves
/// whose buyer's code refused at the re-ask.
///
/// A named party's operations are dead-lettered and the rest re-queued. When
/// nobody is named and the batch carries a wallet-code resolve, those resolves
/// are dead-lettered alone: a wallet's code can answer yes to every eth_call
/// and no in the transaction (branching on `tx.origin`, `gasleft()`, a block
/// field or its own balance) at no cost and with no state change, so the
/// re-ask names nobody, and dead-lettering the whole batch would let it sink
/// every co-batched party's operations again with fresh bytes. Its buyer is
/// counted by the adversarial signal. Only a batch with no wallet-code resolve
/// is dead-lettered whole.
pub fn classify_deterministic_revert(
    still: Vec<PendingOp>,
    revoked: Vec<(PendingOp, String, Address)>,
    unverifiable: Vec<PendingOp>,
    code_refused: Vec<(PendingOp, String)>,
) -> RevertVerdict {
    let mut verdict = RevertVerdict::default();
    if revoked.is_empty() && code_refused.is_empty() {
        if still.iter().any(|p| wallet_code_buyer(&p.op).is_some()) {
            let (by_code, rest): (Vec<_>, Vec<_>) =
                still.into_iter().partition(|p| wallet_code_buyer(&p.op).is_some());
            for op in by_code {
                let buyer = wallet_code_buyer(&op.op);
                verdict.dead.push((
                    op,
                    "the batch was refused on chain and nobody was named; a wallet-code resolve's buyer code may answer the relay's check otherwise than the transaction — dead-lettered, re-submittable".to_string(),
                    buyer,
                ));
            }
            verdict.requeue = rest.into_iter().chain(unverifiable).collect();
            return verdict;
        }
        verdict.whole = true;
        verdict.dead = still.into_iter().chain(unverifiable).map(|op| (op, String::new(), None)).collect();
        return verdict;
    }
    for (op, why, who) in revoked {
        verdict.dead.push((op, format!("revoked after the funding check: {why}"), Some(who)));
    }
    for (op, why) in code_refused {
        let buyer = wallet_code_buyer(&op.op);
        verdict.dead.push((op, format!("refused by the buyer's code after the check: {why}"), buyer));
    }
    verdict.requeue = still.into_iter().chain(unverifiable).collect();
    verdict
}

/// The latest block's timestamp — the batch's clock. The guest checks every
/// commitment deadline against it and the verifier refuses a timestamp
/// ahead of its own block, so it is the chain's, never the host's.
pub async fn read_chain_timestamp(rpc_url: &str) -> Result<u64, String> {
    let provider = ProviderBuilder::new().connect_http(
        rpc_url
            .parse()
            .map_err(|e| format!("invalid rpc url: {e}"))?,
    );
    let block = provider
        .get_block_by_number(alloy::eips::BlockNumberOrTag::Latest)
        .await
        .map_err(|e| format!("latest block read failed: {e}"))?
        .ok_or_else(|| "the node returned no latest block".to_string())?;
    Ok(block.header.timestamp)
}

// Generate Rust bindings for the FigaroBatchVerifier contract.
sol! {
    #[sol(rpc)]
    interface IFigaroBatchVerifier {
        struct NetPositionCall {
            address token;
            address user;
            uint256 deposit;
            uint256 payout;
        }

        struct AttestationDataCall {
            bytes32 orderHash;
            bytes32 processId;
            address attester;
            bytes32 clauseId;
            uint8 stage;
            bytes32 contentRef;
        }

        struct SpecBindingCall {
            bytes32 clauseId;
            bytes32 specHash;
        }

        struct BatchEventDataCall {
            AttestationDataCall[] attestations;
            SpecBindingCall[] specBindings;
        }

        struct BatchUseCall {
            bytes32 clauseOrAssembly;
            uint8 kind;
            bytes32 processId;
            address seller;
        }

        struct BatchUsageDataCall {
            uint8 period;
            bytes32 provenanceLeaf;
            BatchUseCall[] uses;
        }

        function settleBatch(
            bytes calldata proof,
            bytes calldata publicValues,
            NetPositionCall[] calldata positions,
            BatchEventDataCall calldata events,
            BatchUsageDataCall calldata usage,
            bytes calldata operations
        ) external;

        event BatchSettled(
            uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount
        );

        event BatchOperations(
            uint64 indexed batchId, uint64 blockTimestamp, uint8 usagePeriod, bytes32 provenanceLeaf, bytes operations
        );

        function stateRoot() external view returns (bytes32);
        function clauseRegistry() external view returns (address);
        function programVKey() external view returns (bytes32);
        function batchCount() external view returns (uint64);
    }
}

// The UsageCounter facts a batch's uses must agree with: the open period and
// the provenance leaf, and whether a process is already counted under a key.
// All are re-checked by the counter at resolution, so reading them here is an
// optimization (don't prove what the counter would not count), never a
// source of authority.
sol! {
    #[sol(rpc)]
    interface IUsageCounter {
        function currentPeriod() external view returns (uint8);
        function provenanceLeaf() external view returns (bytes32);
        function processCounted(uint8 kind, bytes32 clauseOrAssembly, bytes32 processId) external view returns (bool);
    }
}

// The clause-or-assembly-side and seller-side stake gates the counter applies
// to each use at resolution, skipping a use that fails either.
// Reading them HERE is a pre-filter: drop a claim the counter would not count
// before it enters a proof, so it costs the batch no gas. Never a source of
// authority — the counter re-checks all of it.
sol! {
    #[sol(rpc)]
    interface IClauseRegistry {
        function depositOf(bytes32 idHash) external view returns (address registeredBy, bool withdrawn);
        function registered(bytes32 clauseKey) external view returns (bool);
    }
}

sol! {
    #[sol(rpc)]
    interface IAssemblyRegistry {
        function bindings(bytes32 assemblyHash)
            external
            view
            returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string contentURI);
    }
}

sol! {
    #[sol(rpc)]
    interface IAgreementRegistry {
        function bindings(bytes32 agreementHash)
            external
            view
            returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string contentURI);
    }
}

sol! {
    #[sol(rpc)]
    interface IMembersRegistry {
        function registered(address member) external view returns (bool);
    }
}

/// Configuration for the on-chain submitter.
#[derive(Clone, Debug)]
pub struct SubmitterConfig {
    pub rpc_url: String,
    pub verifier_address: Address,
    /// The RPGF counter. `Address::ZERO` disables usage accrual — the
    /// sequencer then resolves trade without crediting it, which is exactly
    /// what a deployment with no counter should do.
    pub usage_counter_address: Address,
    /// The four registries the usage-claim pre-filter reads, one per claim
    /// kind plus the members' — clause, assembly, agreement, members. With
    /// no counter configured the pre-filter passes every claim through; with
    /// one configured, a read against a registry left `Address::ZERO` fails
    /// and drops the claim (see `filter_usage_claims`).
    pub clause_registry_address: Address,
    pub assembly_registry_address: Address,
    pub agreement_registry_address: Address,
    pub members_registry_address: Address,
    pub private_key: String,
}

/// Read the accrual period and provenance leaf's key a batch must commit to.
///
/// Returns `None` when there is no counter configured, or when accrual has
/// CLOSED (`currentPeriod()` reverts `AccrualClosed` after the last period).
/// A closed reward is not an error: trade goes on, it simply stops being
/// credited, and the batch resolves with an empty accrual.
pub async fn read_usage_context(
    rpc_url: &str,
    usage_counter: Address,
) -> Option<(u8, alloy::primitives::B256)> {
    if usage_counter == Address::ZERO {
        return None;
    }
    let provider = ProviderBuilder::new().connect_http(rpc_url.parse().ok()?);
    let contract = IUsageCounter::new(usage_counter, &provider);
    let period = contract.currentPeriod().call().await.ok()?;
    let provenance = contract.provenanceLeaf().call().await.ok()?;
    Some((period, provenance))
}

/// Drop usage claims the `UsageCounter` would not count at resolution, BEFORE
/// they enter a proof.
///
/// The counter SKIPS a use whose key has no live registration, whose seller
/// holds no live member stake, or whose process it has already counted under
/// that key, on either route (it never reverts on those). A skipped use still
/// costs the batch its proof cycles and its calldata, so filtering here keeps
/// such claims out. The residual — a seller who unstakes AFTER this read but
/// before submission — is a use the counter skips; this only shrinks how
/// often that happens.
///
/// The pre-filter is an OPTIMIZATION, never authority: the counter re-checks all
/// of it on-chain. So when a registry read fails (RPC hiccup) the claim is
/// dropped conservatively — it can be re-submitted — rather than proven on
/// unverified state. The filter is keyed on the COUNTER address, not the
/// registries: with no counter there is no accrual (claims are dropped upstream
/// when `read_usage_context` returns `None`), so passing them through here is
/// harmless. When a counter IS configured the filter always runs — a misconfig
/// that left the registries at `Address::ZERO` while accrual is live must NOT
/// silently disable the filter; the per-claim reads against a zero registry
/// simply fail and drop the claim loudly, rather than the filter switching
/// itself off.
pub async fn filter_usage_claims(
    config: &SubmitterConfig,
    claims: Vec<UsageClaim>,
) -> (Vec<UsageClaim>, Vec<(UsageClaim, String)>) {
    // The format's two reserved keys (the provenance leaf's and the
    // assembly terms leaf's) are never registrations: the guest refuses a
    // claim keyed on either (any kind), and an assembly claim whose agreement
    // position names either as its agreementHash, so one such claim would cost
    // the whole batch its proof. A constant comparison, no chain read — it
    // runs whether or not a counter is set.
    let (reserved, claims): (Vec<UsageClaim>, Vec<UsageClaim>) =
        claims.into_iter().partition(names_a_reserved_key);
    let mut dropped: Vec<(UsageClaim, String)> = reserved
        .into_iter()
        .map(|c| {
            (
                c,
                "names a reserved key of the format, which is not a registration".to_string(),
            )
        })
        .collect();

    let disabled = config.usage_counter_address == Address::ZERO;
    if disabled || claims.is_empty() {
        return (claims, dropped);
    }

    let provider = match config
        .rpc_url
        .parse()
        .ok()
        .map(|u| ProviderBuilder::new().connect_http(u))
    {
        Some(p) => p,
        None => return (claims, dropped), // unparsable RPC — leave to the on-chain backstop
    };
    let clauses = IClauseRegistry::new(config.clause_registry_address, &provider);
    let assemblies = IAssemblyRegistry::new(config.assembly_registry_address, &provider);
    let agreements = IAgreementRegistry::new(config.agreement_registry_address, &provider);
    let members = IMembersRegistry::new(config.members_registry_address, &provider);
    let counter = IUsageCounter::new(config.usage_counter_address, &provider);
    // The process id a claim's use carries, derived under the verifier's
    // domain as the guest derives it.
    let domain = match provider.get_chain_id().await {
        Ok(chain_id) => figaro_kernel::eip712::domain_separator(chain_id, config.verifier_address),
        Err(e) => {
            let why = format!("chain id read failed: {e}");
            dropped.extend(claims.into_iter().map(|c| (c, why.clone())));
            return (Vec::new(), dropped);
        }
    };

    let mut valid = Vec::with_capacity(claims.len());

    // Per-claim classification. `Ok(())` = would be accrued on-chain; any read
    // error drops the claim conservatively (re-submittable), never proven on
    // unverified state.
    for claim in claims {
        let reason: Result<(), String> = async {
            // Registration-side stake gate: a live registration stake in the
            // key's own registry (clause, agreement or assembly, matching the kind).
            let live = match claim.kind {
                UsageClaimKind::Clause { .. } => {
                    match clauses.depositOf(claim.clause_or_assembly).call().await {
                        Ok(d) => d.registeredBy != Address::ZERO && !d.withdrawn,
                        Err(e) => return Err(format!("clause depositOf read failed: {e}")),
                    }
                }
                UsageClaimKind::Assembly { .. } => {
                    match assemblies.bindings(claim.clause_or_assembly).call().await {
                        Ok(b) => {
                            b.registeredBy != Address::ZERO && b.registeredAt != 0 && !b.depositWithdrawn
                        }
                        Err(e) => return Err(format!("assembly bindings read failed: {e}")),
                    }
                }
                UsageClaimKind::Agreement { .. } => {
                    match agreements.bindings(claim.clause_or_assembly).call().await {
                        Ok(b) => {
                            b.registeredBy != Address::ZERO && b.registeredAt != 0 && !b.depositWithdrawn
                        }
                        Err(e) => return Err(format!("agreement bindings read failed: {e}")),
                    }
                }
            };
            if !live {
                return Err("the claim's key has no live registration stake in its registry".to_string());
            }

            // Seller-side stake gate: the order's seller of record must be live-staked.
            match members.registered(claim.order.seller).call().await {
                Ok(true) => {}
                Ok(false) => return Err("seller is not live-staked".to_string()),
                Err(e) => return Err(format!("member registered read failed: {e}")),
            }

            // Once ever: the counter's one counted-process set, both routes.
            let (_, process_id) = figaro_kernel::kernel::derive_commitment_ids(&domain, &claim.order);
            match counter
                .processCounted(claim.kind.code(), claim.clause_or_assembly, process_id)
                .call()
                .await
            {
                Ok(false) => Ok(()),
                Ok(true) => Err("the counter has already counted this process under the key".to_string()),
                Err(e) => Err(format!("counter processCounted read failed: {e}")),
            }
        }
        .await;

        match reason {
            Ok(()) => valid.push(claim),
            Err(why) => dropped.push((claim, why)),
        }
    }
    (valid, dropped)
}

/// Whether a claim names one of the format's reserved keys where the guest
/// refuses it: as the claim's key, of any kind, or as an assembly claim's
/// agreement-position agreementHash.
fn names_a_reserved_key(claim: &UsageClaim) -> bool {
    use figaro_kernel::kernel::is_reserved_key;
    is_reserved_key(&claim.clause_or_assembly)
        || matches!(&claim.kind, UsageClaimKind::Assembly { agreement_hash, .. } if is_reserved_key(agreement_hash))
}

/// Submit a proved batch to the on-chain FigaroBatchVerifier.
pub async fn submit_batch(
    config: &SubmitterConfig,
    result: &ProveResult,
) -> Result<alloy::primitives::B256, SettleError> {
    let transient = |message: String| SettleError { message, deterministic: false };
    // Build provider with signer
    let signer: PrivateKeySigner = config
        .private_key
        .parse()
        .map_err(|e| transient(format!("invalid private key: {e}")))?;
    let wallet = EthereumWallet::from(signer);

    // alloy 1.x: the recommended fillers (nonce, gas, chain id) are the
    // builder's default; only the wallet is added.
    let provider = ProviderBuilder::new()
        .wallet(wallet)
        .connect_http(
            config
                .rpc_url
                .parse()
                .map_err(|e| transient(format!("invalid rpc url: {e}")))?,
        );

    let (positions, events_call, usage_call) =
        settle_call_args(&result.positions, &result.events, result.provenance_leaf);

    let contract = IFigaroBatchVerifier::new(config.verifier_address, &provider);

    let tx = contract.settleBatch(
        Bytes::from(result.proof_bytes.clone()),
        Bytes::from(result.public_values_bytes.clone()),
        positions,
        events_call,
        usage_call,
        Bytes::from(result.operations_bytes.clone()),
    );

    info!(verifier = ?config.verifier_address, "Submitting settleBatch transaction");

    let pending = match tx.send().await {
        Ok(p) => p,
        Err(e) => {
            let msg = format!("tx submission failed: {e}");
            eprintln!("SUBMIT_ERROR: {msg}");
            // A send-path revert is the chain's evaluated refusal (the node
            // simulates before accepting) — deterministic, never retried.
            return Err(SettleError {
                deterministic: is_deterministic_send_error(&msg),
                message: msg,
            });
        }
    };

    let receipt = match pending.get_receipt().await {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("tx confirmation failed: {e}");
            eprintln!("RECEIPT_ERROR: {msg}");
            return Err(transient(msg));
        }
    };

    let tx_hash = receipt.transaction_hash;
    // A mined-but-reverted resolve is DETERMINISTIC failure, not success:
    // advancing the mirror here would fork it from the chain permanently
    // (the chain's root did not move) and fail every later batch's
    // prev-root check.
    if !receipt.status() {
        let msg = format!("settleBatch mined but REVERTED: {tx_hash:?}");
        eprintln!("REVERT_ERROR: {msg}");
        return Err(SettleError { message: msg, deterministic: true });
    }
    info!(?tx_hash, "settleBatch confirmed");

    Ok(tx_hash)
}


/// The mirror's positions and events as the verifier's call types: the
/// send and the gas estimate encode the same arguments.
pub fn settle_call_args(
    positions: &[NetPosition],
    events: &BatchEvents,
    provenance_leaf: B256,
) -> (
    Vec<IFigaroBatchVerifier::NetPositionCall>,
    IFigaroBatchVerifier::BatchEventDataCall,
    IFigaroBatchVerifier::BatchUsageDataCall,
) {
    let positions = positions
        .iter()
        .map(|p| IFigaroBatchVerifier::NetPositionCall {
            token: p.token,
            user: p.user,
            deposit: p.deposit,
            payout: p.payout,
        })
        .collect();
    let attestations = events
        .attestations
        .iter()
        .map(|a| IFigaroBatchVerifier::AttestationDataCall {
            orderHash: a.order_hash,
            processId: a.process_id,
            attester: a.attester,
            clauseId: a.clause_id,
            stage: a.stage,
            contentRef: a.content_ref,
        })
        .collect();
    // The (clause key, witness-spec hash) bindings the proof committed,
    // both fields equal — the verifier checks each key is registered.
    let spec_bindings = events
        .spec_bindings
        .iter()
        .map(|b| IFigaroBatchVerifier::SpecBindingCall {
            clauseId: b.clause_id,
            specHash: b.spec_hash,
        })
        .collect();
    let events_call = IFigaroBatchVerifier::BatchEventDataCall {
        attestations,
        specBindings: spec_bindings,
    };
    // The uses the proof committed. An empty array is normal and resolves
    // fine — the counter treats it as a no-op, which is what lets trade keep
    // resolving after the reward's last period ends.
    let usage_call = IFigaroBatchVerifier::BatchUsageDataCall {
        period: events.usage_period,
        provenanceLeaf: provenance_leaf,
        uses: events
            .uses
            .iter()
            .map(|u| IFigaroBatchVerifier::BatchUseCall {
                clauseOrAssembly: u.clause_or_assembly,
                kind: u.kind,
                processId: u.process_id,
                seller: u.seller,
            })
            .collect(),
    };
    (positions, events_call, usage_call)
}

/// The calldata a settle of these positions and events would carry, with
/// `proof_len` bytes standing for the proof, `public_values` as the guest
/// commits them and `operations` the batch's operation stream: what the gas
/// estimate charges per byte.
pub fn settle_calldata(
    positions: &[NetPosition],
    events: &BatchEvents,
    provenance_leaf: B256,
    public_values: &[u8],
    proof_len: usize,
    operations: &[u8],
) -> Vec<u8> {
    use alloy::sol_types::SolCall;
    let (positions, events, usage) = settle_call_args(positions, events, provenance_leaf);
    IFigaroBatchVerifier::settleBatchCall {
        proof: Bytes::from(vec![0xffu8; proof_len]),
        publicValues: Bytes::copy_from_slice(public_values),
        positions,
        events,
        usage,
        operations: Bytes::copy_from_slice(operations),
    }
    .abi_encode()
}

/// The latest block's gas limit: what a batch's settle must fit, with the
/// headroom `gas::settle_gas_budget` keeps.
pub async fn read_block_gas_limit(rpc_url: &str) -> Result<u64, String> {
    let provider = ProviderBuilder::new().connect_http(
        rpc_url
            .parse()
            .map_err(|e| format!("invalid rpc url: {e}"))?,
    );
    let block = provider
        .get_block_by_number(alloy::eips::BlockNumberOrTag::Latest)
        .await
        .map_err(|e| format!("latest block read failed: {e}"))?
        .ok_or_else(|| "the node returned no latest block".to_string())?;
    Ok(block.header.gas_limit)
}

/// Read the current on-chain state root.
pub async fn read_state_root(
    rpc_url: &str,
    verifier_address: Address,
) -> Result<alloy::primitives::B256, String> {
    let provider = ProviderBuilder::new().connect_http(
        rpc_url
            .parse()
            .map_err(|e| format!("invalid rpc url: {e}"))?,
    );

    let contract = IFigaroBatchVerifier::new(verifier_address, &provider);
    let root = contract
        .stateRoot()
        .call()
        .await
        .map_err(|e| format!("stateRoot() call failed: {e}"))?;

    Ok(root)
}

/// The guest fingerprint the deployed verifier pins — `programVKey`, an
/// immutable. A relay whose embedded guest hashes to anything else makes
/// proofs that verifier refuses, so the relay compares this at startup
/// against `prover::embedded_vkey()` and refuses to run on a mismatch.
pub async fn read_program_vkey(
    rpc_url: &str,
    verifier_address: Address,
) -> Result<alloy::primitives::B256, String> {
    let provider = ProviderBuilder::new().connect_http(
        rpc_url
            .parse()
            .map_err(|e| format!("invalid rpc url: {e}"))?,
    );
    let contract = IFigaroBatchVerifier::new(verifier_address, &provider);
    contract
        .programVKey()
        .call()
        .await
        .map_err(|e| format!("programVKey() call failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{B256, U256};
    use figaro_kernel::types::Commitment;

    /// The classifier's whole contract: the chain's evaluated refusal is
    /// deterministic; everything transport-shaped is not. The first case is
    /// the exact string of the ProofInvalid loop.
    #[test]
    fn send_error_classification() {
        assert!(is_deterministic_send_error(
            "tx submission failed: server returned an error response: \
             error code 3: execution reverted: custom error 0x7fcdd1f4"
        ));
        for transient in [
            "tx submission failed: error sending request",
            "tx submission failed: connection refused",
            "tx submission failed: nonce too low",
            "tx confirmation failed: timed out",
        ] {
            assert!(!is_deterministic_send_error(transient), "{transient}");
        }
    }

    /// The funding verdict: both the balance and the allowance must cover
    /// the bond; either short and the pull would revert the batch.
    #[test]
    fn a_bond_is_funded_only_with_both_balance_and_allowance() {
        let need = U256::from(200u64);
        assert!(commit_funded(U256::from(200u64), U256::from(200u64), need));
        assert!(commit_funded(U256::MAX, U256::MAX, need));
        assert!(!commit_funded(U256::from(199u64), U256::MAX, need), "short balance");
        assert!(!commit_funded(U256::MAX, U256::from(199u64), need), "short allowance");
        assert!(!commit_funded(U256::ZERO, U256::ZERO, need));
    }

    /// The bonds are FigaroCore's: 2 × payment for the buyer, 2 × cumulative
    /// value for the seller.
    #[test]
    fn bonds_are_the_kernels_arithmetic() {
        let mut c = dummy_claim().order;
        c.payment = U256::from(100u64);
        c.expected_cumulative_value = U256::from(150u64);
        assert_eq!(bonds_of(&c), (U256::from(200u64), U256::from(300u64)));
    }

    /// No verifier configured means no funding reads: a prove-only dry run
    /// passes everything through, and never touches the (unreachable) rpc.
    #[tokio::test]
    async fn funding_filter_is_a_pass_through_without_a_verifier() {
        let ops = vec![PendingOp {
            id: 1,
            key: B256::repeat_byte(0x01),
            op: KernelOp::Resolve {
                process_id: B256::ZERO,
                cumulative_value: alloy::primitives::U256::ZERO,
                commitments: vec![],
                buyer_sig: figaro_kernel::types::Signature {
                    v: 27,
                    r: B256::ZERO,
                    s: B256::ZERO,
                },
            },
            deferred_since: None,
            behind: Vec::new(),
        }];
        let (valid, dropped) = filter_funded_commits(None, ops).await;
        assert_eq!(valid.len(), 1);
        assert!(dropped.is_empty());
    }

    /// With a verifier configured but the chain unreachable, a commit is
    /// dropped conservatively — never proved against unverified funding —
    /// and the reason says so; a non-commit op is not a funding question.
    #[tokio::test]
    async fn funding_filter_drops_a_commit_it_cannot_verify() {
        let gate = FundingGate {
            rpc_url: "http://127.0.0.1:1".to_string(),
            verifier: Address::repeat_byte(0x02),
        };
        let sig = figaro_kernel::types::Signature {
            v: 27,
            r: B256::ZERO,
            s: B256::ZERO,
        };
        let ops = vec![
            PendingOp {
                id: 1,
                key: B256::repeat_byte(0x01),
                op: KernelOp::Commit {
                    commitment: dummy_claim().order,
                    buyer_sig: sig.clone(),
                    seller_sig: sig.clone(),
                },
                deferred_since: None,
                behind: Vec::new(),
            },
            PendingOp {
                id: 2,
                key: B256::repeat_byte(0x02),
                op: KernelOp::Resolve {
                    process_id: B256::ZERO,
                    cumulative_value: alloy::primitives::U256::ZERO,
                    commitments: vec![],
                    buyer_sig: sig,
                },
                deferred_since: None,
                behind: Vec::new(),
            },
        ];
        let (valid, dropped) = filter_funded_commits(Some(&gate), ops).await;
        assert_eq!(valid.len(), 1, "the resolve passes");
        assert_eq!(dropped.len(), 1, "the commit is dropped");
        assert!(dropped[0].1.contains("funding unverifiable"), "{}", dropped[0].1);
        let KernelOp::Commit { commitment, .. } = &dropped[0].0.op else {
            panic!("the dropped op is the commit");
        };
        assert_eq!(dropped[0].2, commitment.buyer, "the drop names the party that fails funding");
    }

    /// The revocation log counts one address's refusals within the window
    /// and forgets the ones that aged out — the repeated-revocation signal.
    #[test]
    fn revocation_log_counts_within_the_window_only() {
        let window = Duration::from_secs(3600);
        let log = RevocationLog::new(window);
        let who = Address::repeat_byte(0x0a);
        let other = Address::repeat_byte(0x0b);
        let now = Instant::now();
        let old = now.checked_sub(window * 2).expect("the clock has run longer than two windows");

        assert_eq!(log.record_at(who, old), 1, "the first refusal stands alone");
        assert_eq!(log.record_at(who, now), 1, "an aged-out refusal is not repetition");
        assert_eq!(log.record_at(who, now), 2, "two within the window are the signal");
        assert_eq!(log.record_at(other, now), 1, "addresses are counted apart");
    }

    /// No key, no relay: unset and blank both refuse, and the refusal names
    /// the variable; a set key is taken as given.
    #[test]
    fn signing_key_is_required() {
        for absent in [None, Some(String::new()), Some("   ".to_string())] {
            let err = signing_key_from_env(absent).unwrap_err();
            assert!(err.contains("SEQUENCER_PRIVATE_KEY"), "{err}");
        }
        assert_eq!(
            signing_key_from_env(Some(" 0xabc ".to_string())).unwrap(),
            "0xabc"
        );
    }

    fn dummy_config(clause: Address, assembly: Address, members: Address) -> SubmitterConfig {
        SubmitterConfig {
            rpc_url: "http://127.0.0.1:1".to_string(),
            verifier_address: Address::ZERO,
            usage_counter_address: Address::ZERO,
            clause_registry_address: clause,
            assembly_registry_address: assembly,
            agreement_registry_address: Address::ZERO,
            members_registry_address: members,
            private_key: String::new(),
        }
    }

    fn dummy_claim() -> UsageClaim {
        UsageClaim {
            order: Commitment {
                process_id: B256::ZERO,
                buyer: Address::ZERO,
                seller: Address::repeat_byte(0x11),
                currency: Address::ZERO,
                payment: U256::from(1),
                expected_cumulative_value: U256::from(1),
                checkout_hash: B256::ZERO,
                salt: U256::ZERO,
                deadline: U256::ZERO,
            },
            clause_or_assembly: B256::repeat_byte(0xAB),
            kind: UsageClaimKind::Clause {
                clause_data_hash: B256::ZERO,
            },
            inclusion_proof: Vec::new(),
        }
    }

    // When no registries are configured, the pre-filter is disabled and every
    // claim passes through UNTOUCHED — the on-chain gates plus the verifier's
    // try/catch are the backstop. It must NOT make chain calls (the rpc here is
    // unreachable) and must NOT drop anything.
    #[tokio::test]
    async fn disabled_when_no_registries_configured_passes_all_through() {
        let config = dummy_config(Address::ZERO, Address::ZERO, Address::ZERO);
        let (valid, dropped) = filter_usage_claims(&config, vec![dummy_claim()]).await;
        assert_eq!(valid.len(), 1, "the one claim survives");
        assert!(
            dropped.is_empty(),
            "nothing dropped when the filter is disabled"
        );
    }

    // A claim keyed on the agreement format's reserved provenance leaf is
    // dropped before any chain read — the guest refuses it, so it would cost
    // the whole batch its proof. Pure: the rpc here is unreachable.
    #[tokio::test]
    async fn drops_a_claim_keyed_on_the_provenance_leaf_without_touching_the_chain() {
        let config = dummy_config(Address::ZERO, Address::ZERO, Address::ZERO);
        let mut reserved = dummy_claim();
        reserved.clause_or_assembly = figaro_kernel::kernel::PROVENANCE_LEAF_KEY;
        let (valid, dropped) = filter_usage_claims(&config, vec![reserved, dummy_claim()]).await;
        assert_eq!(valid.len(), 1, "the ordinary claim passes through");
        assert_eq!(dropped.len(), 1, "the reserved-key claim is dropped");
        assert_eq!(
            dropped[0].0.clause_or_assembly,
            figaro_kernel::kernel::PROVENANCE_LEAF_KEY
        );
    }

    // Even with registries configured, an empty claim set short-circuits before
    // any provider is built (an unreachable rpc must not error the batch loop).
    #[tokio::test]
    async fn empty_claims_return_empty_without_touching_the_chain() {
        let config = dummy_config(
            Address::repeat_byte(0x01),
            Address::repeat_byte(0x02),
            Address::repeat_byte(0x03),
        );
        let (valid, dropped) = filter_usage_claims(&config, Vec::new()).await;
        assert!(valid.is_empty());
        assert!(dropped.is_empty());
    }

    // ── The agreement kind's pre-filter, against a chain double ──────

    const COUNTER: Address = Address::repeat_byte(0xC0);
    const CLAUSES: Address = Address::repeat_byte(0xC1);
    const ASSEMBLIES: Address = Address::repeat_byte(0xC2);
    const AGREEMENTS: Address = Address::repeat_byte(0xC3);
    const MEMBERS: Address = Address::repeat_byte(0xC4);

    /// A JSON-RPC double answering `eth_call` for the registries and the
    /// counter the pre-filter reads: `bindings(key)` is live for the
    /// (registry, key) pairs in `live`, every member is staked, the counter
    /// has counted a process under exactly the keys in `counted`, and
    /// anything else is an unregistered binding. Returns the URL it serves on.
    async fn registries_double(live: Vec<(Address, B256)>, counted: Vec<B256>) -> String {
        use alloy::sol_types::{SolCall, SolValue};
        use axum::{routing::post, Json, Router};

        let live = std::sync::Arc::new(live);
        let counted = std::sync::Arc::new(counted);
        let app = Router::new().route(
            "/",
            post(move |Json(req): Json<serde_json::Value>| {
                let live = live.clone();
                let counted = counted.clone();
                async move {
                    let answer = |req: &serde_json::Value| -> serde_json::Value {
                        let id = req["id"].clone();
                        let result = match req["method"].as_str().unwrap_or("") {
                            "eth_chainId" => serde_json::json!("0x7a69"),
                            "eth_blockNumber" => serde_json::json!("0x1"),
                            "eth_call" => {
                                let tx = &req["params"][0];
                                let to: Address = tx["to"].as_str().unwrap().parse().unwrap();
                                let input = tx["input"].as_str().or(tx["data"].as_str()).unwrap();
                                let input = alloy::primitives::hex::decode(input).unwrap();
                                let out: Vec<u8> = if input[..4] == IMembersRegistry::registeredCall::SELECTOR {
                                    true.abi_encode()
                                } else if input[..4] == IUsageCounter::processCountedCall::SELECTOR {
                                    assert_eq!(to, COUNTER, "the counted set is the counter's");
                                    counted.contains(&B256::from_slice(&input[36..68])).abi_encode()
                                } else if input[..4] == IAgreementRegistry::bindingsCall::SELECTOR {
                                    let key = B256::from_slice(&input[4..36]);
                                    let registered = live.contains(&(to, key));
                                    let by = if registered { Address::repeat_byte(0xDE) } else { Address::ZERO };
                                    let at: u64 = if registered { 1 } else { 0 };
                                    let uri = if registered { "ipfs://doc".to_string() } else { String::new() };
                                    (by, at, false, uri).abi_encode_params()
                                } else {
                                    panic!("unexpected call to {to}");
                                };
                                serde_json::json!(format!("0x{}", alloy::primitives::hex::encode(out)))
                            }
                            other => panic!("unexpected method {other}"),
                        };
                        serde_json::json!({"jsonrpc": "2.0", "id": id, "result": result})
                    };
                    let body = match &req {
                        serde_json::Value::Array(batch) => {
                            serde_json::Value::Array(batch.iter().map(answer).collect())
                        }
                        single => answer(single),
                    };
                    Json(body)
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{addr}")
    }

    fn live_config(rpc_url: String) -> SubmitterConfig {
        SubmitterConfig {
            rpc_url,
            verifier_address: Address::ZERO,
            usage_counter_address: COUNTER,
            clause_registry_address: CLAUSES,
            assembly_registry_address: ASSEMBLIES,
            agreement_registry_address: AGREEMENTS,
            members_registry_address: MEMBERS,
            private_key: String::new(),
        }
    }

    fn agreement_claim(key: B256) -> UsageClaim {
        let mut claim = dummy_claim();
        claim.clause_or_assembly = key;
        claim.kind = UsageClaimKind::Agreement {
            assembly_hash: B256::repeat_byte(0xA5),
        };
        claim
    }

    // A kind-2 claim reads `AgreementRegistry.bindings`: a registered
    // agreement passes, an unregistered one is dropped — and a key that only
    // the ASSEMBLY registry holds is still dropped, so the read goes to the
    // agreement registry and nowhere else.
    #[tokio::test]
    async fn an_agreement_claim_is_filtered_by_the_agreement_registry() {
        let registered = B256::repeat_byte(0x21);
        let unregistered = B256::repeat_byte(0x22);
        let assembly_only = B256::repeat_byte(0x23);
        let url = registries_double(vec![
            (AGREEMENTS, registered),
            (ASSEMBLIES, assembly_only),
        ], vec![])
        .await;
        let config = live_config(url);

        let (valid, dropped) = filter_usage_claims(
            &config,
            vec![
                agreement_claim(registered),
                agreement_claim(unregistered),
                agreement_claim(assembly_only),
            ],
        )
        .await;

        assert_eq!(valid.len(), 1, "only the registered agreement passes");
        assert_eq!(valid[0].clause_or_assembly, registered);
        let mut refused: Vec<B256> = dropped.iter().map(|(c, _)| c.clause_or_assembly).collect();
        refused.sort();
        assert_eq!(refused, vec![unregistered, assembly_only]);
        for (_, why) in &dropped {
            assert!(why.contains("no live registration"), "{why}");
        }
    }

    // A claim whose process the counter has already counted under its key —
    // on either route — is dropped: the counter would skip its use, and the
    // read goes to the counter's one counted-process set.
    #[tokio::test]
    async fn a_claim_the_counter_has_counted_is_dropped() {
        let fresh = B256::repeat_byte(0x31);
        let counted = B256::repeat_byte(0x32);
        let url = registries_double(vec![(AGREEMENTS, fresh), (AGREEMENTS, counted)], vec![counted]).await;
        let config = live_config(url);

        let (valid, dropped) =
            filter_usage_claims(&config, vec![agreement_claim(fresh), agreement_claim(counted)]).await;

        assert_eq!(valid.len(), 1);
        assert_eq!(valid[0].clause_or_assembly, fresh);
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].0.clause_or_assembly, counted);
        assert!(dropped[0].1.contains("already counted"), "{}", dropped[0].1);
    }

    // The format's two reserved keys are dropped before any chain read,
    // whether a claim is keyed on one or an assembly claim's agreement
    // names one as its agreementHash (the terms leaf is not an agreement).
    // Pure: the rpc here is unreachable.
    #[tokio::test]
    async fn drops_claims_naming_either_reserved_key_without_touching_the_chain() {
        use figaro_kernel::kernel::{ASSEMBLY_TERMS_LEAF_KEY, PROVENANCE_LEAF_KEY};
        let config = dummy_config(Address::ZERO, Address::ZERO, Address::ZERO);
        let slot_naming = |agreement_hash: B256| {
            let mut claim = dummy_claim();
            claim.kind = UsageClaimKind::Assembly {
                agreement_hash,
                slot_content_hash: B256::repeat_byte(0x5C),
                membership_proof: vec![],
            };
            claim
        };
        let claims = vec![
            agreement_claim(ASSEMBLY_TERMS_LEAF_KEY),
            agreement_claim(PROVENANCE_LEAF_KEY),
            slot_naming(ASSEMBLY_TERMS_LEAF_KEY),
            slot_naming(PROVENANCE_LEAF_KEY),
            dummy_claim(),
        ];
        let (valid, dropped) = filter_usage_claims(&config, claims).await;
        assert_eq!(valid.len(), 1, "the ordinary claim passes through");
        assert_eq!(dropped.len(), 4, "every claim naming a reserved key is dropped");
    }
}
