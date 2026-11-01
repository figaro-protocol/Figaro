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
        rejection::JsonRejection,
        ConnectInfo, DefaultBodyLimit, State,
    },
    http::{HeaderName, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use tower::limit::GlobalConcurrencyLimitLayer;
use tower_http::cors::{Any, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::mempool::{Mempool, SubmitError};
use crate::state::StateMirror;
use crate::submitter::{self, FundingGate};
use figaro_kernel::types::{KernelOp, UsageClaim};

/// Shared application state for axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub mempool: Mempool,
    pub state_mirror: StateMirror,
    /// Cumulative number of batches resolved by this sequencer.
    pub batch_count: std::sync::Arc<tokio::sync::RwLock<u64>>,
    /// Cumulative failure facts — see `FailureLog`.
    pub failures: FailureLog,
    /// Where a commit's bonds are checked at the door (`None`: no verifier
    /// configured, nothing is read — the prove-only dry run).
    pub funding: Option<FundingGate>,
}

/// Cumulative failure facts, surfaced on `/status` so a polling driver SEES a
/// death instead of waiting out a batch that will never come (the
/// gap it closes: ops were dead-lettered and every observer kept polling a surface that
/// could not say so). Counts OPS dead-lettered — dropped without resolving —
/// whatever the path (deterministic resolve revert, prove failure); the last
/// error is kept for the reader, every URL in it taken out. Usage claims dropped without
/// landing are counted apart, with their own last reason: a claim is not an
/// operation, and one figure for both would tell neither reader the truth.
#[derive(Clone, Default)]
pub struct FailureLog {
    inner: std::sync::Arc<tokio::sync::RwLock<FailureLogInner>>,
}

#[derive(Default)]
struct FailureLogInner {
    dead_lettered_ops: u64,
    last_error: Option<String>,
    dropped_usage_claims: u64,
    last_claim_error: Option<String>,
}

impl FailureLog {
    /// Count `ops` operations dropped without resolving, with the reason,
    /// every URL in it taken out ([`without_urls`]). The reason is an error's
    /// Display text: an error recorded with `{:?}` can carry a URL as a
    /// parsed structure, its scheme and host apart with no `://`, which
    /// `without_urls` does not find.
    pub async fn record(&self, ops: u64, error: String) {
        let mut inner = self.inner.write().await;
        inner.dead_lettered_ops += ops;
        inner.last_error = Some(without_urls(&error));
    }

    pub async fn snapshot(&self) -> (u64, Option<String>) {
        let inner = self.inner.read().await;
        (inner.dead_lettered_ops, inner.last_error.clone())
    }

    /// Count `claims` usage claims dropped without landing, with the reason,
    /// every URL in it taken out ([`without_urls`]).
    pub async fn record_claims(&self, claims: u64, error: String) {
        if claims == 0 {
            return;
        }
        let mut inner = self.inner.write().await;
        inner.dropped_usage_claims += claims;
        inner.last_claim_error = Some(without_urls(&error));
    }

    /// The usage claims dropped so far, and the last reason.
    pub async fn claims_snapshot(&self) -> (u64, Option<String>) {
        let inner = self.inner.read().await;
        (inner.dropped_usage_claims, inner.last_claim_error.clone())
    }
}

/// `text` with every URL in it replaced by `<url>`. A failure's text is
/// served to any client on `/status`; an HTTP client's error names the URL
/// it requested, and a keyed RPC URL carries its key. A URL runs from its
/// scheme (`http://`, `https://`, `ws://`, `wss://`) to the first
/// whitespace, quote, or closing bracket; the scheme matches in any case.
pub fn without_urls(text: &str) -> String {
    const SCHEMES: [&str; 4] = ["https://", "http://", "wss://", "ws://"];
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    // Schemes match in any case (`HTTPS://` is a URL too); ASCII lowercasing
    // keeps every byte offset, so a match in the lowered text is one in `rest`.
    while let Some((at, scheme)) = {
        let lowered = rest.to_ascii_lowercase();
        SCHEMES
            .iter()
            .filter_map(|scheme| lowered.find(scheme).map(|at| (at, *scheme)))
            .min_by_key(|(at, _)| *at)
    } {
        out.push_str(&rest[..at]);
        out.push_str("<url>");
        let after = &rest[at + scheme.len()..];
        let end = after
            .find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '`' | ')' | ']' | '}' | '>'))
            .unwrap_or(after.len());
        rest = &after[end..];
    }
    out.push_str(rest);
    out
}

