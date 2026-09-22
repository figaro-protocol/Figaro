/// HTTP API — axum routes for operation submission, publication reads, and
/// status queries.
///
/// This is a PUBLIC, unauthenticated surface. It holds no keys and grants
/// no privilege: it only relays signed submissions into the mempool, where
/// admission runs the same EIP-712 recovery and witness gates the proof
/// enforces, and republishes what it resolved. Every failure is a structured
/// `{ "error": … }` JSON body — never a panic, never a plaintext rejection.
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::{
    extract::{
        rejection::{JsonRejection, QueryRejection},
        ConnectInfo, DefaultBodyLimit, Path, Query, State,
    },
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use tower::limit::ConcurrencyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::archive::{Archive, RetentionWindow};
use crate::mempool::{Mempool, SubmitError};
use crate::state::StateMirror;
use crate::submitter::{self, FundingGate};
use alloy_primitives::B256;
use figaro_kernel::types::{KernelOp, UsageClaim};

/// Shared application state for axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub mempool: Mempool,
    pub state_mirror: StateMirror,
    /// What this relay has resolved, kept so it can be read back.
    pub archive: Archive,
    /// Cumulative number of batches resolved by this sequencer.
    pub batch_count: std::sync::Arc<tokio::sync::RwLock<u64>>,
    /// Cumulative failure facts — see `FailureLog`.
    pub failures: FailureLog,
    /// Where a commit's bonds are checked at the door (`None`: no verifier
    /// configured, nothing is read — the prove-only dry run).
    pub funding: Option<FundingGate>,
}

/// Cumulative failure facts, surfaced on `/status` so a polling driver SEES a
/// death instead of waiting out a batch that will never come (the 2026-08-20
/// gap: ops were dead-lettered and every observer kept polling a surface that
/// could not say so). Counts OPS dead-lettered — dropped without resolving —
/// whatever the path (deterministic resolve revert, prove failure); the last
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
    /// A request that has not completed by then is answered `408`.
    pub request_timeout: Duration,
    /// Requests in flight at once, across every route; the rest wait.
    pub max_in_flight: usize,
    /// Submissions (`/submit`, `/submit-usage`) one client address may make
    /// per minute before it is answered `429`; zero disables the limit.
    pub submits_per_minute_per_ip: u32,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            max_body_bytes: 1024 * 1024,
            request_timeout: Duration::from_secs(10),
            max_in_flight: 256,
            submits_per_minute_per_ip: 60,
        }
    }
}

// ── Per-IP submit rate limit ─────────────────────────────────────
//
// A fixed one-minute window per client address over the two submission
// routes. The mempool already refuses an unfunded or malformed submission
// at no cost to the sender; this bounds how fast one address can make it
// say so, and how fast one address can fill the queue caps with
// well-formed, self-signed operations. Behind a proxy the address is the
// proxy's — a deployment that fronts the relay sets the limit there.

#[derive(Clone)]
pub struct RateLimiter {
    per_minute: u32,
    windows: Arc<Mutex<HashMap<IpAddr, (Instant, u32)>>>,
}

impl RateLimiter {
    pub fn new(per_minute: u32) -> Self {
        Self {
            per_minute,
            windows: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Whether one more submission from `ip` is within the window.
    pub fn admit(&self, ip: IpAddr) -> bool {
        self.admit_at(ip, Instant::now())
    }

    fn admit_at(&self, ip: IpAddr, now: Instant) -> bool {
        if self.per_minute == 0 {
            return true;
        }
        let mut windows = self.windows.lock().expect("rate limiter lock");
        let entry = windows.entry(ip).or_insert((now, 0));
        if now.duration_since(entry.0) >= Duration::from_secs(60) {
            *entry = (now, 0);
        }
        if entry.1 >= self.per_minute {
            return false;
        }
        entry.1 += 1;
        true
    }
}

/// The client address, from the connection; absent (a router driven
/// without connect info) every request shares one bucket.
fn client_ip(req: &axum::extract::Request) -> IpAddr {
    req.extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
}

async fn rate_limit(
    State(limiter): State<RateLimiter>,
    req: axum::extract::Request,
    next: Next,
) -> Response {
    let ip = client_ip(&req);
    if !limiter.admit(ip) {
        warn!(%ip, route = %req.uri().path(), "submission rate limit");
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse {
                error: "submission rate limit for this address; retry after the window".to_string(),
            }),
        )
            .into_response();
    }
    next.run(req).await
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
    /// Cumulative ops dropped without resolving — a growing figure DURING a
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
    let submissions = Router::new()
        .route("/submit", post(submit_op))
        .route("/submit-usage", post(submit_usage))
        .route_layer(middleware::from_fn_with_state(
            RateLimiter::new(config.submits_per_minute_per_ip),
            rate_limit,
        ));
    Router::new()
        .merge(submissions)
        .route("/health", get(health))
        .route("/status", get(status))
        // Publication — the batch universe's mirror of the kernel's events.
        .route("/orders/:order_hash", get(get_order))
        .route("/processes/:process_id", get(get_process))
        .route("/batches", get(get_batches))
        .layer(DefaultBodyLimit::max(config.max_body_bytes))
        // Outermost last: the in-flight cap admits, the timeout bounds.
        .layer(TimeoutLayer::new(config.request_timeout))
        .layer(ConcurrencyLimitLayer::new(config.max_in_flight))
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
    // A commit's bonds are checked at the door: an unfunded commit would
    // be dropped at batch formation anyway, so refusing it here costs the
    // sender nothing and keeps the queue for operations that can land. A
    // read failure is not a verdict — the batch-time check decides.
    if let (Some(gate), KernelOp::Commit { commitment, .. }) = (&state.funding, &req.operation) {
        match submitter::check_commit_funding(gate, commitment).await {
            Ok(Ok(())) => {}
            Ok(Err(unfunded)) => {
                warn!(route = "/submit", kind, %unfunded, "unfunded commitment refused");
                return (
                    StatusCode::PAYMENT_REQUIRED,
                    Json(ErrorResponse {
                        error: format!("unfunded commitment: {unfunded}"),
                    }),
                )
                    .into_response();
            }
            Err(read) => {
                warn!(route = "/submit", kind, %read, "funding unverifiable at the door; the batch-time check decides");
            }
        }
    }
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

/// Submit an RPGF usage claim for an order the batch path has resolved.
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
/// besides `/status`: resolved state is read from the chain, not from a
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
// The batch path resolves trade that `FigaroCore` would have PUBLISHED —
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
    "not in this relay's archive — it may have been resolved by another relay, resolved directly \
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

/// Bounded, cursor-paged replay of everything this relay has resolved — the
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

#[cfg(test)]
mod tests {
    use super::*;

    /// The window: `per_minute` admissions, the next refused, a fresh
    /// window after sixty seconds; addresses are independent; zero
    /// disables.
    #[test]
    fn rate_limiter_window() {
        let limiter = RateLimiter::new(2);
        let a = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));
        let b = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2));
        let t0 = Instant::now();
        assert!(limiter.admit_at(a, t0));
        assert!(limiter.admit_at(a, t0));
        assert!(!limiter.admit_at(a, t0), "the third in the window is refused");
        assert!(limiter.admit_at(b, t0), "another address has its own window");
        assert!(limiter.admit_at(a, t0 + Duration::from_secs(60)), "a new window");
        assert!(RateLimiter::new(0).admit_at(a, t0), "zero disables");
    }
}
