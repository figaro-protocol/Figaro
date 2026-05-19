import type { Hex } from "./types.js";

export interface CommittedLogWithPosition {
  order_hash: Hex;
  process_id: Hex;
  block_number: number;
  log_index: number;
}

/**
 * Compute chain_position per order_hash from the on-chain order-commit
 * stream alone. The kernel sees a linear sequence of commits per
 * processId — the first commit for a process is the root order
 * (chain_position = 1); each subsequent commit increments the position.
 *
 * Ordering: (block_number, log_index) ascending. Pure function;
 * deterministic for any given input.
 *
 * Rationale: FigaroCore's OrderCommitted event does not emit
 * parentOrderIds (DAG topology lives in the off-chain agreement
 * manifest by design — see THEORY.md "process chains are linear at
 * the kernel level"). For RPGF's substrate-broadening signal the
 * linear-position-within-process is the right semantic: it matches
 * what the kernel sees and avoids an IPFS dependency in the sequencer.
 */
export function computeChainPositions(
  logs: CommittedLogWithPosition[],
): Map<Hex, number> {
  const byProcess = new Map<Hex, CommittedLogWithPosition[]>();
  for (const log of logs) {
    const bucket = byProcess.get(log.process_id) ?? [];
    bucket.push(log);
    byProcess.set(log.process_id, bucket);
  }

  const positions = new Map<Hex, number>();
  for (const bucket of byProcess.values()) {
    bucket.sort((a, b) => {
      if (a.block_number !== b.block_number) {
        return a.block_number - b.block_number;
      }
      return a.log_index - b.log_index;
    });
    bucket.forEach((log, i) => positions.set(log.order_hash, i + 1));
  }
  return positions;
}
