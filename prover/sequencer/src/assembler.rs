/// Batch assembler — drains the mempool and builds a BatchInput for
/// the SP1 prover.
use alloy_primitives::{Address, B256};
use figaro_kernel::kernel::{apply_claims, apply_operations};
use figaro_kernel::state::KernelState;
use figaro_kernel::types::{BatchInput, KernelError, KernelOp, KernelStateSnapshot, UsageClaim};

use crate::mempool::PendingOp;

/// The RPGF context a batch resolves under — the claims to credit, the
/// period they land in, and the provenance leaf's key assembly claims
/// prove against.
///
/// PERIOD AND PROVENANCE ARE CHAIN FACTS, read from `UsageCounter`
/// (`currentPeriod()`, `provenanceLeaf()`), never guessed from a local
/// clock: the counter re-checks both at resolution and rejects the batch
/// on a mismatch. A batch assembled just before a period boundary and
/// resolved just after it must be re-proven for the new period.
#[derive(Clone, Debug, Default)]
pub struct UsageContext {
    pub claims: Vec<UsageClaim>,
    pub period: u8,
    pub provenance_leaf: B256,
}

/// Configuration for batch assembly triggers.
#[derive(Clone, Debug)]
pub struct AssemblerConfig {
    /// Maximum number of operations per batch.
    pub max_ops: usize,
    /// The chain's cap on one transaction's gas: the settle's budget never
    /// plans past it (`gas::settle_gas_budget`).
    pub settle_gas_cap: u64,
    /// Whether the cap was read against the chain's block gas limit at
    /// startup; when not, the first tick that reads the block checks it.
    pub settle_gas_cap_checked: bool,
    /// Batch interval in seconds (time trigger).
    pub interval_secs: u64,
}

impl Default for AssemblerConfig {
    fn default() -> Self {
        Self {
            max_ops: 100,
            settle_gas_cap: crate::gas::DEFAULT_SETTLE_GAS_CAP,
            settle_gas_cap_checked: true,
            interval_secs: 10,
        }
    }
}

/// Build a BatchInput from a set of operations and current state.
pub fn assemble_batch(
    chain_id: u64,
    verifying_contract: Address,
    block_timestamp: u64,
    operations: Vec<KernelOp>,
    prev_state: KernelStateSnapshot,
    usage: UsageContext,
) -> BatchInput {
    BatchInput {
        chain_id,
        verifying_contract,
        block_timestamp,
        operations,
        prev_state,
        usage_claims: usage.claims,
        usage_period: usage.period,
        provenance_leaf: usage.provenance_leaf,
    }
}

/// Trial-apply pending ops against `prev_state`, partitioning them into
/// the ops that can be batched and the ops that cannot.
///
/// `apply_batch` is all-or-nothing — one failing op aborts the whole
/// proof — so before batching, each op is trial-applied one at a time
/// against a running state. An op that fails is held and retried after
/// the others: an op submitted before the op it depends on still gets
/// batched once that dependency lands. Ops that fail against every
/// reachable ordering are genuine "poison" and are returned separately
/// so the caller can dead-letter them instead of poisoning the batch.
///
/// `valid` comes back in a working execution order (each op applied
/// cleanly in sequence); `poison` carries each rejected op with the
/// mirror error that rejected it.
pub fn filter_applicable_ops(
    chain_id: u64,
    verifying_contract: Address,
    block_timestamp: u64,
    prev_state: &KernelStateSnapshot,
    pending: Vec<PendingOp>,
) -> (Vec<PendingOp>, Vec<(PendingOp, String)>) {
    // The running state is the mirror's own, moved by each trial that
    // passes; a trial never hashes it (`trial_apply`).
    let mut state = KernelState::from_snapshot(prev_state);
    let mut valid: Vec<PendingOp> = Vec::new();
    let mut remaining: Vec<PendingOp> = pending;

    // Fixpoint: each pass places every op that applies against the
    // running state. Repeat while a pass makes progress — this resolves
    // ops submitted before the op they depend on.
    loop {
        let mut progressed = false;
        let mut next_round: Vec<PendingOp> = Vec::new();
        for pending_op in remaining {
            match trial_apply(
                chain_id,
                verifying_contract,
                block_timestamp,
                &state,
                &pending_op.op,
            ) {
                Ok(post) => {
                    state = post;
                    valid.push(pending_op);
                    progressed = true;
                }
                Err(_) => next_round.push(pending_op),
            }
        }
        remaining = next_round;
        if !progressed || remaining.is_empty() {
            break;
        }
    }

    // Whatever is left failed against every reachable ordering. Re-run
    // each once more against the final state to capture the mirror error
    // for the dead-letter log.
    let poison = remaining
        .into_iter()
        .map(|pending_op| {
            let reason = trial_apply(
                chain_id,
                verifying_contract,
                block_timestamp,
                &state,
                &pending_op.op,
            )
            .err()
            .unwrap_or_else(|| "op became applicable after filtering".to_string());
            (pending_op, reason)
        })
        .collect();

    (valid, poison)
}

