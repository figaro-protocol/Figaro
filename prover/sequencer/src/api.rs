/// HTTP API — axum routes for operation submission, publication reads, and
/// status queries.
///
/// This is a PUBLIC, unauthenticated surface. It holds no keys and grants
/// no privilege: it only relays signed submissions into the mempool, where
/// admission runs the same EIP-712 recovery and witness gates the proof
/// enforces, and republishes what it settled. Every failure is a structured
/// `{ "error": … }` JSON body — never a panic, never a plaintext rejection.
use axum::{
    extract::{
        rejection::{JsonRejection, QueryRejection},
        DefaultBodyLimit, Path, Query, State,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::archive::{Archive, RetentionWindow};
use crate::mempool::{Mempool, SubmitError};
use crate::state::StateMirror;
use alloy_primitives::B256;
use figaro_kernel::types::{KernelOp, UsageClaim};

/// Shared application state for axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub mempool: Mempool,
    pub state_mirror: StateMirror,
    /// What this relay has settled, kept so it can be read back.
    pub archive: Archive,
    /// Cumulative number of batches settled by this sequencer.
    pub batch_count: std::sync::Arc<tokio::sync::RwLock<u64>>,
    /// Cumulative failure facts — see `FailureLog`.
    pub failures: FailureLog,
}

/// Cumulative failure facts, surfaced on `/status` so a polling driver SEES a
/// death instead of waiting out a batch that will never come (the 2026-08-20
/// gap: ops were dead-lettered and every observer kept polling a surface that
/// could not say so). Counts OPS dead-lettered — dropped without settling —
/// whatever the path (deterministic settle revert, prove failure); the last
/// error is kept verbatim for the reader.
#[derive(Clone, Default)]
pub struct FailureLog {
    inner: std::sync::Arc<tokio::sync::RwLock<FailureLogInner>>,
}

#[derive(Default)]
struct FailureLogInner {
    dead_lettered_ops: u64,
    last_error: Option<String>,
}

impl FailureLog {
    pub async fn record(&self, ops: u64, error: String) {
        let mut inner = self.inner.write().await;
        inner.dead_lettered_ops += ops;
        inner.last_error = Some(error);
    }

    pub async fn snapshot(&self) -> (u64, Option<String>) {
        let inner = self.inner.read().await;
        (inner.dead_lettered_ops, inner.last_error.clone())
    }
}

/// HTTP-boundary limits.
#[derive(Clone, Copy, Debug)]
pub struct ApiConfig {
    /// Per-request body cap in bytes. A full attestation witness (spec
    /// JSON + content + agreement sections + inclusion proof) is tens of
    /// KB; 1 MiB is generous headroom without inviting memory abuse.
    pub max_body_bytes: usize,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            max_body_bytes: 1024 * 1024,
        }
    }
}

// ── Request / Response types ─────────────────────────────────────

#[derive(Deserialize)]
pub struct SubmitRequest {
    pub operation: KernelOp,
}

#[derive(Deserialize)]
pub struct SubmitUsageRequest {
    pub claim: UsageClaim,
}

#[derive(Serialize)]
pub struct SubmitResponse {
    pub id: u64,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub state_root: String,
    pub pending_ops: usize,
    pub pending_usage_claims: usize,
    pub batches_settled: u64,
    /// Cumulative ops dropped without settling — a growing figure DURING a
    /// wait means the wait is over, whatever `batches_settled` says.
    pub dead_lettered_ops: u64,
    /// The most recent dead-letter reason, verbatim; null while clean.
    pub last_settle_error: Option<String>,
    /// The publication window — what `/batches` can still serve. A
    /// consumer reads this BEFORE replaying, so a gap between its cursor
    /// and `first_batch` is visible rather than silently skipped.
    pub archive: RetentionWindow,
}

/// Query parameters for the batch range read.
#[derive(Deserialize)]
pub struct RangeQuery {
    /// First batch number to return (inclusive). Omitted = from the
    /// oldest retained batch.
    pub from: Option<u64>,
    /// Page size, clamped to `MAX_PAGE_LIMIT`.
    pub limit: Option<usize>,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub pending_ops: usize,
    pub pending_usage_claims: usize,
    pub batches_settled: u64,
}

// ── Router ───────────────────────────────────────────────────────

