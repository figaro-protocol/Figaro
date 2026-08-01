/// Batch assembler — drains the mempool and builds a BatchInput for
/// the SP1 prover.
use alloy_primitives::{Address, B256};
use figaro_kernel::types::{BatchInput, KernelOp, KernelStateSnapshot, UsageClaim};

use crate::mempool::PendingOp;

/// The RPGF context a batch settles under — the claims to credit, the
/// period they land in, and the provenance clause key assembly claims
/// prove against.
///
/// PERIOD AND PROVENANCE ARE CHAIN FACTS, read from `UsageCounter`
/// (`currentPeriod()`, `provenanceClause()`), never guessed from a local
/// clock: the counter re-checks both at settlement and rejects the batch
/// on a mismatch. A batch assembled just before a period boundary and
/// settled just after it must be re-proven for the new period.
#[derive(Clone, Debug, Default)]
pub struct UsageContext {
    pub claims: Vec<UsageClaim>,
    pub period: u8,
    pub provenance_clause: B256,
}

/// Configuration for batch assembly triggers.
#[derive(Clone, Debug)]
pub struct AssemblerConfig {
    /// Maximum number of operations per batch.
    pub max_ops: usize,
    /// Batch interval in seconds (time trigger).
    pub interval_secs: u64,
}

impl Default for AssemblerConfig {
    fn default() -> Self {
        Self {
            max_ops: 100,
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
        provenance_clause: usage.provenance_clause,
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
/// kernel error that rejected it.
pub fn filter_applicable_ops(
    chain_id: u64,
    verifying_contract: Address,
    block_timestamp: u64,
    prev_state: &KernelStateSnapshot,
    pending: Vec<PendingOp>,
) -> (Vec<PendingOp>, Vec<(PendingOp, String)>) {
    let mut state = prev_state.clone();
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
    // each once more against the final state to capture the kernel error
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

/// Trial-apply usage claims against the batch's POST-OP state, partitioning
/// them into claims that can be batched and poison claims that would abort the
/// whole proof.
///
/// The guest runs every claim through `apply_usage_claims` AFTER the ops,
/// against the post-state, and the batch is all-or-nothing: one claim that
/// fails a check the SEQUENCER's registry pre-filter cannot see — the order not
/// RESOLVED in this post-state, a bad merkle inclusion proof, or an
/// already-counted process — aborts the ENTIRE proof. That dead-letters the
/// whole batch (`main`'s prove-failure arm) and discards every co-batched
/// legitimate trade with it. A usage claim is publicly submittable, so without
/// this filter one crafted claim (real resolved order + garbage inclusion proof,
/// or a replay of an already-counted claim) is a gas-free batch-settlement DoS.
///
/// So each claim is trial-applied one at a time against the running post-op
/// state — threaded, so a duplicate claim WITHIN the batch is caught as
/// already-counted exactly as the guest would — and poison is returned
/// separately for the caller to drop. This is the usage-claim twin of
/// `filter_applicable_ops`; unlike ops, claims have no inter-claim ordering to
/// resolve (each proves against the settled post-op state), so a single pass
/// suffices. The registry/stake gates the guest CANNOT see are pre-filtered
/// upstream (`submitter::filter_usage_claims`); this covers the disjoint set of
/// classes only the guest decides.
///
/// `valid_ops` must be the ops the batch will actually carry, in the order
/// `filter_applicable_ops` returned them (they apply cleanly as a group); the
/// running state is seeded by applying them, reproducing the exact post-state
/// the guest credits claims against.
pub fn filter_applicable_claims(
    chain_id: u64,
    verifying_contract: Address,
    block_timestamp: u64,
    prev_state: &KernelStateSnapshot,
    valid_ops: &[KernelOp],
    usage_period: u8,
    provenance_clause: B256,
    claims: Vec<UsageClaim>,
) -> (Vec<UsageClaim>, Vec<(UsageClaim, String)>) {
    if claims.is_empty() {
        return (Vec::new(), Vec::new());
    }
    // Seed the running state with the batch's ops applied — the same post-op
    // state the guest credits claims against. `valid_ops` already trial-applied
    // cleanly in this order, so the group apply succeeds; if it somehow does not,
    // every claim is undecidable and dropped conservatively (re-submittable).
    let seed = BatchInput {
        chain_id,
        verifying_contract,
        block_timestamp,
        operations: valid_ops.to_vec(),
        prev_state: prev_state.clone(),
        usage_claims: vec![],
        usage_period,
        provenance_clause,
    };
    let mut state = match figaro_kernel::kernel::apply_batch_with_state(&seed) {
        Ok((_, _, _, post)) => post.to_snapshot(),
        Err(e) => {
            let why = format!("post-op state did not assemble: {e}");
            return (
                Vec::new(),
                claims.into_iter().map(|c| (c, why.clone())).collect(),
            );
        }
    };

    let mut valid = Vec::with_capacity(claims.len());
    let mut poison = Vec::new();
    for claim in claims {
        let trial = BatchInput {
            chain_id,
            verifying_contract,
            block_timestamp,
            operations: vec![],
            prev_state: state.clone(),
            usage_claims: vec![claim.clone()],
            usage_period,
            provenance_clause,
        };
        match figaro_kernel::kernel::apply_batch_with_state(&trial) {
            Ok((_, _, _, post)) => {
                state = post.to_snapshot();
                valid.push(claim);
            }
            Err(e) => poison.push((claim, e.to_string())),
        }
    }
    (valid, poison)
}

/// Trial-apply a single op against `state`, returning the post-state on
/// success or the kernel error string on failure.
fn trial_apply(
    chain_id: u64,
    verifying_contract: Address,
    block_timestamp: u64,
    state: &KernelStateSnapshot,
    op: &KernelOp,
) -> Result<KernelStateSnapshot, String> {
    // Ops only — a trial-apply asks "does this operation apply cleanly
    // against the running state?", and usage claims answer a different
    // question against the batch's POST-state.
    let trial = BatchInput {
        chain_id,
        verifying_contract,
        block_timestamp,
        operations: vec![op.clone()],
        prev_state: state.clone(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_clause: B256::ZERO,
    };
    figaro_kernel::kernel::apply_batch_with_state(&trial)
        .map(|(_, _, _, post)| post.to_snapshot())
        .map_err(|e| e.to_string())
}
