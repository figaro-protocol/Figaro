/// Batch assembler — drains the mempool and builds a BatchInput for
/// the SP1 prover.
use alloy_primitives::Address;
use figaro_kernel::types::{BatchInput, KernelOp, KernelStateSnapshot};

use crate::mempool::PendingOp;

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
) -> BatchInput {
    BatchInput {
        chain_id,
        verifying_contract,
        block_timestamp,
        operations,
        prev_state,
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
            match trial_apply(chain_id, verifying_contract, block_timestamp, &state, &pending_op.op)
            {
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
            let reason =
                trial_apply(chain_id, verifying_contract, block_timestamp, &state, &pending_op.op)
                    .err()
                    .unwrap_or_else(|| "op became applicable after filtering".to_string());
            (pending_op, reason)
        })
        .collect();

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
    let trial = BatchInput {
        chain_id,
        verifying_contract,
        block_timestamp,
        operations: vec![op.clone()],
        prev_state: state.clone(),
    };
    figaro_kernel::kernel::apply_batch_with_state(&trial)
        .map(|(_, _, _, post)| post.to_snapshot())
        .map_err(|e| e.to_string())
}