/// Whether a Core refusal against the LANDED state is final. The state
/// behind the verifier's root only moves forward — a process, once it
/// exists, keeps its root buyer and currency; an order goes from
/// uncommitted to committed to resolved and never back; the chain's clock
/// only advances — and a signature or a witness fails whatever the state.
/// The rest name what a later operation may still supply: a process or an
/// order not yet committed, an order list or a cumulative value a sibling
/// order may yet complete. A refusal that carries its figures is judged on
/// them: an order list SHORTER than the active orders, or a cumulative value
/// the process has already PASSED — a commit's expected value or a resolve
/// authorization's signed one — never returns (the active count and the
/// accumulator only grow until resolution), and a resolve listing an order
/// whose own process is not the resolve's names an order that can never be
/// under it. Exhaustive, so a new refusal is classified where it is added.
pub fn is_permanent_refusal(e: &KernelError, op: &KernelOp, domain: &B256) -> bool {
    match e {
        KernelError::IncompleteOrderList { required, provided } => provided < required,
        KernelError::CumulativeValueMismatch { expected, actual } => expected < actual,
        KernelError::StaleResolveAuthorization { signed, current } => signed < current,
        KernelError::OrderNotCommitted(_) => match op {
            KernelOp::Resolve { process_id, commitments, .. }
            | KernelOp::ResolveByWalletCode { process_id, commitments, .. } => commitments
                .iter()
                .any(|c| figaro_kernel::kernel::derive_commitment_ids(domain, c).1 != *process_id),
            _ => false,
        },
        KernelError::DeadlineExpired
        | KernelError::InvalidBuyerSignature
        | KernelError::InvalidSellerSignature
        | KernelError::InvalidSignature
        | KernelError::ZeroPayment
        | KernelError::InvalidRootCumulativeValue
        | KernelError::Overflow
        | KernelError::ProcessAlreadyExists
        | KernelError::DuplicateCommitment
        | KernelError::ProcessAlreadyResolved
        | KernelError::NoActiveOrders
        | KernelError::OrderResolved
        | KernelError::NotProcessBuyer
        | KernelError::CurrencyMismatch
        | KernelError::NotAuthorized
        | KernelError::InvalidInclusionProof
        | KernelError::ClauseSpecParseFailed(_)
        | KernelError::SpecIdentityMismatch(_)
        | KernelError::ClauseContentInvalid(_)
        | KernelError::ContentEncodingFailed(_)
        | KernelError::ContentHashMismatch
        | KernelError::ProvenanceLeafNotCanonical => true,
        KernelError::UnknownProcess | KernelError::UnknownOrder => false,
        // A usage claim's refusals; an operation never meets them.
        KernelError::UsageOrderNotResolved(_)
        | KernelError::UsageInvalidInclusionProof
        | KernelError::ReservedKeyIsNotARegistration(_) => false,
    }
}

