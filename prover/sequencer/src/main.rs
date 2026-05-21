/// Figaro Batch Sequencer — devnet single-operator sequencer.
///
/// Collects signed protocol operations via HTTP, assembles batches on a
/// timer, runs the SP1 mock prover, and submits settlement transactions
/// to FigaroBatchVerifier on Anvil.
///
/// This is Phase 1 (devnet). For testnet and mainnet, swap MockSP1Verifier
/// for the real SP1 verifier and set SP1_PROVER=cpu/cuda so the sequencer
/// self-proves with the local SP1 prover — no external proving service.
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use alloy_primitives::Address;
use tokio::sync::RwLock;
use tokio::time;
use tracing::{info, warn, error};

use figaro_sequencer::api::{self, AppState};
use figaro_sequencer::assembler::{self, AssemblerConfig};
use figaro_sequencer::mempool::Mempool;
use figaro_sequencer::prover;
use figaro_sequencer::state::StateMirror;
use figaro_sequencer::submitter::{self, SubmitterConfig};

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "figaro_sequencer=info".into()),
        )
        .init();

    // ── Configuration from environment ────────────────────────────
    let rpc_url = env_or("RPC_URL", "http://127.0.0.1:8545");
    let chain_id: u64 = env_or("CHAIN_ID", "31337").parse().expect("invalid CHAIN_ID");
    let verifier_addr: Address = env_or(
        "BATCH_VERIFIER_ADDRESS",
        "0x0000000000000000000000000000000000000000",
    )
    .parse()
    .expect("invalid BATCH_VERIFIER_ADDRESS");
    let verifying_contract: Address = env_or(
        "FIGARO_CORE_ADDRESS",
        "0x0000000000000000000000000000000000000000",
    )
    .parse()
    .expect("invalid FIGARO_CORE_ADDRESS");
    let private_key = env_or(
        "SEQUENCER_PRIVATE_KEY",
        // Anvil account[0] default
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
    let listen_addr = env_or("LISTEN_ADDR", "0.0.0.0:3001");
    let batch_interval: u64 = env_or("BATCH_INTERVAL_SECS", "10")
        .parse()
        .expect("invalid BATCH_INTERVAL_SECS");
    let max_ops: usize = env_or("MAX_BATCH_OPS", "100")
        .parse()
        .expect("invalid MAX_BATCH_OPS");
    info!(%rpc_url, %chain_id, ?verifier_addr, ?verifying_contract, %listen_addr, %batch_interval, %max_ops, "Starting Figaro sequencer");

    // ── Initialize components ─────────────────────────────────────
    let mempool = Mempool::new(chain_id, verifying_contract);
    let state_mirror = StateMirror::genesis();
    let batch_count = Arc::new(RwLock::new(0u64));

    // Sync initial state root from chain (if verifier is deployed)
    if verifier_addr != Address::ZERO {
        match submitter::read_state_root(&rpc_url, verifier_addr).await {
            Ok(root) => {
                info!(?root, "Synced on-chain state root");
                // For genesis, the on-chain root should match our local genesis root.
                let local_root = state_mirror.state_root().await;
                if root != local_root {
                    warn!(
                        ?root,
                        ?local_root,
                        "On-chain state root differs from local genesis — state sync needed"
                    );
                }
            }
            Err(e) => {
                warn!(%e, "Could not read on-chain state root (verifier may not be deployed yet)");
            }
        }
    }

    let submitter_config = SubmitterConfig {
        rpc_url: rpc_url.clone(),
        verifier_address: verifier_addr,
        private_key,
    };

    let assembler_config = AssemblerConfig {
        max_ops,
        interval_secs: batch_interval,
    };

    // ── Spawn batch loop ──────────────────────────────────────────
    let loop_mempool = mempool.clone();
    let loop_state = state_mirror.clone();
    let loop_batch_count = batch_count.clone();

    tokio::spawn(async move {
        batch_loop(
            loop_mempool,
            loop_state,
            loop_batch_count,
            assembler_config,
            submitter_config,
            chain_id,
            verifying_contract,
        )
        .await;
    });

    // ── Start HTTP server ─────────────────────────────────────────
    let app_state = AppState {
        mempool,
        state_mirror,
        batch_count,
    };

    let app = api::router(app_state);

    let listener = tokio::net::TcpListener::bind(&listen_addr)
        .await
        .expect("failed to bind");

    info!(%listen_addr, "HTTP server listening");
    axum::serve(listener, app).await.expect("server error");
}

/// Main batch loop: periodically drains the mempool, assembles a batch,
/// proves it, and submits to the on-chain verifier.
async fn batch_loop(
    mempool: Mempool,
    state_mirror: StateMirror,
    batch_count: Arc<RwLock<u64>>,
    config: AssemblerConfig,
    submitter_config: SubmitterConfig,
    chain_id: u64,
    verifying_contract: Address,
) {
    let interval = Duration::from_secs(config.interval_secs);
    let mut ticker = time::interval(interval);

    loop {
        ticker.tick().await;

        // Drain pending operations
        let pending = mempool.drain().await;
        if pending.is_empty() {
            continue;
        }

        // Get current state snapshot
        let prev_state = state_mirror.snapshot().await;

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Stateful filter: trial-apply each op against the state mirror
        // and drop any that would abort the proof. apply_batch is
        // all-or-nothing, so one poison op must never reach the prover.
        let (valid, poison) = assembler::filter_applicable_ops(
            chain_id,
            verifying_contract,
            timestamp,
            &prev_state,
            pending,
        );
        for (p, reason) in &poison {
            warn!(id = p.id, %reason, "Dropped poison op — would abort the batch");
        }
        if valid.is_empty() {
            continue;
        }

        let op_count = valid.len();
        info!(ops = op_count, dropped = poison.len(), "Assembling batch");

        let ops: Vec<_> = valid.iter().map(|p| p.op.clone()).collect();
        let batch = assembler::assemble_batch(
            chain_id,
            verifying_contract,
            timestamp,
            ops,
            prev_state,
        );

        // Prove
        let result = match prover::prove_batch(&batch).await {
            Ok(r) => r,
            Err(e) => {
                // The batch passed the op-by-op filter but still failed
                // to prove as a whole — a filter/kernel divergence, not a
                // normal poison op. Re-queuing would loop forever, so
                // dead-letter the batch instead.
                error!(%e, ops = op_count, "Batch failed to prove after filtering — dead-lettered");
                continue;
            }
        };

        // Submit on-chain (advance state mirror only on success)
        if submitter_config.verifier_address != Address::ZERO {
            match submitter::submit_batch(&submitter_config, &result).await {
                Ok(tx_hash) => {
                    state_mirror.advance(result.post_state.clone()).await;
                    info!(
                        ?tx_hash,
                        new_root = ?result.public_values.new_state_root,
                        ops = op_count,
                        "Batch settled on-chain, state mirror advanced"
                    );
                    let mut count = batch_count.write().await;
                    *count += 1;
                }
                Err(e) => {
                    // Submission failure is transient (RPC) — the ops are
                    // valid, so re-queue them for the next tick.
                    error!(%e, "On-chain submission failed — re-queuing operations");
                    mempool.requeue(valid).await;
                }
            }
        } else {
            state_mirror.advance(result.post_state.clone()).await;
            info!(
                new_root = ?result.public_values.new_state_root,
                ops = op_count,
                "Batch proved (no verifier configured — dry run), state mirror advanced"
            );
            let mut count = batch_count.write().await;
            *count += 1;
        }
    }
}