/// Log every usage claim dropped at `stage`, each with its reason, so a
/// claim drop counts on `/status` apart from the operations. Returns how
/// many were recorded.
pub async fn record_dropped_claims(
    failures: &FailureLog,
    dropped: &[(UsageClaim, String)],
    stage: &str,
) -> u64 {
    for (claim, reason) in dropped {
        tracing::warn!(clause_or_assembly = ?claim.clause_or_assembly, %reason, "Usage claim dropped at {stage}");
        failures.record_claims(1, format!("dropped at {stage}: {reason}")).await;
    }
    dropped.len() as u64
}

/// Record every operation dropped at `stage` (batch formation, say), each
/// with its reason, so a drop counts on `/status` whatever its path. Returns
/// how many were recorded.
pub async fn record_dropped(
    failures: &FailureLog,
    dropped: &[(crate::mempool::PendingOp, String)],
    stage: &str,
) -> u64 {
    for (op, reason) in dropped {
        tracing::warn!(id = op.id, %reason, "Dropped at {stage}");
        failures.record(1, format!("dropped at {stage}: {reason}")).await;
    }
    dropped.len() as u64
}

/// HTTP-boundary limits.
#[derive(Clone, Copy, Debug)]
pub struct ApiConfig {
    /// Per-request body cap in bytes. A plaintext attestation witness
    /// (spec JSON + content + agreement clauses + inclusion proof) is tens
    /// of KB, a hash-only one a few hundred bytes; 1 MiB is generous
    /// headroom without inviting memory abuse.
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
// proxy's — a deployment that fronts the relay sets the limit there. An IPv6
// client holds a /64, so an IPv6 address counts by its /64. A window past its
// minute is swept, at most once a minute, so the map holds the addresses of
// the last two windows and no more.

const RATE_WINDOW: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct RateLimiter {
    per_minute: u32,
    windows: Arc<Mutex<HashMap<IpAddr, (Instant, u32)>>>,
    swept: Arc<Mutex<Option<Instant>>>,
}

/// The address a window is kept for: an IPv4 address itself, an IPv6
/// address's /64.
fn window_key(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V4(_) => ip,
        IpAddr::V6(v6) => {
            let prefix = u128::from(v6) & !((1u128 << 64) - 1);
            IpAddr::V6(std::net::Ipv6Addr::from(prefix))
        }
    }
}

impl RateLimiter {
    pub fn new(per_minute: u32) -> Self {
        Self {
            per_minute,
            windows: Arc::new(Mutex::new(HashMap::new())),
            swept: Arc::new(Mutex::new(None)),
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
        {
            let mut swept = self.swept.lock().expect("rate limiter lock");
            if swept.is_none_or(|at| now.saturating_duration_since(at) >= RATE_WINDOW) {
                windows.retain(|_, (start, _)| now.saturating_duration_since(*start) < RATE_WINDOW);
                *swept = Some(now);
            }
        }
        let entry = windows.entry(window_key(ip)).or_insert((now, 0));
        if now.saturating_duration_since(entry.0) >= RATE_WINDOW {
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
    /// The most recent dead-letter reason, its URLs taken out; null while clean.
    pub last_settle_error: Option<String>,
    /// Cumulative usage claims dropped without landing — counted apart from
    /// the operations: a claim credits a designer, it resolves nothing.
    pub dropped_usage_claims: u64,
    /// The most recent claim drop's reason, its URLs taken out; null while clean.
    pub last_dropped_claim_error: Option<String>,
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
    // One in-flight count across every route: each route's layer shares the
    // one semaphore.
    let in_flight = GlobalConcurrencyLimitLayer::new(config.max_in_flight);
    // The submission routes carry no cross-origin header. A JSON submission
    // from a page needs a preflight, which they never answer; a `text/plain`
    // POST is a CORS simple request, sent with no preflight, and the JSON
    // extractor answers it `415`. So no page can have its visitors'
    // browsers submit for it, each from an address of its own past the
    // per-address limit.
    let submissions = Router::new()
        .route("/submit", post(submit_op))
        .route("/submit-usage", post(submit_usage))
        .route_layer(middleware::from_fn_with_state(
            RateLimiter::new(config.submits_per_minute_per_ip),
            rate_limit,
        ))
        .layer(DefaultBodyLimit::max(config.max_body_bytes))
        // Outermost last: the in-flight cap admits, the timeout bounds.
        .layer(TimeoutLayer::new(config.request_timeout))
        .layer(in_flight.clone());
    // The read routes answer a page on any origin: GET and its preflight,
    // `/state`'s root header exposed. The read routes
    // change nothing, and serve what the relay already serves to any client
    // on `LISTEN_ADDR`. The cross-origin header is outermost, so an answer
    // the timeout gives (`408`) reaches the page too.
    let reads = Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
        // The state behind the verifier's root, as this relay holds it.
        .route("/state", get(get_state))
        .layer(TimeoutLayer::new(config.request_timeout))
        .layer(in_flight)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::OPTIONS])
                .expose_headers([HeaderName::from_static("x-figaro-state-root")]),
        );
    Router::new().merge(submissions).merge(reads).with_state(state)
}

