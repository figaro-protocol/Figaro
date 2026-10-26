//! Rebuilding the state behind the verifier's root from the chain alone.
//!
//! Every batch `FigaroBatchVerifier.settleBatch` lands carries its operation
//! stream as calldata, hash-bound to public value 9 (`operation_stream`), and
//! names its previous and new root in `BatchSettled`. So the state behind any
//! root the verifier holds is a replay: from the empty state, each landed
//! batch's stream is applied in chain order under the clock, chain binding,
//! usage period and provenance leaf the same transaction carries, and the
//! root the replay reaches must be the one the batch's log names. A relay
//! holding nothing starts this way (`REBUILD_FROM_CHAIN=1`); no other relay,
//! file or archive is read.
//!
//! The one shape this reads is a transaction whose top-level call is
//! `settleBatch` on the verifier. A batch landed through another contract's
//! internal call carries its stream only in a call trace, which this module
//! does not read: it refuses, naming the transaction, rather than guess.

use alloy::providers::{Provider, ProviderBuilder};
use alloy::rpc::types::Filter;
use alloy::sol_types::{SolCall, SolEvent};
use alloy_primitives::{Address, B256};

use figaro_kernel::kernel::{apply_claims, apply_operations};
use figaro_kernel::operation_stream::decode_operation_stream;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::{KernelStateSnapshot, PublicValues};

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
/// and return the state behind the last root. Refuses on the first batch
/// whose replay does not land on the root its log names, whose transaction
/// is not a top-level `settleBatch` on the verifier, or whose stream does
/// not decode: each is named.
pub async fn rebuild_from_chain(
    rpc_url: &str,
    verifier: Address,
    from_block: u64,
) -> Result<Rebuilt, String> {
    let provider = ProviderBuilder::new()
        .connect_http(rpc_url.parse().map_err(|e| format!("invalid rpc url: {e}"))?);
    let contract = IFigaroBatchVerifier::new(verifier, &provider);
    let head = provider
        .get_block_number()
        .await
        .map_err(|e| format!("block number read failed: {e}"))?;

    let mut state = KernelState::new();
    let genesis = state.compute_root();
    let mut root = genesis;
    let mut batches = 0u64;
    let mut from = from_block;
    while from <= head {
        let to = (from + LOG_CHUNK - 1).min(head);
        let filter = Filter::new()
            .address(verifier)
            .event_signature(IFigaroBatchVerifier::BatchSettled::SIGNATURE_HASH)
            .from_block(from)
            .to_block(to);
        let mut logs = provider
            .get_logs(&filter)
            .await
            .map_err(|e| format!("BatchSettled log read failed ({from}..{to}): {e}"))?;
        logs.sort_by_key(|l| (l.block_number, l.log_index));
        for log in logs {
            let settled = IFigaroBatchVerifier::BatchSettled::decode_log(&log.inner)
                .map_err(|e| format!("a BatchSettled log does not decode: {e}"))?;
            let tx_hash = log
                .transaction_hash
                .ok_or_else(|| "a BatchSettled log names no transaction".to_string())?;
            if settled.prevStateRoot != root {
                return Err(format!(
                    "batch {} in {tx_hash} starts from {} but the replay holds {root}",
                    settled.batchId, settled.prevStateRoot
                ));
            }
            let tx = provider
                .get_transaction_by_hash(tx_hash)
                .await
                .map_err(|e| format!("transaction {tx_hash} read failed: {e}"))?
                .ok_or_else(|| format!("transaction {tx_hash} is not served by the node"))?;
            use alloy::consensus::Transaction as _;
            if tx.inner.to() != Some(verifier) {
                return Err(format!(
                    "batch {} landed in {tx_hash} through another contract's call; its stream is only in a call trace, which this rebuild does not read",
                    settled.batchId
                ));
            }
            let call = IFigaroBatchVerifier::settleBatchCall::abi_decode(tx.inner.input())
                .map_err(|e| format!("{tx_hash} is not a settleBatch call: {e}"))?;
            let pv = PublicValues::abi_decode(&call.publicValues)
                .map_err(|e| format!("{tx_hash}: public values: {e}"))?;
            let (operations, claims) = decode_operation_stream(&call.operations)
                .map_err(|e| format!("{tx_hash}: operation stream: {e}"))?;
            apply_operations(
                &mut state,
                pv.chain_id,
                pv.verifying_contract,
                pv.block_timestamp,
                &operations,
            )
            .map_err(|e| format!("{tx_hash}: the stream's operations do not apply: {e:?}"))?;
            apply_claims(
                &mut state,
                pv.chain_id,
                pv.verifying_contract,
                &claims,
                call.usage.period,
                &call.usage.provenanceLeaf,
            )
            .map_err(|e| format!("{tx_hash}: the stream's claims do not apply: {e:?}"))?;
            let reached = state.compute_root();
            if reached != settled.newStateRoot {
                return Err(format!(
                    "batch {} in {tx_hash}: the replay reaches {reached}, the log names {}",
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
            "the replay of {batches} batch(es) reaches {root}, the verifier holds {on_chain} (a batch landed after the logs were read, or before from_block)"
        ));
    }
    let _ = genesis;
    Ok(Rebuilt {
        state: state.to_snapshot(),
        root,
        batches,
    })
}
