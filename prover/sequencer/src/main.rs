/// Figaro Batch Sequencer — devnet single-seller sequencer.
///
/// Collects signed protocol operations via HTTP, assembles batches on a
/// timer, runs the SP1 mock prover, and submits resolution transactions
/// to FigaroBatchVerifier on Anvil.
///
/// This is Phase 1 (devnet). For testnet and mainnet, swap MockSP1Verifier
/// for the real SP1 verifier gateway and set SP1_PROVER=cpu/cuda so the
/// sequencer self-proves with the local SP1 prover, or SP1_PROVER=network to
/// buy the proof from the Succinct Prover Network (the relay operator pays;
/// liveness only — the proof still verifies against the vkey).
use std::sync::Arc;
use std::time::Duration;

use alloy_primitives::{Address, B256};
use tokio::sync::RwLock;
use tokio::time;
use tracing::{error, info, warn};

use figaro_sequencer::api::{self, AppState, FailureLog};
use figaro_sequencer::archive::{self, Archive, ArchiveConfig, BatchRecord};
use figaro_sequencer::assembler::{self, AssemblerConfig};
use figaro_kernel::state::KernelState;
use figaro_sequencer::mempool::{Mempool, PendingOp};
use figaro_sequencer::prover;
use figaro_sequencer::state::{self, Held, NextState, StateMirror, StateStore};
use figaro_sequencer::submitter::{self, FundingGate, SubmitterConfig};

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

