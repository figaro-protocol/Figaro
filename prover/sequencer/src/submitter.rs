use crate::api::without_urls;
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
    /// The chain id the RPC answered at startup (`read_chain_id`), the one the verifier's domain is built on.
    pub chain_id: u64,
}

/// The chain id, read from the RPC: the one source the relay takes it from, read once at startup.
pub async fn read_chain_id(rpc_url: &str) -> Result<u64, String> {
    let url = rpc_url.parse().map_err(|e| format!("invalid RPC_URL: {e}"))?;
    ProviderBuilder::new()
        .connect_http(url)
        .get_chain_id()
        .await
        .map_err(|e| format!("chain id read failed: {}", without_urls(&e.to_string())))
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
            .map_err(|e| format!("balanceOf({who}) read failed: {}", without_urls(&e.to_string())))?;
        let allowance = token
            .allowance(who, gate.verifier)
            .call()
            .await
            .map_err(|e| format!("allowance({who}) read failed: {}", without_urls(&e.to_string())))?;
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
/// reverts the WHOLE batch, in either authorization form (the wallet-code
/// form commits the binding too). `None` for a hash-only attestation, which
/// commits no spec binding (the verifier checks no registry for it, as the
/// coordinator checks none), and for every other op.
pub fn attestation_spec(op: &KernelOp) -> Option<(alloy::primitives::B256, alloy::primitives::B256)> {
    match op {
        KernelOp::AttestAsSeller { clause_id, proof: AttestationWitness::Plaintext(proof), .. }
        | KernelOp::AttestAsBuyer { clause_id, proof: AttestationWitness::Plaintext(proof), .. }
        | KernelOp::AttestByWalletCode { clause_id, proof: AttestationWitness::Plaintext(proof), .. } => {
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
        let Some((clause, witness_hash)) = attestation_spec(&op.op) else {
            valid.push(op);
            continue;
        };
        if witness_hash != clause {
            dropped.push((
                op,
                format!("witness spec {witness_hash} does not hash to clause key {clause} — the guest would refuse the batch"),
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

// ── Wallet-code operations: the party's code must validate ─────────
//
// A resolve or an attestation in the wallet-code form carries bytes the
// party's own account code validates (ERC-1271). The guest cannot run that
// code; the verifier asks it at resolution, and reverts the WHOLE batch on
// any answer but the magic value, for a resolve and for an attestation
// alike. The relay asks the same
// code the same question against the latest block — at the door and again at
// batch formation — as it reads a commit's funding: a liveness aid, never the
// gate, so a resolve or an attestation the code refuses never reverts a
// batch. The question is the
// verifier's: `isValidSignature(digest, bytes)` from the verifier's address,
// under the verifier's domain; for a resolve the digest `ResolveProcess` over
// the process and the listed payments, the buyer the listed orders'; for an
// attestation the `AttestSeller` / `AttestBuyer` digest over the target's ids
// derived from its commitment, the party the role names. The call runs under
// `gas::WALLET_CODE_EXECUTION_GAS`, the gas this relay plans for the wallet's
// own code. The residual window is the proving time: code whose answer
// changes inside it reverts the batch, a resolve's or an attestation's, as
// does code that burns the gas the verifier forwards; the deterministic-revert arm
// names and dead-letters those operations alone (`filter_wallet_code_ops`).

sol! {
    #[sol(rpc)]
    interface IERC1271WalletCode {
        function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4);
    }
}

/// ERC-1271's magic value.
const ERC1271_MAGIC_VALUE: [u8; 4] = [0x16, 0x26, 0xba, 0x7e];

/// What the verifier asks a wallet-code operation's party: the party, the
/// digest under the verifier's domain, and the bytes. For a resolve, the
/// buyer (the listed orders') and `ResolveProcess` over the process and the
/// listed payments; for an attestation, the role's party of the target and
/// `AttestSeller` / `AttestBuyer` over the target's ids, derived from its
/// commitment (`derive_commitment_ids`) as the verifier derives them. `None`
/// for every other op, and for a resolve listing no order (the guest refuses
/// it).
pub fn wallet_code_question(
    chain_id: u64,
    verifier: Address,
    op: &KernelOp,
) -> Option<(Address, B256, Bytes)> {
    use figaro_kernel::eip712::{
        attest_buyer_struct_hash, attest_seller_struct_hash, domain_separator, resolve_struct_hash, typed_data_hash,
    };
    use figaro_kernel::types::AttesterRole;
    let domain = domain_separator(chain_id, verifier);
    match op {
        KernelOp::ResolveByWalletCode { process_id, commitments, authorization, .. } => {
            let buyer = commitments.first()?.buyer;
            // The value the verifier derives: the listed payments' sum.
            let value = figaro_kernel::operation_stream::resolved_cumulative_value(commitments)?;
            let digest = typed_data_hash(&domain, &resolve_struct_hash(process_id, &value));
            Some((buyer, digest, authorization.clone()))
        }
        KernelOp::AttestByWalletCode { role, target, clause_id, stage, content_ref, authorization, .. } => {
            let (order_hash, process_id) = figaro_kernel::kernel::derive_commitment_ids(&domain, target);
            let struct_hash = match role {
                AttesterRole::Seller => attest_seller_struct_hash(&order_hash, clause_id, *stage, content_ref),
                AttesterRole::Buyer => attest_buyer_struct_hash(&process_id, &order_hash, clause_id, *stage, content_ref),
            };
            Some((role.party(target), typed_data_hash(&domain, &struct_hash), authorization.clone()))
        }
        _ => None,
    }
}

/// How a report names a wallet-code operation's party, and the two errors
/// the verifier reverts the batch with when the party's account has no code
/// and when its code refuses the operation.
fn wallet_code_terms(op: &KernelOp) -> (&'static str, &'static str, &'static str) {
    match op {
        KernelOp::AttestByWalletCode { role: figaro_kernel::types::AttesterRole::Seller, .. } => {
            ("seller", "AttesterHasNoCode", "WalletCodeAttestationRefused")
        }
        KernelOp::AttestByWalletCode { .. } => ("buyer", "AttesterHasNoCode", "WalletCodeAttestationRefused"),
        _ => ("buyer", "BuyerHasNoCode", "WalletCodeAuthorizationRefused"),
    }
}

/// Ask a wallet-code operation's party code, as the verifier will: the
/// buyer's for a resolve, the role's party's for an attestation. The outer
/// `Err` is a read failure (the chain could not be asked); the inner `Err`
/// is a verdict: the account has no code, or its code does not answer with
/// the magic value under the gas this relay plans. Any other op passes.
pub async fn check_wallet_code(gate: &FundingGate, op: &KernelOp) -> Result<Result<(), String>, String> {
    if !matches!(op, KernelOp::ResolveByWalletCode { .. } | KernelOp::AttestByWalletCode { .. }) {
        return Ok(Ok(()));
    }
    let (party, no_code, refused) = wallet_code_terms(op);
    let url = gate.rpc_url.parse().map_err(|e| format!("invalid RPC_URL: {e}"))?;
    let provider = ProviderBuilder::new().connect_http(url);
    let Some((buyer, digest, authorization)) = wallet_code_question(gate.chain_id, gate.verifier, op) else {
        return Ok(Err("a wallet-code resolve listing no order, or whose payments overflow".to_string()));
    };
    let code = provider
        .get_code_at(buyer)
        .await
        .map_err(|e| format!("code read of {buyer} failed: {}", without_urls(&e.to_string())))?;
    if code.is_empty() {
        return Ok(Err(format!(
            "{party} {buyer} has no account code to validate a wallet-code operation — the verifier would revert the batch ({no_code})"
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
            "{party} {buyer}'s code answered {other} for digest {digest}, not the ERC-1271 magic value — the verifier would revert the batch ({refused})"
        ))),
        Err(e) if is_deterministic_send_error(&e.to_string()) => Ok(Err(format!(
            "{party} {buyer}'s code reverted for digest {digest} under {} gas — the verifier would revert the batch ({refused})",
            crate::gas::WALLET_CODE_EXECUTION_GAS
        ))),
        Err(e) => Err(format!("isValidSignature read of {buyer} failed: {}", without_urls(&e.to_string()))),
    }
}

/// Drop every wallet-code operation whose party's code does not validate it,
/// against the latest block, before proving: such a resolve or attestation
/// reverts the whole batch on chain. A read failure drops conservatively
/// (`WALLET_CODE_UNREAD`); a dropped operation is re-submittable. `None` (no
/// verifier configured — a prove-only dry run) passes everything through.
pub async fn filter_wallet_code_ops(
    gate: Option<&FundingGate>,
    pending: Vec<PendingOp>,
) -> (Vec<PendingOp>, Vec<(PendingOp, String)>) {
    let Some(gate) = gate else {
        return (pending, Vec::new());
    };
    let mut valid = Vec::with_capacity(pending.len());
    let mut dropped = Vec::new();
    for op in pending {
        match check_wallet_code(gate, &op.op).await {
            Ok(Ok(())) => valid.push(op),
            Ok(Err(refused)) => dropped.push((op, refused)),
            Err(read) => dropped.push((op, format!("{WALLET_CODE_UNREAD}, dropped conservatively: {read}"))),
        }
    }
    (valid, dropped)
}

/// The prefix of a drop whose party's code could not be asked: a read
/// failure, never a verdict.
pub const WALLET_CODE_UNREAD: &str = "the party's code could not be asked";

/// The party a wallet-code operation names: a resolve's listed orders'
/// buyer, an attestation's role's party. `None` for every other op.
pub fn wallet_code_party(op: &KernelOp) -> Option<Address> {
    match op {
        KernelOp::ResolveByWalletCode { commitments, .. } => commitments.first().map(|c| c.buyer),
        KernelOp::AttestByWalletCode { role, target, .. } => Some(role.party(target)),
        _ => None,
    }
}

/// What the deterministic-revert arm does with a batch the chain refused, from
/// what its re-reads named: the operations it dead-letters, each with its
/// reason and, for an address the adversarial signal counts, that address;
/// the operations it re-queues; and, when no one was named and no operation
/// is a wallet-code one, the operations it isolates by splitting
/// (`Mempool::isolate`), within the split budget none dead-lettered for a
/// revert it may not have caused. What it re-queues or isolates keeps the
/// batch's order.
#[derive(Debug, Default)]
pub struct RevertVerdict {
    pub dead: Vec<(PendingOp, String, Option<Address>)>,
    pub requeue: Vec<PendingOp>,
    pub isolate: Vec<PendingOp>,
}

impl RevertVerdict {
    /// Whether the re-reads or the re-ask named anyone: a revoker, a party
    /// whose code refused, or a wallet-code operation's party. Nobody named
    /// leaves the batch's operations, if any, to the isolation.
    pub fn named(&self) -> bool {
        !self.dead.is_empty() || !self.requeue.is_empty()
    }

    /// Why the refused batch's usage claims are dropped: the chain's refusal
    /// when nobody was named, a batch of claims alone included; else the
    /// named cause.
    pub fn claims_reason(&self, named_revoker: bool, refusal: &str) -> String {
        if !self.named() {
            return refusal.to_string();
        }
        if named_revoker {
            "the batch was refused for a revoked approval".to_string()
        } else {
            "the batch was refused by a party's wallet code".to_string()
        }
    }
}

/// Decide the refused batch's fate. `order` is the batch's keys in its
/// execution order, `still` what the re-reads did not name, `revoked` the operations of a verified revoker, `unverifiable` those
/// whose funding could not be read, `code_refused` the wallet-code
/// operations whose party's code refused at the re-ask.
///
/// A named party's operations are dead-lettered and the rest re-queued. When
/// nobody is named and the batch carries a wallet-code operation, those
/// operations are dead-lettered alone: a wallet's code can answer yes to every
/// eth_call and no in the transaction (branching on `tx.origin`, `gasleft()`,
/// a block field or its own balance) at no cost and with no state change,
/// which reverts a batch through a wallet-code resolve or a wallet-code
/// attestation alike. The re-ask names nobody, and
/// dead-lettering the whole batch would let the wallet sink every co-batched
/// party's operations again with fresh bytes. Its party is counted by the
/// adversarial signal. A batch with no wallet-code operation goes to the
/// isolation whole, the unread wallets' operations with it: nothing named
/// any of them.
pub fn classify_deterministic_revert(
    order: &[B256],
    still: Vec<PendingOp>,
    revoked: Vec<(PendingOp, String, Address)>,
    unverifiable: Vec<PendingOp>,
    code_refused: Vec<(PendingOp, String)>,
) -> RevertVerdict {
    let mut verdict = classify_unordered(still, revoked, unverifiable, code_refused);
    // An unread wallet's operations were split off the rest; put everything
    // back in the batch's order, so a half never holds an operation ahead of
    // one it was built on.
    let at = |p: &PendingOp| order.iter().position(|k| *k == p.key).unwrap_or(usize::MAX);
    verdict.requeue.sort_by_key(at);
    verdict.isolate.sort_by_key(at);
    verdict
}

fn classify_unordered(
    still: Vec<PendingOp>,
    revoked: Vec<(PendingOp, String, Address)>,
    unverifiable: Vec<PendingOp>,
    code_refused: Vec<(PendingOp, String)>,
) -> RevertVerdict {
    let mut verdict = RevertVerdict::default();
    if revoked.is_empty() && code_refused.is_empty() {
        if still.iter().any(|p| wallet_code_party(&p.op).is_some()) {
            let (by_code, rest): (Vec<_>, Vec<_>) =
                still.into_iter().partition(|p| wallet_code_party(&p.op).is_some());
            for op in by_code {
                let party = wallet_code_party(&op.op);
                verdict.dead.push((
                    op,
                    "the batch was refused on chain and nobody was named; a wallet-code operation's party code may answer the relay's check otherwise than the transaction, or burn the gas the verifier forwards it — dead-lettered, re-submittable".to_string(),
                    party,
                ));
            }
            verdict.requeue = rest.into_iter().chain(unverifiable).collect();
            return verdict;
        }
        verdict.isolate = still.into_iter().chain(unverifiable).collect();
        return verdict;
    }
    for (op, why, who) in revoked {
        verdict.dead.push((op, format!("revoked after the funding check: {why}"), Some(who)));
    }
    for (op, why) in code_refused {
        let party = wallet_code_party(&op.op);
        verdict.dead.push((op, format!("refused by the party's code after the check: {why}"), party));
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
        .map_err(|e| format!("latest block read failed: {}", without_urls(&e.to_string())))?
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

// The UsageCounter facts a batch's uses must agree with: the open period, and
// whether a process is already counted under a key.
// All are re-checked by the counter at resolution, so reading them here is an
// optimization (don't prove what the counter would not count), never a
// source of authority.
sol! {
    #[sol(rpc)]
    interface IUsageCounter {
        function currentPeriod() external view returns (uint8);
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
    /// The chain id the RPC answered at startup (`read_chain_id`).
    pub chain_id: u64,
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

/// Read the accrual period a batch must commit to. The provenance leaf's key
/// is the guest's own constant (`kernel::PROVENANCE_LEAF_KEY`), never read.
///
/// Returns `None` when there is no counter configured, or when accrual has
/// CLOSED (`currentPeriod()` reverts `AccrualClosed` after the last period).
/// A closed reward is not an error: trade goes on, it simply stops being
/// credited, and the batch resolves with an empty accrual.
pub async fn read_usage_context(
    rpc_url: &str,
    usage_counter: Address,
) -> Option<u8> {
    if usage_counter == Address::ZERO {
        return None;
    }
    let provider = ProviderBuilder::new().connect_http(rpc_url.parse().ok()?);
    let contract = IUsageCounter::new(usage_counter, &provider);
    contract.currentPeriod().call().await.ok()
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
    let domain = figaro_kernel::eip712::domain_separator(config.chain_id, config.verifier_address);

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
                        Err(e) => return Err(format!("clause depositOf read failed: {}", without_urls(&e.to_string()))),
                    }
                }
                UsageClaimKind::Assembly { .. } => {
                    match assemblies.bindings(claim.clause_or_assembly).call().await {
                        Ok(b) => {
                            b.registeredBy != Address::ZERO && b.registeredAt != 0 && !b.depositWithdrawn
                        }
                        Err(e) => return Err(format!("assembly bindings read failed: {}", without_urls(&e.to_string()))),
                    }
                }
                UsageClaimKind::Agreement { .. } => {
                    match agreements.bindings(claim.clause_or_assembly).call().await {
                        Ok(b) => {
                            b.registeredBy != Address::ZERO && b.registeredAt != 0 && !b.depositWithdrawn
                        }
                        Err(e) => return Err(format!("agreement bindings read failed: {}", without_urls(&e.to_string()))),
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
                Err(e) => return Err(format!("member registered read failed: {}", without_urls(&e.to_string()))),
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
                Err(e) => Err(format!("counter processCounted read failed: {}", without_urls(&e.to_string()))),
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

/// Submit a proved batch to the on-chain FigaroBatchVerifier, its gas limit
/// the node's estimate with headroom, capped at `gas_ceiling`, the budget the
/// batch was planned against (`gas::settle_gas_limit`). An estimate above
/// `gas_ceiling` is refused before anything is sent, as a deterministic
/// refusal: a party's wallet code can answer the relay's check within
/// `WALLET_CODE_EXECUTION_GAS` and burn far more in the node's estimate, and a
/// limit set at that estimate would have the relay pay past its plan, or,
/// above the most the node takes for one transaction, be refused at the send
/// with an error that is not a revert and read as transient.
pub async fn submit_batch(
    config: &SubmitterConfig,
    result: &ProveResult,
    gas_ceiling: u64,
) -> Result<alloy::primitives::B256, SettleError> {
    let transient = |message: String| SettleError { message, deterministic: false };
    // Build provider with signer
    let signer: PrivateKeySigner = config
        .private_key
        .parse()
        .map_err(|e| transient(format!("invalid private key: {e}")))?;
    let from = signer.address();
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
        settle_call_args(&result.positions, &result.events);

    let contract = IFigaroBatchVerifier::new(config.verifier_address, &provider);

    let tx = contract.settleBatch(
        Bytes::from(result.proof_bytes.clone()),
        Bytes::from(result.public_values_bytes.clone()),
        positions,
        events_call,
        usage_call,
        Bytes::from(result.operations_bytes.clone()),
    );

    // A send-path revert is the chain's evaluated refusal (the node
    // simulates before accepting) — deterministic, never retried.
    let refused = |e: String| {
        let msg = format!("tx submission failed: {}", without_urls(&e));
        eprintln!("SUBMIT_ERROR: {msg}");
        SettleError { deterministic: is_deterministic_send_error(&msg), message: msg }
    };
    let tx = tx.from(from);
    let estimate = tx.estimate_gas().await.map_err(|e| refused(e.to_string()))?;
    if estimate > gas_ceiling {
        let msg = format!(
            "tx submission refused: the node's estimate of {estimate} gas exceeds the planned ceiling of {gas_ceiling}"
        );
        eprintln!("SUBMIT_ERROR: {msg}");
        return Err(SettleError { message: msg, deterministic: true });
    }
    let tx = tx.gas(crate::gas::settle_gas_limit(estimate, gas_ceiling));

    info!(verifier = ?config.verifier_address, %estimate, "Submitting settleBatch transaction");

    let pending = match tx.send().await {
        Ok(p) => p,
        Err(e) => return Err(refused(e.to_string())),
    };

    let receipt = match pending.get_receipt().await {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("tx confirmation failed: {}", without_urls(&e.to_string()));
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
    // The clause keys the proof committed — the verifier checks each key is
    // registered.
    let spec_bindings = events
        .spec_bindings
        .iter()
        .map(|b| IFigaroBatchVerifier::SpecBindingCall { clauseId: b.clause_id })
        .collect();
    let events_call = IFigaroBatchVerifier::BatchEventDataCall {
        attestations,
        specBindings: spec_bindings,
    };
    // The uses the proof committed. An empty array is normal and resolves
    // fine — the counter treats it as a no-op, which is what lets trade keep
    // resolving after the reward's last period ends. The provenance leaf's
    // key is the one the guest committed in the usage hash, its own constant.
    let usage_call = IFigaroBatchVerifier::BatchUsageDataCall {
        period: events.usage_period,
        provenanceLeaf: figaro_kernel::kernel::PROVENANCE_LEAF_KEY,
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
    public_values: &[u8],
    proof_len: usize,
    operations: &[u8],
) -> Vec<u8> {
    use alloy::sol_types::SolCall;
    let (positions, events, usage) = settle_call_args(positions, events);
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
        .map_err(|e| format!("latest block read failed: {}", without_urls(&e.to_string())))?
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
        .map_err(|e| format!("stateRoot() call failed: {}", without_urls(&e.to_string())))?;

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
        .map_err(|e| format!("programVKey() call failed: {}", without_urls(&e.to_string())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{B256, U256};
    use figaro_kernel::types::Commitment;

    /// The key a provider URL carries never reaches a log line or `/status`:
    /// every RPC error text this module formats passes through the one URL
    /// helper (`api::without_urls`), and the send path's message, the one
    /// logged at every failed batch, keeps its prefix and loses the URL whole.
    #[test]
    fn rpc_error_texts_carry_no_url() {
        let e = "error sending request for url (https://eth-sepolia.g.alchemy.com/v2/SECRETKEY): connection refused";
        let msg = format!("tx submission failed: {}", without_urls(e));
        assert_eq!(msg, "tx submission failed: error sending request for url (<url>): connection refused");
        assert!(is_deterministic_send_error(&msg) == is_deterministic_send_error(e), "the classification is the same on both texts");
        for text in [
            "[https://h.example/v2/SECRETKEY] next",
            "`https://h.example/v2/SECRETKEY` next",
            "https://h.example/v2/SECRETKEY: refused",
            "https://h.example/x?apikey=SECRETKEY refused",
            "https://user:SECRETKEY@h.example/x refused",
            "HTTPS://h.example/v2/SECRETKEY refused",
        ] {
            let out = without_urls(text);
            assert!(!out.contains("SECRETKEY"), "{text:?} → {out:?}");
            assert!(out.contains("<url>"), "{text:?} → {out:?}");
        }
        assert_eq!(without_urls("no url here"), "no url here");
    }

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

    /// The chain id has one source, the RPC: an unreachable RPC is an error (the relay refuses to
    /// start), never a default chain.
    #[tokio::test]
    async fn the_chain_id_is_read_from_the_rpc_and_never_defaulted() {
        let err = read_chain_id("http://127.0.0.1:1").await.unwrap_err();
        assert!(err.starts_with("chain id read failed"), "{err}");
        let err = read_chain_id("not a url").await.unwrap_err();
        assert!(err.starts_with("invalid RPC_URL"), "{err}");
    }

    /// With a verifier configured but the chain unreachable, a commit is
    /// dropped conservatively — never proved against unverified funding —
    /// and the reason says so; a non-commit op is not a funding question.
    #[tokio::test]
    async fn funding_filter_drops_a_commit_it_cannot_verify() {
        let gate = FundingGate {
            rpc_url: "http://127.0.0.1:1".to_string(),
            verifier: Address::repeat_byte(0x02),
            chain_id: 31337,
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
            chain_id: 31337,
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
    /// (registry, key) pairs in `live`, every member is staked but those in
    /// `unstaked`, the counter has counted a process under exactly the keys
    /// in `counted`, and anything else is an unregistered binding. Returns
    /// the URL it serves on.
    async fn registries_double(live: Vec<(Address, B256)>, counted: Vec<B256>, unstaked: Vec<Address>) -> String {
        use crate::rpc_double::{call_of, hex_value, serve, unserved};
        use alloy::sol_types::{SolCall, SolValue};

        serve(move |method, params| match method {
            "eth_chainId" => Ok(serde_json::json!("0x7a69")),
            "eth_blockNumber" => Ok(serde_json::json!("0x1")),
            "eth_call" => {
                let (to, input) = call_of(params);
                let out: Vec<u8> = if input[..4] == IMembersRegistry::registeredCall::SELECTOR {
                    assert_eq!(to, MEMBERS, "the stake is the members registry's");
                    let member = Address::from_slice(&input[16..36]);
                    (!unstaked.contains(&member)).abi_encode()
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
                Ok(hex_value(&out))
            }
            other => unserved(other),
        })
        .await
        .url
    }

    fn live_config(rpc_url: String) -> SubmitterConfig {
        SubmitterConfig {
            chain_id: 31337,
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
        ], vec![], vec![])
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
        let url = registries_double(vec![(AGREEMENTS, fresh), (AGREEMENTS, counted)], vec![counted], vec![]).await;
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

    // A claim whose order's seller holds no live member stake is dropped: the
    // counter skips a use whose seller is not `registered`, and the read goes
    // to the members registry under the order's seller (E-7's pre-filter).
    #[tokio::test]
    async fn a_claim_whose_seller_is_unstaked_is_dropped() {
        let key = B256::repeat_byte(0x41);
        let unstaked = Address::repeat_byte(0x5E);
        let url = registries_double(vec![(AGREEMENTS, key)], vec![], vec![unstaked]).await;
        let config = live_config(url);
        let staked_claim = agreement_claim(key);
        let mut unstaked_claim = agreement_claim(key);
        unstaked_claim.order.seller = unstaked;

        let (valid, dropped) = filter_usage_claims(&config, vec![staked_claim.clone(), unstaked_claim]).await;

        assert_eq!(valid.len(), 1, "the staked seller's claim passes");
        assert_eq!(valid[0].order.seller, staked_claim.order.seller);
        assert_eq!(dropped.len(), 1, "the unstaked seller's claim is dropped");
        assert_eq!(dropped[0].0.order.seller, unstaked);
        assert!(dropped[0].1.contains("not live-staked"), "{}", dropped[0].1);
    }

    // ── Wallet-code resolves, against a chain double ──────────────────

    const VERIFIER: Address = Address::repeat_byte(0x77);

    /// What a buyer's account answers in the wallet-code double.
    #[derive(Clone, Copy)]
    enum WalletCode {
        Absent,
        Magic,
        Other,
        Reverts,
    }

    /// A JSON-RPC double holding each listed buyer's account: its code
    /// (`eth_getCode`) and what that code answers to `isValidSignature`.
    async fn wallet_code_double(accounts: Vec<(Address, WalletCode)>) -> crate::rpc_double::RpcDouble {
        use crate::rpc_double::{call_of, hex_value, reverted, serve, unserved};
        use alloy::sol_types::SolCall;
        let held = move |who: Address| accounts.iter().find(|(a, _)| *a == who).map(|(_, c)| *c).unwrap_or(WalletCode::Absent);
        serve(move |method, params| match method {
            "eth_chainId" => Ok(serde_json::json!("0x7a69")),
            "eth_getCode" => {
                let who: Address = params[0].as_str().unwrap().parse().unwrap();
                Ok(match held(who) {
                    WalletCode::Absent => serde_json::json!("0x"),
                    _ => serde_json::json!("0x6001600055"),
                })
            }
            "eth_call" => {
                let (to, input) = call_of(params);
                assert_eq!(input[..4], IERC1271WalletCode::isValidSignatureCall::SELECTOR);
                let mut word = [0u8; 32];
                match held(to) {
                    WalletCode::Magic => word[..4].copy_from_slice(&ERC1271_MAGIC_VALUE),
                    WalletCode::Other => word[..4].copy_from_slice(&[0xff, 0xff, 0xff, 0xff]),
                    WalletCode::Reverts | WalletCode::Absent => return reverted(),
                }
                Ok(hex_value(&word))
            }
            other => unserved(other),
        })
        .await
    }

    /// A wallet-code resolve of the canonical order, its buyer set to `buyer`.
    fn wallet_code_resolve(buyer: Address) -> KernelOp {
        let KernelOp::Commit { commitment: mut order, .. } = figaro_prove_test::build_canonical_batch_input().operations[0].clone() else {
            panic!("the canonical batch opens with a commit");
        };
        order.buyer = buyer;
        KernelOp::ResolveByWalletCode {
            process_id: order.process_id,
            cumulative_value: order.payment,
            commitments: vec![order],
            authorization: Bytes::from_static(b"guardian-approval"),
        }
    }

    fn pending(id: u64, op: KernelOp) -> PendingOp {
        PendingOp { id, key: B256::with_last_byte(id as u8), op, deferred_since: None, behind: Vec::new() }
    }

    fn gate(rpc_url: String) -> FundingGate {
        FundingGate { rpc_url, verifier: VERIFIER, chain_id: 31337 }
    }

    // The relay asks the buyer's code the verifier's question, from the
    // verifier's address, under the gas it plans for the wallet's code, and
    // admits the resolve only on the ERC-1271 magic value.
    #[tokio::test]
    async fn a_wallet_code_resolve_passes_only_on_the_magic_value() {
        let (yes, other, reverts, codeless) =
            (Address::repeat_byte(0xA1), Address::repeat_byte(0xA2), Address::repeat_byte(0xA3), Address::repeat_byte(0xA4));
        let double = wallet_code_double(vec![
            (yes, WalletCode::Magic),
            (other, WalletCode::Other),
            (reverts, WalletCode::Reverts),
        ])
        .await;
        let gate = gate(double.url.clone());

        let op = wallet_code_resolve(yes);
        assert_eq!(check_wallet_code(&gate, &op).await, Ok(Ok(())));
        let asked = double.calls_to("eth_call");
        assert_eq!(asked.len(), 1);
        let (_, digest, bytes) = wallet_code_question(31337, VERIFIER, &op).unwrap();
        let (to, input) = crate::rpc_double::call_of(&asked[0]);
        assert_eq!(to, yes, "the buyer's own account is asked");
        assert_eq!(&input[4..36], digest.as_slice(), "the digest is the verifier's");
        assert!(input.windows(bytes.len()).any(|w| w == bytes.as_ref()), "the resolve's bytes are passed");
        assert_eq!(asked[0][0]["from"].as_str().unwrap().parse::<Address>().unwrap(), VERIFIER, "asked from the verifier");
        assert_eq!(
            u64::from_str_radix(asked[0][0]["gas"].as_str().unwrap().trim_start_matches("0x"), 16).unwrap(),
            crate::gas::WALLET_CODE_EXECUTION_GAS,
            "under the gas the relay plans"
        );

        let refused = check_wallet_code(&gate, &wallet_code_resolve(other)).await.unwrap().unwrap_err();
        assert!(refused.contains("not the ERC-1271 magic value"), "{refused}");
        let refused = check_wallet_code(&gate, &wallet_code_resolve(reverts)).await.unwrap().unwrap_err();
        assert!(refused.contains("reverted"), "{refused}");
        let refused = check_wallet_code(&gate, &wallet_code_resolve(codeless)).await.unwrap().unwrap_err();
        assert!(refused.contains("BuyerHasNoCode"), "{refused}");
    }

    // An op of any other form is no wallet-code question: it passes without
    // a read (the RPC here is unreachable). A chain that cannot be asked is a
    // read failure, never a verdict, and its text carries no URL.
    #[tokio::test]
    async fn a_wallet_code_check_reads_only_for_its_form_and_its_errors_carry_no_url() {
        let gate = gate("http://127.0.0.1:1/v2/SECRETKEY".to_string());
        let commit = figaro_prove_test::build_canonical_batch_input().operations[0].clone();
        assert_eq!(check_wallet_code(&gate, &commit).await, Ok(Ok(())));
        let err = check_wallet_code(&gate, &wallet_code_resolve(Address::repeat_byte(0xA1))).await.unwrap_err();
        assert!(err.starts_with("code read of"), "{err}");
        assert!(!err.contains("SECRETKEY") && !err.contains("127.0.0.1"), "{err}");
    }

    // The batch filter keeps a validated resolve and every other op, drops a
    // refused one with its verdict and an unaskable one conservatively, and
    // with no verifier configured passes everything through.
    #[tokio::test]
    async fn the_wallet_code_filter_drops_what_the_buyers_code_refuses() {
        let (yes, no) = (Address::repeat_byte(0xB1), Address::repeat_byte(0xB2));
        let double = wallet_code_double(vec![(yes, WalletCode::Magic), (no, WalletCode::Other)]).await;
        let commit = figaro_prove_test::build_canonical_batch_input().operations[0].clone();
        let ops = || vec![pending(1, wallet_code_resolve(yes)), pending(2, wallet_code_resolve(no)), pending(3, commit.clone())];

        let (valid, dropped) = filter_wallet_code_ops(Some(&gate(double.url.clone())), ops()).await;
        assert_eq!(valid.iter().map(|p| p.id).collect::<Vec<_>>(), vec![1, 3]);
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].0.id, 2);
        assert!(dropped[0].1.contains("WalletCodeAuthorizationRefused"), "{}", dropped[0].1);

        let (valid, dropped) = filter_wallet_code_ops(Some(&gate("http://127.0.0.1:1".to_string())), ops()).await;
        assert_eq!(valid.iter().map(|p| p.id).collect::<Vec<_>>(), vec![3]);
        assert_eq!(dropped.len(), 2);
        for (_, why) in &dropped {
            assert!(why.contains("dropped conservatively"), "{why}");
        }

        let (valid, dropped) = filter_wallet_code_ops(None, ops()).await;
        assert_eq!(valid.len(), 3);
        assert!(dropped.is_empty());
    }

    /// The canonical seller attestation in the wallet-code form, its seller
    /// set to `seller`.
    fn wallet_code_attestation(seller: Address) -> KernelOp {
        let KernelOp::AttestAsSeller { mut target, clause_id, stage, content_ref, proof, .. } =
            figaro_prove_test::build_canonical_batch_input().operations[1].clone()
        else {
            panic!("the canonical batch's second op is the seller's attestation");
        };
        target.seller = seller;
        KernelOp::AttestByWalletCode {
            role: figaro_kernel::types::AttesterRole::Seller,
            target,
            clause_id,
            stage,
            content_ref,
            authorization: Bytes::from_static(b"session-key-approval"),
            proof,
        }
    }

    // The door and the formation ask the attesting party's code the
    // verifier's question: a refusal reverts the whole batch on chain, so an
    // attestation the code refuses never reaches proving.
    #[tokio::test]
    async fn a_wallet_code_attestation_passes_the_door_and_the_formation_only_on_the_magic_value() {
        let (yes, other, codeless) = (Address::repeat_byte(0xC1), Address::repeat_byte(0xC2), Address::repeat_byte(0xC4));
        let double = wallet_code_double(vec![(yes, WalletCode::Magic), (other, WalletCode::Other)]).await;
        let gate = gate(double.url.clone());

        let op = wallet_code_attestation(yes);
        assert_eq!(check_wallet_code(&gate, &op).await, Ok(Ok(())));
        let asked = double.calls_to("eth_call");
        let (_, digest, _) = wallet_code_question(31337, VERIFIER, &op).unwrap();
        let (to, input) = crate::rpc_double::call_of(&asked[0]);
        assert_eq!(to, yes, "the seller's own account is asked");
        assert_eq!(&input[4..36], digest.as_slice(), "the digest is the verifier's");

        let refused = check_wallet_code(&gate, &wallet_code_attestation(other)).await.unwrap().unwrap_err();
        assert!(refused.contains("seller") && refused.contains("WalletCodeAttestationRefused"), "{refused}");
        let refused = check_wallet_code(&gate, &wallet_code_attestation(codeless)).await.unwrap().unwrap_err();
        assert!(refused.contains("no account code") && refused.contains("AttesterHasNoCode"), "{refused}");

        let ops = vec![pending(1, wallet_code_attestation(yes)), pending(2, wallet_code_attestation(other))];
        let (valid, dropped) = filter_wallet_code_ops(Some(&gate), ops).await;
        assert_eq!(valid.iter().map(|p| p.id).collect::<Vec<_>>(), vec![1]);
        assert_eq!(dropped.iter().map(|(p, _)| p.id).collect::<Vec<_>>(), vec![2]);
    }

    // ── The chain write: `submit_batch` against a chain double ────────

    const SIGNING_KEY: &str = "0x1111111111111111111111111111111111111111111111111111111111111111";

    /// How the submit double's chain treats the transaction.
    #[derive(Clone, Copy)]
    enum Chain {
        Lands,
        MinedReverted,
        RefusesAtEstimate,
    }

    /// A JSON-RPC double for a signed send: it fills nonce, gas and the
    /// EIP-1559 price, takes the raw transaction, and answers its receipt
    /// with the status `chain` names.
    async fn submit_double(chain: Chain) -> crate::rpc_double::RpcDouble {
        use crate::rpc_double::{reverted, serve, unserved};
        serve(move |method, params| match method {
            "eth_chainId" => Ok(serde_json::json!("0x7a69")),
            "eth_getTransactionCount" => Ok(serde_json::json!("0x0")),
            "eth_estimateGas" => match chain {
                Chain::RefusesAtEstimate => reverted(),
                _ => Ok(serde_json::json!("0x100000")),
            },
            "eth_feeHistory" => Ok(serde_json::json!({
                "oldestBlock": "0x1",
                "baseFeePerGas": ["0x3b9aca00", "0x3b9aca00"],
                "gasUsedRatio": [0.5],
                "reward": [["0x1"]],
            })),
            "eth_sendRawTransaction" => {
                let raw = alloy::primitives::hex::decode(params[0].as_str().unwrap()).unwrap();
                Ok(serde_json::json!(alloy::primitives::keccak256(&raw)))
            }
            "eth_getTransactionReceipt" => Ok(serde_json::json!({
                "transactionHash": params[0],
                "transactionIndex": "0x0",
                "blockHash": B256::repeat_byte(0x0b),
                "blockNumber": "0x2",
                "from": Address::repeat_byte(0x0f),
                "to": VERIFIER,
                "cumulativeGasUsed": "0x5208",
                "gasUsed": "0x5208",
                "effectiveGasPrice": "0x3b9aca01",
                "contractAddress": null,
                "logs": [],
                "logsBloom": format!("0x{}", "00".repeat(256)),
                "type": "0x2",
                "status": match chain { Chain::MinedReverted => "0x0", _ => "0x1" },
            })),
            "eth_blockNumber" => Ok(serde_json::json!("0x2")),
            other => unserved(other),
        })
        .await
    }

    fn submit_config(rpc_url: String) -> SubmitterConfig {
        SubmitterConfig { verifier_address: VERIFIER, private_key: SIGNING_KEY.to_string(), ..live_config(rpc_url) }
    }

    /// The canonical batch, executed, as the prover hands it to the submitter.
    fn proved_canonical_batch() -> ProveResult {
        let input = figaro_prove_test::build_canonical_batch_input();
        let (pv, positions, events, post_state) =
            figaro_kernel::kernel::apply_batch_with_state(&input).expect("the canonical batch applies");
        ProveResult {
            public_values_bytes: pv.abi_encode(),
            public_values: pv,
            positions,
            events,
            proof_bytes: vec![0xAB; 7],
            operations_bytes: figaro_kernel::operation_stream::encode_operation_stream(&input.operations, &input.usage_claims),
            post_state,
        }
    }

    // The relay's one chain write: a transaction signed by the relay's key,
    // to the verifier, on the RPC's chain, carrying `settleBatch` with the
    // proof, the public values, the positions, the uses and the operation
    // stream the prover handed over; its hash is the one returned.
    #[tokio::test]
    async fn the_batch_is_sent_signed_to_the_verifier_with_the_proved_arguments() {
        use alloy::consensus::transaction::SignerRecoverable;
        use alloy::consensus::{Transaction, TxEnvelope};
        use alloy::eips::eip2718::Decodable2718;
        use alloy::sol_types::SolCall;

        let double = submit_double(Chain::Lands).await;
        let result = proved_canonical_batch();
        let hash = submit_batch(&submit_config(double.url.clone()), &result, u64::MAX).await.expect("the batch lands");

        let sent = double.calls_to("eth_sendRawTransaction");
        assert_eq!(sent.len(), 1, "one transaction is sent");
        let raw = alloy::primitives::hex::decode(sent[0][0].as_str().unwrap()).unwrap();
        assert_eq!(hash, alloy::primitives::keccak256(&raw), "the returned hash is the sent transaction's");
        let tx = TxEnvelope::decode_2718(&mut raw.as_slice()).expect("a signed transaction");
        let relay: PrivateKeySigner = SIGNING_KEY.parse().unwrap();
        assert_eq!(tx.recover_signer().unwrap(), relay.address(), "signed by the relay's key");
        assert_eq!(tx.to(), Some(VERIFIER), "sent to the verifier");
        assert_eq!(tx.chain_id(), Some(31337), "on the RPC's chain");
        let call = IFigaroBatchVerifier::settleBatchCall::abi_decode(tx.input()).expect("a settleBatch call");
        assert_eq!(call.proof.as_ref(), result.proof_bytes.as_slice());
        assert_eq!(call.publicValues.as_ref(), result.public_values_bytes.as_slice());
        assert_eq!(call.operations.as_ref(), result.operations_bytes.as_slice());
        assert_eq!(
            call.positions.iter().map(|p| (p.token, p.user, p.deposit, p.payout)).collect::<Vec<_>>(),
            result.positions.iter().map(|p| (p.token, p.user, p.deposit, p.payout)).collect::<Vec<_>>()
        );
        assert_eq!(call.events.attestations.len(), result.events.attestations.len());
        assert_eq!(call.usage.provenanceLeaf, figaro_kernel::kernel::PROVENANCE_LEAF_KEY);
        assert_eq!(call.usage.uses.len(), result.events.uses.len());
    }

    // A transaction mined but reverted is a deterministic failure, never a
    // success: the chain's root did not move, so the mirror must not advance.
    #[tokio::test]
    async fn a_mined_but_reverted_batch_is_a_deterministic_failure() {
        let double = submit_double(Chain::MinedReverted).await;
        let err = submit_batch(&submit_config(double.url.clone()), &proved_canonical_batch(), u64::MAX).await.unwrap_err();
        assert!(err.deterministic, "{}", err.message);
        assert!(err.message.contains("REVERTED"), "{}", err.message);
    }

    // A revert at the send path is the chain's evaluated refusal:
    // deterministic, and nothing is sent. Transport trouble is transient.
    // Neither text carries the RPC's URL.
    #[tokio::test]
    async fn a_send_path_revert_is_deterministic_and_transport_trouble_is_not() {
        let double = submit_double(Chain::RefusesAtEstimate).await;
        let err = submit_batch(&submit_config(double.url.clone()), &proved_canonical_batch(), u64::MAX).await.unwrap_err();
        assert!(err.deterministic, "{}", err.message);
        assert!(double.calls_to("eth_sendRawTransaction").is_empty(), "nothing is sent");
        assert!(!err.message.contains(&double.url), "{}", err.message);

        let err = submit_batch(&submit_config("http://127.0.0.1:1/v2/SECRETKEY".to_string()), &proved_canonical_batch(), u64::MAX)
            .await
            .unwrap_err();
        assert!(!err.deterministic, "{}", err.message);
        assert!(err.message.starts_with("tx submission failed"), "{}", err.message);
        assert!(!err.message.contains("SECRETKEY") && !err.message.contains("127.0.0.1"), "{}", err.message);
    }

    // ── A revert that names nobody: isolation by splitting ────────────

    /// A root commit of its own process, the canonical order's with `salt`,
    /// signed by both parties: commits of distinct salts apply together.
    fn signed_root_commit(salt: u64) -> KernelOp {
        use figaro_kernel::eip712::domain_separator;
        use figaro_prove_test::{make_signing_key, sign_commitment, BUYER_KEY, CHAIN_ID, CORE, SELLER1_KEY};
        let KernelOp::Commit { commitment, .. } = figaro_prove_test::build_canonical_batch_input().operations[0].clone() else {
            panic!("the canonical batch opens with a commit")
        };
        let c = Commitment { salt: U256::from(salt), ..commitment };
        let domain = domain_separator(CHAIN_ID, CORE);
        KernelOp::Commit {
            buyer_sig: sign_commitment(&c, &domain, &make_signing_key(BUYER_KEY)),
            seller_sig: sign_commitment(&c, &domain, &make_signing_key(SELLER1_KEY)),
            commitment: c,
        }
    }

    fn salt_of(op: &KernelOp) -> u64 {
        match op {
            KernelOp::Commit { commitment, .. } => commitment.salt.to::<u64>(),
            other => panic!("a commit, got {other:?}"),
        }
    }

    fn landed_receipt(hash: &serde_json::Value, status: bool) -> serde_json::Value {
        serde_json::json!({
            "transactionHash": hash,
            "transactionIndex": "0x0",
            "blockHash": B256::repeat_byte(0x0b),
            "blockNumber": "0x2",
            "from": Address::repeat_byte(0x0f),
            "to": VERIFIER,
            "cumulativeGasUsed": "0x5208",
            "gasUsed": "0x5208",
            "effectiveGasPrice": "0x3b9aca01",
            "contractAddress": null,
            "logs": [],
            "logsBloom": format!("0x{}", "00".repeat(256)),
            "type": "0x2",
            "status": if status { "0x1" } else { "0x0" },
        })
    }

    /// The answers a signed send needs besides the estimate and the receipt.
    fn send_answers(method: &str, params: &serde_json::Value) -> Option<crate::rpc_double::Answer> {
        match method {
            "eth_chainId" => Some(Ok(serde_json::json!("0x7a69"))),
            "eth_getTransactionCount" => Some(Ok(serde_json::json!("0x0"))),
            "eth_feeHistory" => Some(Ok(serde_json::json!({
                "oldestBlock": "0x1",
                "baseFeePerGas": ["0x3b9aca00", "0x3b9aca00"],
                "gasUsedRatio": [0.5],
                "reward": [["0x1"]],
            }))),
            "eth_sendRawTransaction" => {
                let raw = alloy::primitives::hex::decode(params[0].as_str().unwrap()).unwrap();
                Some(Ok(serde_json::json!(alloy::primitives::keccak256(&raw))))
            }
            "eth_blockNumber" => Some(Ok(serde_json::json!("0x2"))),
            _ => None,
        }
    }

    /// A chain double whose verifier refuses, at the estimate and naming
    /// nobody, every `settleBatch` call whose operation stream carries a commit of one of
    /// the `offenders`' salts: an operation that reverts the `settleBatch` call wherever
    /// it rides, for a reason no re-read names. Every other `settleBatch` call lands.
    async fn refusing_double(offenders: Vec<u64>) -> crate::rpc_double::RpcDouble {
        use crate::rpc_double::{reverted, serve, unserved};
        use alloy::sol_types::SolCall;
        serve(move |method, params| match method {
            "eth_estimateGas" => {
                let (_, input) = crate::rpc_double::call_of(params);
                let call = IFigaroBatchVerifier::settleBatchCall::abi_decode(&input).expect("a settleBatch call");
                let (ops, _, _) = figaro_kernel::operation_stream::decode_operation_stream(&call.operations).unwrap();
                if ops.iter().any(|op| offenders.contains(&salt_of(op))) {
                    reverted()
                } else {
                    Ok(serde_json::json!("0x100000"))
                }
            }
            "eth_getTransactionReceipt" => Ok(landed_receipt(&params[0], true)),
            other => send_answers(other, params).unwrap_or_else(|| unserved(other)),
        })
        .await
    }

    /// What the relay's batch loop does with the mempool, the submit and a
    /// refusal, against the double: drain, execute, send; on a deterministic
    /// refusal naming nobody, `classify_deterministic_revert` and
    /// `Mempool::isolate`, as `main.rs` does. Returns the salts landed, the
    /// salts dead-lettered with their reasons, and the number of `settleBatch` calls sent.
    async fn run_until_empty(
        mempool: &crate::mempool::Mempool,
        rpc_url: String,
    ) -> (Vec<u64>, Vec<(u64, String)>, usize) {
        use figaro_kernel::types::BatchInput;
        use figaro_prove_test::{CHAIN_ID, CORE};
        let config = submit_config(rpc_url);
        let mut state = figaro_kernel::state::KernelState::new().to_snapshot();
        let (mut landed, mut dead, mut tries) = (Vec::new(), Vec::new(), 0);
        loop {
            let ops = mempool.drain_up_to(100).await;
            if ops.is_empty() {
                break;
            }
            tries += 1;
            assert!(tries <= 200, "the isolation ends");
            let input = BatchInput {
                chain_id: CHAIN_ID,
                verifying_contract: CORE,
                block_timestamp: 1000,
                operations: ops.iter().map(|p| p.op.clone()).collect(),
                prev_state: state.clone(),
                usage_claims: vec![],
                usage_period: 0,
            };
            let (pv, positions, events, post) =
                figaro_kernel::kernel::apply_batch_with_state(&input).expect("the drained commits apply");
            let result = ProveResult {
                public_values_bytes: pv.abi_encode(),
                public_values: pv,
                positions,
                events,
                proof_bytes: vec![0xAB; 7],
                operations_bytes: figaro_kernel::operation_stream::encode_operation_stream(&input.operations, &[]),
                post_state: post,
            };
            match submit_batch(&config, &result, u64::MAX).await {
                Ok(_) => {
                    landed.extend(ops.iter().map(|p| salt_of(&p.op)));
                    state = result.post_state.to_snapshot();
                }
                Err(e) if e.deterministic => {
                    let order: Vec<B256> = ops.iter().map(|p| p.key).collect();
                    let verdict = classify_deterministic_revert(&order, ops, vec![], vec![], vec![]);
                    assert!(verdict.dead.is_empty() && verdict.requeue.is_empty(), "nobody is named");
                    for (op, why) in mempool.isolate(verdict.isolate).await {
                        dead.push((salt_of(&op.op), why));
                    }
                }
                Err(e) => panic!("transient: {}", e.message),
            }
        }
        landed.sort_unstable();
        dead.sort_unstable_by_key(|(salt, _)| *salt);
        (landed, dead, tries)
    }

    async fn queued(salts: impl IntoIterator<Item = u64>) -> crate::mempool::Mempool {
        let mempool = crate::mempool::Mempool::new(figaro_prove_test::CHAIN_ID, figaro_prove_test::CORE);
        for salt in salts {
            mempool.submit(signed_root_commit(salt)).await.expect("admitted");
        }
        mempool
    }

    // The blind audit's finding: a batch the chain refuses naming nobody
    // was dead-lettered whole, so one operation that reverts sank every
    // honest operation beside it. Every honest operation lands, and the
    // offender alone is dead-lettered, with the reason.
    #[tokio::test]
    async fn an_unnamed_revert_dead_letters_the_offender_alone_and_every_honest_operation_lands() {
        let double = refusing_double(vec![105]).await;
        let mempool = queued(100..110).await;
        let (landed, dead, tries) = run_until_empty(&mempool, double.url.clone()).await;
        assert_eq!(landed, (100..110).filter(|s| *s != 105).collect::<Vec<_>>(), "every honest operation lands");
        assert_eq!(dead.iter().map(|(s, _)| *s).collect::<Vec<_>>(), vec![105], "the offender alone is dead-lettered");
        assert!(dead[0].1.contains("alone"), "{}", dead[0].1);
        // One offender among ten: the batch, then two halves at each of the
        // ⌈log2 10⌉ = 4 levels at most — never more than 9 `settleBatch` calls.
        assert!(tries <= 9, "{tries} settles");
        assert_eq!(mempool.len().await, 0, "nothing is left waiting");
    }

    // Every operation reverts alone: each is dead-lettered alone, with the
    // reason that it reverted alone, none by the split budget, which a batch
    // of four never exhausts.
    #[tokio::test]
    async fn a_batch_whose_every_operation_reverts_dead_letters_each_alone_under_the_cap() {
        let double = refusing_double(vec![1, 2, 3, 4]).await;
        let mempool = queued(1..=4).await;
        let (landed, dead, tries) = run_until_empty(&mempool, double.url.clone()).await;
        assert!(landed.is_empty());
        assert_eq!(dead.iter().map(|(s, _)| *s).collect::<Vec<_>>(), vec![1, 2, 3, 4]);
        for (_, why) in &dead {
            assert!(why.contains("alone") && !why.contains("split budget"), "{why}");
        }
        assert_eq!(tries, 7, "the batch, two halves, four singles");
    }

    // ── The `settleBatch` call's gas headroom ─────────────────────────────────────

    /// A chain double whose `settleBatch` call costs `inclusion` gas when it is mined,
    /// though the node estimates `estimate`: a party's wallet code that costs
    /// more at inclusion than at the estimate. The receipt lands iff the
    /// transaction's gas limit covers the inclusion cost. On chain, below it
    /// the code runs out of gas and the verifier reverts the whole batch,
    /// where a limit that covers the code lets it answer — the verifier's
    /// half, tested on the Forge side
    /// (`FigaroBatchVerifierTest.test_settleBatch_walletCodeAttestation_gasStarvationProbe`).
    /// The node refuses a transaction whose gas limit exceeds `node_cap`,
    /// the most it takes for one transaction (EIP-7825), with an error that
    /// is not a revert.
    async fn rising_cost_double(
        estimate: u64,
        inclusion: u64,
        node_cap: u64,
    ) -> (crate::rpc_double::RpcDouble, std::sync::Arc<std::sync::Mutex<u64>>) {
        use crate::rpc_double::{serve, unserved};
        let sent_limit = std::sync::Arc::new(std::sync::Mutex::new(0u64));
        let seen = sent_limit.clone();
        let double = serve(move |method, params| match method {
            "eth_estimateGas" => Ok(serde_json::json!(format!("0x{estimate:x}"))),
            "eth_sendRawTransaction" => {
                use alloy::consensus::{Transaction, TxEnvelope};
                use alloy::eips::eip2718::Decodable2718;
                let raw = alloy::primitives::hex::decode(params[0].as_str().unwrap()).unwrap();
                let tx = TxEnvelope::decode_2718(&mut raw.as_slice()).unwrap();
                if tx.gas_limit() > node_cap {
                    return Err((-32000, format!("transaction gas limit too high (cap: {node_cap}, tx: {})", tx.gas_limit())));
                }
                *seen.lock().unwrap() = tx.gas_limit();
                Ok(serde_json::json!(alloy::primitives::keccak256(&raw)))
            }
            "eth_getTransactionReceipt" => Ok(landed_receipt(&params[0], *seen.lock().unwrap() >= inclusion)),
            other => send_answers(other, params).unwrap_or_else(|| unserved(other)),
        })
        .await;
        (double, sent_limit)
    }

    // A `settleBatch` call whose wallet code costs an eighth more at inclusion than at
    // the estimate lands: the relay sends it with headroom over the estimate.
    #[tokio::test]
    async fn a_settle_whose_code_cost_rises_after_the_estimate_lands() {
        let estimate = 1_000_000;
        let (double, limit) = rising_cost_double(estimate, estimate + estimate / 8, u64::MAX).await;
        let landed = submit_batch(&submit_config(double.url.clone()), &proved_canonical_batch(), 16_777_216).await;
        assert!(landed.is_ok(), "{:?} under a limit of {}", landed.err(), limit.lock().unwrap());
        assert!(*limit.lock().unwrap() > estimate, "the limit carries headroom over the estimate");
    }

    // The headroom never takes the limit above the ceiling the relay plans
    // the batch against.
    #[tokio::test]
    async fn the_settles_headroom_stops_at_the_planned_ceiling() {
        let estimate = 1_000_000;
        let (double, limit) = rising_cost_double(estimate, estimate, u64::MAX).await;
        submit_batch(&submit_config(double.url.clone()), &proved_canonical_batch(), estimate + 1_000).await.unwrap();
        assert_eq!(*limit.lock().unwrap(), estimate + 1_000, "capped at the ceiling");
    }

    // A party's wallet code can answer the relay's check cheaply and cost
    // far more in the node's estimate. A `settleBatch` call whose estimate
    // exceeds the ceiling the batch was planned against is refused before
    // anything is sent, as a deterministic refusal naming nobody: the relay
    // never pays past its plan, and the refusal goes to the arm that
    // dead-letters the batch's wallet-code operations alone.
    #[tokio::test]
    async fn a_settle_whose_estimate_exceeds_the_planned_ceiling_is_refused_unsent_and_deterministic() {
        let estimate = 1_000_000;
        let (double, _) = rising_cost_double(estimate, estimate, u64::MAX).await;
        let err = submit_batch(&submit_config(double.url.clone()), &proved_canonical_batch(), estimate - 1_000)
            .await
            .unwrap_err();
        assert!(err.deterministic, "{}", err.message);
        assert!(err.message.contains("exceeds the planned ceiling"), "{}", err.message);
        assert!(double.calls_to("eth_sendRawTransaction").is_empty(), "nothing is sent");
    }

    // An estimate above the most the node takes for one transaction is
    // refused the same way, before the send: the node's refusal of the send
    // is not a revert, and would be read as transient, re-queued and
    // re-proved until the re-queue cap dead-lettered every operation beside
    // the wallet's.
    #[tokio::test]
    async fn a_settle_whose_estimate_exceeds_the_transaction_cap_is_refused_unsent_and_deterministic() {
        let cap = crate::gas::DEFAULT_SETTLE_GAS_CAP;
        let estimate = cap + 1_000_000;
        let (double, _) = rising_cost_double(estimate, estimate, cap).await;
        let err = submit_batch(&submit_config(double.url.clone()), &proved_canonical_batch(), cap).await.unwrap_err();
        assert!(err.deterministic, "{}", err.message);
        assert!(double.calls_to("eth_sendRawTransaction").is_empty(), "nothing is sent");
    }
}
