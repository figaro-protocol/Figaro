/// Batch assembler — drains the mempool and builds a BatchInput for
/// the SP1 prover.
use alloy_primitives::Address;
use figaro_kernel::types::{BatchInput, KernelOp, KernelStateSnapshot};

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