/// Split the operation filter's poison into what may yet apply, what the
/// Core refuses for good, and what was built on the latter. Each is judged
/// ALONE against the landed state (`prev_state`), never against the drain's
/// own operations, which have not landed: a refusal there that is permanent
/// ([`is_permanent_refusal`]) is returned with the Core's reason, to be
/// dead-lettered at once. An operation that names a process or an order only
/// a refused commit would have created — one the landed state does not hold
/// — is built on it and goes with it, transitively, with the refused one's
/// reason. Every other one — one that applies alone, or names a missing
/// dependency — keeps its reason and may be deferred.
pub fn split_permanent_refusals(
    chain_id: u64,
    verifying_contract: Address,
    block_timestamp: u64,
    prev_state: &KernelStateSnapshot,
    poison: Vec<(PendingOp, String)>,
) -> (Vec<(PendingOp, String)>, Vec<(PendingOp, String)>, Vec<(PendingOp, String)>) {
    let domain = figaro_kernel::eip712::domain_separator(chain_id, verifying_contract);
    let landed = KernelState::from_snapshot(prev_state);
    let mut deferrable = Vec::new();
    let mut refused = Vec::new();
    for (op, reason) in poison {
        match trial_apply_kernel(chain_id, verifying_contract, block_timestamp, &landed, &op.op) {
            Err(e) if is_permanent_refusal(&e, &op.op, &domain) => refused.push((op, e.to_string())),
            _ => deferrable.push((op, reason)),
        }
    }
    if refused.is_empty() {
        return (deferrable, refused, Vec::new());
    }
    // What the refused commits would have created and the landed state does
    // not hold, each with the reason it is gone.
    let landed_processes: std::collections::HashSet<B256> =
        prev_state.processes.iter().map(|(id, _)| *id).collect();
    let landed_orders: std::collections::HashSet<B256> =
        prev_state.order_status.iter().map(|(h, _)| *h).collect();
    let mut gone: std::collections::HashMap<B256, String> = std::collections::HashMap::new();
    let add_created = |op: &KernelOp, why: &str, gone: &mut std::collections::HashMap<B256, String>| {
        if let KernelOp::Commit { commitment: c, .. } = op {
            let (order_hash, process_id) = figaro_kernel::kernel::derive_commitment_ids(&domain, c);
            if c.process_id == B256::ZERO && !landed_processes.contains(&process_id) {
                gone.entry(process_id).or_insert_with(|| why.to_string());
            }
            if !landed_orders.contains(&order_hash) {
                gone.entry(order_hash).or_insert_with(|| why.to_string());
            }
        }
    };
    for (op, why) in &refused {
        add_created(&op.op, why, &mut gone);
    }
    let mut built_on = Vec::new();
    loop {
        let mut moved = false;
        let mut waiting = Vec::with_capacity(deferrable.len());
        for (op, reason) in deferrable {
            match referenced_ids(&domain, &op.op).iter().find_map(|id| gone.get(id).cloned()) {
                Some(why) => {
                    add_created(&op.op, &why, &mut gone);
                    built_on.push((op, format!("built on an operation the kernel refused for good: {why}")));
                    moved = true;
                }
                None => waiting.push((op, reason)),
            }
        }
        deferrable = waiting;
        if !moved {
            break;
        }
    }
    (deferrable, refused, built_on)
}

/// The processes and orders an operation needs to exist: a sub-order's
/// process, a resolve's process and listed orders, an attestation's target
/// order.
fn referenced_ids(domain: &B256, op: &KernelOp) -> Vec<B256> {
    let order = |c: &figaro_kernel::types::Commitment| figaro_kernel::kernel::derive_commitment_ids(domain, c).0;
    match op {
        KernelOp::Commit { commitment, .. } => {
            if commitment.process_id == B256::ZERO {
                Vec::new()
            } else {
                vec![commitment.process_id]
            }
        }
        KernelOp::Resolve { process_id, commitments, .. }
        | KernelOp::ResolveByWalletCode { process_id, commitments, .. } => {
            let mut ids = vec![*process_id];
            ids.extend(commitments.iter().map(|c| {
                figaro_kernel::eip712::compute_order_hash(process_id, &figaro_kernel::eip712::commitment_struct_hash(c))
            }));
            ids
        }
        KernelOp::AttestAsSeller { target, .. } => vec![order(target)],
        KernelOp::AttestAsBuyer { target, .. } => vec![order(target)],
    }
}

