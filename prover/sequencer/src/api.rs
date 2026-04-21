/// HTTP API — axum routes for operation submission and status queries.
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::mempool::Mempool;
use crate::state::StateMirror;
use figaro_kernel::types::KernelOp;

/// Shared application state for axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub mempool: Mempool,
    pub state_mirror: StateMirror,
    /// Cumulative number of batches settled by this sequencer.
    pub batch_count: std::sync::Arc<tokio::sync::RwLock<u64>>,
}

// ── Request / Response types ─────────────────────────────────────

#[derive(Deserialize)]
pub struct SubmitRequest {
    pub operation: KernelOp,
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
    pub batches_settled: u64,
}

// ── Router ───────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/submit", post(submit_op))
        .route("/status", get(status))
        .with_state(state)
}

// ── Handlers ─────────────────────────────────────────────────────

async fn submit_op(
    State(state): State<AppState>,
    Json(req): Json<SubmitRequest>,
) -> impl IntoResponse {
    match state.mempool.submit(req.operation).await {
        Ok(id) => (StatusCode::OK, Json(serde_json::json!({ "id": id }))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e })),
        ),
    }
}

async fn status(State(state): State<AppState>) -> impl IntoResponse {
    let root = state.state_mirror.state_root().await;
    let pending = state.mempool.len().await;
    let batches = *state.batch_count.read().await;

    Json(StatusResponse {
        state_root: format!("{root:?}"),
        pending_ops: pending,
        batches_settled: batches,
    })
}