// ── Handlers ─────────────────────────────────────────────────────

/// Map a body/JSON extraction failure to a structured error with the
/// rejection's own status: 400 malformed JSON, 422 valid JSON that is not a
/// `KernelOp`, 413 oversize, 415 wrong content type.
fn payload_error(route: &'static str, rej: JsonRejection) -> Response {
    let status = rej.status();
    let error = rej.body_text();
    // serde's reason quotes the value it could not read, and a body may be a
    // plaintext attestation: the log carries the status alone, the reason
    // goes to the sender.
    warn!(route, %status, "payload rejected");
    (status, Json(ErrorResponse { error })).into_response()
}

fn submit_error(route: &'static str, kind: &'static str, e: SubmitError) -> Response {
    let status = match e {
        SubmitError::Full => StatusCode::SERVICE_UNAVAILABLE,
        SubmitError::Invalid(_) => StatusCode::BAD_REQUEST,
    };
    let error = e.to_string();
    // An attestation's refusal can quote its content (a value outside a
    // spec's bounds), so the relay logs the refusal without its reason; the
    // reason goes to the sender alone, whose content it is.
    if matches!(kind, "AttestAsSeller" | "AttestAsBuyer") {
        warn!(route, kind, %status, "submission rejected");
    } else {
        warn!(route, kind, %status, %error, "submission rejected");
    }
    (status, Json(ErrorResponse { error })).into_response()
}

/// A submission the relay could not verify because the chain could not be
/// asked: `503`, to retry, its reason with every URL taken out.
fn unverifiable(error: String) -> Response {
    (StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse { error })).into_response()
}

fn op_kind(op: &KernelOp) -> &'static str {
    match op {
        KernelOp::Commit { .. } => "Commit",
        KernelOp::Resolve { .. } => "Resolve",
        KernelOp::ResolveByWalletCode { .. } => "ResolveByWalletCode",
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
    // The stateless checks first, so a refusal names the operation's own
    // fault; then an operation on a process or an order this relay can
    // verify nowhere — neither landed nor queued — is refused, never queued
    // to wait out the deferral window (`Mempool::refuse_unknown`).
    if let Err(invalid) = state.mempool.pre_check(&req.operation) {
        return submit_error("/submit", kind, SubmitError::Invalid(invalid));
    }
    if let Err(unknown) = state.mempool.refuse_unknown(&req.operation, &state.state_mirror).await {
        return submit_error("/submit", kind, SubmitError::Invalid(unknown));
    }
    // A commit's bonds are checked at the door: an unfunded commit would
    // be dropped at batch formation anyway, so refusing it here costs the
    // sender nothing and keeps the queue for operations that can land. Bonds
    // the chain could not be asked about are unverified, and an unverified
    // commit is refused too, with a retry: the queue holds only what this
    // relay could check.
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
                let read = without_urls(&read);
                warn!(route = "/submit", kind, %read, "funding unverifiable at the door; refused");
                return unverifiable(format!("the commitment's bonds could not be read; retry: {read}"));
            }
        }
    }
    // A wallet-code resolve is asked of the buyer's code at the door, as the
    // verifier will ask it at resolution: bytes the code refuses would revert
    // a whole batch. Code that could not be asked is unverified, and the
    // resolve is refused, with a retry.
    if let (Some(gate), KernelOp::ResolveByWalletCode { .. }) = (&state.funding, &req.operation) {
        match submitter::check_wallet_code_resolve(gate, &req.operation).await {
            Ok(Ok(())) => {}
            Ok(Err(refused)) => {
                warn!(route = "/submit", kind, %refused, "wallet-code resolve refused");
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("wallet-code resolve refused: {refused}"),
                    }),
                )
                    .into_response();
            }
            Err(read) => {
                let read = without_urls(&read);
                warn!(route = "/submit", kind, %read, "the buyer's code could not be asked at the door; refused");
                return unverifiable(format!("the buyer's code could not be asked; retry: {read}"));
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
/// Separate from `/submit` because a claim is not a FigaroCore operation — it
/// changes no FigaroCore state and is applied against the batch's post-state.
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
    let (dead_lettered_ops, last_settle_error) = state.failures.snapshot().await;
    let (dropped_usage_claims, last_dropped_claim_error) = state.failures.claims_snapshot().await;

    Json(StatusResponse {
        state_root: format!("{root:?}"),
        pending_ops: pending,
        pending_usage_claims: pending_usage,
        batches_settled: batches,
        dead_lettered_ops,
        last_settle_error,
        dropped_usage_claims,
        last_dropped_claim_error,
    })
}