/// Filter `valid` again once formation has taken operations out of it:
/// what was filtered into an order behind an operation taken out does not
/// apply without it, and left in the batch would fail the
/// Core's rules at planning and cost the whole tick's batch. Returns the ops
/// kept, in a working execution order; the ops that apply again once the
/// `deferred` operations are restored — built on one of them, they move
/// with them; and the rest, each with the Core's reason, built on an
/// operation dropped for good.
pub fn refilter_after_drops(
    chain_id: u64,
    verifying_contract: Address,
    block_timestamp: u64,
    prev_state: &KernelStateSnapshot,
    valid: Vec<PendingOp>,
    deferred: &[PendingOp],
) -> (Vec<PendingOp>, Vec<PendingOp>, Vec<(PendingOp, String)>) {
    let (kept, built_on) =
        filter_applicable_ops(chain_id, verifying_contract, block_timestamp, prev_state, valid);
    if built_on.is_empty() || deferred.is_empty() {
        return (kept, Vec::new(), built_on);
    }
    let with_deferred: Vec<PendingOp> = kept
        .iter()
        .chain(deferred)
        .cloned()
        .chain(built_on.iter().map(|(op, _)| op.clone()))
        .collect();
    let (applies, _) = filter_applicable_ops(
        chain_id,
        verifying_contract,
        block_timestamp,
        prev_state,
        with_deferred,
    );
    let (follow, dropped): (Vec<_>, Vec<_>) = built_on
        .into_iter()
        .partition(|(op, _)| applies.iter().any(|a| a.id == op.id));
    (kept, follow.into_iter().map(|(op, _)| op).collect(), dropped)
}

/// Drop the commits that would grow a batch-path process past what one
/// settle can resolve (`gas::max_orders_in_one_settle`): a process past it
/// has no resolve any relay on the chain can settle, so its bonds would
/// stay where they are. Counted in the batch's order from the mirror's
/// process states; a resolve closes its process. Returns the ops kept and
/// each dropped op with its reason.
pub fn filter_commits_within_resolve_capacity(
    prev_state: &KernelStateSnapshot,
    ops: Vec<PendingOp>,
    max_orders: usize,
) -> (Vec<PendingOp>, Vec<(PendingOp, String)>) {
    let mut active: std::collections::BTreeMap<B256, u64> =
        prev_state.processes.iter().map(|(id, p)| (*id, p.active_order_count)).collect();
    let mut kept = Vec::new();
    let mut dropped = Vec::new();
    for op in ops {
        match &op.op {
            KernelOp::Commit { commitment, .. } => {
                let count = active.get(&commitment.process_id).copied().unwrap_or(0) + 1;
                if count as usize > max_orders {
                    dropped.push((
                        op,
                        format!(
                            "would grow the process to {count} orders, past the {max_orders} one settle can resolve under the chain's cap; its resolve would fit no batch and its bonds would stay where they are"
                        ),
                    ));
                    continue;
                }
                active.insert(commitment.process_id, count);
            }
            KernelOp::Resolve { process_id, .. } | KernelOp::ResolveByWalletCode { process_id, .. } => {
                active.insert(*process_id, 0);
            }
            _ => {}
        }
        kept.push(op);
    }
    (kept, dropped)
}

