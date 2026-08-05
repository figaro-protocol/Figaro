/// Figaro Batch Sequencer — devnet single-seller sequencer.
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
use tracing::{error, info, warn};

use figaro_sequencer::api::{self, AppState};
use figaro_sequencer::archive::{self, Archive, ArchiveConfig, BatchRecord};
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
    let chain_id: u64 = env_or("CHAIN_ID", "31337")
        .parse()
        .expect("invalid CHAIN_ID");
    let verifier_addr: Address = env_or(
        "BATCH_VERIFIER_ADDRESS",
        "0x0000000000000000000000000000000000000000",
    )
    .parse()
    .expect("invalid BATCH_VERIFIER_ADDRESS");
    // The RPGF counter the batch accrual is written to. Unset (zero) means
    // this sequencer credits no usage — trade still settles.
    let usage_counter_addr: Address = env_or(
        "USAGE_COUNTER_ADDRESS",
        "0x0000000000000000000000000000000000000000",
    )
    .parse()
    .expect("invalid USAGE_COUNTER_ADDRESS");
    // The three registries the usage-claim pre-filter reads. Unset (zero)
    // disables the pre-filter — every claim passes through and the counter's own
    // gates plus the verifier's try/catch remain the backstop.
    let clause_registry_addr: Address = env_or(
        "CLAUSE_REGISTRY_ADDRESS",
        "0x0000000000000000000000000000000000000000",
    )
    .parse()
    .expect("invalid CLAUSE_REGISTRY_ADDRESS");
    let assembly_registry_addr: Address = env_or(
        "ASSEMBLY_REGISTRY_ADDRESS",
        "0x0000000000000000000000000000000000000000",
    )
    .parse()
    .expect("invalid ASSEMBLY_REGISTRY_ADDRESS");
    let members_registry_addr: Address = env_or(
        "MEMBERS_REGISTRY_ADDRESS",
        "0x0000000000000000000000000000000000000000",
    )
    .parse()
    .expect("invalid MEMBERS_REGISTRY_ADDRESS");
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
    // Public-endpoint bounds: queue caps + per-request body cap.
    let mempool_max_ops: usize = env_or("MEMPOOL_MAX_OPS", "10000")
        .parse()
        .expect("invalid MEMPOOL_MAX_OPS");
    let mempool_max_usage: usize = env_or("MEMPOOL_MAX_USAGE_CLAIMS", "10000")
        .parse()
        .expect("invalid MEMPOOL_MAX_USAGE_CLAIMS");
    let max_body_bytes: usize = env_or("MAX_BODY_BYTES", "1048576")
        .parse()
        .expect("invalid MAX_BODY_BYTES");
    // Publication bounds. `ARCHIVE_PATH=` (empty) makes the archive
    // in-memory only — it then answers for this process's lifetime and
    // forgets on restart.
    let archive_path = env_or("ARCHIVE_PATH", "sequencer-archive.jsonl");
    let archive_max_batches: usize = env_or("ARCHIVE_MAX_BATCHES", "10000")
        .parse()
        .expect("invalid ARCHIVE_MAX_BATCHES");
    info!(%rpc_url, %chain_id, ?verifier_addr, ?verifying_contract, %listen_addr, %batch_interval, %max_ops, %mempool_max_ops, %mempool_max_usage, %max_body_bytes, %archive_path, %archive_max_batches, "Starting Figaro sequencer");

    // ── Initialize components ─────────────────────────────────────
    let mempool = Mempool::with_caps(
        chain_id,
        verifying_contract,
        mempool_max_ops,
        mempool_max_usage,
    );
    let state_mirror = StateMirror::genesis();
    let archive = Archive::open(ArchiveConfig {
        path: (!archive_path.is_empty()).then(|| archive_path.clone().into()),
        max_batches: archive_max_batches,
    })
    .await;
    // Resume this relay's batch numbering where the archive left off, so a
    // restart continues the published sequence instead of colliding with it.
    let batch_count = Arc::new(RwLock::new(archive.last_batch().await.unwrap_or(0)));

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
        usage_counter_address: usage_counter_addr,
        clause_registry_address: clause_registry_addr,
        assembly_registry_address: assembly_registry_addr,
        members_registry_address: members_registry_addr,
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
    let loop_archive = archive.clone();

    tokio::spawn(async move {
        batch_loop(
            loop_mempool,
            loop_state,
            loop_archive,
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
        archive,
        batch_count,
    };

    let app = api::router(app_state, api::ApiConfig { max_body_bytes });

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
    archive: Archive,
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

        // Drain pending operations AND the RPGF usage claims together.
        //
        // Claims are applied against the batch's POST-state, so a claim for an
        // order this same batch resolves is credited by this same batch. But a
        // claim ALONE is also a valid batch: it changes the usage state, which
        // is under the state root, so the transition is real and provable.
        // Draining before the empty-check (and admitting a claims-only batch
        // below) is what stops a claim submitted after the last trade from
        // sitting in the mempool forever.
        let pending = mempool.drain().await;
        let usage_claims = mempool.drain_usage().await;

        // Pre-filter usage claims against live chain state so a poison claim
        // (excluded/unregistered clause or assembly, or an unstaked seller) never
        // enters a proof and cannot cost the rest of the batch its accrual. The
        // counter's
        // own gates and the verifier's try/catch remain the on-chain backstop
        // for the residual race (a seller unstaking after this read).
        let (usage_claims, dropped_claims) =
            submitter::filter_usage_claims(&submitter_config, usage_claims).await;
        for (claim, why) in &dropped_claims {
            warn!(clause_or_assembly = ?claim.clause_or_assembly, reason = %why, "Dropped usage claim — the counter would reject it");
        }

        if pending.is_empty() && usage_claims.is_empty() {
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
        if valid.is_empty() && usage_claims.is_empty() {
            continue;
        }
        // Falling through with `valid` empty and claims present is deliberate:
        // the claims prove against state that already settled, so they are
        // independent of whatever poisoned the ops.

        let op_count = valid.len();
        info!(
            ops = op_count,
            usage_claims = usage_claims.len(),
            dropped = poison.len(),
            "Assembling batch"
        );

        // The period and provenance clause are CHAIN facts — asked of the
        // counter, never derived from the sequencer's clock. If there is no
        // counter, or accrual has closed, the batch settles crediting nothing.
        let mut usage = match submitter::read_usage_context(
            &submitter_config.rpc_url,
            submitter_config.usage_counter_address,
        )
        .await
        {
            Some((period, provenance_clause)) => assembler::UsageContext {
                claims: usage_claims,
                period,
                provenance_clause,
            },
            None => {
                if !usage_claims.is_empty() {
                    warn!(
                        claims = usage_claims.len(),
                        "Dropping usage claims — no usage counter, or accrual has closed"
                    );
                }
                assembler::UsageContext::default()
            }
        };

        let ops: Vec<_> = valid.iter().map(|p| p.op.clone()).collect();

        // Stateful filter for usage claims — the twin of the op filter above.
        // The guest credits claims against the batch's POST-OP state and aborts
        // the WHOLE proof on any that fail (order not resolved, bad inclusion
        // proof, already-counted). A poison claim there dead-letters the batch
        // and discards every co-batched trade; claims are publicly submittable,
        // so this is a gas-free DoS surface. Trial-apply each claim and drop the
        // poison before proving. (The registry/stake pre-filter above covers the
        // disjoint set of gates the guest cannot see.)
        if !usage.claims.is_empty() {
            let (kept, dropped) = assembler::filter_applicable_claims(
                chain_id,
                verifying_contract,
                timestamp,
                &prev_state,
                &ops,
                usage.period,
                usage.provenance_clause,
                std::mem::take(&mut usage.claims),
            );
            for (claim, reason) in &dropped {
                warn!(clause_or_assembly = ?claim.clause_or_assembly, %reason, "Dropped usage claim — would abort the batch proof");
            }
            usage.claims = kept;
        }

        // After BOTH filters an all-poison tick can leave nothing to settle
        // (every op held, every claim dropped). Never assemble an empty batch.
        if ops.is_empty() && usage.claims.is_empty() {
            continue;
        }

        let batch = assembler::assemble_batch(
            chain_id,
            verifying_contract,
            timestamp,
            ops,
            prev_state,
            usage,
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
                    let number = {
                        let mut count = batch_count.write().await;
                        *count += 1;
                        *count
                    };
                    publish(&archive, number, &batch, &result, Some(tx_hash)).await;
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
            let number = {
                let mut count = batch_count.write().await;
                *count += 1;
                *count
            };
            publish(&archive, number, &batch, &result, None).await;
        }
    }
}

/// Publish what the batch settled — the per-order commitments and their
/// signatures, and the per-process resolution facts. This is the batch
/// universe's mirror of the events `FigaroCore` emits on the direct path;
/// without it, a batch-settled order exists only under a proven state root
/// and no reader can see it at all.
///
/// Publication follows settlement and never gates it: a failure here is
/// logged inside the archive and the batch stays settled.
async fn publish(
    archive: &Archive,
    number: u64,
    batch: &figaro_kernel::types::BatchInput,
    result: &prover::ProveResult,
    settlement_tx: Option<alloy_primitives::B256>,
) {
    let (commits, resolutions) =
        archive::publication_from_ops(batch.chain_id, batch.verifying_contract, &batch.operations);
    archive
        .record(BatchRecord {
            batch: number,
            chain_id: batch.chain_id,
            verifying_contract: batch.verifying_contract,
            prev_state_root: result.public_values.prev_state_root,
            new_state_root: result.public_values.new_state_root,
            settlement_tx,
            block_timestamp: batch.block_timestamp,
            commits,
            resolutions,
        })
        .await;
}