/// `GET /state` — the state behind this relay's root: the kept-state file's
/// own format (`KernelStateSnapshot`), so it gives another relay the state
/// to start on (`STATE_FROM=<this relay's base URL>`), a faster start than
/// rebuilding it from the chain (`REBUILD_FROM_CHAIN=1`). Nothing in it is
/// private: it is derived from the operation streams every landed batch
/// logs. It is checked, never trusted — the relay started on it recomputes
/// the root from the body and adopts the state only when that root is the
/// verifier's and it does not already hold the state behind it
/// (`state::takeover`); the `x-figaro-state-root` header is what this relay
/// claims, and a header that disagrees with the body is a refusal. A stale
/// relay serves a stale state, and the file it would replace may be the
/// only copy, so the served state is never written unchecked.
async fn get_state(State(state): State<AppState>) -> impl IntoResponse {
    let snapshot = state.state_mirror.snapshot().await;
    let root = state.state_mirror.state_root().await;
    (
        [("x-figaro-state-root", format!("{root:?}"))],
        Json(snapshot),
    )
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
            dropped_usage_claims: 0,
            last_dropped_claim_error: None,
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

    /// The map of windows holds only the addresses seen within the last
    /// window or two: a window past its minute is swept, so addresses that
    /// came once never accumulate.
    #[test]
    fn rate_limiter_sweeps_windows_past_their_minute() {
        let limiter = RateLimiter::new(5);
        let t0 = Instant::now();
        for n in 0..1_000u32 {
            let ip = IpAddr::V4(Ipv4Addr::from(0x0a00_0000 + n));
            assert!(limiter.admit_at(ip, t0));
        }
        assert_eq!(limiter.windows.lock().unwrap().len(), 1_000);
        let late = IpAddr::V4(Ipv4Addr::new(192, 168, 0, 1));
        assert!(limiter.admit_at(late, t0 + Duration::from_secs(121)));
        assert_eq!(limiter.windows.lock().unwrap().len(), 1, "every window past its minute is swept");
    }

    /// An IPv6 client holds a /64, so the addresses of one /64 share one
    /// window: rotating through them neither escapes the limit nor grows the
    /// map.
    #[test]
    fn rate_limiter_counts_an_ipv6_slash_64_as_one_address() {
        let limiter = RateLimiter::new(2);
        let t0 = Instant::now();
        let host = |h: u16| IpAddr::V6(std::net::Ipv6Addr::new(0x2001, 0xdb8, 0, 1, 0, 0, 0, h));
        assert!(limiter.admit_at(host(1), t0));
        assert!(limiter.admit_at(host(2), t0));
        assert!(!limiter.admit_at(host(3), t0), "the third from one /64 is refused");
        assert_eq!(limiter.windows.lock().unwrap().len(), 1);
        let other = IpAddr::V6(std::net::Ipv6Addr::new(0x2001, 0xdb8, 0, 2, 0, 0, 0, 1));
        assert!(limiter.admit_at(other, t0), "another /64 has its own window");
    }
}