#[tokio::main]
async fn main() {
    // `sequencer --vkey`: print the fingerprint of the guest this binary
    // embeds — the value a FigaroBatchVerifier deploy takes as
    // SP1_PROGRAM_VKEY — and stop. The batch e2e deploys its verifier with
    // this; an operator compares it with the deployed verifier's before a
    // 7-minute wrap, though the startup check below does that too.
    if std::env::args().any(|a| a == "--vkey") {
        match prover::embedded_vkey().await {
            Ok(vkey) => {
                println!("SP1_PROGRAM_VKEY={vkey:?}");
                return;
            }
            Err(e) => {
                eprintln!("{e}");
                std::process::exit(2);
            }
        }
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                // Two targets: the library's modules log as
                // `figaro_sequencer`, this binary (startup, every refusal to
                // start, the batch loop) as `sequencer`.
                .unwrap_or_else(|_| "figaro_sequencer=info,sequencer=info".into()),
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
    // this sequencer credits no usage — trade still resolves.
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
    let private_key =
        match submitter::signing_key_from_env(std::env::var("SEQUENCER_PRIVATE_KEY").ok()) {
            Ok(key) => key,
            Err(reason) => {
                error!(%reason, "refusing to start");
                std::process::exit(2);
            }
        };
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
    let request_timeout_secs: u64 = env_or("REQUEST_TIMEOUT_SECS", "10")
        .parse()
        .expect("invalid REQUEST_TIMEOUT_SECS");
    let max_in_flight: usize = env_or("MAX_IN_FLIGHT", "256")
        .parse()
        .expect("invalid MAX_IN_FLIGHT");
    let submits_per_minute_per_ip: u32 = env_or("SUBMITS_PER_MINUTE_PER_IP", "60")
        .parse()
        .expect("invalid SUBMITS_PER_MINUTE_PER_IP");
    // Publication bounds. `ARCHIVE_PATH=` (empty) makes the archive
    // in-memory only — it then answers for this process's lifetime and
    // forgets on restart.
    let archive_path = env_or("ARCHIVE_PATH", "sequencer-archive.jsonl");
    let archive_max_batches: usize = env_or("ARCHIVE_MAX_BATCHES", "10000")
        .parse()
        .expect("invalid ARCHIVE_MAX_BATCHES");
    // The state behind the verifier's root, kept across restarts. The
    // default names the chain and the verifier, so two deployments never
    // share a file. `STATE_PATH=` (empty) keeps it in memory only: a restart
    // then holds nothing, and against a verifier past genesis refuses to
    // start.
    let state_path = env_or(
        "STATE_PATH",
        &format!("sequencer-state-{chain_id}-{verifier_addr:#x}.json"),
    );
    info!(%rpc_url, %chain_id, ?verifier_addr, ?verifying_contract, %listen_addr, %batch_interval, %max_ops, %mempool_max_ops, %mempool_max_usage, %max_body_bytes, %archive_path, %archive_max_batches, %state_path, "Starting Figaro sequencer");

    // ── Initialize components ─────────────────────────────────────
    let mempool = Mempool::with_caps(
        chain_id,
        verifying_contract,
        mempool_max_ops,
        mempool_max_usage,
    );
    let (state_store, kept_state) =
        match StateStore::open((!state_path.is_empty()).then(|| state_path.clone().into())).await {
            Ok(opened) => opened,
            Err(reason) => {
                error!(%reason, "refusing to start");
                std::process::exit(2);
            }
        };
    let state_mirror = match kept_state {
        Some(snapshot) => StateMirror::from_snapshot(snapshot),
        None => StateMirror::genesis(),
    };
    let archive = Archive::open(ArchiveConfig {
        path: (!archive_path.is_empty()).then(|| archive_path.clone().into()),
        max_batches: archive_max_batches,
    })
    .await;
    // Resume this relay's batch numbering where the archive left off, so a
    // restart continues the published sequence instead of colliding with it.
    let batch_count = Arc::new(RwLock::new(archive.last_batch().await.unwrap_or(0)));

    // The verifier pins one guest fingerprint, immutably. A relay that
    // embeds any other guest makes proofs it refuses — every batch would
    // revert ProofInvalid after minutes of proving. Compared here, once,
    // before anything is queued: a mismatch is a refusal to start, with
    // both values printed. A verifier that cannot be read is not a
    // verdict (it may not be deployed yet); the state-root check below
    // warns the same way.
    if verifier_addr != Address::ZERO {
        match (
            prover::embedded_vkey().await,
            submitter::read_program_vkey(&rpc_url, verifier_addr).await,
        ) {
            (Ok(embedded), Ok(pinned)) if embedded == pinned => {
                info!(vkey = ?pinned, "Guest fingerprint matches the verifier's programVKey");
            }
            (Ok(embedded), Ok(pinned)) => {
                error!(
                    ?embedded,
                    ?pinned,
                    ?verifier_addr,
                    "refusing to start: this binary's guest fingerprint is not the one the verifier pins — rebuild from the recipe that produced the verifier's, or deploy a verifier for this guest"
                );
                std::process::exit(2);
            }
            (Err(e), _) => {
                error!(%e, "refusing to start: the embedded guest fingerprint could not be derived");
                std::process::exit(2);
            }
            (Ok(_), Err(e)) => {
                warn!(%e, "Could not read the verifier's programVKey (verifier may not be deployed yet)");
            }
        }
    }

    // The verifier holds a root; a bond committed on the batch path is
    // refunded only by a batch built on the state behind it. This relay
    // builds on a state it holds whose root is the verifier's, and on no
    // other: holding none, it refuses to start, the way a relay with
    // another guest does. A verifier that cannot be read is not a verdict
    // (it may not be deployed yet); the batch loop asks again before every
    // batch.
    if verifier_addr != Address::ZERO {
        match submitter::read_state_root(&rpc_url, verifier_addr).await {
            Ok(root) => {
                if step_to(root, &rpc_url, verifier_addr, &state_mirror, &state_store, &archive, &batch_count).await {
                    info!(?root, "This relay holds the state behind the verifier's root");
                } else {
                    error!(
                        on_chain_root = ?root,
                        local_root = ?state_mirror.state_root().await,
                        held_next = ?state_store.next_roots().await,
                        %state_path,
                        "refusing to start: this relay does not hold the state behind the verifier's root — start it on the state file (STATE_PATH) of the relay that built the verifier's last batch"
                    );
                    std::process::exit(2);
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

    // The funding gate reads bonds as balance and allowance to the verifier;
    // without a verifier (prove-only dry run) nothing is read.
    let funding = (verifier_addr != Address::ZERO).then(|| FundingGate {
        rpc_url: rpc_url.clone(),
        verifier: verifier_addr,
    });
    let loop_funding = funding.clone();

    // ── Spawn batch loop ──────────────────────────────────────────
    let failures = FailureLog::default();
    let loop_mempool = mempool.clone();
    let loop_state = state_mirror.clone();
    let loop_state_store = state_store.clone();
    let loop_batch_count = batch_count.clone();
    let loop_archive = archive.clone();
    let loop_failures = failures.clone();

    tokio::spawn(async move {
        batch_loop(
            loop_mempool,
            loop_state,
            loop_state_store,
            loop_archive,
            loop_batch_count,
            loop_failures,
            assembler_config,
            submitter_config,
            loop_funding,
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
        failures,
        funding,
    };

    let app = api::router(
        app_state,
        api::ApiConfig {
            max_body_bytes,
            request_timeout: Duration::from_secs(request_timeout_secs),
            max_in_flight,
            submits_per_minute_per_ip,
        },
    );

    let listener = tokio::net::TcpListener::bind(&listen_addr)
        .await
        .expect("failed to bind");

    info!(%listen_addr, %request_timeout_secs, %max_in_flight, %submits_per_minute_per_ip, "HTTP server listening");
    // Connect info carries the client address the per-IP limit keys on.
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .expect("server error");
}

/// Main batch loop: periodically drains the mempool, assembles a batch,
/// proves it, and submits to the on-chain verifier.
async fn batch_loop(
    mempool: Mempool,
    state_mirror: StateMirror,
    state_store: StateStore,
    archive: Archive,
    batch_count: Arc<RwLock<u64>>,
    failures: FailureLog,
    config: AssemblerConfig,
    submitter_config: SubmitterConfig,
    funding: Option<FundingGate>,
    chain_id: u64,
    verifying_contract: Address,
) {
    let interval = Duration::from_secs(config.interval_secs);
    let mut ticker = time::interval(interval);
    let dry_run = submitter_config.verifier_address == Address::ZERO;
    // The verifier root this relay last found it holds no state for.
    let mut out_of_step: Option<B256> = None;
    // Refusals caused by a revoked approval, counted per address for the
    // adversarial signal (exclusion itself needs no state — funding is
    // re-read from the chain at every batch formation).
    let revocations = submitter::RevocationLog::new(submitter::REVOCATION_SIGNAL_WINDOW);

    loop {
        ticker.tick().await;

        // Build only on the state behind the verifier's root. Asked before
        // anything is drained: a batch this relay sent may have landed
        // unread (its state is held, and becomes the mirror's here), or
        // another submitter's batch may have landed (its state is not held,
        // and no batch is built until it is). A root that cannot be read
        // leaves the tick's submissions queued.
        if !dry_run {
            match submitter::read_state_root(&submitter_config.rpc_url, submitter_config.verifier_address).await {
                Ok(root) => {
                    if !step_to(root, &submitter_config.rpc_url, submitter_config.verifier_address, &state_mirror, &state_store, &archive, &batch_count).await {
                        if out_of_step != Some(root) {
                            out_of_step = Some(root);
                            let why = format!(
                                "the verifier's root {root:?} is not a state this relay holds — no batch is built until it is"
                            );
                            error!("{why}");
                            failures.record(0, why).await;
                        }
                        continue;
                    }
                    out_of_step = None;
                }
                Err(e) => {
                    warn!(%e, "Could not read the verifier's root — no batch this tick");
                    continue;
                }
            }
        }

        // The batch's clock is the chain's: the guest checks every
        // commitment deadline against it, and the verifier refuses one ahead
        // of its own block. Read before anything is drained: a clock that
        // cannot be read leaves the tick's submissions queued.
        let timestamp = match submitter::read_chain_timestamp(&submitter_config.rpc_url).await {
            Ok(t) => t,
            Err(e) => {
                warn!(%e, "Could not read the chain's clock — no batch this tick");
                continue;
            }
        };

        // Drain pending operations AND the RPGF usage claims together.
        //
        // Claims are applied against the batch's POST-state, so a claim for an
        // order this same batch resolves is credited by this same batch. But a
        // claim ALONE is also a valid batch: it changes the usage state, which
        // is under the state root, so the transition is real and provable.
        // Draining before the empty-check (and admitting a claims-only batch
        // below) is what stops a claim submitted after the last trade from
        // sitting in the mempool forever.
        // At most MAX_BATCH_OPS operations: a batch has to fit in one block
        // and be proved in one sitting. The rest wait for the next tick.
        let pending = mempool.drain_up_to(config.max_ops).await;
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

        // Funding at batch formation, against the latest block: a commit
        // whose bonds no longer pull would revert the whole settle. Dropped
        // here it is dead-lettered and re-submittable, never proved.
        let (valid, unfunded) = submitter::filter_funded_commits(funding.as_ref(), valid).await;
        for (p, reason, _) in &unfunded {
            warn!(id = p.id, %reason, "Dropped commit at batch formation");
            failures.record(1, reason.clone()).await;
        }
        // An attestation whose witness spec is not the registry's anchored
        // one reverts the whole batch on chain: dropped here, alone.
        let (valid, unanchored) = submitter::filter_anchored_attestations(funding.as_ref(), valid).await;
        for (p, reason) in &unanchored {
            warn!(id = p.id, %reason, "Dropped attestation at batch formation");
            failures.record(1, reason.clone()).await;
        }
        if valid.is_empty() && usage_claims.is_empty() {
            continue;
        }
        // Falling through with `valid` empty and claims present is deliberate:
        // the claims prove against state that already resolved, so they are
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
        // counter, or accrual has closed, the batch resolves crediting nothing.
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

        // After BOTH filters an all-poison tick can leave nothing to resolve
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
                // to prove as a whole — a filter/mirror divergence, not a
                // normal poison op. Re-queuing would loop forever, so
                // dead-letter the batch instead.
                error!(%e, ops = op_count, "Batch failed to prove after filtering — dead-lettered");
                failures.record(op_count as u64, format!("prove failed: {e}")).await;
                continue;
            }
        };

        // The state this batch produces is on disk BEFORE the batch is
        // sent: once the transaction is out, the verifier's root can move to
        // it whether or not this relay reads the receipt, or lives to. A
        // batch that leaves the root where it is (attestations alone change
        // no state) produces no new state to hold.
        let next_root = result.public_values.new_state_root;
        let moves_root = next_root != result.public_values.prev_state_root;
        let mut next = NextState {
            root: next_root,
            state: result.post_state.to_snapshot(),
            record: batch_record(&batch, &result),
        };
        if moves_root {
            if let Err(e) = state_store.hold_next(next.clone()).await {
                error!(%e, "Could not write the batch's state — the batch is not sent; re-queuing operations");
                requeue_or_dead_letter(&mempool, &failures, valid).await;
                continue;
            }
        }

        // Submit on-chain (advance state mirror only on success)
        if !dry_run {
            let outcome = submitter::submit_batch(&submitter_config, &result).await;
            // The chain's root decides, not this transaction's fate alone:
            // the same batch sent on an earlier tick, its receipt unread,
            // may be what moved the root here. Asked only of a batch that
            // moves the root — one that does not leaves nothing to read.
            let landed_earlier = moves_root
                && outcome.is_err()
                && submitter::read_state_root(&submitter_config.rpc_url, submitter_config.verifier_address)
                    .await
                    .is_ok_and(|root| root == next_root);
            if landed_earlier {
                step_to(next_root, &submitter_config.rpc_url, submitter_config.verifier_address, &state_mirror, &state_store, &archive, &batch_count).await;
                info!(new_root = ?next_root, ops = op_count, "Batch already resolved on-chain by an earlier send, state mirror advanced");
                continue;
            }
            match outcome {
                Ok(tx_hash) => {
                    next.record.resolution_tx = Some(tx_hash);
                    adopt(next, true, &state_mirror, &state_store, &archive, &batch_count).await;
                    info!(
                        ?tx_hash,
                        new_root = ?next_root,
                        ops = op_count,
                        "Batch resolved on-chain, state mirror advanced"
                    );
                }
                Err(e) if e.deterministic => {
                    // The batch's state stays held: its proof is public now,
                    // and anyone can send it again while the verifier's root
                    // is its previous root (a revoker who re-approves
                    // revives it).
                    //
                    // The chain EVALUATED the resolve and refused. One cause
                    // is adversarial and recoverable: a party who revoked
                    // its approval after the funding check reverts the whole
                    // pull at no cost to itself. Funding is re-read at the
                    // latest block to name it — the revoker's operations
                    // alone are dead-lettered (re-submittable once funded),
                    // everyone else's re-queue, and the next tick builds a
                    // fresh batch without the revoker; the refused batch
                    // itself is never re-sent. Repeated revocation from one
                    // address within the window is the adversarial signal.
                    let (mut still_funded, unfunded) =
                        submitter::filter_funded_commits(funding.as_ref(), valid).await;
                    // Only a VERIFIED shortfall names a revoker; a wallet
                    // whose read failed is dropped conservatively elsewhere
                    // and must not be logged as one.
                    let (revoked, unverifiable): (Vec<_>, Vec<_>) = unfunded
                        .into_iter()
                        .partition(|(_, why, _)| !submitter::is_unverifiable_drop(why));
                    if revoked.is_empty() {
                        // No revoker named: some other deterministic cause,
                        // or the re-read could not see one (a revoker who
                        // re-approved before the re-read lands here — the
                        // residual the handover's limitation 3 states).
                        // Retrying re-proves the identical batch (~minutes
                        // each) for the same refusal. Dead-letter now,
                        // loudly; the counter and the reason surface on
                        // /status so a polling driver sees the death instead
                        // of waiting it out.
                        error!(error = %e, ops = op_count, "Deterministic resolve revert — dead-lettered, NOT re-proving");
                        failures.record(op_count as u64, e.message).await;
                    } else {
                        let mut revokers: Vec<Address> = Vec::new();
                        for (op, why, who) in &revoked {
                            error!(id = op.id, %who, %why, "Approval revoked after the funding check — dead-lettered, re-submittable once funded");
                            failures.record(1, format!("revoked after the funding check: {why}")).await;
                            if !revokers.contains(who) {
                                revokers.push(*who);
                            }
                        }
                        for who in revokers {
                            let hits = revocations.record(who);
                            if hits > 1 {
                                error!(%who, hits, window_secs = submitter::REVOCATION_SIGNAL_WINDOW.as_secs(), "ADVERSARIAL SIGNAL — repeated revocation refusals from one address within the window");
                            }
                        }
                        // A wallet whose re-read failed re-queues with the
                        // funded ops: the next formation reads funding again
                        // and decides. Re-queued ops re-prove at most to the
                        // re-queue cap — "never re-proved" holds only for
                        // the whole-batch dead-letter above.
                        still_funded.extend(unverifiable.into_iter().map(|(op, _, _)| op));
                        if !still_funded.is_empty() {
                            info!(ops = still_funded.len(), "Re-queuing the funded operations — the next batch is built without the revoker");
                            requeue_or_dead_letter(&mempool, &failures, still_funded).await;
                        }
                    }
                }
                Err(e) => {
                    // Transport trouble is transient — the ops are valid,
                    // so re-queue them for the next tick. Past the re-queue
                    // cap an op is dead-lettered instead, so a batch that
                    // never lands is not re-proved forever.
                    error!(error = %e, "On-chain submission failed (transient) — re-queuing operations");
                    requeue_or_dead_letter(&mempool, &failures, valid).await;
                }
            }
        } else {
            adopt(next, true, &state_mirror, &state_store, &archive, &batch_count).await;
            info!(
                new_root = ?next_root,
                ops = op_count,
                "Batch proved (no verifier configured — dry run), state mirror advanced"
            );
        }
    }
}

/// Re-queue ops whose batch was not evaluated by the chain; past the
/// re-queue cap an op is dead-lettered instead.
async fn requeue_or_dead_letter(mempool: &Mempool, failures: &FailureLog, ops: Vec<PendingOp>) {
    let dropped = mempool.requeue(ops).await;
    for (op, why) in dropped {
        error!(id = op.id, %why, "Dead-lettered after repeated transient failures");
        failures.record(1, why).await;
    }
}

/// Bring the mirror to the held state whose root is `root`, the verifier's.
/// `false`: this relay holds no such state, and builds nothing on what it has.
///
/// A held next state arrives here when its batch landed without this relay
/// reading the receipt: its own transaction, or the same proof sent by
/// someone else. The transaction is read from the verifier's `BatchSettled`
/// log; the record is published under it, once, and not at all when the log
/// is not found. The record's `block_timestamp` is the held batch's own.
async fn step_to(
    root: B256,
    rpc_url: &str,
    verifier: Address,
    state_mirror: &StateMirror,
    state_store: &StateStore,
    archive: &Archive,
    batch_count: &Arc<RwLock<u64>>,
) -> bool {
    match state::held_state_for(state_mirror, state_store, root).await {
        Some(Held::Current) => true,
        Some(Held::Next(next)) => {
            let mut next = *next;
            let last = archive.last_batch().await;
            let published = archive
                .range(last, Some(1))
                .await
                .batches
                .last()
                .is_some_and(|r| r.new_state_root == root && r.resolution_tx.is_some());
            let mut publish = false;
            if !published {
                match submitter::find_settle_tx(rpc_url, verifier, next.record.prev_state_root, root).await {
                    Ok(Some(tx)) => {
                        next.record.resolution_tx = Some(tx);
                        publish = true;
                    }
                    Ok(None) => {
                        error!(?root, "A batch of this relay landed and its BatchSettled log was not found — its state is adopted, its record is not published");
                    }
                    Err(e) => {
                        error!(?root, %e, "A batch of this relay landed and its transaction could not be read — its state is adopted, its record is not published");
                    }
                }
            }
            adopt(next, publish, state_mirror, state_store, archive, batch_count).await;
            true
        }
        None => false,
    }
}

/// A batch landed (or, in a dry run, proved): its state becomes the mirror's
/// and the kept one, and with `publish` its record goes out under the next
/// batch number. A kept file that cannot be written leaves the state held in
/// the journal, where the next start finds it.
async fn adopt(
    next: NextState,
    publish: bool,
    state_mirror: &StateMirror,
    state_store: &StateStore,
    archive: &Archive,
    batch_count: &Arc<RwLock<u64>>,
) {
    state_mirror.advance(KernelState::from_snapshot(&next.state)).await;
    if let Err(e) = state_store.keep(next.root, &next.state).await {
        error!(%e, root = ?next.root, "Could not write the kept state — it stays held in the next-state journal");
    }
    if !publish {
        return;
    }
    let number = {
        let mut count = batch_count.write().await;
        *count += 1;
        *count
    };
    archive
        .record(BatchRecord {
            batch: number,
            ..next.record
        })
        .await;
}

/// What the batch publishes once it lands — the per-order commitments and
/// their signatures, and the per-process resolution facts. This is the batch
/// universe's mirror of the events `FigaroCore` emits on the direct path;
/// without it, a batch-resolved order exists only under a proven state root
/// and no reader can see it at all. The batch number and the transaction are
/// set when the batch lands ([`adopt`]).
///
/// Publication follows resolution and never gates it: a failure there is
/// logged inside the archive and the batch stays resolved.
fn batch_record(
    batch: &figaro_kernel::types::BatchInput,
    result: &prover::ProveResult,
) -> BatchRecord {
    let (commits, resolutions) =
        archive::publication_from_ops(batch.chain_id, batch.verifying_contract, &batch.operations);
    BatchRecord {
        batch: 0,
        chain_id: batch.chain_id,
        verifying_contract: batch.verifying_contract,
        prev_state_root: result.public_values.prev_state_root,
        new_state_root: result.public_values.new_state_root,
        resolution_tx: None,
        block_timestamp: batch.block_timestamp,
        commits,
        resolutions,
    }
}
