//! Rebuilding the state behind the verifier's root from the chain alone.
//!
//! Every batch `FigaroBatchVerifier.settleBatch` lands logs its operation
//! stream in `BatchOperations` (bound to public value 9 before it is logged)
//! with the clock, usage period and provenance leaf its replay needs, and
//! names its previous and new root in `BatchSettled`, both in the same
//! transaction. So the state behind any root the verifier holds is a replay
//! of the verifier's own logs: from the empty state, each landed batch's
//! stream is applied in chain order under this chain's id and the verifier's
//! address, and the root the replay reaches must be the one the batch's
//! `BatchSettled` names. A relay holding nothing starts this way
//! (`REBUILD_FROM_CHAIN=1`); no other relay, file, archive or call trace is
//! read, however the batch's call reached the verifier.

use alloy::providers::{Provider, ProviderBuilder};
use alloy::rpc::types::Filter;
use alloy::sol_types::SolEvent;
use alloy_primitives::{Address, B256};

use figaro_kernel::kernel::{apply_claims, apply_operations};
use figaro_kernel::operation_stream::decode_operation_stream;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::KernelStateSnapshot;

use crate::submitter::IFigaroBatchVerifier;

/// Blocks read per log query.
const LOG_CHUNK: u64 = 5_000;

/// What a rebuild reached: the state, its root and the batches replayed.
pub struct Rebuilt {
    pub state: KernelStateSnapshot,
    pub root: B256,
    pub batches: u64,
}

/// Replay every batch the verifier landed, from `from_block` to the head,
/// and return the state behind the last root. Refuses, naming the batch, on
/// the first whose replay does not land on the root its `BatchSettled`
/// names, whose stream does not decode or apply, or whose two logs do not
/// pair up in one transaction.
pub async fn rebuild_from_chain(
    rpc_url: &str,
    verifier: Address,
    from_block: u64,
) -> Result<Rebuilt, String> {
    let provider = ProviderBuilder::new()
        .connect_http(rpc_url.parse().map_err(|e| format!("invalid rpc url: {e}"))?);
    let contract = IFigaroBatchVerifier::new(verifier, &provider);
    let chain_id = provider
        .get_chain_id()
        .await
        .map_err(|e| format!("chain id read failed: {e}"))?;
    let head = provider
        .get_block_number()
        .await
        .map_err(|e| format!("block number read failed: {e}"))?;

    let mut state = KernelState::new();
    let mut root = state.compute_root();
    let mut batches = 0u64;
    let mut from = from_block;
    while from <= head {
        let to = (from + LOG_CHUNK - 1).min(head);
        let filter = Filter::new()
            .address(verifier)
            .event_signature(vec![
                IFigaroBatchVerifier::BatchOperations::SIGNATURE_HASH,
                IFigaroBatchVerifier::BatchSettled::SIGNATURE_HASH,
            ])
            .from_block(from)
            .to_block(to);
        let mut logs = provider
            .get_logs(&filter)
            .await
            .map_err(|e| format!("verifier log read failed ({from}..{to}): {e}"))?;
        logs.sort_by_key(|l| (l.block_number, l.log_index));
        let mut pending: Option<(B256, IFigaroBatchVerifier::BatchOperations)> = None;
        for log in logs {
            let tx = log.transaction_hash.unwrap_or_default();
            if log.topic0() == Some(&IFigaroBatchVerifier::BatchOperations::SIGNATURE_HASH) {
                let ops = IFigaroBatchVerifier::BatchOperations::decode_log(&log.inner)
                    .map_err(|e| format!("{tx}: a BatchOperations log does not decode: {e}"))?;
                pending = Some((tx, ops.data));
                continue;
            }
            let settled = IFigaroBatchVerifier::BatchSettled::decode_log(&log.inner)
                .map_err(|e| format!("{tx}: a BatchSettled log does not decode: {e}"))?;
            let (ops_tx, ops) = pending
                .take()
                .ok_or_else(|| format!("batch {} in {tx} has no BatchOperations log before it", settled.batchId))?;
            if ops_tx != tx || ops.batchId != settled.batchId {
                return Err(format!("batch {} in {tx}: its BatchOperations log is another batch's", settled.batchId));
            }
            if settled.prevStateRoot != root {
                return Err(format!(
                    "batch {} in {tx} starts from {} but the replay holds {root}",
                    settled.batchId, settled.prevStateRoot
                ));
            }
            let (operations, claims) = decode_operation_stream(&ops.operations)
                .map_err(|e| format!("batch {} in {tx}: operation stream: {e}", settled.batchId))?;
            apply_operations(&mut state, chain_id, verifier, ops.blockTimestamp, &operations)
                .map_err(|e| format!("batch {} in {tx}: the operations do not apply: {e:?}", settled.batchId))?;
            apply_claims(&mut state, chain_id, verifier, &claims, ops.usagePeriod, &ops.provenanceLeaf)
                .map_err(|e| format!("batch {} in {tx}: the claims do not apply: {e:?}", settled.batchId))?;
            let reached = state.compute_root();
            if reached != settled.newStateRoot {
                return Err(format!(
                    "batch {} in {tx}: the replay reaches {reached}, the log names {}",
                    settled.batchId, settled.newStateRoot
                ));
            }
            root = reached;
            batches += 1;
        }
        from = to + 1;
    }

    let on_chain = contract
        .stateRoot()
        .call()
        .await
        .map_err(|e| format!("stateRoot() call failed: {e}"))?;
    if on_chain != root {
        return Err(format!(
            "the replay of {batches} batch(es) reaches {root}, the verifier holds {on_chain} (a batch landed after the logs were read, or before REBUILD_FROM_BLOCK)"
        ));
    }
    Ok(Rebuilt {
        state: state.to_snapshot(),
        root,
        batches,
    })
}
