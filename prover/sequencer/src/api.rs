/// HTTP API — axum routes for operation submission and status queries.
///
/// This is a PUBLIC, unauthenticated surface. It holds no keys and grants
/// no privilege: it only relays signed artifacts into the mempool, where
/// admission runs the same EIP-712 recovery and witness gates the proof
/// enforces. Every failure is a structured `{ "error": … }` JSON body —
/// never a panic, never a plaintext rejection.
use axum::{
    extract::{rejection::JsonRejection, DefaultBodyLimit, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::mempool::{Mempool, SubmitError};
use crate::state::StateMirror;
use figaro_kernel::types::{KernelOp, UsageClaim};

/// Shared application state for axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub mempool: Mempool,
    pub state_mirror: StateMirror,
    /// Cumulative number of batches settled by this sequencer.
    pub batch_count: std::sync::Arc<tokio::sync::RwLock<u64>>,
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
            (StatusCode::OK, Json(serde_json::json!({ "pending": pending }))).into_response()
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

    Json(StatusResponse {
        state_root: format!("{root:?}"),
        pending_ops: pending,
        pending_usage_claims: pending_usage,
        batches_settled: batches,
    })
}
