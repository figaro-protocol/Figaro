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
//! (`REBUILD_FROM_CHAIN=1`); no other relay, file or call trace is
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
    chain_id: u64,
) -> Result<Rebuilt, String> {
    let provider = ProviderBuilder::new()
        .connect_http(rpc_url.parse().map_err(|e| format!("invalid rpc url: {e}"))?);
    let contract = IFigaroBatchVerifier::new(verifier, &provider);
    let head = provider
        .get_block_number()
        .await
        .map_err(|e| format!("block number read failed: {}", crate::api::without_urls(&e.to_string())))?;

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
            .map_err(|e| format!("verifier log read failed ({from}..{to}): {}", crate::api::without_urls(&e.to_string())))?;
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
            apply_claims(&state, chain_id, verifier, &claims, &ops.provenanceLeaf)
                .map_err(|e| format!("batch {} in {tx}: the claims do not prove: {e:?}", settled.batchId))?;
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
        .map_err(|e| format!("stateRoot() call failed: {}", crate::api::without_urls(&e.to_string())))?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rpc_double::{call_of, hex_value, serve, unserved, RpcDouble};
    use alloy::primitives::LogData;
    use alloy::sol_types::SolCall;
    use figaro_kernel::kernel::apply_batch_with_state;
    use figaro_kernel::operation_stream::encode_operation_stream;
    use figaro_prove_test::{build_canonical_batch_input, CHAIN_ID, CORE};

    /// One log the double serves: its block, transaction and body.
    #[derive(Clone)]
    struct Logged {
        block: u64,
        tx: B256,
        data: LogData,
    }

    /// A JSON-RPC double for the verifier's history: the chain head, the
    /// listed logs (served by the block range each query names) and the
    /// root `stateRoot()` answers.
    async fn verifier_double(head: u64, logs: Vec<Logged>, state_root: B256) -> RpcDouble {
        serve(move |method, params| match method {
            "eth_chainId" => Ok(serde_json::json!(format!("0x{CHAIN_ID:x}"))),
            "eth_blockNumber" => Ok(serde_json::json!(format!("0x{head:x}"))),
            "eth_getLogs" => {
                let block = |k: &str| u64::from_str_radix(params[0][k].as_str().unwrap().trim_start_matches("0x"), 16).unwrap();
                let (from, to) = (block("fromBlock"), block("toBlock"));
                let served: Vec<serde_json::Value> = logs
                    .iter()
                    .enumerate()
                    .filter(|(_, l)| (from..=to).contains(&l.block))
                    .map(|(i, l)| {
                        serde_json::json!({
                            "address": CORE,
                            "topics": l.data.topics(),
                            "data": hex_value(&l.data.data),
                            "blockNumber": format!("0x{:x}", l.block),
                            "blockHash": B256::with_last_byte(l.block as u8),
                            "transactionHash": l.tx,
                            "transactionIndex": "0x0",
                            "logIndex": format!("0x{i:x}"),
                            "removed": false,
                        })
                    })
                    .collect();
                Ok(serde_json::Value::Array(served))
            }
            "eth_call" => {
                let (to, input) = call_of(params);
                assert_eq!(to, CORE, "the root is the verifier's");
                assert_eq!(input[..4], IFigaroBatchVerifier::stateRootCall::SELECTOR);
                Ok(hex_value(state_root.as_slice()))
            }
            other => unserved(other),
        })
        .await
    }

    /// The canonical batch as the verifier logs it: its `BatchOperations`
    /// and `BatchSettled`, both in transaction `tx` of `block`, and the root
    /// the batch reaches.
    fn landed_canonical_batch(block: u64, tx: B256) -> (Vec<Logged>, B256, B256) {
        let input = build_canonical_batch_input();
        let (pv, positions, _, _) = apply_batch_with_state(&input).expect("the canonical batch applies");
        let operations = IFigaroBatchVerifier::BatchOperations {
            batchId: 1,
            blockTimestamp: input.block_timestamp,
            usagePeriod: input.usage_period,
            provenanceLeaf: input.provenance_leaf,
            operations: encode_operation_stream(&input.operations, &input.usage_claims).into(),
        };
        let landed = IFigaroBatchVerifier::BatchSettled {
            batchId: 1,
            prevStateRoot: pv.prev_state_root,
            newStateRoot: pv.new_state_root,
            positionCount: alloy::primitives::U256::from(positions.len()),
        };
        (
            vec![
                Logged { block, tx, data: operations.encode_log_data() },
                Logged { block, tx, data: landed.encode_log_data() },
            ],
            pv.prev_state_root,
            pv.new_state_root,
        )
    }

    // The state behind the verifier's root is rebuilt from its logs alone:
    // the landed batch's stream is replayed from the empty state onto the
    // root its `BatchSettled` names and the verifier holds, across more than
    // one log query.
    #[tokio::test]
    async fn the_state_behind_the_verifiers_root_is_rebuilt_from_its_logs() {
        let block = LOG_CHUNK + 7;
        let (logs, empty, reached) = landed_canonical_batch(block, B256::repeat_byte(0x7a));
        assert_eq!(empty, KernelState::new().compute_root(), "the batch starts from the empty state");
        let double = verifier_double(block + 1, logs, reached).await;

        let rebuilt = rebuild_from_chain(&double.url, CORE, 0, CHAIN_ID).await.expect("the replay lands");
        assert_eq!(rebuilt.batches, 1);
        assert_eq!(rebuilt.root, reached);
        assert_eq!(KernelState::from_snapshot(&rebuilt.state).compute_root(), reached, "the state is the root's");
        assert_eq!(double.calls_to("eth_getLogs").len(), 2, "the history is read in chunks");
    }

    // An empty history rebuilds the empty state, and only when the verifier
    // holds the empty root.
    #[tokio::test]
    async fn an_empty_history_is_the_empty_state() {
        let empty = KernelState::new().compute_root();
        let double = verifier_double(3, vec![], empty).await;
        let rebuilt = rebuild_from_chain(&double.url, CORE, 0, CHAIN_ID).await.expect("nothing to replay");
        assert_eq!((rebuilt.batches, rebuilt.root), (0, empty));
    }

    // Each refusal names what broke: a replay that reaches another root than
    // the log names, a batch starting from a root the replay does not hold,
    // a `BatchSettled` with no `BatchOperations` before it or with another
    // transaction's, and a verifier holding a root the replay did not reach.
    #[tokio::test]
    async fn a_history_that_does_not_replay_is_refused_naming_the_batch() {
        let tx = B256::repeat_byte(0x7a);
        let (logs, prev, reached) = landed_canonical_batch(5, tx);
        let landed = |prev: B256, new: B256| IFigaroBatchVerifier::BatchSettled {
            batchId: 1,
            prevStateRoot: prev,
            newStateRoot: new,
            positionCount: alloy::primitives::U256::from(2),
        }
        .encode_log_data();
        let other = B256::repeat_byte(0x99);

        let cases: Vec<(Vec<Logged>, B256, &str)> = vec![
            (vec![logs[0].clone(), Logged { data: landed(prev, other), ..logs[1].clone() }], other, "the replay reaches"),
            (vec![logs[0].clone(), Logged { data: landed(other, reached), ..logs[1].clone() }], reached, "starts from"),
            (vec![logs[1].clone()], reached, "has no BatchOperations log"),
            (vec![logs[0].clone(), Logged { tx: B256::repeat_byte(0x7b), ..logs[1].clone() }], reached, "another batch's"),
            (logs.clone(), other, "the verifier holds"),
        ];
        for (logs, held, refusal) in cases {
            let double = verifier_double(6, logs, held).await;
            let err = rebuild_from_chain(&double.url, CORE, 0, CHAIN_ID).await.err().expect("refused");
            assert!(err.contains(refusal), "expected {refusal:?}: {err}");
        }
    }

    // A chain that cannot be read is an error whose text carries no URL.
    #[tokio::test]
    async fn a_failed_read_carries_no_url() {
        let err = rebuild_from_chain("http://127.0.0.1:1/v2/SECRETKEY", CORE, 0, CHAIN_ID).await.err().expect("refused");
        assert!(err.starts_with("block number read failed"), "{err}");
        assert!(!err.contains("SECRETKEY") && !err.contains("127.0.0.1"), "{err}");
    }
}