/// Trial-prove usage claims against the batch's POST-OP state, partitioning
/// them into claims that can be batched and poison claims that would abort the
/// whole proof.
///
/// The guest proves every claim in `apply_usage_claims` AFTER the ops,
/// against the post-state, and the batch is all-or-nothing: one claim that
/// fails a check the SEQUENCER's registry pre-filter cannot see — the order not
/// RESOLVED in this post-state, a bad merkle inclusion proof — aborts the
/// ENTIRE proof. That dead-letters the whole batch (`main`'s prove-failure arm)
/// and discards every co-batched legitimate trade with it. A usage claim is
/// publicly submittable, so without this filter one crafted claim (real
/// resolved order + garbage inclusion proof) is a gas-free batch-resolution DoS.
///
/// So each claim is trial-proved one at a time against the post-op state and
/// poison is returned separately for the caller to drop. A second claim of a
/// (kind, key, process) the batch already carries is dropped too: the guest
/// would give it no use of its own, so it would cost the batch its stream
/// bytes for nothing. This is the usage-claim twin of `filter_applicable_ops`;
/// claims move no state and have no inter-claim ordering, so a single pass
/// suffices. The registry, stake and already-counted gates the guest CANNOT
/// see are pre-filtered upstream (`submitter::filter_usage_claims`); this
/// covers the disjoint set of classes only the guest decides.
///
/// `valid_ops` must be the ops the batch will actually carry, in the order
/// `filter_applicable_ops` returned them (they apply cleanly as a group); the
/// state is built by applying them, reproducing the exact post-state the
/// guest proves claims against.
pub fn filter_applicable_claims(
    chain_id: u64,
    verifying_contract: Address,
    block_timestamp: u64,
    prev_state: &KernelStateSnapshot,
    valid_ops: &[KernelOp],
    provenance_leaf: B256,
    claims: Vec<UsageClaim>,
) -> (Vec<UsageClaim>, Vec<(UsageClaim, String)>) {
    if claims.is_empty() {
        return (Vec::new(), Vec::new());
    }
    // The post-op state the guest proves claims against, reached through the
    // same function (`apply_operations`), no root computed. `valid_ops`
    // already trial-applied cleanly in this order, so the group apply
    // succeeds; if it somehow does not, every claim is undecidable and
    // dropped conservatively (re-submittable).
    let mut state = KernelState::from_snapshot(prev_state);
    if let Err(e) = apply_operations(&mut state, chain_id, verifying_contract, block_timestamp, valid_ops) {
        let why = format!("post-op state did not assemble: {e}");
        return (
            Vec::new(),
            claims.into_iter().map(|c| (c, why.clone())).collect(),
        );
    }

    let mut carried: std::collections::HashSet<(u8, B256, B256)> = std::collections::HashSet::new();
    let mut valid = Vec::with_capacity(claims.len());
    let mut poison = Vec::new();
    for claim in claims {
        match apply_claims(
            &state,
            chain_id,
            verifying_contract,
            std::slice::from_ref(&claim),
            &provenance_leaf,
        ) {
            Ok(uses) => match uses.first() {
                Some(u) if carried.insert((u.kind, u.clause_or_assembly, u.process_id)) => valid.push(claim),
                _ => poison.push((claim, "the batch already carries this (kind, key, process)".to_string())),
            },
            Err(e) => poison.push((claim, e.to_string())),
        }
    }
    (valid, poison)
}

/// Trial-apply a single op against `state`, returning the post-state on
/// success or the mirror error string on failure.
fn trial_apply(
    chain_id: u64,
    verifying_contract: Address,
    block_timestamp: u64,
    state: &KernelState,
    op: &KernelOp,
) -> Result<KernelState, String> {
    trial_apply_kernel(chain_id, verifying_contract, block_timestamp, state, op).map_err(|e| e.to_string())
}

/// [`trial_apply`] with the Core's own refusal. The op is applied to a
/// clone of `state` through the Core mirror's own `apply_operations` — the
/// one home of the rules — with no root computed: the clone is the post-state
/// on success and is dropped on refusal.
fn trial_apply_kernel(
    chain_id: u64,
    verifying_contract: Address,
    block_timestamp: u64,
    state: &KernelState,
    op: &KernelOp,
) -> Result<KernelState, KernelError> {
    // Ops only — a trial-apply asks "does this operation apply cleanly
    // against the running state?", and usage claims answer a different
    // question against the batch's POST-state.
    let mut trial = state.clone();
    apply_operations(&mut trial, chain_id, verifying_contract, block_timestamp, std::slice::from_ref(op))?;
    Ok(trial)
}