pub fn router(state: AppState, config: ApiConfig) -> Router {
    Router::new()
        .route("/submit", post(submit_op))
        .route("/submit-usage", post(submit_usage))
        .route("/health", get(health))
        .route("/status", get(status))
        // Publication — the batch universe's mirror of the kernel's events.
        .route("/orders/:order_hash", get(get_order))
        .route("/processes/:process_id", get(get_process))
        .route("/batches", get(get_batches))
        .layer(DefaultBodyLimit::max(config.max_body_bytes))
        .with_state(state)
}

// ── Handlers ─────────────────────────────────────────────────────

/// Map a body/JSON extraction failure to a structured error with the
/// rejection's own status: 400 malformed JSON, 422 valid JSON that is not a
/// `KernelOp`, 413 oversize, 415 wrong content type.
fn payload_error(route: &'static str, rej: JsonRejection) -> Response {
    let status = rej.status();
    let error = rej.body_text();
    warn!(route, %status, %error, "payload rejected");
    (status, Json(ErrorResponse { error })).into_response()
}

fn submit_error(route: &'static str, kind: &'static str, e: SubmitError) -> Response {
    let status = match e {
        SubmitError::Full => StatusCode::SERVICE_UNAVAILABLE,
        SubmitError::Invalid(_) => StatusCode::BAD_REQUEST,
    };
    let error = e.to_string();
    warn!(route, kind, %status, %error, "submission rejected");
    (status, Json(ErrorResponse { error })).into_response()
}

fn op_kind(op: &KernelOp) -> &'static str {
    match op {
        KernelOp::Commit { .. } => "Commit",
        KernelOp::Resolve { .. } => "Resolve",
        KernelOp::AttestAsSeller { .. } => "AttestAsSeller",
        KernelOp::AttestAsBuyer { .. } => "AttestAsBuyer",
    }
}

async fn submit_op(
    State(state): State<AppState>,
    payload: Result<Json<SubmitRequest>, JsonRejection>,
) -> Response {
    let Json(req) = match payload {
        Ok(p) => p,
        Err(rej) => return payload_error("/submit", rej),
    };
    let kind = op_kind(&req.operation);
    match state.mempool.submit(req.operation).await {
        Ok(admission) => {
            info!(
                route = "/submit",
                kind,
                id = admission.id,
                duplicate = admission.duplicate,
                "operation admitted"
            );
            (StatusCode::OK, Json(SubmitResponse { id: admission.id })).into_response()
        }
        Err(e) => submit_error("/submit", kind, e),
    }
}

/// Submit an RPGF usage claim for an order the batch path has settled.
/// Separate from `/submit` because a claim is not a kernel operation — it
/// changes no kernel state and is applied against the batch's post-state.
async fn submit_usage(
    State(state): State<AppState>,
    payload: Result<Json<SubmitUsageRequest>, JsonRejection>,
) -> Response {
    let Json(req) = match payload {
        Ok(p) => p,
        Err(rej) => return payload_error("/submit-usage", rej),
    };
    match state.mempool.submit_usage_claim(req.claim).await {
        Ok(pending) => {
            info!(route = "/submit-usage", pending, "usage claim admitted");
            (
                StatusCode::OK,
                Json(serde_json::json!({ "pending": pending })),
            )
                .into_response()
        }
        Err(e) => submit_error("/submit-usage", "UsageClaim", e),
    }
}

/// Liveness + bounded queue counts. Deliberately the ONLY info surface
/// besides `/status`: settled state is read from the chain, not from a
/// relay.
async fn health(State(state): State<AppState>) -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok",
        pending_ops: state.mempool.len().await,
        pending_usage_claims: state.mempool.usage_len().await,
        batches_settled: *state.batch_count.read().await,
    })
}

async fn status(State(state): State<AppState>) -> impl IntoResponse {
    let root = state.state_mirror.state_root().await;
    let pending = state.mempool.len().await;
    let pending_usage = state.mempool.usage_len().await;
    let batches = *state.batch_count.read().await;
    let archive = state.archive.window().await;
    let (dead_lettered_ops, last_settle_error) = state.failures.snapshot().await;

    Json(StatusResponse {
        state_root: format!("{root:?}"),
        pending_ops: pending,
        pending_usage_claims: pending_usage,
        batches_settled: batches,
        dead_lettered_ops,
        last_settle_error,
        archive,
    })
}

// ── Publication reads ────────────────────────────────────────────
//
// The batch path settles trade that `FigaroCore` would have PUBLISHED —
// the commitment struct, the seller and currency, the per-order and
// per-process resolution facts, and the signatures that admitted it. The
// verifier publishes none of that (its public values carry no order
// hashes; its storage is a state root and a count), so these routes mirror
// the kernel's publication role for the batch universe.
//
// They are a CONVENIENCE, never an authority. Every field is verifiable
// against the chain by the reader (structs hash to the order hash under
// the VERIFIER's EIP-712 domain, signatures recover to the named parties,
// the batch is anchored by its state-root transition), and both parties
// already hold their own signed copies — so a relay that omits, delays, or
// forgets a record costs nobody their evidence.

fn error_response(route: &'static str, status: StatusCode, error: String) -> Response {
    warn!(route, %status, %error, "read rejected");
    (status, Json(ErrorResponse { error })).into_response()
}

/// Parse a 32-byte hash path parameter, with a structured 400 on garbage.
fn parse_hash(route: &'static str, raw: &str) -> Result<B256, Response> {
    raw.parse::<B256>().map_err(|e| {
        error_response(
            route,
            StatusCode::BAD_REQUEST,
            format!("invalid 32-byte hash: {e}"),
        )
    })
}

/// The absence message is deliberately explicit: this relay is one among
/// any number, so "not here" never means "did not happen".
const ABSENT: &str =
    "not in this relay's archive — it may have been settled by another relay, settled directly \
     against FigaroCore, or aged out of this relay's retention window (see /status)";

async fn get_order(State(state): State<AppState>, Path(raw): Path<String>) -> Response {
    let order_hash = match parse_hash("/orders", &raw) {
        Ok(h) => h,
        Err(response) => return response,
    };
    match state.archive.order(order_hash).await {
        Some(view) => (StatusCode::OK, Json(view)).into_response(),
        None => error_response("/orders", StatusCode::NOT_FOUND, ABSENT.to_string()),
    }
}

async fn get_process(State(state): State<AppState>, Path(raw): Path<String>) -> Response {
    let process_id = match parse_hash("/processes", &raw) {
        Ok(h) => h,
        Err(response) => return response,
    };
    match state.archive.process(process_id).await {
        Some(view) => (StatusCode::OK, Json(view)).into_response(),
        None => error_response("/processes", StatusCode::NOT_FOUND, ABSENT.to_string()),
    }
}

/// Bounded, cursor-paged replay of everything this relay has settled — the
/// batch universe's equivalent of walking the kernel's logs from a block.
async fn get_batches(
    State(state): State<AppState>,
    query: Result<Query<RangeQuery>, QueryRejection>,
) -> Response {
    let Query(range) = match query {
        Ok(q) => q,
        Err(rej) => {
            return error_response("/batches", rej.status(), rej.body_text());
        }
    };
    let page = state.archive.range(range.from, range.limit).await;
    (StatusCode::OK, Json(page)).into_response()
}

#[cfg(test)]
mod failure_tests {
    use super::*;

    /// The failure surface a polling driver reads: ops accumulate across
    /// dead-letter events and the latest reason replaces the previous one.
    #[tokio::test]
    async fn failure_log_accumulates_and_keeps_last_reason() {
        let log = FailureLog::default();
        assert_eq!(log.snapshot().await, (0, None));
        log.record(2, "execution reverted: 0x7fcdd1f4".into()).await;
        log.record(1, "prove failed: divergence".into()).await;
        let (ops, last) = log.snapshot().await;
        assert_eq!(ops, 3);
        assert_eq!(last.as_deref(), Some("prove failed: divergence"));
    }

    /// The wire shape: both failure fields serialize, null while clean —
    /// an old consumer ignores them, a driver keys its abort on them.
    #[test]
    fn status_response_carries_failure_fields() {
        let clean = serde_json::to_value(StatusResponse {
            state_root: "0x00".into(),
            pending_ops: 0,
            pending_usage_claims: 0,
            batches_settled: 0,
            dead_lettered_ops: 0,
            last_settle_error: None,
            archive: RetentionWindow {
                first_batch: None,
                last_batch: None,
                retained_batches: 0,
                max_batches: 1,
            },
        })
        .unwrap();
        assert_eq!(clean["dead_lettered_ops"], 0);
        assert!(clean["last_settle_error"].is_null());
    }
}
